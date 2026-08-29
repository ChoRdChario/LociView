import { describe, expect, it } from 'vitest';
import {
  inspectZipContainerIdentity,
  ZipGuardError,
} from '../../src/assets/zipio';
import { writeDirectZip } from '../helpers/maliciousZip';

const encoder = new TextEncoder();

async function archive(paths: readonly string[]): Promise<Uint8Array> {
  return writeDirectZip(paths.map((path) => ({ path, data: encoder.encode('{}') })));
}

function blob(bytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
}

class RootArrayBufferForbiddenBlob extends Blob {
  override arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.reject(new Error('selected package-wide arrayBuffer() must not be used'));
  }
}

describe('ordinary-entry ZIP container identity', () => {
  it('keeps the frozen root v1 marker authoritative without reading the selected Blob wholesale', async () => {
    const bytes = await archive(['lociview.json', 'native/package.json', 'assets/model.bin']);
    const selected = new RootArrayBufferForbiddenBlob([new Uint8Array(bytes)], { type: 'application/zip' });

    await expect(inspectZipContainerIdentity(selected)).resolves.toBe('v1');
  });

  it('routes only the exact native marker and leaves unmarked ZIPs foreign', async () => {
    await expect(inspectZipContainerIdentity(blob(
      await archive(['native/package.json', 'native/snapshot.json']),
    ))).resolves.toBe('native-portable');
    await expect(inspectZipContainerIdentity(blob(
      await archive(['folder/lociview.json', 'models/model.glb']),
    ))).resolves.toBe('foreign');
  });

  it('applies the existing unsafe and ambiguous namespace guards before routing', async () => {
    await expect(inspectZipContainerIdentity(blob(
      await archive(['../native/package.json']),
    ))).rejects.toMatchObject({ code: 'unsafe-path' } satisfies Partial<ZipGuardError>);
    await expect(inspectZipContainerIdentity(blob(
      await archive(['native/package.json', 'NATIVE/PACKAGE.JSON']),
    ))).rejects.toMatchObject({ code: 'ambiguous-path' } satisfies Partial<ZipGuardError>);
  });
});
