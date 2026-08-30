import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildImportPlan } from '../../src/assets/importWizard';
import { readZipEntries, writeZipEntries } from '../../src/assets/zipio';
import {
  assertLociMyuSourceUnchanged,
  completeLociMyuNativeConversionReport,
  createLociMyuNativeProject,
  planLociMyuZipToNative,
} from '../../src/nativeGs/locimyuConversion';
import { listNativeProjectsV1, nativeProjectRoot, openNativeProjectV1 } from '../../src/nativeGs/storage';
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';

const fixturePath = resolve('fixtures/v1-migration/locimyu-drive-exact-v1.zip');
const captionHeader = ['id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt'];
const encoder = new TextEncoder();

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function captionCsv(rows: readonly (readonly string[])[]): Uint8Array {
  return encoder.encode(`${[captionHeader, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`);
}

describe('LociMyu ZIP to native direct adapter', () => {
  it('reuses recipe-2 identity and converts only exact source-authoritative relations', async () => {
    const bytes = new Uint8Array(await readFile(fixturePath));
    const file = new File([Uint8Array.from(bytes)], 'locimyu-drive-exact-v1.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(bytes), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Direct native fixture');

    expect(plan.blockingIssueCount).toBe(0);
    expect(importPlan.sources[importPlan.selectedSourceIndex]!.fileName).toBe('LociMyu Save.xlsx');
    expect(plan.draft.assets).toHaveLength(1);
    expect(plan.draft.representations).toHaveLength(1);
    expect(plan.draft.displaySets).toHaveLength(2);
    expect(plan.draft.captions.map((caption) => caption.id)).toEqual(expect.arrayContaining([
      'cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40',
      'cap_4BAEWJVQTVNFB6FNH23E4ZGCVB',
    ]));
    expect(plan.inventory.duplicateOccurrenceCount).toBe(0);
    expect(plan.draft.mediaResources).toHaveLength(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'orthographic-view-reported' }));
    expect(plan.mappings.some((entry) => entry.sourceKind === 'image' && entry.disposition === 'reported')).toBe(true);
    await expect(assertLociMyuSourceUnchanged(plan, file)).resolves.toEqual(plan.sourceBefore);

    const fs = new MemoryFS();
    const session = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    session.activateNewProject();
    const snapshot = await createLociMyuNativeProject(session.workspace, plan, file);
    const opened = await openNativeProjectV1(fs, snapshot.project.id);
    expect(opened.missingRepresentationIds).toEqual([]);
    expect(opened.missingMediaIds).toEqual([]);
    expect(opened.snapshot.captions.map((caption) => caption.id)).toEqual(plan.draft.captions.map((caption) => caption.id));
    session.release();
  });

  it('treats ID-less rows as reported empty input without shifting the valid Caption row', async () => {
    const zip = await writeZipEntries([
      {
        path: 'LociMyu Save.csv',
        data: captionCsv([
          ['', 'first missing ID', '', '', '', '', '', '', '2026-01-01', ''],
          ['c_valid', 'valid row', '', '', '0', '1', '2', '', '', ''],
          ['', 'second missing ID', '', '', '', '', '', '', '', '2026-01-02'],
        ]),
      },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'idless-rows-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'ID-less rows direct fixture');
    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.inventory.captionRowCount).toBe(3);
    expect(plan.issues.filter((entry) => entry.code === 'caption-row-skipped-missing-id')).toEqual([
      expect.objectContaining({ sourceSheet: 'LociMyu Save', sourceRow: 2, field: 'legacyCaptionId' }),
      expect.objectContaining({ sourceSheet: 'LociMyu Save', sourceRow: 4, field: 'legacyCaptionId' }),
    ]);
    expect(plan.mappings.filter((entry) =>
      entry.sourceKind === 'Caption row' && entry.disposition === 'reported')).toEqual([
      expect.objectContaining({ sourceId: 'LociMyu Save:2:(missing legacy ID)' }),
      expect.objectContaining({ sourceId: 'LociMyu Save:4:(missing legacy ID)' }),
    ]);
    expect(plan.draft.captions).toEqual([
      expect.objectContaining({
        title: 'valid row',
        anchor: expect.objectContaining({ positionAsset: [0, 1, 2] }),
      }),
    ]);
    expect(plan.mappings).toContainEqual(expect.objectContaining({
      sourceKind: 'Caption row',
      sourceId: 'LociMyu Save:3:c_valid',
      disposition: 'converted',
    }));
    expect(plan.representationSources.size).toBe(1);
    expect(plan.mediaSources.size).toBe(0);
    expect(plan.draft.assets).toHaveLength(1);
    const after = await assertLociMyuSourceUnchanged(plan, file);

    const fs = new MemoryFS();
    const session = await ProjectMutationCoordinator.local().tryAcquire(
      fs,
      nativeProjectRoot(plan.draft.project.id),
      plan.draft.project.id,
    );
    session.activateNewProject();
    const snapshot = await createLociMyuNativeProject(session.workspace, plan, file);
    const report = completeLociMyuNativeConversionReport(plan, snapshot, after);
    expect(report.source.unchanged).toBe(true);
    expect(report.convertedCounts.assets).toBe(1);
    expect(report.convertedCounts.captions).toBe(1);
    expect(report.target.snapshotId).toBe(snapshot.snapshotId);
    expect(await listNativeProjectsV1(fs)).toHaveLength(1);
    expect((await openNativeProjectV1(fs, snapshot.project.id)).snapshot.captions).toEqual(snapshot.captions);
    session.release();
  });

  it('reports an identity digest collision without falling through or exposing a publishable draft', async () => {
    const zip = await writeZipEntries([
      {
        path: 'LociMyu Save.csv',
        data: captionCsv([
          ['c_one', 'one', '', '', '', '', '', '', '', ''],
          ['c_two', 'two', '', '', '', '', '', '', '', ''],
        ]),
      },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'collision-locimyu.zip', { type: 'application/zip' });
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer as ArrayBuffer);
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    vi.restoreAllMocks();

    expect(importPlan.blockedLociMyuSource).toEqual(expect.objectContaining({ code: 'full-digest-collision' }));
    const plan = await planLociMyuZipToNative(file, importPlan, 'Collision direct fixture');
    expect(plan.blockingIssueCount).toBe(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'full-digest-collision', severity: 'blocking' }));
    expect(plan.draft.assets).toEqual([]);
    expect(plan.representationSources.size).toBe(0);
    expect(plan.mediaSources.size).toBe(0);
  });

  it('does not choose a model owner when the selected dataset contains multiple model entries', async () => {
    const fixture = new Uint8Array(await readFile(fixturePath));
    const entries = await readZipEntries(fixture);
    const model = entries.find((entry) => entry.path.toLowerCase().endsWith('.glb'))!;
    const zip = await writeZipEntries([
      ...entries,
      { path: 'second-model.glb', data: new Uint8Array(model.data) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'multiple-models-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Multiple model fixture');

    expect(plan.blockingIssueCount).toBe(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'model-owner-not-unique', severity: 'blocking' }));
    expect(plan.inventory.modelCount).toBe(2);
    expect(plan.draft.assets).toEqual([]);
    expect(plan.representationSources.size).toBe(0);
  });

  it('does not attach media when the exact filename extension conflicts with its bytes', async () => {
    const entries = await readZipEntries(new Uint8Array(await readFile(fixturePath)));
    const zip = await writeZipEntries(entries.map((entry) => entry.path === 'images/linked.png'
      ? { ...entry, data: new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }
      : entry));
    const file = new File([Uint8Array.from(zip)], 'conflicting-media-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });
    const plan = await planLociMyuZipToNative(file, importPlan, 'Conflicting media fixture');

    expect(plan.blockingIssueCount).toBe(0);
    expect(plan.issues).toContainEqual(expect.objectContaining({
      code: 'media-filename-bytes-conflict',
      severity: 'warning',
    }));
    expect(plan.draft.mediaResources).toEqual([]);
    expect(plan.mediaSources.size).toBe(0);
    expect(plan.draft.captions.every((caption) => caption.attachmentMediaIds === undefined)).toBe(true);
  });

  it('keeps an unreadable named LociMyu workbook on the direct blocked-report path', async () => {
    const zip = await writeZipEntries([
      { path: 'LociMyu Save.xlsx', data: encoder.encode('not an XLSX container') },
      { path: 'models/tri.glb', data: new Uint8Array(await readFile(resolve('public/samples/tri.glb'))) },
    ]);
    const file = new File([Uint8Array.from(zip)], 'unreadable-workbook-locimyu.zip', { type: 'application/zip' });
    const importPlan = await buildImportPlan(await readZipEntries(zip), { preserveBlockedLociMyuSource: true });

    expect(importPlan.blockedLociMyuSource).toEqual(expect.objectContaining({ code: 'workbook-unreadable' }));
    const plan = await planLociMyuZipToNative(file, importPlan, 'Unreadable workbook fixture');
    expect(plan.blockingIssueCount).toBe(1);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: 'workbook-unreadable', severity: 'blocking' }));
    expect(plan.draft.assets).toEqual([]);
    expect(plan.representationSources.size).toBe(0);
  });
});
