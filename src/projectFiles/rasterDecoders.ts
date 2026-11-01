import { pngDimensions } from '../viewer/rasterDimensions';
import { rasterBytes, type RasterResources } from '../viewer/rasterResources';
import { browserPngDecoder, type PngDecoder, type DecodedPng } from './png';
import { browserJpegDecoder, jpegStructure, type JpegDecoder } from './jpeg';
import { fileError, type FileValidationLimits } from './validation';
import { browserPhotoDecoder, photoStructure, type PhotoDecoder } from './photo';
import { browserHeicDecoder, type HeicDecoder, type MediaDecoders } from './media';
import { browserHeicRasterEncoder, type HeicRasterEncoder } from './portableHeic';
import { heicStructure } from './heic';

/** One workspace owner is injected through the existing decoder port, outside persisted policy. */
export function createRasterDecoders(limits: FileValidationLimits, resources: RasterResources) {
  const decode = (bytes: Uint8Array, width: number, height: number, native: () => Promise<DecodedPng>,preserveNative=false) => resources.decode('retry', async () => {
    const pixels = rasterBytes(width, height), lease = resources.reserve({ cpuBytes: pixels + bytes.length * 2, gpuBytes: 0 }, '画像の検査');
    try {
      const image = await native(); lease.retain({ cpuBytes: pixels, gpuBytes: 0 }, '検査中の画像'); let closed = false;
      return { width: image.width, height: image.height,...(preserveNative?{nativeSource:image as CanvasImageSource}:{}), close() { if (!closed) { closed = true; try { image.close(); } finally { lease.release(); } } } };
    } catch (error) { lease.release(); throw error; }
  }, image => image.close());
  const png: PngDecoder = Object.assign(async (bytes: Uint8Array) => {
    const shape = pngDimensions(bytes); if (!shape) return fileError('PNGの大きさを確認してください。');
    return decode(bytes, shape.width, shape.height, () => browserPngDecoder(bytes));
  }, { rasterResources: resources });
  const jpeg: JpegDecoder = async (bytes, use) => {
    const shape = jpegStructure(bytes, limits, use); return decode(bytes, shape.width, shape.height, () => browserJpegDecoder(bytes, use));
  };
  const photo:PhotoDecoder=async(bytes,mime)=>{const shape=photoStructure(bytes,limits);return decode(bytes,shape.width,shape.height,()=>browserPhotoDecoder(bytes,mime));};
  const heic:HeicDecoder=async bytes=>{const shape=heicStructure(bytes,limits,resources);return decode(bytes,shape.width,shape.height,()=>browserHeicDecoder(bytes),true);};
  const encode:HeicRasterEncoder=(bitmap,signal)=>resources.decode('retry',async()=>{
    const lease=resources.reserve({cpuBytes:rasterBytes(bitmap.width,bitmap.height),gpuBytes:0},'HEICの表示用画像');
    try{return await browserHeicRasterEncoder(bitmap,signal,true);}finally{lease.release();}
  },()=>{},signal);
  const media:MediaDecoders={heic,raster:encode};
  return { png, jpeg, photo, media };
}
