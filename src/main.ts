// LociView 製品エントリポイント
import './ui/style.css';
import { bootApp } from './ui/app';

const root = document.getElementById('app');
if (root === null) throw new Error('missing #app');
void bootApp(root);
