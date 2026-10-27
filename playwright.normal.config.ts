import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Existing Native/v1 product entry; distinct from the isolated ProjectScene host.
export default defineConfig({...base,testMatch:'**/normal-three-compat.spec.ts',testIgnore:[],
  webServer:{command:'npm run build && npm run preview -- --host 127.0.0.1 --port 4182 --strictPort',
    url:'http://127.0.0.1:4182/',reuseExistingServer:false,timeout:120_000,stdout:'pipe',stderr:'pipe'}});
