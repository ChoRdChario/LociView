import type { NativeAssetImportV1, NativeBinarySource } from '../../src/nativeGs/storage';
import {
  NATIVE_GS_PROFILE_ID,
  NATIVE_POINT_PROFILE_ID,
  NATIVE_SCHEMA_VERSION,
  NATIVE_SNAPSHOT_FORMAT,
  nativeModelProfileId,
  type NativeBlobRefV1,
  type NativeProjectDraftV1,
  type NativeProjectSnapshotV1,
  type NativeRepresentationDraftV1,
} from '../../src/nativeGs/schema';
import type { NativeGsPlyFactsV1, NativePointPlyFactsV1 } from '../../src/nativeGs/plyProfile';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function testNativeId(prefix: string, ordinal: number): string {
  let value = ordinal;
  let suffix = '';
  do {
    suffix = B32[value % 32]! + suffix;
    value = Math.floor(value / 32);
  } while (value > 0);
  return `${prefix}_${suffix.padStart(26, '0')}`;
}

function numbered(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`);
}

export function makeGsPlySource(
  shDegree: 2 | 3,
  splatCount = 1,
): { readonly source: NativeBinarySource; readonly facts: NativeGsPlyFactsV1; readonly bytes: Uint8Array } {
  const restCount = shDegree === 2 ? 24 : 45;
  const names = [
    'x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2',
    ...numbered('f_rest_', restCount),
    'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
  ];
  const header = [
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${splatCount}`,
    ...names.map((name) => `property float ${name}`),
    'end_header',
    '',
  ].join('\n');
  const headerBytes = new TextEncoder().encode(header);
  const recordStrideBytes = shDegree === 2 ? 164 : 248;
  const payloadByteLength = splatCount * recordStrideBytes;
  const bytes = new Uint8Array(headerBytes.byteLength + payloadByteLength);
  bytes.set(headerBytes);
  const view = new DataView(bytes.buffer);
  const rotOffset = names.indexOf('rot_0') * 4;
  for (let index = 0; index < splatCount; index += 1) {
    view.setFloat32(headerBytes.byteLength + index * recordStrideBytes + rotOffset + 12, 1, true);
  }
  const facts: NativeGsPlyFactsV1 = {
    shDegree,
    splatCount,
    headerByteLength: headerBytes.byteLength,
    recordStrideBytes,
    payloadByteLength,
  };
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  return {
    bytes,
    facts,
    source: { size: blob.size, mediaType: blob.type, stream: () => blob.stream() },
  };
}

export function makePointPlySource(pointCount = 3): {
  readonly source: NativeBinarySource;
  readonly facts: NativePointPlyFactsV1;
  readonly bytes: Uint8Array;
} {
  const header = [
    'ply', 'format ascii 1.0', `element vertex ${pointCount}`,
    'property float x', 'property float y', 'property float z',
    'property uchar red', 'property uchar green', 'property uchar blue',
    'end_header', '',
  ].join('\n');
  const rows = Array.from({ length: pointCount }, (_, index) => `${index} ${index / 2} ${-index} ${index % 256} 64 255`).join('\n');
  const bytes = new TextEncoder().encode(`${header}${rows}\n`);
  const headerByteLength = new TextEncoder().encode(header).byteLength;
  const facts: NativePointPlyFactsV1 = { pointCount, headerByteLength, encoding: 'ascii' };
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  return {
    bytes,
    facts,
    source: { size: blob.size, mediaType: blob.type, stream: () => blob.stream() },
  };
}

export const NATIVE_TEST_IDS = Object.freeze({
  project: testNativeId('prj', 1),
  projectFrame: testNativeId('frm', 1),
  meshAsset: testNativeId('ast', 1),
  meshFrame: testNativeId('frm', 2),
  meshRevision: testNativeId('rev', 1),
  meshBinding: testNativeId('bnd', 1),
  meshRepresentation: testNativeId('rep', 1),
  meshRepresentationFrame: testNativeId('frm', 3),
  meshFamily: testNativeId('fam', 1),
  meshClass: testNativeId('cls', 1),
  gsAsset: testNativeId('ast', 2),
  gsFrame: testNativeId('frm', 4),
  gsRevision: testNativeId('rev', 2),
  gsBinding: testNativeId('bnd', 2),
  gsRepresentation: testNativeId('rep', 2),
  gsRepresentationFrame: testNativeId('frm', 5),
  gsFamily: testNativeId('fam', 2),
  gsClass: testNativeId('cls', 2),
  proxyRepresentation: testNativeId('rep', 3),
  proxyRepresentationFrame: testNativeId('frm', 6),
  proxyFamily: testNativeId('fam', 3),
  caption: testNativeId('cap', 1),
  savedView: testNativeId('view', 1),
  snapshot: testNativeId('snp', 1),
});

export function makeNativeMeshImport(ordinal = 100): {
  readonly imported: NativeAssetImportV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
  readonly assetId: string;
  readonly representationId: string;
  readonly bytes: Uint8Array;
} {
  const assetId = testNativeId('ast', ordinal);
  const assetFrameId = testNativeId('frm', ordinal + 100);
  const revisionId = testNativeId('rev', ordinal);
  const bindingId = testNativeId('bnd', ordinal);
  const representationId = testNativeId('rep', ordinal);
  const representationFrameId = testNativeId('frm', ordinal + 200);
  const familyId = testNativeId('fam', ordinal);
  const compatibilityId = testNativeId('cls', ordinal);
  const bytes = new TextEncoder().encode(`o mesh-${ordinal}\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`);
  const blob = new Blob([bytes], { type: 'text/plain' });
  const sources = new Map<string, NativeBinarySource>([[representationId, {
    size: blob.size,
    mediaType: blob.type,
    stream: () => blob.stream(),
  }]]);
  return {
    assetId,
    representationId,
    bytes,
    sources,
    imported: {
      asset: {
        id: assetId,
        label: `ordinary Mesh ${ordinal}`,
        assetFrameId,
        status: { kind: 'ready', activeBindingId: bindingId },
      },
      binding: {
        id: bindingId,
        assetId,
        assetRevisionId: revisionId,
        assetToProject: { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 },
        method: 'import',
      },
      revision: {
        id: revisionId,
        assetId,
        representationIds: [representationId],
        anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [familyId] }],
      },
      representations: [{
        id: representationId,
        assetId,
        representationFrameId,
        contentKind: 'mesh',
        purposes: ['source', 'display'],
        role: 'meshPrimary',
        variantFamilyId: familyId,
        formatProfile: { id: nativeModelProfileId('obj') },
        representationToAsset: { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1, reflection: 'none' },
        derivedFrom: [],
        mediaType: 'text/plain',
      }],
    },
  };
}

export function makeNativePointImport(ordinal = 300, pointCount = 3): {
  readonly imported: NativeAssetImportV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
  readonly assetId: string;
  readonly representationId: string;
  readonly bytes: Uint8Array;
} {
  const assetId = testNativeId('ast', ordinal);
  const assetFrameId = testNativeId('frm', ordinal + 100);
  const revisionId = testNativeId('rev', ordinal);
  const bindingId = testNativeId('bnd', ordinal);
  const representationId = testNativeId('rep', ordinal);
  const familyId = testNativeId('fam', ordinal);
  const compatibilityId = testNativeId('cls', ordinal);
  const point = makePointPlySource(pointCount);
  return {
    assetId,
    representationId,
    bytes: point.bytes,
    sources: new Map([[representationId, point.source]]),
    imported: {
      asset: {
        id: assetId,
        label: `ordinary Point Asset ${ordinal}`,
        assetFrameId,
        status: { kind: 'ready', activeBindingId: bindingId },
      },
      binding: {
        id: bindingId,
        assetId,
        assetRevisionId: revisionId,
        assetToProject: { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 },
        method: 'import',
      },
      revision: {
        id: revisionId,
        assetId,
        representationIds: [representationId],
        anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [familyId] }],
      },
      representations: [{
        id: representationId,
        assetId,
        representationFrameId: testNativeId('frm', ordinal + 200),
        contentKind: 'pointCloud',
        purposes: ['source', 'display'],
        role: 'pointPrimary',
        variantFamilyId: familyId,
        formatProfile: { id: NATIVE_POINT_PROFILE_ID },
        representationToAsset: { translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1, reflection: 'none' },
        derivedFrom: [],
        pointPly: point.facts,
        mediaType: point.source.mediaType,
      }],
    },
  };
}

export function makeNativeMeshReplacement(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
  ordinal = 120,
): {
  readonly imported: NativeAssetImportV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
  readonly representationId: string;
  readonly revisionId: string;
  readonly compatibilityId: string;
  readonly bytes: Uint8Array;
} {
  const candidate = makeNativeMeshImport(ordinal);
  const asset = snapshot.assets.find((entry) => entry.id === assetId);
  const binding = snapshot.assetBindingRevisions.find((entry) => entry.id === asset?.status.activeBindingId);
  if (asset === undefined || binding === undefined) throw new Error('test replacement Asset is unavailable');
  const compatibilityId = candidate.imported.revision.anchorCompatibilityClasses[0]!.id;
  return {
    sources: candidate.sources,
    representationId: candidate.representationId,
    revisionId: candidate.imported.revision.id,
    compatibilityId,
    bytes: candidate.bytes,
    imported: {
      asset: {
        ...candidate.imported.asset,
        id: asset.id,
        label: asset.label,
        assetFrameId: asset.assetFrameId,
      },
      binding: {
        ...candidate.imported.binding,
        assetId: asset.id,
        assetToProject: binding.assetToProject,
        method: binding.method,
      },
      revision: { ...candidate.imported.revision, assetId: asset.id },
      representations: candidate.imported.representations.map((representation) => ({
        ...representation,
        assetId: asset.id,
      })),
    },
  };
}

export function makeNativeGsReplacement(
  snapshot: NativeProjectSnapshotV1,
  assetId: string,
  ordinal = 140,
): {
  readonly imported: NativeAssetImportV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
  readonly gsRepresentationId: string;
  readonly proxyRepresentationId: string;
  readonly revisionId: string;
  readonly compatibilityId: string;
} {
  const asset = snapshot.assets.find((entry) => entry.id === assetId);
  const activeBinding = snapshot.assetBindingRevisions.find((entry) => entry.id === asset?.status.activeBindingId);
  if (asset === undefined || activeBinding === undefined) throw new Error('test replacement Asset is unavailable');
  const gs = makeGsPlySource(2, 2);
  const proxyBytes = new TextEncoder().encode(`o proxy-${ordinal}\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`);
  const proxyBlob = new Blob([proxyBytes], { type: 'text/plain' });
  const gsRepresentationId = testNativeId('rep', ordinal);
  const proxyRepresentationId = testNativeId('rep', ordinal + 1);
  const gsFamilyId = testNativeId('fam', ordinal);
  const proxyFamilyId = testNativeId('fam', ordinal + 1);
  const revisionId = testNativeId('rev', ordinal);
  const bindingId = testNativeId('bnd', ordinal);
  const compatibilityId = testNativeId('cls', ordinal);
  const identity = {
    translation: [0, 0, 0] as const,
    rotationXYZW: [0, 0, 0, 1] as const,
    uniformScale: 1,
    reflection: 'none' as const,
  };
  return {
    gsRepresentationId,
    proxyRepresentationId,
    revisionId,
    compatibilityId,
    sources: new Map([
      [gsRepresentationId, gs.source],
      [proxyRepresentationId, {
        size: proxyBlob.size,
        mediaType: proxyBlob.type,
        stream: () => proxyBlob.stream(),
      }],
    ]),
    imported: {
      asset: {
        id: asset.id,
        label: asset.label,
        assetFrameId: asset.assetFrameId,
        status: { kind: 'ready', activeBindingId: bindingId },
      },
      binding: {
        id: bindingId,
        assetId: asset.id,
        assetRevisionId: revisionId,
        assetToProject: activeBinding.assetToProject,
        method: activeBinding.method,
      },
      revision: {
        id: revisionId,
        assetId: asset.id,
        representationIds: [gsRepresentationId, proxyRepresentationId],
        anchorCompatibilityClasses: [{ id: compatibilityId, targetVariantFamilyIds: [gsFamilyId] }],
      },
      representations: [{
        id: gsRepresentationId,
        assetId: asset.id,
        representationFrameId: testNativeId('frm', ordinal + 200),
        contentKind: 'gaussianSplat',
        purposes: ['source', 'display'],
        role: 'gsPrimary',
        variantFamilyId: gsFamilyId,
        formatProfile: { id: NATIVE_GS_PROFILE_ID },
        representationToAsset: identity,
        derivedFrom: [],
        gsPly: gs.facts,
        mediaType: 'application/octet-stream',
      }, {
        id: proxyRepresentationId,
        assetId: asset.id,
        representationFrameId: testNativeId('frm', ordinal + 201),
        contentKind: 'mesh',
        purposes: ['interaction'],
        role: 'interactionProxy',
        variantFamilyId: proxyFamilyId,
        formatProfile: { id: nativeModelProfileId('obj') },
        representationToAsset: identity,
        derivedFrom: [gsRepresentationId],
        proxyForGsVariantFamilyId: gsFamilyId,
        mediaType: 'text/plain',
      }],
    },
  };
}

export function makeNativeDraft(shDegree: 2 | 3 = 3): {
  readonly draft: NativeProjectDraftV1;
  readonly sources: ReadonlyMap<string, NativeBinarySource>;
} {
  const ids = NATIVE_TEST_IDS;
  const gs = makeGsPlySource(shDegree);
  const objBytes = new TextEncoder().encode('o tri\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  const meshBlob = new Blob([objBytes], { type: 'text/plain' });
  const meshSource: NativeBinarySource = { size: meshBlob.size, mediaType: 'text/plain', stream: () => meshBlob.stream() };
  const identity = { translation: [0, 0, 0] as const, rotationXYZW: [0, 0, 0, 1] as const, uniformScale: 1, reflection: 'none' as const };
  const representations: NativeRepresentationDraftV1[] = [
    {
      id: ids.meshRepresentation,
      assetId: ids.meshAsset,
      representationFrameId: ids.meshRepresentationFrame,
      contentKind: 'mesh',
      purposes: ['source', 'display'],
      role: 'meshPrimary',
      variantFamilyId: ids.meshFamily,
      formatProfile: { id: nativeModelProfileId('obj') },
      representationToAsset: identity,
      derivedFrom: [],
      mediaType: 'text/plain',
    },
    {
      id: ids.gsRepresentation,
      assetId: ids.gsAsset,
      representationFrameId: ids.gsRepresentationFrame,
      contentKind: 'gaussianSplat',
      purposes: ['source', 'display'],
      role: 'gsPrimary',
      variantFamilyId: ids.gsFamily,
      formatProfile: { id: NATIVE_GS_PROFILE_ID },
      representationToAsset: identity,
      derivedFrom: [],
      gsPly: gs.facts,
      mediaType: 'application/octet-stream',
    },
    {
      id: ids.proxyRepresentation,
      assetId: ids.gsAsset,
      representationFrameId: ids.proxyRepresentationFrame,
      contentKind: 'mesh',
      purposes: ['interaction'],
      role: 'interactionProxy',
      variantFamilyId: ids.proxyFamily,
      formatProfile: { id: nativeModelProfileId('obj') },
      representationToAsset: identity,
      derivedFrom: [ids.gsRepresentation],
      proxyForGsVariantFamilyId: ids.gsFamily,
      mediaType: 'text/plain',
    },
  ];
  const draft: NativeProjectDraftV1 = {
    project: {
      id: ids.project,
      title: 'Native GS test project',
      frame: { id: ids.projectFrame, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } },
    },
    assets: [
      { id: ids.meshAsset, label: 'ordinary Mesh', assetFrameId: ids.meshFrame, status: { kind: 'ready', activeBindingId: ids.meshBinding } },
      { id: ids.gsAsset, label: 'partial GS', assetFrameId: ids.gsFrame, status: { kind: 'ready', activeBindingId: ids.gsBinding } },
    ],
    assetBindingRevisions: [
      {
        id: ids.meshBinding,
        assetId: ids.meshAsset,
        assetRevisionId: ids.meshRevision,
        assetToProject: { translation: [-1.5, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 },
        method: 'import',
      },
      {
        id: ids.gsBinding,
        assetId: ids.gsAsset,
        assetRevisionId: ids.gsRevision,
        assetToProject: {
          translation: [1.25, 0.5, -0.25],
          rotationXYZW: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
          uniformScale: 1.5,
        },
        method: 'manual',
      },
    ],
    assetRevisions: [
      {
        id: ids.meshRevision,
        assetId: ids.meshAsset,
        representationIds: [ids.meshRepresentation],
        anchorCompatibilityClasses: [{ id: ids.meshClass, targetVariantFamilyIds: [ids.meshFamily] }],
      },
      {
        id: ids.gsRevision,
        assetId: ids.gsAsset,
        representationIds: [ids.gsRepresentation, ids.proxyRepresentation],
        anchorCompatibilityClasses: [{ id: ids.gsClass, targetVariantFamilyIds: [ids.gsFamily] }],
      },
    ],
    representations,
    presentation: { displayMode: 'mixed', captionTargetAssetId: ids.gsAsset },
    captions: [],
  };
  return {
    draft,
    sources: new Map([
      [ids.meshRepresentation, meshSource],
      [ids.gsRepresentation, gs.source],
      [ids.proxyRepresentation, meshSource],
    ]),
  };
}

const TEST_BLOB: NativeBlobRefV1 = {
  algorithm: 'sha256',
  digest: 'a'.repeat(64),
  byteLength: 1,
  mediaType: 'application/octet-stream',
};

export function snapshotFromDraft(draft: NativeProjectDraftV1): NativeProjectSnapshotV1 {
  return {
    format: NATIVE_SNAPSHOT_FORMAT,
    schemaVersion: NATIVE_SCHEMA_VERSION,
    snapshotId: NATIVE_TEST_IDS.snapshot,
    generation: 1,
    project: draft.project,
    assets: draft.assets,
    assetBindingRevisions: draft.assetBindingRevisions,
    assetRevisions: draft.assetRevisions,
    representations: draft.representations.map(({ mediaType, ...representation }) => ({
      ...representation,
      blob: representation.gsPly !== undefined
        ? {
            ...TEST_BLOB,
            mediaType,
            byteLength: representation.gsPly.headerByteLength + representation.gsPly.payloadByteLength,
          }
        : representation.pointPly !== undefined
          ? {
              ...TEST_BLOB,
              mediaType,
              byteLength: Math.max(representation.pointPly.headerByteLength + 1, TEST_BLOB.byteLength),
            }
          : { ...TEST_BLOB, mediaType },
    })),
    presentation: draft.presentation,
    captions: draft.captions,
    savedViews: draft.savedViews ?? [],
  };
}
