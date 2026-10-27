import { createHash } from 'node:crypto';
import { ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js';
import { deflateSync } from 'node:zlib';
import { serializeGlb } from '../../src/assets/glbOptimize';

/** Owned synthetic inputs; no user data or externally downloaded sample. */
export function triangleGlb(z = 0) {
  const bin = new Uint8Array(36);
  new Float32Array(bin.buffer).set([-1, 0, z, 1, 0, z, 0, 2, z]);
  return Buffer.from(serializeGlb({ asset: { version: '2.0' }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, z], max: [1, 2, z] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.8, 1], roughnessFactor: 0.7 } }],
  }, bin));
}

export function smallPng(red = 40) {
  const chunk = (type: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, payload, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4);
  header[8] = 8; header[9] = 6;
  const row = Buffer.from([0, red, 120, 200, 255, 220, 160, 60, 255]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat([row, row]))), chunk('IEND', Buffer.alloc(0))]);
}

/** Embedded owned texture plus UVs; exercises bitmap lifetime on GPU recovery. */
export function texturedTriangleGlb() {
  const image=smallPng(), bin=new Uint8Array(60+image.length);
  new Float32Array(bin.buffer,0,9).set([-1,0,0,1,0,0,0,2,0]);
  new Float32Array(bin.buffer,36,6).set([0,0,1,0,.5,1]);bin.set(image,60);
  return Buffer.from(serializeGlb({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Panel',mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],buffers:[{byteLength:bin.length}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:24},{buffer:0,byteOffset:60,byteLength:image.length}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}, {bufferView:1,componentType:5126,count:3,type:'VEC2'}],
    materials:[{name:'Panel paint',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.7}}],
    textures:[{source:0}],images:[{bufferView:2,mimeType:'image/png'}]},bin));
}

/** Existing admitted Native recipe-1 shape, synthesized locally for real browser entry. */
export async function nativeConversionBackup(model: Buffer, image: Buffer, captionCount = 2, appearance = false) {
  const id = (prefix: string, n: number) => `${prefix}_${String(n).padStart(26, '0')}`;
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const placement = () => ({ translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1], uniformScale: 1 });
  const modelBlob = { algorithm: 'sha256', digest: hash(model), byteLength: model.length, mediaType: 'model/gltf-binary' };
  const imageBlob = { algorithm: 'sha256', digest: hash(image), byteLength: image.length, mediaType: 'image/png' };
  const snapshot = { format: 'lociview-native-project-snapshot', schemaVersion: 1, snapshotId: id('snp', 1), generation: 1,
    project: { id: id('prj', 1), title: 'Nativeから引き継ぐ記録', frame: { id: id('frm', 1), handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } } },
    assets: [2, 1].map(n => ({ id: id('ast', n), label: n === 1 ? '建物' : '非表示の設備', assetFrameId: id('frm', n + 1), status: { kind: 'ready', activeBindingId: id('bnd', n) } })),
    assetBindingRevisions: [1, 2].map(n => ({ id: id('bnd', n), assetId: id('ast', n), assetRevisionId: id('rev', n), assetToProject: { ...placement(), translation: [n, 0, 0] }, method: 'manual' })),
    assetRevisions: [1, 2].map(n => ({ id: id('rev', n), assetId: id('ast', n), representationIds: [id('rep', n)], anchorCompatibilityClasses: [{ id: id('cls', n), targetVariantFamilyIds: [id('fam', n)] }] })),
    representations: [1, 2].map(n => ({ id: id('rep', n), assetId: id('ast', n), representationFrameId: id('frm', n + 3), contentKind: 'mesh', purposes: ['source', 'display'], role: 'meshPrimary',
      variantFamilyId: id('fam', n), formatProfile: { id: 'lociview-native-model-glb-v1' }, blob: modelBlob, representationToAsset: { ...placement(), reflection: 'none' }, derivedFrom: [] })),
    presentation: { displayMode: 'gs-only', captionTargetAssetId: null, hiddenAssetIds: [id('ast', 2)], activeDisplaySetId: id('set', 2) },
    displaySets: [{ id: id('set', 2), name: '観察', orderKey: 'ZZ', defaultSavedViewId: id('view', 1) }, { id: id('set', 0), name: '全体', orderKey: 'AA', defaultSavedViewId: null }],
    savedViews: [{ id: id('view', 1), displaySetId: id('set', 2), name: '記録した視点', orderKey: 'old', projectFrameId: id('frm', 1),
      camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0], projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.1, 0.2, 0.3] } }],
    captions: [{ id: id('cap', 1), title: '既存のピン', body: '本文を保持', displaySetId: id('set', 2), tags: ['観察', '記録'], attachmentMediaIds: [id('med', 2), id('med', 1)],
      anchor: { kind: 'asset', assetId: id('ast', 1), assetFrameId: id('frm', 2), positionAsset: [3, 0.5, 0], authoredAssetRevisionId: id('rev', 1), authoredAnchorCompatibilityId: id('cls', 1), hitEvidence: { method: 'manual' } } },
      { id: id('cap', 2), title: '未配置の記録', body: '', displaySetId: id('set', 2), tags: ['記録'], color: '#123456', anchor: null }],
    mediaResources: [1, 2].map(n => ({ id: id('med', n), label: `画像 ${n}`, kind: 'image', blob: imageBlob })) };
  const placed = snapshot.captions[0]! as Extract<(typeof snapshot.captions)[number], { anchor: object }>;
  for (let n = 3; n <= captionCount; n++) snapshot.captions.push({ ...placed, id: id('cap', n),
    title: `${String(n).padStart(3, '0')}：長い日本語の記録名を狭い画面でも省略せず確認するための現地観察記録`,
    body: `現地観察の記録 ${n}`, tags: [], attachmentMediaIds: [] });
  if (appearance) Object.assign(snapshot,{meshMaterialAppearances:snapshot.displaySets.map((set,i)=>({id:id('mat',i+1),
    displaySetId:set.id,assetId:id('ast',1),authoredAssetRevisionId:id('rev',1),representationId:id('rep',1),materialSlotKey:'m/0/0',
    opacity:1,doubleSided:true,unlit:true,chroma:{enabled:false,colorSrgb:[0,1,0],tolerance:.2,feather:0}}))});
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const manifest = { format: 'lociview-native-portable-backup', packageVersion: 2,
    nativeSnapshot: { schemaVersion: 1, projectId: snapshot.project.id, snapshotId: snapshot.snapshotId, generation: snapshot.generation, entry: 'native/snapshot.json', byteLength: bytes.length, algorithm: 'sha256', digest: hash(bytes) },
    representations: snapshot.representations.map(r => ({ representationId: r.id, entry: `native/representations/${r.id}.bin`, ...r.blob })),
    media: snapshot.mediaResources.map(m => ({ mediaId: m.id, entry: `native/media/${m.id}.bin`, ...m.blob })) };
  const writer = new ZipWriter(new Uint8ArrayWriter());
  const add = (path: string, content: Uint8Array) => writer.add(path, new Uint8ArrayReader(content), { level: 0 });
  await add('native/package.json', Buffer.from(JSON.stringify(manifest))); await add('native/snapshot.json', bytes);
  for (const row of manifest.representations) await add(row.entry, model);
  for (const row of manifest.media) await add(row.entry, image);
  return Buffer.from(await writer.close());
}

/** Frozen-v1 GLB/PNG subset from the existing owned operation-log fixture. */
export async function frozenV1ConversionBackup(model: Buffer, image: Buffer) {
  const id = (prefix: string, n: number) => `${prefix}_${String(n).padStart(26, '0')}`, actor = 'a_0000000000001', ops: Record<string, unknown>[] = [];
  const add = (e: string, n: number, v: Record<string, unknown>, t = 'create') => { const op = ops.length + 1;
    ops.push({ op, hlc: `2026-10-15T00:00:00.000Z-${op.toString(16).padStart(4, '0')}-${actor}`, actor, user: '', t, e,
      id: id(e === 'caption' ? 'cap' : e === 'asset' ? 'ast' : e === 'profile' ? 'usr' : e, n), ...(t === 'delete' ? {} : { v }) }); };
  add('set', 1, { name: '観察', order: 1 }); add('set', 2, { name: '全体', order: 2 });
  add('asset', 1, { kind: 'model', path: 'models/model.glb', originalName: '模型.glb', mime: '', size: model.length, transform: { scale: 1, upAxis: 'Y' }, pinScale: 1.5 });
  const digest = createHash('sha256').update(image).digest('hex');
  for (const n of [2, 3, 4]) add('asset', n, { kind: 'image', path: `media/image${n}.png`, originalName: `画像${n}.png`, mime: 'image/png', size: image.length, sha256: digest });
  add('caption', 1, { setId: id('set', 1), title: '配置済み', body: '元の本文', color: '#eab308', tags: ['記録', '観察'], attachments: [id('ast', 2), id('ast', 3), id('ast', 2)], anchor: { modelAssetId: id('ast', 1), position: [0.25, 0.5, 0], normal: [0, 0, 1] } });
  add('caption', 2, { setId: id('set', 1), title: '', body: '', color: '#123456' });
  add('caption', 3, { setId: id('set', 2), title: '親だけの記録', body: '', color: '#ff8000', anchor: { modelAssetId: id('ast', 1) } });
  add('view', 1, { setId: id('set', 1), name: '透視図', cameraState: { eye: [1, 2, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 60, ortho: false }, background: '#123456' });
  add('profile', 1, { displayName: '過去の編集者', defaultPinColor: '#eab308' }); add('asset', 4, {}, 'delete');
  const entries: [string, Uint8Array][] = [
    ['lociview.json', Buffer.from(JSON.stringify({ format: 'lociview-project', schemaVersion: 1, projectId: id('prj', 1), name: '旧形式の記録', createdAt: '2026-10-15T00:00:00.000Z', generator: 'synthetic-test' }))],
    [`ops/${actor}.jsonl`, Buffer.from('  ' + ops.map(op => JSON.stringify(op)).join('\r\n') + '\r\n' + JSON.stringify(ops[0]) + '\r\n')],
    ['models/model.glb', model], ...[2, 3, 4].map(n => [`media/image${n}.png`, image] as [string, Uint8Array]),
    ['snapshot.json', Buffer.from('{"stale":true}')], ['captions.csv', Buffer.from('ignored cache')], ['thumbs/unused.png', image],
  ];
  const writer = new ZipWriter(new Uint8ArrayWriter()); for (const [path, bytes] of entries) await writer.add(path, new Uint8ArrayReader(bytes), { level: 0 }); return Buffer.from(await writer.close());
}

/** One CSV, one static GLB and one exact image relation; no auxiliary mapping guess. */
export async function lociMyuConversionBackup(model: Buffer, image: Buffer) {
  const entries: [string, Uint8Array][] = [ ['models/model.glb', model], ['media/a.png', image],
    ['records.csv', Buffer.from('id,title,body,color,posX,posY,posZ,imageFileId,createdAt,updatedAt\nplaced,配置済み,元の本文,#123456,0.2,0.2,0,image1,,\nunplaced,未配置の記録,,#eab308,,,,image1,,\n')],
    ['file_ids.csv', Buffer.from('fileId,filename\nimage1,a.png\n')],
  ];
  const writer = new ZipWriter(new Uint8ArrayWriter()); for (const [path, bytes] of entries) await writer.add(path, new Uint8ArrayReader(bytes), { level: 0 }); return Buffer.from(await writer.close());
}
