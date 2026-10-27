import {createValidationWorkspace as selector,type ValidationWorkspacePorts as ApplicationPorts,type MountedEditorFactory} from '../../projectScene/validationWorkspace';
import {legacyValidationHost,type ValidationNormalHost,type FirstBackupRecovery} from './validationHost';
import {createSavedWorkspace} from './metadataWorkspace';
import {createProductWorkspace} from './productWorkspace';
import {createMetadataConflictControls} from './metadataConflictControls';
import {createMetadataCaptionLifecycleControls} from './metadataCaptionLifecycleControls';
import {createMetadataMembershipControls} from './metadataMembershipControls';
import {createMetadataAssetStatusControls} from './metadataAssetStatusControls';
import {createMetadataMaterialControls} from './metadataMaterialControls';
export type ValidationWorkspacePorts=Omit<ApplicationPorts,'mountEditor'|'open'> & {productEditor?:boolean;open(...args:Parameters<ApplicationPorts['open']>):Promise<ValidationNormalHost|FirstBackupRecovery>};
export function validationEditorFactory(document:Document,productEditor=false):MountedEditorFactory {
const withNotice=(editor:ReturnType<MountedEditorFactory>)=>{const notice=document.createElement('p');
  notice.textContent='検証用プロジェクト。通常画面・オフライン・実機での受入れは未完了です。';editor.root.append(notice);return editor;};
return (typed,factory,fileTools,renderCandidate,navigation)=>{
    if(productEditor||typed.authority.read().modelVersions?.some(v=>['saved-point','saved-gs'].includes(v.closure.shape)))return withNotice(createProductWorkspace(document,typed,factory,fileTools,renderCandidate,navigation));
    const target=legacyValidationHost(typed);
    return withNotice(createSavedWorkspace(document,target,factory,
      (session, changed) => {
        const root = document.createElement('section');
        const blockedReason = () => fileTools?.hasChanges() ? 'ファイルの操作を終えるか、取り消してから解消してください。' : null;
        const text = createMetadataConflictControls(document, target, session, changed, { blockedReason });
        const lifecycle = createMetadataCaptionLifecycleControls(document, target, session, text.composing, changed, blockedReason);
        const memberships = createMetadataMembershipControls(document, target, session, text.composing, changed, 'caption', blockedReason);
        const models = createMetadataAssetStatusControls(document, target, session, text.composing, changed, { blockedReason,
          preview: renderCandidate });
        const modelMemberships = createMetadataMembershipControls(document, target, session, text.composing, changed, 'asset', blockedReason);
        const materials = createMetadataMaterialControls(document, target, session, text.composing, changed, blockedReason);
        const groups = [lifecycle, text, memberships, models, modelMemberships, materials]; root.append(...groups.map(g => g.root));
        return { root, render: () => { for (const group of groups) group.render(); },
          hasChanges: () => groups.some(g => g.hasChanges()), dispose: () => { for (const group of groups) group.dispose(); root.remove(); } };
      }, fileTools))
;
  };
}
export function createValidationWorkspace(document:Document,ports:ValidationWorkspacePorts,...args:Parameters<typeof selector> extends [unknown,unknown,...infer R]?R:never){
 return selector(document,{...ports,mountEditor:validationEditorFactory(document,!!ports.productEditor),
 introduction:ports.introduction??'LociViewは、3Dモデルに記録を付け、ファイルで作業を受け渡すアプリです。この検証画面では通常画面のプロジェクトを変更しません。ダウンロード後は、保存先でファイルを確認してください。'},...args);
}
