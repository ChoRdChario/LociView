/** A complete original-size JPEG for inspection. Its owner must close the frame. */
export async function decodeNativeJpegFrame(data: ImageDecoderInit['data']): Promise<Pick<ImageBitmap, 'width' | 'height' | 'close'> | undefined> {
  if (typeof ImageDecoder === 'undefined' || !await ImageDecoder.isTypeSupported('image/jpeg')) return;
  let decoder: ImageDecoder | undefined;
  try {
    decoder = new ImageDecoder({ type: 'image/jpeg', data, colorSpaceConversion: 'none' });
    const { image, complete } = await decoder.decode({ frameIndex: 0, completeFramesOnly: true });
    if (!complete) {
      image.close();
      throw Error('JPEGの画像を最後まで表示できません。');
    }
    return { width: image.displayWidth, height: image.displayHeight, close: () => image.close() };
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotSupportedError')) throw error;
  } finally {
    decoder?.close();
  }
}
