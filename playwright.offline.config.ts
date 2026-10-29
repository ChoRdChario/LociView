import {defineConfig} from '@playwright/test';
const run=process.env.LOCIVIEW_E2E_RUN??`${Date.now()}-${process.pid}`;
if(!/^\d+-\d+$/.test(run))throw Error('Invalid E2E run identifier');
const artifacts=`.artifacts/e2e/runs/${run}`;
export default defineConfig({testDir:'./tests/offline-e2e',fullyParallel:false,workers:1,retries:0,
  globalSetup:'./tests/offline-e2e/setup.ts',timeout:900_000,expect:{timeout:20_000},outputDir:`${artifacts}/results`,
  reporter:[['list'],['html',{outputFolder:`${artifacts}/report`,open:'never'}],['json',{outputFile:`${artifacts}/result.json`}]],
  use:{channel:'chromium',serviceWorkers:'allow'}});
