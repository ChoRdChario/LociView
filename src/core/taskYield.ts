/** One owned task boundary; no shared queue, retained ports or transferred data. */
export function yieldTask(): Promise<void> {
  return new Promise((resolve, reject) => {
    let channel: MessageChannel | undefined, finished = false;
    const finish = (fallback = false) => {
      if (finished) return; finished = true;
      let failed = false, failure: unknown;
      if (channel) {
        for (const port of [channel.port1, channel.port2]) {
          try { port.onmessage = null; port.onmessageerror = null; }
          catch (error) { if (!failed) { failed = true; failure = error; } }
          try { port.close(); } catch (error) { if (!failed) { failed = true; failure = error; } }
        }
      }
      if (failed) reject(failure);
      else if (fallback) { try { setTimeout(resolve, 0); } catch (error) { reject(error); } }
      else resolve();
    };
    try {
      if (typeof MessageChannel !== 'function') { finish(true); return; }
      channel = new MessageChannel(); channel.port1.onmessage = () => finish(); channel.port1.onmessageerror = () => finish(true);
      channel.port2.postMessage(null);
    } catch { finish(true); }
  });
}
