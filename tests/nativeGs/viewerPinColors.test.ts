import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NativeGsViewer } from '../../src/nativeGs/viewer';
import { makeNativeDraft, snapshotFromDraft, NATIVE_TEST_IDS } from './nativeTestProject';

/** Exercise real marker/projection/picking methods without creating WebGL. */
function fixture() {
  const initial = snapshotFromDraft(makeNativeDraft().draft);
  const caption = {
    id: NATIVE_TEST_IDS.caption, title: 'Synthetic pin', body: '', color: '#7293b0',
    anchor: {
      kind: 'asset' as const, assetId: NATIVE_TEST_IDS.gsAsset,
      assetFrameId: NATIVE_TEST_IDS.gsFrame, positionAsset: [0,0,0] as const,
      authoredAssetRevisionId: NATIVE_TEST_IDS.gsRevision,
      authoredAnchorCompatibilityId: NATIVE_TEST_IDS.gsClass,
      hitEvidence: { method: 'manual' as const },
    },
  };
  const snapshot = { ...initial, captions: [caption] };
  const scene = new THREE.Scene();
  const groups = new Map(initial.assets.map((asset) => [asset.id, new THREE.Group()]));
  for (const group of groups.values()) scene.add(group);
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, .1, 100);
  camera.position.z = 5; camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
  const markers = new Map<string, THREE.Mesh>();
  const resolution = { visibleRepresentationIds: initial.representations.map((rep) => rep.id) };
  const target = { kind: 'caption' };
  const raycaster = new THREE.Raycaster();
  const viewer = Object.create(NativeGsViewer.prototype) as NativeGsViewer;
  Object.assign(viewer, {
    snapshot, scene, camera, captionMarkers: markers, assetGroups: groups,
    resolution, currentCaption: caption, gizmoTarget: target,
    repositionCaptionId: caption.id, visibleCaptionColors: null,
    editingEnabled: true, activeDisplaySetOverride: null,
    gizmoRoot: new THREE.Group(),
    gizmo: { detach: vi.fn(), setMode: vi.fn(), attach: vi.fn() },
    canvas: { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ width: 800, height: 600 }) },
    raycaster, callbacks: { onCaptionSelected: vi.fn() },
  });
  return { viewer, markers, snapshot, caption, target, resolution, raycaster };
}

describe('Native pin color marker integration (no WebGL)', () => {
  it('keeps selection, placement and project bytes while filtering the actual marker', () => {
    const { viewer, markers, snapshot, caption, target } = fixture();
    const before = JSON.stringify(snapshot);
    viewer.setCaptionColorFilter(new Set());
    expect(markers.get(caption.id)?.visible).toBe(false);
    expect(viewer.projectCaption(caption.id)).toBeNull();
    expect(viewer.projectCaption(caption.id, true)).toMatchObject({ visible: true, xCss: 400, yCss: 300 });
    expect(viewer.isCaptionColorVisible(caption.id)).toBe(false);
    expect(viewer.getPositionEditingTarget()).toBe(target);
    expect(viewer.isCaptionRepositioning()).toBe(true);
    expect(JSON.stringify(snapshot)).toBe(before);
    viewer.setCaptionColorFilter(null);
    expect(markers.get(caption.id)?.visible).toBe(true);
    expect(viewer.isCaptionRepositioning()).toBe(true);
  });

  it('does not let color reveal override an unavailable/hidden Asset', () => {
    const { viewer, markers, caption, resolution } = fixture();
    resolution.visibleRepresentationIds = [];
    viewer.setCaptionColorFilter(null);
    expect(markers.get(caption.id)?.visible).toBe(false);
    expect(viewer.projectCaption(caption.id, true)).toBeNull();
  });

  it('excludes color-hidden markers from both exact ray and screen-space selection', () => {
    const { viewer, raycaster } = fixture();
    viewer.setCaptionColorFilter(new Set());
    const ray = vi.spyOn(raycaster, 'intersectObjects');
    const pick = viewer as unknown as {
      selectCaptionAt(point: THREE.Vector2): boolean;
      pickCaptionIdInScreenSpace(point: THREE.Vector2): string | null;
    };
    expect(pick.pickCaptionIdInScreenSpace(new THREE.Vector2())).toBeNull();
    expect(pick.selectCaptionAt(new THREE.Vector2())).toBe(false);
    expect(ray.mock.calls[0]?.[0]).toEqual([]);
  });
});
