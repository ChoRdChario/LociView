// Hybrid Logical Clock (docs/02 §4.2)
// 形式: "<ISO8601ms 24桁>-<counter 4hex>-<actorId>"
// 固定幅の前半により、文字列比較がそのまま時刻順比較になる。
// 端末時計が過去に狂っていても、observe済みのhlcより過去の値を発行しないことを保証する。

export interface ParsedHlc {
  physical: number;
  counter: number;
  actor: string;
}

const ISO_LEN = 24; // "YYYY-MM-DDTHH:mm:ss.sssZ"

export function formatHlc(physical: number, counter: number, actor: string): string {
  const iso = new Date(physical).toISOString();
  if (iso.length !== ISO_LEN) {
    // 西暦10000年問題等。固定幅が崩れると順序保証が壊れるため明示的に落とす
    throw new Error(`hlc: non-canonical timestamp: ${iso}`);
  }
  const hex = counter.toString(16).padStart(4, '0');
  return `${iso}-${hex}-${actor}`;
}

export function parseHlc(hlc: string): ParsedHlc {
  const physical = Date.parse(hlc.slice(0, ISO_LEN));
  const counter = parseInt(hlc.slice(ISO_LEN + 1, ISO_LEN + 5), 16);
  const actor = hlc.slice(ISO_LEN + 6);
  if (!Number.isFinite(physical) || !Number.isFinite(counter) || counter < 0 || !actor) {
    throw new Error(`hlc: invalid: ${hlc}`);
  }
  return { physical, counter, actor };
}

/** 文字列比較 = hlc順序比較（固定幅設計による） */
export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class HlcClock {
  private physical = 0;
  private counter = 0;

  constructor(
    readonly actor: string,
    private readonly nowFn: () => number = Date.now,
  ) {}

  /** 新しいopのためのhlcを発行する。単調増加を保証 */
  tick(): string {
    const now = this.nowFn();
    if (now > this.physical) {
      this.physical = now;
      this.counter = 0;
    } else {
      this.counter++;
      if (this.counter > 0xffff) {
        this.physical++;
        this.counter = 0;
      }
    }
    return formatHlc(this.physical, this.counter, this.actor);
  }

  /** 他者のhlcを観測する（マージ取込時に全opに対して呼ぶ）。以後のtickは必ず観測値より後になる */
  observe(remote: string): void {
    const r = parseHlc(remote);
    if (r.physical > this.physical) {
      this.physical = r.physical;
      this.counter = r.counter;
    } else if (r.physical === this.physical && r.counter > this.counter) {
      this.counter = r.counter;
    }
  }
}
