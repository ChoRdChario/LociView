import {createValidationBrowserWorkspace as applicationWorkspace} from '../../projectScene/validationBrowser';
import {validationEditorFactory} from './validationWorkspace';
export {validationBrowserLimits} from '../../projectScene/validationBrowser';
export function createValidationBrowserWorkspace(document:Document,run?:string){return applicationWorkspace(document,{
 progressivePresentation:new URL(location.href).searchParams.get('editor')==='project',
 mountEditor:validationEditorFactory(document,new URL(location.href).searchParams.get('editor')==='project'),
 introduction:'LociViewは、3Dモデルに記録を付け、ファイルで作業を受け渡すアプリです。この検証画面では通常画面のプロジェクトを変更しません。ダウンロード後は、保存先でファイルを確認してください。'},run);}
