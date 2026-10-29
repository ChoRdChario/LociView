/** Reviewed composition/import boundary. Entries are exact files, never a directory exemption. */
export const projectSceneApplicationImports:Readonly<Record<string,readonly string[]>> = {
  "src/harness/projectScene/acknowledgment.ts": [
    "../../projectScene/acknowledgment"
  ],
  "src/projectScene/deferredViewport.ts": [
    "./viewportModel",
    "./viewportPorts"
  ],
  "src/harness/projectScene/browserMetadataStorage.ts": [
    "../../projectScene/browserMetadataStorage"
  ],
  "src/harness/projectScene/browserUiState.ts": [
    "../../projectScene/browserUiState"
  ],
  "src/harness/projectScene/gsProxyWorkflow.ts": [
    "../../projectScene/gsProxyWorkflow"
  ],
  "src/harness/projectScene/metadataMaterials.ts": [
    "../../projectScene/metadataMaterials"
  ],
  "src/harness/projectScene/metadataMedia.ts": [
    "../../projectScene/metadataMedia"
  ],
  "src/harness/projectScene/metadataViews.ts": [
    "../../projectScene/metadataViews"
  ],
  "src/harness/projectScene/modelCandidatePreview.ts": [
    "../../projectScene/modelCandidatePreview"
  ],
  "src/harness/projectScene/modelTransform.ts": [
    "../../projectScene/modelTransform"
  ],
  "src/harness/projectScene/pinGizmo.ts": [
    "../../projectScene/pinGizmo"
  ],
  "src/harness/projectScene/productSources.ts": [
    "../../projectScene/productSources"
  ],
  "src/harness/projectScene/productWorkspace.ts": [
    "../../projectScene/productWorkspace"
  ],
  "src/harness/projectScene/reviewView.ts": [
    "../../projectScene/reviewView"
  ],
  "src/harness/projectScene/reviewWorkspace.ts": [
    "../../projectScene/reviewWorkspace"
  ],
  "src/harness/projectScene/validationBrowser.ts": [
    "../../projectScene/validationBrowser",
    "./validationWorkspace"
  ],
  "src/harness/projectScene/validationCatalog.ts": [
    "../../projectScene/validationCatalog"
  ],
  "src/harness/projectScene/validationCoverage.ts": [
    "../../projectScene/validationCoverage"
  ],
  "src/harness/projectScene/validationGeneration.ts": [
    "../../projectScene/validationGeneration"
  ],
  "src/harness/projectScene/validationHost.ts": [
    "../../projectMetadata/commands",
    "../../projectScene/validationHost",
    "./metadataIntent"
  ],
  "src/harness/projectScene/validationMaterials.ts": [
    "../../projectScene/validationMaterials"
  ],
  "src/harness/projectScene/validationModeHost.ts": [
    "../../projectScene/validationModeHost",
    "./validationHost"
  ],
  "src/harness/projectScene/validationOutputControls.ts": [
    "../../projectScene/validationOutputControls"
  ],
  "src/harness/projectScene/validationPointCoverage.ts": [
    "../../projectScene/validationPointCoverage"
  ],
  "src/harness/projectScene/validationProjection.ts": [
    "../../projectScene/validationProjection"
  ],
  "src/harness/projectScene/validationReceiveControls.ts": [
    "../../projectScene/validationReceiveControls"
  ],
  "src/harness/projectScene/validationRender.ts": [
    "../../projectScene/validationRender"
  ],
  "src/harness/projectScene/validationWorkspace.ts": [
    "../../projectScene/validationWorkspace",
    "./metadataAssetStatusControls",
    "./metadataCaptionLifecycleControls",
    "./metadataConflictControls",
    "./metadataMaterialControls",
    "./metadataMembershipControls",
    "./metadataWorkspace",
    "./productWorkspace",
    "./validationHost"
  ],
  "src/harness/projectScene/viewCandidateLabels.ts": [
    "../../projectScene/viewCandidateLabels"
  ],
  "src/harness/projectScene/viewport.ts": [
    "../../projectScene/viewport",
    "../../viewer/gsDecodeQueue",
    "./modelClosure",
    "./validationRender",
    "./viewportModel",
    "three"
  ],
  "src/harness/projectScene/viewportPicking.ts": [
    "../../projectScene/viewportPicking"
  ],
  "src/harness/projectScene/viewportPointPicking.ts": [
    "../../projectScene/viewportPointPicking"
  ],
  "src/projectScene/acknowledgment.ts": [],
  "src/projectScene/browserMetadataStorage.ts": [
    "@automerge/automerge-repo-storage-indexeddb",
    "@automerge/automerge/automerge.wasm?url",
    "@automerge/automerge/slim"
  ],
  "src/projectScene/browserUiState.ts": [
    "../ui/context",
    "../ui/resumeReference",
    "../projectMetadata/editorAttribution",
    "../projectMetadata/source"
  ],
  "src/projectScene/desktopEntry.ts": [
    "../nativeGs/app",
    "../projectFiles/validation",
    "../ui/app",
    "../viewer/gsDecodeQueue",
    "../viewer/smoothComposite",
    "../viewer/targetBudget",
    "./productWorkspace",
    "./styles.css",
    "./validationBrowser"
  ],
  "src/projectScene/displayCapture.ts": [
    "./viewDisplay"
  ],
  "src/projectScene/displayCells.ts": [
    "../domain/atomicHistory"
  ],
  "src/projectScene/displaySupport.ts": [
    "../domain/values",
    "./modelTypes"
  ],
  "src/projectScene/displayTypes.ts": [
    "../domain/projectProfile",
    "../scene/types",
    "./displaySupport",
    "./materialDisplay",
    "./mediaDisplay",
    "./modelTypes",
    "./viewDisplay"
  ],
  "src/projectScene/gsProxyWorkflow.ts": [
    "../domain/values",
    "../projectFiles/content",
    "../projectFiles/initialProject",
    "../projectFiles/validation",
    "../projectMetadata/gsProxy",
    "../projectMetadata/persistence",
    "../scene/projectProvider",
    "./mediaDisplay",
    "../projectMetadata/editorAttribution"
  ],
  "src/projectScene/hostPorts.ts": [
    "../projectMetadata/commands",
    "../projectMetadata/format",
    "../projectMetadata/session",
    "../scene/commands",
    "./acknowledgment",
    "./displayTypes",
    "./gsProxyWorkflow",
    "./mediaDisplay",
    "./modelTypes"
  ],
  "src/projectScene/materialDisplay.ts": [
    "../domain/materialIntent",
    "../scene/types",
    "./displayCells",
    "./displaySupport",
    "./modelTypes"
  ],
  "src/projectScene/materialLabels.ts": [
    "./displaySupport",
    "./displayTypes",
    "./materialDisplay"
  ],
  "src/projectScene/mediaDisplay.ts": [
    "../domain/values",
    "../scene/types",
    "./displayCells"
  ],
  "src/projectScene/metadataMaterials.ts": [
    "../domain/materialIntent",
    "../domain/projectGraphSupport",
    "../scene/projectMaterialRoutes",
    "../scene/projectProvider",
    "../scene/types",
    "./displayCells",
    "./materialDisplay"
  ],
  "src/projectScene/metadataMedia.ts": [
    "../domain/projectGraphSupport",
    "../scene/projectProvider",
    "../scene/types",
    "./displayCells",
    "./mediaDisplay"
  ],
  "src/projectScene/metadataViews.ts": [
    "../domain/projectGraphSupport",
    "../domain/values",
    "../scene/projectProvider",
    "../scene/types",
    "./displayCells",
    "./viewDisplay"
  ],
  "src/projectScene/modelCandidatePreview.ts": [
    "../domain/meshSource",
    "../projectMetadata/assetStatus",
    "../projectMetadata/format",
    "../projectMetadata/records",
    "../scene/projectProvider",
    "./modelTypes",
    "./viewportModel",
    "./viewportPorts"
  ],
  "src/projectScene/modelTransform.ts": [
    "./displaySupport",
    "three"
  ],
  "src/projectScene/modelTypes.ts": [
    "../domain/values",
    "../scene/types",
    "./mediaDisplay",
    "../domain/pointSource",
    "../domain/gsSource",
    "../domain/projectGraphSupport"
  ],
  "src/projectScene/pinGizmo.ts": [
    "./modelTransform",
    "./viewportModel",
    "./viewportPicking",
    "three",
    "three/addons/controls/TransformControls.js"
  ],
  "src/projectScene/pinParent.ts": [
    "./displayTypes",
    "./viewportModel",
    "three"
  ],
  "src/projectScene/productSources.ts": [
    "../domain/materialIntent",
    "../domain/values",
    "../projectMetadata/assetStatus",
    "../projectMetadata/captionCandidates",
    "../projectMetadata/captionDeletion",
    "../projectMetadata/captionAuthoring",
    "../projectMetadata/commands",
    "../projectMetadata/materialResolution",
    "../projectMetadata/membership",
    "../projectMetadata/modelMembership",
    "../projectMetadata/persistence",
    "../projectMetadata/sceneAuthoring",
    "../projectMetadata/sceneOrganization",
    "../projectMetadata/startupScene",
    "../projectMetadata/viewResolution",
    "../scene/resolve",
    "../scene/types",
    "../ui/projectScene/materialState",
    "../ui/projectScene/projectRead",
    "../ui/projectScene/projectWorkspacePorts",
    "./displaySupport",
    "./materialDisplay",
    "./materialLabels",
    "./mediaDisplay",
    "./metadataViews",
    "./modelTransform",
    "./modelTypes",
    "./pinParent",
    "./validationMaterials",
    "./validationModeHost",
    "./viewCandidateLabels",
    "./viewDisplay",
    "../projectMetadata/captionUndo"
  ],
  "src/projectScene/productWorkspace.ts": [
    "../domain/portableMedia",
    "../domain/values",
    "../scene/resolve",
    "../ui/projectScene/projectWorkspace",
    "../ui/projectScene/projectWorkspacePorts",
    "./modelCandidatePreview",
    "./productSources",
    "./startupControls",
    "./validationModeHost",
    "./validationReceiveControls",
    "./viewDisplay",
    "./viewportModel",
    "./viewportPorts"
  ],
  "src/projectScene/providerProjection.ts": [
    "../domain/values",
    "../scene/projectProvider",
    "../scene/types",
    "./displayTypes",
    "./mediaDisplay",
    "./metadataMaterials",
    "./metadataMedia",
    "./metadataViews",
    "./modelTypes"
  ],
  "src/projectScene/reviewView.ts": [
    "../projectFiles/portableHeic",
    "../domain/portableMedia",
    "../projectFiles/media",
    "../projectFiles/nativeSpatial",
    "../domain/materialIntent",
    "../domain/projectGraphSupport",
    "../domain/values",
    "../projectFiles/content",
    "../projectFiles/jpeg",
    "../projectFiles/photo",
    "../projectFiles/png",
    "../projectFiles/pointPly",
    "../projectFiles/validation",
    "../projectPackage/reviewArchive",
    "../scene/types",
    "../ui/projectScene/captionListState",
    "./modelTypes",
    "./validationMaterials",
    "./viewDisplay",
    "./viewportModel",
    "three"
  ],
  "src/projectScene/reviewWorkspace.ts": [
    "../ui/projectScene/captionListControls",
    "../ui/projectScene/captionListState",
    "../ui/projectScene/captionWindowControls",
    "../ui/projectScene/captionWindowState",
    "../ui/projectScene/mediaPreview",
    "../ui/projectScene/navigationState",
    "../ui/projectScene/viewState",
    "./reviewView",
    "./viewportPorts"
  ],
  "src/projectScene/startupControls.ts": [
    "../projectMetadata/sceneOrganization",
    "../projectMetadata/persistence",
    "../projectMetadata/startupScene",
    "./acknowledgment",
    "./hostPorts"
  ],
  "src/projectScene/validationBrowser.ts": [
    "../platform/opfs",
    "../platform/projectLock",
    "../projectFiles/receiveWorkspace",
    "../projectFiles/validation",
    "../projectMetadata/blobStore",
    "../projectMetadata/generationScope",
    "../projectPackage/reviewEdit",
    "../viewer/gsDecodeQueue",
    "../viewer/smoothComposite",
    "./browserMetadataStorage",
    "./browserUiState",
    "./displayTypes",
    "./modelTypes",
    "./validationCatalog",
    "./validationHost",
    "./validationRender",
    "./validationWorkspace",
    "./viewport",
    "./viewportModel"
  ],
  "src/projectScene/validationCatalog.ts": [
    "../projectFiles/receiveWorkspace",
    "../projectFiles/sendWorkspace",
    "../projectFiles/validation",
    "../projectPackage/reviewEditControls",
    "./validationGeneration",
    "./validationHost"
  ],
  "src/projectScene/validationCoverage.ts": [
    "../viewer/hardChroma",
    "./viewportPicking",
    "three"
  ],
  "src/projectScene/validationGeneration.ts": [
    "../platform/fs",
    "../projectFiles/creation",
    "../projectFiles/validation",
    "../projectMetadata/generationScope",
    "../projectPackage/backupRestoreJob",
    "../projectPackage/restoreControls",
    "./validationHost"
  ],
  "src/projectScene/validationHost.ts": [
    "../domain/portableMedia",
    "../projectFiles/media",
    "../projectFiles/meshSource",
    "../projectFiles/nativeSpatialConversion",
    "../projectFiles/bodyBudget",
    "../domain/materialIntent",
    "../domain/projectGraphSupport",
    "../domain/values",
    "../platform/fs",
    "../platform/projectLock",
    "../projectFiles/creation",
    "../projectFiles/frozenV1Conversion",
    "../projectFiles/initialProject",
    "../projectFiles/gsPly",
    "../projectFiles/jpeg",
    "../projectFiles/lociMyuConversion",
    "../projectFiles/nativeConversion",
    "../projectFiles/photo",
    "../projectFiles/png",
    "../projectFiles/receiveWorkspace",
    "../projectFiles/sendWorkspace",
    "../projectFiles/validation",
    "../projectMetadata/assetDeletion",
    "../projectMetadata/blobStore",
    "../projectMetadata/captionDeletion",
    "../projectMetadata/commands",
    "../projectMetadata/journal",
    "../projectMetadata/materialResolution",
    "../projectMetadata/persistence",
    "../projectMetadata/repository",
    "../projectMetadata/session",
    "../projectPackage/backupArchive",
    "../projectPackage/backupRestoreJob",
    "../projectPackage/cleanArchive",
    "../projectPackage/contract",
    "../projectPackage/restoreControls",
    "../projectPackage/reviewEdit",
    "../projectPackage/reviewEditControls",
    "../projectPackage/reviewEditJob",
    "../projectPackage/workspaceArchive",
    "../projectPackage/zipArchive",
    "../scene/resolve",
    "./displayTypes",
    "./gsProxyWorkflow",
    "./hostPorts",
    "./mediaDisplay",
    "./modelTypes",
    "./providerProjection",
    "./validationGeneration",
    "./validationMaterials",
    "./validationProjection",
    "./viewDisplay",
    "../projectMetadata/editorAttribution",
    "../projectMetadata/source"
  ],
  "src/projectScene/validationMaterials.ts": [
    "../domain/materialCoverage",
    "../domain/meshMaterialSource",
    "../domain/meshSource",
    "../domain/materialIntent",
    "../domain/projectGraphSupport",
    "../domain/projectProfile",
    "../domain/values",
    "../scene/types",
    "./modelTypes"
  ],
  "src/projectScene/validationModeHost.ts": [
    "./displayTypes",
    "./hostPorts",
    "./validationHost"
  ],
  "src/projectScene/validationOutputControls.ts": [
    "../ui/projectScene/projectWorkspacePorts",
    "./validationModeHost"
  ],
  "src/projectScene/validationPointCoverage.ts": [
    "../viewer/hardChroma",
    "../viewer/smoothMaterial",
    "./validationCoverage",
    "./viewportPicking",
    "three"
  ],
  "src/projectScene/validationProjection.ts": [
    "../domain/meshSource",
    "../projectFiles/meshSource",
    "../projectFiles/nativeSpatial",
    "../domain/projectGraphSupport",
    "../projectFiles/gsPly",
    "../projectFiles/modelFacts",
    "../projectFiles/pointPly",
    "../projectFiles/validation",
    "../projectMetadata/records",
    "../scene/projectProvider",
    "./displayTypes",
    "./modelTypes"
  ],
  "src/projectScene/validationReceiveControls.ts": [
    "../projectMetadata/format",
    "../ui/projectScene/projectWorkspacePorts",
    "./validationModeHost",
    "./validationOutputControls"
  ],
  "src/projectScene/validationRender.ts": [
    "../domain/materialIntent",
    "../domain/meshMaterialSource",
    "../domain/meshSource",
    "../domain/pointPresentation",
    "../domain/projectGraphSupport",
    "../domain/values",
    "../projectFiles/content",
    "../projectFiles/glb",
    "../projectFiles/glbOccurrences",
    "../projectFiles/gsPly",
    "../projectFiles/meshDecode",
    "../projectFiles/nativeSpatial",
    "../projectFiles/pointPly",
    "../viewer/compat180/proof",
    "../viewer/compat180/sceneProof",
    "../viewer/gsDecodeQueue",
    "../viewer/hardChroma",
    "../viewer/loaders",
    "../viewer/pointSurface",
    "../viewer/smoothMaterial",
    "./modelTypes",
    "./validationMaterials",
    "./viewportModel",
    "./viewportPicking",
    "three",
    "three/addons/loaders/GLTFLoader.js"
  ],
  "src/projectScene/validationWorkspace.ts": [
    "../projectFiles/media",
    "../ui/projectScene/conversionNotice",
    "../projectFiles/meshSource",
    "./deferredViewport",
    "../assets/zipio",
    "../projectFiles/creation",
    "../projectFiles/frozenV1Conversion",
    "../projectFiles/initialProject",
    "../projectFiles/jpeg",
    "../projectFiles/lociMyuConversion",
    "../projectFiles/nativeConversion",
    "../projectFiles/photo",
    "../projectFiles/png",
    "../projectFiles/pointPly",
    "../projectFiles/validation",
    "../projectMetadata/persistence",
    "../projectPackage/backupArchive",
    "../projectPackage/cleanArchive",
    "../projectPackage/contract",
    "../projectPackage/reviewEdit",
    "../projectPackage/workspaceArchive",
    "../projectPackage/zipArchive",
    "../ui/projectScene/projectWorkspacePorts",
    "../ui/resumeReference",
    "./hostPorts",
    "./modelCandidatePreview",
    "./productWorkspace",
    "./reviewView",
    "./reviewWorkspace",
    "./validationCatalog",
    "./validationHost",
    "./validationModeHost",
    "./validationReceiveControls",
    "./viewportPorts"
  ],
  "src/projectScene/viewCandidateLabels.ts": [
    "../scene/projectProvider"
  ],
  "src/projectScene/viewDisplay.ts": [
    "../scene/types",
    "./displayCells",
    "./displaySupport"
  ],
  "src/projectScene/viewport.ts": [
    "../domain/pointPresentation",
    "../viewer/gsDecodeQueue",
    "../viewer/gsRender",
    "../viewer/hardChroma",
    "../viewer/smoothComposite",
    "../viewer/smoothMaterial",
    "../viewer/targetBudget",
    "./displayCapture",
    "./modelTransform",
    "./modelTypes",
    "./pinGizmo",
    "./validationCoverage",
    "./validationPointCoverage",
    "./validationRender",
    "./viewDisplay",
    "./viewportModel",
    "./viewportPicking",
    "./viewportPointPicking",
    "./viewportPorts",
    "three",
    "three/addons/controls/OrbitControls.js"
  ],
  "src/projectScene/viewportModel.ts": [
    "../domain/materialIntent",
    "../scene/resolve",
    "../ui/projectScene/captionListState",
    "./displayCapture",
    "./displaySupport",
    "./displayTypes",
    "./materialDisplay",
    "./modelTransform",
    "./modelTypes",
    "./pinGizmo",
    "./validationMaterials",
    "./viewDisplay",
    "three"
  ],
  "src/projectScene/viewportPicking.ts": [
    "../domain/pointPresentation",
    "../viewer/gsRender",
    "../viewer/hardChroma",
    "./viewportModel",
    "three"
  ],
  "src/projectScene/viewportPointPicking.ts": [
    "../domain/nativeSpatialSource",
    "../domain/values",
    "../domain/pointPresentation",
    "./validationPointCoverage",
    "./viewportModel",
    "./viewportPicking",
    "three"
  ],
  "src/projectScene/viewportPorts.ts": [
    "../ui/projectScene/viewState",
    "./displayCapture",
    "./modelTransform",
    "./pinGizmo",
    "./viewDisplay",
    "./viewportModel",
    "./viewportPicking"
  ]
};
