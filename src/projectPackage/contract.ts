import type { ProjectSemanticProfile } from '../domain/projectProfile';
/** Isolated validation contract, specification 06 §§3/7/11–12. Not published wire adoption. */
export const PACKAGE_FORMAT = 'lociview-project-package';
export const PACKAGE_WIRE_VERSION = '1';
export const SUMMARY_ALGORITHM = 'lociview-project-summary-1';
export const SUMMARY_ALGORITHM2 = 'lociview-project-summary-2';
export type SummaryAlgorithm = typeof SUMMARY_ALGORITHM | typeof SUMMARY_ALGORITHM2;
export const summaryAlgorithm = (profile: ProjectSemanticProfile): SummaryAlgorithm => profile === 'map2' ? SUMMARY_ALGORITHM2 : SUMMARY_ALGORITHM;
export const PACKAGE_LIMITS = Object.freeze({
  archiveBytes: 805_306_368, payloadBytes: 671_088_640, blobBytes: 536_870_912, blobCount: 1024,
  entryCount: 4096, containerMetadataBytes: 4_194_304, controlBytes: 1_048_576, controlsBytes: 4_194_304,
  snapshotBytes: 8_000_000, sourceBytes: 8_000_000, changes: 1000, changeBytes: 1_000_000,
  heads: 1000, dependencyReferences: 100_000, baseEvidenceCount: 32, baseEvidenceBytes: 16_777_216,
  maxDepth: 32, maxNodes: 100_000, maxStringScalars: 65_536,
  inspectionNodes: 1_000_000, inspectionWork: 5_000_000,
  sourceOperations: 20_000, sourceWork: 1_000_000,
  closureRecords: 100_000, closureEdges: 200_000, closureWork: 1_000_000,
  chunkBytes: 16_777_216, streamChunks: 100_000, packageChunks: 1_000_000,
});
export const SUMMARY_FIELDS = Object.freeze({
  project: ['schema', 'identity', 'title', 'frame', 'defaultSceneId'],
  assetsById: ['id', 'lifecycle', 'label', 'assetFrameId', 'status'],
  captionsById: ['id', 'lifecycle', 'title', 'body', 'colorSrgb', 'anchor'],
  captionAttachmentsById: ['id', 'lifecycle', 'captionId', 'mediaResourceId', 'altText', 'orderKey'],
  captionTagsById: ['id', 'lifecycle', 'label', 'colorSrgb', 'orderKey'],
  captionTagMembershipsById: ['id', 'lifecycle', 'captionId', 'tagId'],
  scenesById: ['id', 'lifecycle', 'name', 'orderKey', 'defaultViewId'],
  sceneAssetMembershipsById: ['id', 'lifecycle', 'sceneId', 'assetId', 'orderKey'],
  sceneCaptionMembershipsById: ['id', 'lifecycle', 'sceneId', 'captionId', 'orderKey'],
  viewsById: ['id', 'lifecycle', 'sceneId', 'name', 'orderKey', 'projectFrameId', 'camera', 'background'],
  materialOverridesById: ['id', 'lifecycle', 'routing', 'appearance', 'compositing'],
  assetRevisionsById: ['record'], assetBindingsById: ['record'], representationsById: ['record'], mediaResourcesById: ['record'],
  opaque: ['field'],
} as const);
for (const fields of Object.values(SUMMARY_FIELDS)) Object.freeze(fields);
const SUMMARY_FIELDS2 = Object.freeze({ ...SUMMARY_FIELDS, assetsById: Object.freeze([...SUMMARY_FIELDS.assetsById, 'pinScale']) });
export const summaryFieldsFor = (algorithm: SummaryAlgorithm) => algorithm === SUMMARY_ALGORITHM2 ? SUMMARY_FIELDS2 : SUMMARY_FIELDS;
export type PackagePurpose = 'teamWorkspace' | 'contribution' | 'backup' | 'clean' | 'review';
export interface Entry { readonly path: string; readonly sha256: string; readonly byteLength: number }
export interface EvidenceRef { readonly sha256: string; readonly byteLength: number }
export interface ChangeEntry {
  readonly ordinal: number; readonly expectedChangeHash: string; readonly dependencies: readonly string[];
  readonly byteLength: number; readonly bytesSha256: string;
}
export interface AutomaticSummary {
  readonly algorithm: SummaryAlgorithm; readonly scope: 'entireHistory' | 'baseDelta' | 'snapshot';
  readonly entityClasses: readonly { readonly class: string; readonly count: number }[];
  readonly fieldClasses: readonly { readonly class: string; readonly count: number }[];
  readonly blobEntryCount: number; readonly blobBytes: number;
}
interface Common {
  readonly format: typeof PACKAGE_FORMAT; readonly wireVersion: typeof PACKAGE_WIRE_VERSION;
  readonly packageId: string; readonly createdByVersion: string; readonly memo?: string;
  readonly summary: AutomaticSummary; readonly blobs: readonly Entry[];
  readonly payloadTotals: Readonly<{ entryCount: number; uncompressedBytes: number; largestEntryBytes: number }>;
}
interface Causal {
  readonly identity: Readonly<{ projectId: string; historyEpoch: string; lineageSeed: string }>;
  readonly metadataEnvelope: Readonly<{ adapter: 'automerge'; adapterFormatVersion: 'lociview-automerge-atomic-map-1' | 'lociview-automerge-atomic-map-2';
    lineageProof: Readonly<{ kind: 'automerge-root-change-v1'; rootChangeHash: string }> }>;
  readonly targetHeads: readonly string[];
}
export type PackageManifest = Common & (
  | (Causal & Readonly<{ purpose: 'teamWorkspace' | 'clean'; metadata: Entry }>)
  | (Causal & Readonly<{ purpose: 'contribution'; changes: readonly ChangeEntry[];
      base: Readonly<{ workspacePackageId: string; workspaceManifestSha256: string; heads: readonly string[] }> }>)
  | (Causal & Readonly<{ purpose: 'backup'; metadata: Entry; protectedInventory: Entry; exchangeBases: Entry; baseEvidence: readonly EvidenceRef[] }>)
  | Readonly<{ purpose: 'review'; snapshotId: string; snapshot: Entry }>
);
