import {defineConfig} from '@playwright/test';
const run=process.env.LOCIVIEW_E2E_RUN??`${Date.now()}-${process.pid}`;
if(!/^\d+-\d+$/.test(run))throw Error('Invalid E2E run identifier');
const origin=process.env.LOCIVIEW_DESKTOP_E2E_ORIGIN;
if(!origin||!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Run the Desktop lane through npm run test:e2e -- --config playwright.desktop.config.ts');
const port=new URL(origin).port;
process.env.LOCIVIEW_E2E_ENTRY=origin+'/';
const artifacts=`.artifacts/e2e/runs/${run}`;
export default defineConfig({testDir:'./tests/e2e',testMatch:['gs-workflow.spec.ts','desktop-*.spec.ts','point-workflow.spec.ts'],fullyParallel:false,workers:1,retries:0,
 timeout:360_000,expect:{timeout:15_000},outputDir:`${artifacts}/results`,
 reporter:[['list'],['html',{outputFolder:`${artifacts}/report`,open:'never'}],['json',{outputFile:`${artifacts}/result.json`}]],
 use:{baseURL:origin,channel:'chromium',serviceWorkers:'block'},
 // Current-PC specs exercise both artifacts. Build each afresh even when selecting
 // one spec so a clean checkout cannot silently read a stale offline candidate.
 webServer:{command:`npm run build:desktop && npm run build:offline && node node_modules/vite/bin/vite.js preview --mode project-scene-desktop --outDir desktop-dist --host 127.0.0.1 --port ${port} --strictPort`,url:origin+'/',reuseExistingServer:false,timeout:120_000,stdout:'pipe',stderr:'pipe'}});
