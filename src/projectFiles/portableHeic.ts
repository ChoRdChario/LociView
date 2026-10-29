import { heicStructure, heicGuidance } from './heic';
import { inspectValidationPng, type PngDecoder } from './png';
import { fileError, type FileValidationLimits } from './validation';
import type { PortableDisplay } from '../domain/portableMedia';

export interface HeicBitmap { readonly width: number; readonly height: number; close(): void }
export type HeicRasterEncoder = (bitmap: HeicBitmap, signal: AbortSignal) => Promise<Blob>;
const cancelled = () => new DOMException('選択を取り消しました。', 'AbortError');
function sourceShape(bytes: Uint8Array, limits: FileValidationLimits) {
  try { return heicStructure(bytes, limits); }
  catch { return fileError(heicGuidance); }
}
/** Original structure plus independently decoded raster; never claims pixel equivalence. */
export async function inspectPortableHeic(bytes: Uint8Array, raster: Uint8Array, display: PortableDisplay,
  limits: FileValidationLimits, png?: PngDecoder) {
  const source = sourceShape(bytes, limits), dimensions = await inspectValidationPng(raster, limits, png);
  if (display.kind !== 'native-heic-raster-v1' || display.blob.mediaType !== 'image/png' ||
    dimensions.width !== display.width || dimensions.height !== display.height ||
    !(display.width === source.width && display.height === source.height || display.width === source.height && display.height === source.width))
    return fileError('HEIC原本と表示用画像の情報が一致しません。');
  return { sourceCheck: 'structure', displayCheck: 'decoded', width: display.width, height: display.height } as const;
}
/** Own the canvas through asynchronous toBlob, including a callback after retirement. */
export const browserHeicRasterEncoder: HeicRasterEncoder = (bitmap, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(cancelled()); return; }
  if (typeof document === 'undefined') { reject(Error(heicGuidance)); return; }
  const canvas = document.createElement('canvas'); let ended = false;
  const finish = (blob?: Blob, error?: unknown) => {
    if (ended) return; ended = true; signal.removeEventListener('abort', abort);
    canvas.width = canvas.height = 0;
    if (error) reject(error); else if (blob) resolve(blob); else reject(Error('表示用画像を作成できませんでした。原本は変更していません。'));
  };
  const abort = () => finish(undefined, cancelled()); signal.addEventListener('abort', abort, { once: true });
  try {
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d'); if (!context) return finish(undefined, Error(heicGuidance));
    context.drawImage(bitmap as CanvasImageSource, 0, 0);
    canvas.toBlob(blob => finish(blob ?? undefined), 'image/png');
  } catch { finish(undefined, Error('表示用画像を作成できませんでした。原本は変更していません。HEICを読み込めるブラウザで追加するか、JPEG/PNGを書き出して選択してください。')); }
});

/** One operation-owned native decode/export/check; resulting bytes are never regenerated on retry. */
export async function createPortableHeic(bytes: Uint8Array, limits: FileValidationLimits,
  decode: (bytes: Uint8Array) => Promise<HeicBitmap>, png?: PngDecoder,
  encode: HeicRasterEncoder = browserHeicRasterEncoder, signal?: AbortSignal) {
  const shape = sourceShape(bytes, limits);
  if (signal?.aborted) throw cancelled();
  const controller = new AbortController(); let bitmap: HeicBitmap | undefined, closed = false;
  const close = () => { if (bitmap && !closed) { closed = true; bitmap.close(); } };
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  let retire: (() => void) | undefined;
  const pending = (async () => {
    try { bitmap = await decode(bytes.slice()); }
    catch { if (signal?.aborted) throw cancelled(); return fileError(heicGuidance); }
    try {
      if (controller.signal.aborted) throw signal?.aborted ? cancelled() : Error(heicGuidance);
      if (!(bitmap.width === shape.width && bitmap.height === shape.height || bitmap.width === shape.height && bitmap.height === shape.width)) return fileError(heicGuidance);
      const width = bitmap.width, height = bitmap.height, blob = await encode(bitmap, controller.signal);
      if (controller.signal.aborted) throw signal?.aborted ? cancelled() : Error(heicGuidance);
      if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size <= 0 || blob.size > limits.maxFileBytes)
        return fileError('表示用PNGが容量の上限を超えているか、作成できませんでした。原本は変更していません。');
      const raster = new Uint8Array(await blob.arrayBuffer()), dimensions = await inspectValidationPng(raster, limits, png);
      if (controller.signal.aborted) throw signal?.aborted ? cancelled() : Error(heicGuidance);
      if (dimensions.width !== width || dimensions.height !== height) return fileError('表示用画像の大きさが一致しません。');
      return { bytes: raster, width, height };
    } finally { close(); }
  })();
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      retire = () => reject(signal?.aborted ? cancelled() : Error('表示用画像を作成できませんでした。原本を残し、HEICを読み込めるブラウザで追加してください。'));
      controller.signal.addEventListener('abort', retire, { once: true }); if (controller.signal.aborted) retire();
    })]);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort); if (retire) controller.signal.removeEventListener('abort', retire);
    controller.abort(); close();
  }
}
