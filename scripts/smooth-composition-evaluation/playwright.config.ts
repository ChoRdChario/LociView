import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const run=process.env.LOCIVIEW_E2E_RUN??`${Date.now()}-${process.pid}`;
if(!/^\d+-\d+$/.test(run))throw Error('Invalid E2E run');
const root=fileURLToPath(new URL('../../',import.meta.url)),artifacts=`${root}/.artifacts/e2e/runs/${run}`;
export default defineConfig({testDir:'.',testMatch:'evaluation.spec.ts',workers:1,retries:0,timeout:360_000,
 outputDir:`${artifacts}/results`,reporter:[['list'],['json',{outputFile:`${artifacts}/result.json`}]],
 use:{channel:'chromium',baseURL:'http://127.0.0.1:4182',serviceWorkers:'block',viewport:{width:1100,height:800}},
 webServer:{cwd:root,command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4182 --strictPort',url:'http://127.0.0.1:4182/scripts/smooth-composition-evaluation/index.html',reuseExistingServer:false,timeout:60000,stdout:'pipe',stderr:'pipe'}});
