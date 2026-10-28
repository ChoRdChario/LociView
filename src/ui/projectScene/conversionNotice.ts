import type {MaterialConversionNotice,MaterialNormalizationReason} from '../../domain/materialConversionNotice';
const reasons:Readonly<Record<MaterialNormalizationReason,string>>={
  'alpha-order':'元材質の透過方式を先に評価し、その後に不透明度を掛けます。',
  'chroma-standard':'色の透過を新形式の計算方法・既定値に統一します。',
  'hard-boundary':'ぼかし0は、境界をぼかさない設定になります。',
  'basic-chroma':'照明なしの元材質にも色の透過を適用します。',
  'smooth-display':'滑らかな透過表示は未対応のため、この材質の面は非表示になります。設定は保持し、編集で「切り抜き」等へ変更できます。',
};
/** Read-only explanation beside the existing conversion action; all source labels are text. */
export function createMaterialConversionNotice(document:Document){
  const root=document.createElement('section'),note=document.createElement('p'),details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');
  root.setAttribute('aria-label','材質の変換による変更');details.append(summary,list);root.append(note,details);root.hidden=true;
  return{root,render(notices:readonly MaterialConversionNotice[]=[]){
    root.hidden=notices.length===0;details.open=false;
    note.textContent=notices.some(n=>n.reasons.includes('smooth-display'))?'滑らかな透過表示は未対応のため、一部の材質の面は非表示になります。設定は保持し、変換後に「切り抜き」等へ変更できます。':notices.length?'材質を新形式の操作に統一するため、見た目が変わる場合があります。':'';
    summary.textContent=`影響する材質（${notices.length}件）`;
    list.replaceChildren(...notices.map(n=>{const item=document.createElement('li');item.textContent=`${n.scene} / ${n.model} / ${n.material}：${n.reasons.map(r=>reasons[r]).join(' ')}`;return item;}));
  }};
}
