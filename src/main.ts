// LociView 製品エントリポイント
import './ui/style.css';

const root = document.getElementById('app');
if (root === null) throw new Error('missing #app');
const mode = new URLSearchParams(location.search).get('mode');
if (mode === 'native-gs') {
  void import('./nativeGs/app').then(({ bootNativeGsApp }) => bootNativeGsApp(root));
} else {
  void import('./ui/app').then(({ bootApp }) => bootApp(root));
}
