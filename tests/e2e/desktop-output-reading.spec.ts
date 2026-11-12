import { chromium, expect, test } from '@playwright/test';
import { openAsBlob } from 'node:fs';
import * as A from '@automerge/automerge';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { validationMetadataLimits } from '../../src/projectFiles/validation';
import { ownedServer } from '../offline-e2e/server';
import { nativeConversionBackup, smallPng, triangleGlb } from './fixtures';

for (const phone of [false, true]) test(`saved records remain readable during output on ${phone ? 'phone' : 'PC'}`, async ({}, info) => {
  A.getHeads(A.init());
  const server=await ownedServer('offline-desktop-dist'), browser=await chromium.launch({channel:'chromium'});
  const context=await browser.newContext({viewport:phone?{width:390,height:844}:{width:1280,height:720},isMobile:phone,hasTouch:phone,serviceWorkers:'block',acceptDownloads:true});
  const page=await context.newPage(), errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const files=page.locator('details.lv-project-files'), panel=page.getByRole('region',{name:'ファイル操作',exact:true});
  try{
    await page.goto(server.url);
    await page.getByLabel('ファイルを選択',{exact:true}).setInputFiles({name:'records.zip',mimeType:'application/zip',buffer:await nativeConversionBackup(triangleGlb(),smallPng(),100)});
    await page.getByRole('button',{name:'ファイルを開く',exact:true}).click();
    await page.getByRole('button',{name:'新しいプロジェクトに変換',exact:true}).click();
    await expect(page.getByRole('button',{name:'閲覧する',exact:true})).toBeEnabled({timeout:90_000});
    await expect(page.getByLabel('キャプション一覧',{exact:true}).locator('li')).toHaveCount(100);
    const detail=page.getByRole('region',{name:'キャプションの詳細',exact:true});
    const firstTitles=(await page.getByLabel('キャプション一覧',{exact:true}).locator('.lv-caption-title').allTextContents()).slice(0,3).map(t=>t.trim());
    await page.locator('.lv-caption-select').filter({hasText:firstTitles[0]!}).click();
    await expect(page.locator('.lv-caption-window')).toHaveCount(1);
    // Hold a real output hash, then run the original digest after release. No fake artifact or weakened inspection.
    await page.evaluate(()=>{
      const digest=crypto.subtle.digest.bind(crypto.subtle);let release!:()=>void;
      const gate=new Promise<void>(resolve=>{release=resolve;});
      (window as any).__releaseOutputHash=release;
      crypto.subtle.digest=(async(...args:Parameters<SubtleCrypto['digest']>)=>{await gate;return digest(...args);}) as SubtleCrypto['digest'];
    });
    await files.locator(':scope > summary').click();
    const download=page.waitForEvent('download');await panel.locator('.lv-file-primary').click();
    await expect(panel.getByText('作成中も記録を読めます。',{exact:true})).toBeVisible();
    await panel.getByRole('button',{name:'閉じる',exact:true}).click();
    await expect(panel).toBeHidden();await expect(page.locator('.lv-project-shell > .lv-operation-status')).toContainText('ファイルを作成しています。');
    const search=page.getByRole('searchbox',{name:'検索',exact:true}), list=page.getByLabel('キャプション一覧',{exact:true});
    for(const title of firstTitles.slice(1)){
      await detail.getByRole('button',{name:'次の記録',exact:true}).click();
      await expect(detail.locator('[data-caption-field="title"] > p')).toHaveText(title);
      await expect(page.locator('.lv-caption-window')).toHaveCount(1);
      await expect(page.locator('.lv-caption-window')).toHaveAttribute('aria-label',firstTitles[0]!);
    }
    if(phone)await detail.getByRole('button',{name:'一覧へ戻る',exact:true}).click();
    await search.fill('既存のピン');const windows=await page.locator('.lv-caption-window').count();
    await list.locator('.lv-caption-select').filter({hasText:'既存のピン'}).click();
    await expect(detail.locator('[data-caption-field="title"] > p')).toHaveText('既存のピン');
    await expect(detail.getByLabel('本文',{exact:true})).toBeHidden();
    expect(await page.locator('.lv-caption-window').count()).toBe(windows);
    await expect(page.getByRole('tab',{name:'モデル',exact:true})).toBeDisabled();
    await files.locator(':scope > summary').click();await expect(panel.locator('.lv-file-primary')).toBeDisabled();
    await panel.getByRole('button',{name:'閉じる',exact:true}).press('Escape');await expect(panel).toBeHidden();
    if(phone)await detail.getByRole('button',{name:'一覧へ戻る',exact:true}).click();
    await search.focus();await search.dispatchEvent('compositionstart');
    await page.screenshot({path:info.outputPath('reading-during-output.png')});
    await page.evaluate(()=>(window as any).__releaseOutputHash());
    const file=info.outputPath('read-while-output.zip');await(await download).saveAs(file);
    await expect(page.locator('.lv-project-shell > .lv-operation-status')).toContainText('ダウンロードを開始しました。');
    await expect(search).toBeFocused();await expect(search).toHaveValue('既存のピン');await expect(panel).toBeHidden();
    await search.dispatchEvent('compositionend');
    await BackupArchive.inspect(await openAsBlob(file),validationMetadataLimits);
    expect(errors).toEqual([]);
  }finally{await page.evaluate(()=>(window as any).__releaseOutputHash?.()).catch(()=>{});await context.close();await browser.close();await server.stop();}
});
