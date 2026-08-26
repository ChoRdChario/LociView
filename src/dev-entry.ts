// The ordinary manual harness remains the default. Spark is loaded only after
// an explicit nondefault full-page navigation to dev.html?mode=spark.
const mode = new URLSearchParams(globalThis.location.search).get('mode') ?? 'v1';

export {};

if (mode === 'v1') {
  await import('./devharness');
} else if (mode === 'spark') {
  await import('./harness/sparkHarness');
} else {
  document.body.innerHTML = `<main style="padding:24px;font:16px system-ui;color:#fecaca;background:#111827;min-height:100vh">
    Unknown development harness mode: <code>${mode.replace(/[<>&"']/g, '')}</code>
  </main>`;
  throw new Error(`Unknown development harness mode: ${mode}`);
}
