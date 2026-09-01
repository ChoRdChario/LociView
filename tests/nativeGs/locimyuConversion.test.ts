import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildImportPlan } from '../../src/assets/importWizard';
import { serializeGlb } from '../../src/assets/glbOptimize';
import { readZipEntries, writeZipEntries } from '../../src/assets/zipio';
import {
  assertLociMyuSourceUnchanged,
  completeLociMyuNativeConversionReport,
  createLociMyuNativeProject,
  planLociMyuZipToNative,
} from '../../src/nativeGs/locimyuConversion';
import { listNativeProjectsV1, nativeProjectRoot, openNativeProjectV1 } from '../../src/nativeGs/storage';
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';
import { makeXlsx } from '../helpers/makeXlsx';

const fixturePath = resolve('fixtures/v1-migration/locimyu-drive-exact-v1.zip');
const captionHeader = ['id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt'];
const viewHeader = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
const materialHeader = ['materialKey', 'opacity', 'doubleSided', 'unlitLike', 'chromaEnable', 'chromaColor', 'chromaTolerance', 'chromaFeather', 'roughness', 'metalness', 'emissiveHex', 'updatedAt', 'updatedBy', 'sheetGid'];
const encoder = new TextEncoder();

function duplicateNamedMaterialGlb(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  return serializeGlb({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0 }, { mesh: 0, translation: [2, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: '  Shared  ', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 }],
    accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  }, new Uint8Array(positions.buffer));
}

function texturedNamedMaterialGlb(): Uint8Array {
  const positions = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const image = new Uint8Array(24);
  image.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  image.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(image.buffer).setUint32(16, 8192);
  new DataView(image.buffer).setUint32(20, 4096);
  const bin = new Uint8Array(positions.byteLength + image.byteLength);
  bin.set(positions);
  bin.set(image, positions.byteLength);
  return serializeGlb({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: 'Shared', pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: 1, mimeType: 'image/png' }],
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: image.byteLength },
    ],
    accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  }, bin);
}

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function captionCsv(rows: readonly (readonly string[])[]): Uint8Array {
  return encoder.encode(`${[captionHeader, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`);
}

describe('LociMyu ZIP to native direct adapter', () => {
  it('reuses recipe-2 identity and converts only exact source-authoritative relations', async () => {
    const bytes = new Uint8Array(await readFile(fixturePath));
    const file = new File([Uint8Array.from(bytes)], 'locimyu-drive-exact-v1.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(bytes), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Direct native fixture');

    expect(plan.blockingIssueCount).toBe(0);
    expect(importPlan.sources[importPlan.selectedSourceIndex]!.fileName).toBe('LociMyu Save.xlsx');
    expect(plan.draft.assets).toHaveLength(1);
    expect(plan.draft.representations).toHaveLength(1);
    expect(plan.draft.displaySets).toHaveLength(2);
    expect(plan.draft.captions.map((caption) => caption.id)).toEqual(expect.arrayContaining([
      'cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40',
      'cap_4BAEWJVQTVNFB6FNH23E4ZGCVB',
    ]));
    expect(plan.inventory.duplicateOccurrenceCount).toBe(0);
    expect(plan.draft.mediaResources).toHaveLength(1);
    expect(plan.draft.savedViews).toHaveLength(1);
    const approximatedView = plan.draft.savedViews![0]!;
    expect(approximatedView.camera.projection.kind).toBe('orthographic');
    if (approximatedView.camera.projection.kind !== 'orthographic') throw new Error('expected orthographic view');
    expect(approximatedView.camera.projection.verticalSpan).toBeCloseTo(5.85786437626905, 12);
    expect(plan.draft.displaySets?.find((set) => set.id === approximatedView.displaySetId)?.defaultSavedViewId)
      .toBe(approximatedView.id);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      code: 'orthographic-view-span-approximated',
      severity: 'warning',
      candidates: expect.arrayContaining([
        'fovDegrees=45',
        'fovSource=legacy-default',
        'upSource=legacy-default-y-up',
        'verticalSpan=5.85786437626905',
      ]),
    }));
    expect(plan.mappings).toContainEqual(expect.objectContaining({
      sourceKind: 'view row',
      sourceId: 'v_SYNTH_LAST',
      disposition: 'converted',
      targetKind: 'SavedView',
      targetId: approximatedView.id,
      note: 'orthographic span uses approved legacy compatibility approximation',
    }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'sheet-authority-fields-reported', field: 'updatedAt' }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'view-fields-reported' }));
    expect(plan.mappings.some((entry) => entry.sourceKind === 'image' && entry.disposition === 'reported')).toBe(true);
    await expect(assertLociMyuSourceUnchanged(plan, file)).resolves.toEqual(plan.sourceBefore);

    const fs = new MemoryFS();
    const session = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    session.activateNewProject();
    const snapshot = await createLociMyuNativeProject(session.workspace, plan, file);
    const opened = await openNativeProjectV1(fs, snapshot.project.id);
    expect(opened.missingRepresentationIds).toEqual([]);
    expect(opened.missingMediaIds).toEqual([]);
    expect(opened.snapshot.captions.map((caption) => caption.id)).toEqual(plan.draft.captions.map((caption) => caption.id));
    expect(opened.snapshot.savedViews).toEqual(plan.draft.savedViews);
    expect(opened.snapshot.displaySets).toEqual(plan.draft.displaySets);
    session.release();
  });

  it('approximates only admitted orthographic rows and does not default malformed values', async () => {
    const sheetNames = ['Valid', 'Invalid FOV', 'Same eye target', 'Parallel up', 'Overflow span', 'Partial up'];
    const workbook = await makeXlsx([
      ...sheetNames.map((name, index) => ({
        name,
        rows: [captionHeader, [`c_${index + 1}`, name, '', '#eab308', '0', '0', '0', '', '', '']],
      })),
      {
        name: '__LM_SHEET_NAMES',
        rows: [
          ['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'],
          ...sheetNames.map((name, index) => [String(index + 1), name, name, '']),
        ],
      },
      {
        name: '__LM_VIEWS',
        rows: [
          viewHeader,
          ['v_valid', '1', 'valid', '', 'orthographic', '0', '0', '10', '0', '0', '0', '0', '1', '0', '60', '', ''],
          ['v_invalid_fov', '2', 'invalid fov', '', 'orthographic', '0', '0', '10', '0', '0', '0', '0', '1', '0', '0', '', ''],
          ['v_same', '3', 'same', '', 'orthographic', '0', '0', '0', '0', '0', '0', '0', '1', '0', '', '', ''],
          ['v_parallel', '4', 'parallel', '', 'orthographic', '0', '0', '10', '0', '0', '0', '0', '0', '1', '', '', ''],
          ['v_overflow', '5', 'overflow', '', 'orthographic', '1e307', '0', '0', '0', '0', '0', '0', '1', '0', '178', '', ''],
          ['v_partial_up', '6', 'partial up', '', 'orthographic', '0', '0', '10', '0', '0', '0', '', '1', '0', '', '', ''],
        ],
      },
    ]);
    const zip = await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: workbook },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'orthographic-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Orthographic compatibility fixture');

    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.draft.savedViews).toHaveLength(1);
    const view = plan.draft.savedViews![0]!;
    expect(view.name).toBe('valid');
    expect(view.camera.projection.kind).toBe('orthographic');
    if (view.camera.projection.kind !== 'orthographic') throw new Error('expected orthographic view');
    expect(view.camera.projection.verticalSpan).toBeCloseTo(11.547005383792515, 12);
    expect(plan.draft.displaySets?.find((set) => set.id === view.displaySetId)?.defaultSavedViewId).toBe(view.id);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      code: 'orthographic-view-span-approximated',
      sourceId: 'v_valid',
      candidates: expect.arrayContaining(['fovDegrees=60', 'fovSource=source', 'upSource=source']),
    }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'view-camera-values-reported', sourceId: 'v_invalid_fov' }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'view-camera-basis-reported', sourceId: 'v_same' }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'view-camera-basis-reported', sourceId: 'v_parallel' }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'orthographic-view-span-reported', sourceId: 'v_overflow' }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'view-camera-values-reported', sourceId: 'v_partial_up' }));
    expect(plan.mappings.filter((entry) => entry.sourceKind === 'view row' && entry.disposition === 'converted'))
      .toHaveLength(1);
  });

  it('broadcasts one exact-name material row to every matching slot and preserves source chroma', async () => {
    const workbook = await makeXlsx([
      { name: 'S', rows: [captionHeader, ['c_1', 'A', '', '#eab308', '0', '0', '0', '', '', '']] },
      {
        name: '__LM_SHEET_NAMES',
        rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ['55', 'S', 'S', '']],
      },
      {
        name: '__LM_MATERIALS',
        rows: [
          materialHeader,
          ['Shared', '0.35', 'TRUE', 'FALSE', 'TRUE', '#00ff00', '', '0.05', '', '', '', '', '', '55'],
        ],
      },
    ]);
    const zip = await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: workbook },
      { path: 'models/duplicate-material.glb', data: duplicateNamedMaterialGlb() },
    ]);
    const file = new File([Uint8Array.from(zip)], 'duplicate-material-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Duplicate material fixture');

    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.draft.meshMaterialAppearances).toHaveLength(2);
    expect(new Set(plan.draft.meshMaterialAppearances?.map((appearance) => appearance.materialSlotKey)).size).toBe(2);
    expect(plan.draft.meshMaterialAppearances).toEqual(expect.arrayContaining([
      expect.objectContaining({
        opacity: 0.35,
        doubleSided: true,
        unlit: false,
        chroma: { enabled: true, colorSrgb: [0, 1, 0], tolerance: 0, feather: 0.05 },
      }),
    ]));
    expect(plan.issues.some((entry) => entry.code === 'material-relation-inactive')).toBe(false);
    expect(plan.issues.some((entry) => entry.code === 'material-chroma-disabled-for-parity')).toBe(false);
    expect(plan.mappings.filter((entry) => entry.sourceKind === 'material row' && entry.disposition === 'converted')).toHaveLength(2);
  });

  it('inspects textured GLB material identity without decoding its pixels', async () => {
    const workbook = await makeXlsx([
      { name: 'S', rows: [captionHeader, ['c_1', 'A', '', '#eab308', '0', '0', '0', '', '', '']] },
      {
        name: '__LM_SHEET_NAMES',
        rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ['55', 'S', 'S', '']],
      },
      {
        name: '__LM_MATERIALS',
        rows: [materialHeader, ['Shared', '0.5', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '', '', '', '', '55']],
      },
    ]);
    const zip = await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: workbook },
      { path: 'models/textured.glb', data: texturedNamedMaterialGlb() },
    ]);
    const file = new File([Uint8Array.from(zip)], 'textured-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const decode = vi.fn(() => Promise.reject(new Error('pixel decode must not run')));
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('createImageBitmap', decode);
    try {
      const plan = await planLociMyuZipToNative(file, importPlan, 'Textured material inspection');
      expect(plan.blockingIssueCount).toBe(0);
      expect(plan.draft.meshMaterialAppearances).toContainEqual(expect.objectContaining({ opacity: 0.5 }));
      expect(decode).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('activates only a complete user-confirmed relation while preserving Caption identity', async () => {
    const workbook = await makeXlsx([
      { name: 'S1', rows: [captionHeader, ['c_1', 'one', '', '#eab308', '0', '0', '0', '', '', '']] },
      { name: 'S2', rows: [captionHeader, ['c_2', 'two', '', '#eab308', '1', '0', '0', '', '', '']] },
      { name: 'S3', rows: [captionHeader, ['c_3', 'three', '', '#eab308', '2', '0', '0', '', '', '']] },
      {
        name: '__LM_SHEET_NAMES',
        rows: [['sheetGid', 'displayName', 'sheetTitle', 'updatedAt'], ['11', 'S1', 'S1', '']],
      },
      {
        name: '__LM_VIEWS',
        rows: [
          viewHeader,
          ['v_1', '11', 'view one', '', 'perspective', '1', '2', '3', '0', '0', '0', '0', '1', '0', '45', '', ''],
          ['v_2', '22', 'view two', '', 'perspective', '2', '2', '3', '0', '0', '0', '0', '1', '0', '45', '', ''],
          ['v_3', '33', 'view three', '', 'perspective', '3', '2', '3', '0', '0', '0', '0', '1', '0', '45', '', ''],
        ],
      },
      {
        name: '__LM_MATERIALS',
        rows: [
          materialHeader,
          ['Shared', '1', 'FALSE', 'FALSE', 'FALSE', '', '', '', '', '', '', '', '', '11'],
          ['Shared', '0.5', 'FALSE', 'TRUE', 'FALSE', '', '', '', '', '', '', '', '', '22'],
          ['Shared', '0.25', 'TRUE', 'FALSE', 'TRUE', '#00ff00', '0.1', '0.2', '', '', '', '', '', '33'],
        ],
      },
    ]);
    const zip = await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: workbook },
      { path: 'models/duplicate-material.glb', data: duplicateNamedMaterialGlb() },
    ]);
    const file = new File([Uint8Array.from(zip)], 'corroborated-display-set-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });

    const unconfirmed = await planLociMyuZipToNative(file, importPlan, 'Unconfirmed relation');
    expect(unconfirmed.blockingIssueCount).toBe(0);
    expect(unconfirmed.draft.savedViews).toHaveLength(1);
    expect(unconfirmed.draft.meshMaterialAppearances).toHaveLength(2);
    expect(unconfirmed.issues).toContainEqual(expect.objectContaining({
      code: 'display-set-relation-confirmation-required',
      severity: 'info',
      candidates: ['22:S2', '33:S3'],
    }));
    expect(unconfirmed.issues.filter((entry) => entry.code === 'view-relation-inactive')).toHaveLength(2);
    expect(unconfirmed.issues.filter((entry) => entry.code === 'material-relation-inactive')).toHaveLength(2);

    const confirmation = {
      workbookArchivePath: 'LociMyu Save.xlsx',
      relations: [
        { sheetGid: '22', sheetName: 'S2' },
        { sheetGid: '33', sheetName: 'S3' },
      ],
    } as const;
    const confirmed = await planLociMyuZipToNative(file, importPlan, 'Confirmed relation', {
      confirmedDisplaySetRelation: confirmation,
    });
    expect(confirmed.blockingIssueCount).toBe(0);
    expect(confirmed.draft.savedViews).toHaveLength(3);
    expect(confirmed.draft.meshMaterialAppearances).toHaveLength(6);
    expect(confirmed.draft.captions.map((caption) => caption.id)).toEqual(
      unconfirmed.draft.captions.map((caption) => caption.id),
    );
    expect(confirmed.issues).toContainEqual(expect.objectContaining({
      code: 'display-set-relation-user-confirmed',
      severity: 'info',
      candidates: ['22:S2', '33:S3'],
    }));
    expect(confirmed.mappings.filter((entry) =>
      entry.sourceKind === 'DisplaySet relation confirmation')).toEqual([
      expect.objectContaining({
        sourceId: '22:S2',
        disposition: 'converted',
        relationBasis: 'user-confirmed-corroborated-order',
      }),
      expect.objectContaining({
        sourceId: '33:S3',
        disposition: 'converted',
        relationBasis: 'user-confirmed-corroborated-order',
      }),
    ]);
    expect(confirmed.mappings).toContainEqual(expect.objectContaining({
      sourceKind: 'sheet authority row',
      disposition: 'converted',
      relationBasis: 'source-exact',
    }));
    expect(confirmed.issues.some((entry) => entry.code === 'view-relation-inactive')).toBe(false);
    expect(confirmed.issues.some((entry) => entry.code === 'material-relation-inactive')).toBe(false);

    const invalidConfirmations = [
      { ...confirmation, workbookArchivePath: 'stale/LociMyu Save.xlsx' },
      { ...confirmation, relations: confirmation.relations.slice(0, 1) },
      { ...confirmation, relations: [...confirmation.relations].reverse() },
      { ...confirmation, relations: [...confirmation.relations, { sheetGid: '44', sheetName: 'injected' }] },
    ];
    for (const invalid of invalidConfirmations) {
      const blocked = await planLociMyuZipToNative(file, importPlan, 'Invalid relation confirmation', {
        confirmedDisplaySetRelation: invalid,
      });
      expect(blocked.blockingIssueCount).toBe(1);
      expect(blocked.issues).toContainEqual(expect.objectContaining({
        code: 'display-set-relation-confirmation-invalid',
        severity: 'blocking',
      }));
      expect(blocked.draft.assets).toEqual([]);
      expect(blocked.draft.displaySets).toEqual([]);
      expect(blocked.representationSources.size).toBe(0);
    }
  });

  it('treats ID-less rows as reported empty input without shifting the valid Caption row', async () => {
    const zip = await writeZipEntries([
      {
        path: 'LociMyu Save.csv',
        data: captionCsv([
          ['', 'first missing ID', '', '', '', '', '', '', '2026-01-01', ''],
          ['c_valid', 'valid row', '', '', '0', '1', '2', '', '', ''],
          ['', 'second missing ID', '', '', '', '', '', '', '', '2026-01-02'],
        ]),
      },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'idless-rows-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'ID-less rows direct fixture');
    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.inventory.captionRowCount).toBe(3);
    expect(plan.issues.filter((entry) => entry.code === 'caption-row-skipped-missing-id')).toEqual([
      expect.objectContaining({ sourceSheet: 'LociMyu Save', sourceRow: 2, field: 'legacyCaptionId' }),
      expect.objectContaining({ sourceSheet: 'LociMyu Save', sourceRow: 4, field: 'legacyCaptionId' }),
    ]);
    expect(plan.mappings.filter((entry) =>
      entry.sourceKind === 'Caption row' && entry.disposition === 'reported')).toEqual([
      expect.objectContaining({ sourceId: 'LociMyu Save:2:(missing legacy ID)' }),
      expect.objectContaining({ sourceId: 'LociMyu Save:4:(missing legacy ID)' }),
    ]);
    expect(plan.draft.captions).toEqual([
      expect.objectContaining({
        title: 'valid row',
        anchor: expect.objectContaining({ positionAsset: [0, 1, 2] }),
      }),
    ]);
    expect(plan.mappings).toContainEqual(expect.objectContaining({
      sourceKind: 'Caption row',
      sourceId: 'LociMyu Save:3:c_valid',
      disposition: 'converted',
    }));
    expect(plan.representationSources.size).toBe(1);
    expect(plan.mediaSources.size).toBe(0);
    expect(plan.draft.assets).toHaveLength(1);
    const after = await assertLociMyuSourceUnchanged(plan, file);

    const fs = new MemoryFS();
    const session = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    session.activateNewProject();
    const snapshot = await createLociMyuNativeProject(session.workspace, plan, file);
    const report = completeLociMyuNativeConversionReport(plan, snapshot, after);
    expect(report.source.unchanged).toBe(true);
    expect(report.convertedCounts.assets).toBe(1);
    expect(report.convertedCounts.captions).toBe(1);
    expect(report.target.snapshotId).toBe(snapshot.snapshotId);
    expect(await listNativeProjectsV1(fs)).toHaveLength(1);
    expect((await openNativeProjectV1(fs, snapshot.project.id)).snapshot.captions).toEqual(snapshot.captions);
    session.release();
  });

  it('reports an identity digest collision without falling through or exposing a publishable draft', async () => {
    const zip = await writeZipEntries([
      {
        path: 'LociMyu Save.csv',
        data: captionCsv([
          ['c_one', 'one', '', '', '', '', '', '', '', ''],
          ['c_two', 'two', '', '', '', '', '', '', '', ''],
        ]),
      },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'collision-locimyu.zip', { type: 'application/zip' });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer as ArrayBuffer);
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    vi.restoreAllMocks();

    expect(importPlan.blockedLociMyuSource).toEqual(expect.objectContaining({ code: 'full-digest-collision' }));
    const plan = await planLociMyuZipToNative(file, importPlan, 'Collision direct fixture');
    expect(plan.blockingIssueCount).toBe(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'full-digest-collision', severity: 'blocking' }));
    expect(plan.draft.assets).toEqual([]);
    expect(plan.representationSources.size).toBe(0);
    expect(plan.mediaSources.size).toBe(0);
  });

  it('does not choose a model owner when the selected dataset contains multiple model entries', async () => {
    const fixture = new Uint8Array(await readFile(fixturePath));
    const entries = await readZipEntries(fixture);
    const model = entries.find((entry) => entry.path.toLowerCase().endsWith('.glb'))!;
    const zip = await writeZipEntries([
      ...entries,
      { path: 'second-model.glb', data: new Uint8Array(model.data) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'multiple-models-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Multiple model fixture');

    expect(plan.blockingIssueCount).toBe(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'model-owner-not-unique', severity: 'blocking' }));
    expect(plan.inventory.modelCount).toBe(2);
    expect(plan.draft.assets).toEqual([]);
    expect(plan.representationSources.size).toBe(0);
  });

  it('does not attach media when the exact filename extension conflicts with its bytes', async () => {
    const entries = await readZipEntries(new Uint8Array(await readFile(fixturePath)));
    const zip = await writeZipEntries(entries.map((entry) => entry.path === 'images/linked.png'
      ? { ...entry, data: new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }
      : entry));
    const file = new File([Uint8Array.from(zip)], 'conflicting-media-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Conflicting media fixture');

    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      code: 'media-filename-bytes-conflict',
      severity: 'warning',
    }));
    expect(plan.draft.mediaResources).toEqual([]);
    expect(plan.mediaSources.size).toBe(0);
    expect(plan.draft.captions.every((caption) => caption.attachmentMediaIds === undefined)).toBe(true);
  });

  it('keeps an unreadable named LociMyu workbook on the direct blocked-report path', async () => {
    const zip = await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: encoder.encode('not an XLSX container') },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'unreadable-workbook-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });

    expect(importPlan.blockedLociMyuSource).toEqual(expect.objectContaining({ code: 'workbook-unreadable' }));
    const plan = await planLociMyuZipToNative(file, importPlan, 'Unreadable workbook fixture');
    expect(plan.blockingIssueCount).toBe(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'workbook-unreadable', severity: 'blocking' }));
    expect(plan.draft.assets).toEqual([]);
    expect(plan.representationSources.size).toBe(0);
  });
});
