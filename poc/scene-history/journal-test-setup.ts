// Node-only test bootstrap. Never part of a served client module graph.
// The Node entry initializes the same slim API without a browser bundler Wasm import.
import '@automerge/automerge';
