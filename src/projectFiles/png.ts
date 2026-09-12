import { pngDimensions } from '../viewer/rasterDimensions';
import { checkFileLimits, fileError, type FileValidationLimits } from './validation';

export interface DecodedPng { readonly width: number; readonly height: number; close(): void }
export type PngDecoder = (bytes: Uint8Array) => Promise<DecodedPng>;
export const browserPngDecoder: PngDecoder = async bytes => {
  if (typeof createImageBitmap !== 'function') return fileError('このブラウザでは画像の内容を検証できません。');
  return createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/png' }));
};
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
function crc(bytes: Uint8Array): number {
  let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
/** No header-only success: all chunk bytes plus actual decoder success are required. */
export async function inspectValidationPng(input: Uint8Array, limits: FileValidationLimits, decode: PngDecoder = browserPngDecoder) {
  checkFileLimits(limits);
  if (input.length > limits.maxFileBytes) return fileError('画像がこの検証の上限を超えています。');
  const bytes = input.slice(), dimensions = pngDimensions(bytes);
  if (!dimensions || dimensions.width * dimensions.height > limits.maxPixels) return fileError('PNGの大きさを確認してください。');
  const view = new DataView(bytes.buffer); let offset = 8, chunks = 0, idat = false, endedData = false, ended = false;
  while (offset + 12 <= bytes.length) {
    if (++chunks > limits.maxItems) return fileError('PNGの項目数が上限を超えています。');
    const size = view.getUint32(offset), end = offset + size + 12;
    if (end > bytes.length) return fileError('PNGが途中で切れています。');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || crc(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
      return fileError('PNGの内容が壊れています。');
    if (chunks === 1 ? type !== 'IHDR' || size !== 13 : type === 'IHDR') return fileError('PNGのヘッダーが不正です。');
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) return fileError('アニメーションPNGにはまだ対応していません。');
    if (type[0] === type[0]!.toUpperCase() && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type))
      return fileError('未対応のPNG形式です。');
    if (type === 'IDAT') { if (endedData) return fileError('PNGの画像データの順序が不正です。'); idat = true; }
    else if (idat) endedData = true;
    offset = end;
    if (type === 'IEND') { if (size || !idat || offset !== bytes.length) return fileError('PNGの終端が不正です。'); ended = true; break; }
  }
  if (!ended) return fileError('PNGの画像データが不足しています。');
  let image: DecodedPng | undefined;
  try {
    image = await decode(bytes);
    if (image.width !== dimensions.width || image.height !== dimensions.height) return fileError('PNGの表示サイズが一致しません。');
  } catch { return fileError('PNGの画像を表示できません。'); }
  finally { image?.close(); }
  return dimensions;
}
