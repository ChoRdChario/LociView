import {defineConfig} from '@playwright/test';
const run=process.env.LOCIVIEW_E2E_RUN??`${Date.now()}-${process.pid}`;
if(!/^\d+-\d+$/.test(run))throw Error('Invalid E2E run identifier');
process.env.LOCIVIEW_E2E_ENTRY='http://127.0.0.1:4182/';
const artifacts=`.artifacts/e2e/runs/${run}`;
export default defineConfig({testDir:'./tests/e2e',testMatch:['gs-workflow.spec.ts','desktop-*.spec.ts'],fullyParallel:false,workers:1,retries:0,
 timeout:360_000,expect:{timeout:15_000},outputDir:`${artifacts}/results`,
 reporter:[['list'],['html',{outputFolder:`${artifacts}/report`,open:'never'}],['json',{outputFile:`${artifacts}/result.json`}]],
 use:{baseURL:'http://127.0.0.1:4182',channel:'chromium',serviceWorkers:'block'},
 webServer:{command:'npm run build:desktop && npm run preview:desktop',url:'http://127.0.0.1:4182/',reuseExistingServer:false,timeout:120_000,stdout:'pipe',stderr:'pipe'}});
