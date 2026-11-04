import { describe, expect, it, vi } from 'vitest';
import { createMediaImageViewport } from '../../src/ui/projectScene/mediaImageViewport';
import { RecordedDocument, record } from './domRecorder';

function fixture() {
  const document = new RecordedDocument(), viewport = Object.assign(document.createElement('div'), { clientWidth: 400, clientHeight: 200, scrollLeft: 0 });
  const zoom = createMediaImageViewport(document.asDocument(), viewport as unknown as HTMLElement);
  const toolbar = record(zoom.toolbar), button = (text: string) => toolbar.children.find(n => n.tag === 'button' && n.textContent === text)!;
  const percent = () => toolbar.children.find(n => n.tag === 'output')!.textContent;
  const image = (width: number, height: number) => Object.assign(document.createElement('img'), { naturalWidth: width, naturalHeight: height }) as unknown as HTMLImageElement;
  return { document, viewport, zoom, button, percent, image };
}

describe('existing media dialog image inspection', () => {
  it('fits original pixels, zooms around the centre and preserves inspection through host renders', () => {
    const f = fixture(), image = f.image(800, 400); f.zoom.setImage(image);
    expect(f.percent()).toBe('50%'); expect(image.style.width).toBe('400px'); expect(f.button('縮小').disabled).toBe(true);
    f.button('原寸').click(); expect(f.percent()).toBe('100%'); expect(image.style.width).toBe('800px');
    expect(f.viewport.scrollLeft).toBe(200); expect(f.viewport.scrollTop).toBe(100);
    f.button('拡大').click(); expect(f.percent()).toBe('125%'); expect(f.viewport.scrollLeft).toBe(300);
    f.zoom.render(); f.zoom.setImage(image); expect(f.percent()).toBe('125%'); expect(f.viewport.scrollLeft).toBe(300);
    f.zoom.setImage(f.image(2000, 1000)); expect(f.percent()).toBe('20%'); expect(f.viewport.scrollLeft).toBe(0);
    f.zoom.dispose();
  });
  it('provides keyboard pan without stealing media navigation, browser zoom or composition', () => {
    const f = fixture(), preventDefault = vi.fn(), stopPropagation = vi.fn(); f.zoom.setImage(f.image(800, 400)); f.button('原寸').click();
    f.viewport.fire('keydown', { key: 'ArrowRight', preventDefault, stopPropagation }); expect(preventDefault).not.toHaveBeenCalled();
    f.viewport.fire('keydown', { key: '+', ctrlKey: true, preventDefault, stopPropagation });
    f.viewport.fire('keydown', { key: '+', isComposing: true, preventDefault, stopPropagation }); expect(f.percent()).toBe('100%');
    f.viewport.fire('keydown', { key: 'ArrowRight', shiftKey: true, preventDefault, stopPropagation }); expect(f.viewport.scrollLeft).toBe(240); expect(stopPropagation).toHaveBeenCalledOnce();
    f.viewport.fire('keydown', { key: '0', preventDefault, stopPropagation }); expect(f.percent()).toBe('50%'); expect(f.viewport.scrollLeft).toBe(0);
    f.zoom.dispose();
  });
  it('clears image dimensions for native media and disposes its event lifetime', () => {
    const f = fixture(),capture=vi.fn(),release=vi.fn(),preventDefault=vi.fn();Object.assign(f.viewport,{setPointerCapture:capture,hasPointerCapture:()=>true,releasePointerCapture:release});
    f.zoom.setImage(f.image(800, 400)); f.button('原寸').click();expect(f.viewport.attributes.get('aria-label')).toBe('画像の表示領域');
    f.viewport.fire('pointerdown',{pointerId:7,button:0,clientX:50,clientY:30,preventDefault});expect(capture).toHaveBeenCalledWith(7);
    f.zoom.setImage(null); expect(f.zoom.toolbar.hidden).toBe(true); expect(f.zoom.imageHost.style.width).toBe('');
    expect(release).toHaveBeenCalledWith(7);expect(f.viewport.attributes.has('aria-label')).toBe(false);
    expect(f.viewport.className).not.toContain('lv-media-zoom-viewport'); expect(f.viewport.dataset.zoomed).toBe('false');
    f.zoom.dispose(); expect(f.viewport.listeners.get('keydown')?.size).toBe(0); expect(f.viewport.listeners.get('wheel')?.size).toBe(0);
    f.zoom.setImage(f.image(800, 400)); expect(f.zoom.toolbar.hidden).toBe(true);
  });
  it('pinches from fit, pans with the remaining touch and clears capture when the image changes', () => {
    const f = fixture(), release = vi.fn();
    Object.assign(f.viewport, { getBoundingClientRect: () => ({ left: 0, top: 0 }), hasPointerCapture: () => true, releasePointerCapture: release });
    f.zoom.setImage(f.image(800, 400));
    const send = (event: string, pointerId: number, clientX: number) =>
      f.viewport.fire(event, { pointerType: 'touch', pointerId, clientX, clientY: 100 });
    send('pointerdown', 1, 100);
    send('pointerdown', 2, 300);
    send('pointermove', 2, 400);
    expect(f.percent()).toBe('75%');
    send('pointercancel', 2, 400);
    const left = f.viewport.scrollLeft;
    send('pointermove', 1, 80);
    expect(f.viewport.scrollLeft).toBe(left + 20);
    f.zoom.setImage(f.image(400, 200));
    expect(release).toHaveBeenCalledWith(1);
    expect(f.percent()).toBe('100%');
    expect(f.viewport.scrollLeft).toBe(0);
    f.zoom.dispose();
  });
});
