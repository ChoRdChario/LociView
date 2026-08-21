import { MemoryFS } from '../../src/platform/fs';

export type InterleavingAppendEvent =
  | { type: 'armed'; path: string; participants: number; timeoutMs: number }
  | { type: 'read-attempt'; path: string; callId: number; snapshotBytes: number }
  | { type: 'barrier-release'; path: string; mode: 'concurrent' | 'timeout'; arrivals: number }
  | { type: 'write'; path: string; callId: number; resultBytes: number }
  | { type: 'complete'; path: string; releaseMode: 'concurrent' | 'timeout'; attempts: number };

interface ArmedRace {
  path: string;
  participants: number;
  timeoutMs: number;
  attempts: number;
  completed: number;
  releaseMode: 'concurrent' | 'timeout' | null;
  release: Promise<void>;
  resolve: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

const encoder = new TextEncoder();

/** MemoryFS-compatible model of OPFS's cross-context size-read -> write race. */
export class InterleavingAppendMemoryFS extends MemoryFS {
  readonly events: InterleavingAppendEvent[] = [];
  private armed: ArmedRace | null = null;
  private nextCallId = 1;

  armAppendRace(path: string, participants = 2, timeoutMs = 250): void {
    if (this.armed !== null) throw new Error(`append race already armed for ${this.armed.path}`);
    if (path === '') throw new Error('append race path must not be empty');
    if (!Number.isSafeInteger(participants) || participants < 2) {
      throw new Error('append race participants must be an integer of at least 2');
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error('append race timeoutMs must be a positive integer');
    }

    let resolve!: () => void;
    const release = new Promise<void>((done) => {
      resolve = done;
    });
    this.armed = {
      path,
      participants,
      timeoutMs,
      attempts: 0,
      completed: 0,
      releaseMode: null,
      release,
      resolve,
      timer: null,
    };
    this.events.push({ type: 'armed', path, participants, timeoutMs });
  }

  override async appendText(path: string, text: string): Promise<void> {
    const race = this.armed;
    if (race === null || race.path !== path) return super.appendText(path, text);
    if (race.attempts >= race.participants) {
      throw new Error(`append race received too many attempts for ${path}`);
    }

    // Concurrent callers retain the same pre-append snapshot. If a future
    // project lock serializes them, the timeout releases the first caller and
    // the later caller observes its durable write instead of deadlocking.
    const snapshot = (await super.readText(path)) ?? '';
    const callId = this.nextCallId++;
    race.attempts += 1;
    this.events.push({
      type: 'read-attempt',
      path,
      callId,
      snapshotBytes: encoder.encode(snapshot).length,
    });

    if (race.releaseMode === null && race.attempts === 1) {
      race.timer = setTimeout(() => {
        if (race.releaseMode !== null) return;
        race.releaseMode = 'timeout';
        race.timer = null;
        this.events.push({
          type: 'barrier-release',
          path,
          mode: 'timeout',
          arrivals: race.attempts,
        });
        race.resolve();
      }, race.timeoutMs);
    }
    if (race.releaseMode === null && race.attempts === race.participants) {
      if (race.timer !== null) clearTimeout(race.timer);
      race.timer = null;
      race.releaseMode = 'concurrent';
      this.events.push({
        type: 'barrier-release',
        path,
        mode: 'concurrent',
        arrivals: race.attempts,
      });
      race.resolve();
    }
    if (race.releaseMode === null) await race.release;

    const result = snapshot + text;
    await super.writeText(path, result);
    this.events.push({
      type: 'write',
      path,
      callId,
      resultBytes: encoder.encode(result).length,
    });
    race.completed += 1;
    if (race.completed === race.participants) {
      if (race.releaseMode === null) throw new Error(`append race completed without release for ${path}`);
      this.events.push({
        type: 'complete',
        path,
        releaseMode: race.releaseMode,
        attempts: race.attempts,
      });
      this.armed = null;
    }
  }
}
