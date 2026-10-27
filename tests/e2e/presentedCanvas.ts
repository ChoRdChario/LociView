import type { Locator } from '@playwright/test';

/** Inspect the presented image, not an already discarded default WebGL buffer. */
export async function presentedCanvas(canvas: Locator, dx = 0, dy = 0) {
  const png = await canvas.screenshot({ scale: 'device', style: '.lv-project-markers,.lv-development-pin-layer{visibility:hidden!important}' });
  return canvas.evaluate(async (element, input) => {
    const blob = await (await fetch(`data:image/png;base64,${input.png}`)).blob();
    const bitmap = await createImageBitmap(blob), copy = document.createElement('canvas');
    copy.width = bitmap.width; copy.height = bitmap.height;
    const context = copy.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
    let red = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i]! > pixels[i + 1]! + 10 && Math.abs(pixels[i + 1]! - pixels[i + 2]!) < 10) red++;
    const rect = element.getBoundingClientRect();
    const x = Math.floor((rect.width / 2 + input.dx) * copy.width / rect.width);
    const y = Math.floor((rect.height / 2 + input.dy) * copy.height / rect.height);
    if (!(rect.width > 0 && rect.height > 0) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= copy.width || y >= copy.height)
      throw Error('Canvas sample is outside the presented image');
    const offset = (y * copy.width + x) * 4;
    return { sample: [...pixels.slice(offset, offset + 4)], red };
  }, { png: png.toString('base64'), dx, dy });
}
