// LociView 製品エントリポイント
import './ui/style.css';

const root = document.getElementById('app');
if (root === null) throw new Error('missing #app');
if(import.meta.env.MODE==='project-scene-offline'){
  void import('./projectScene/offlineEntry').then(({bootOfflineDesktopApp})=>bootOfflineDesktopApp(root));
}else if(import.meta.env.MODE==='project-scene-desktop'){
  void import('./projectScene/desktopEntry').then(({bootDesktopApp})=>bootDesktopApp(root));
}else{
const mode = new URLSearchParams(location.search).get('mode');
if (mode === 'native-gs') {
  void import('./nativeGs/app').then(({ bootNativeGsApp }) => bootNativeGsApp(root));
} else {
  void import('./ui/app').then(({ bootApp }) => bootApp(root));
}

}
