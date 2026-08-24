import {
  loadTrustedModeBDescriptor,
  parseModeBReceiptBytes,
  parseModeBReceiptEnvelope,
} from './contracts.mjs';
import {
  createProductionFilesystem,
  normalizeReceiptCliPath,
} from './filesystem.mjs';
import { createAttemptId } from './ids.mjs';
import { fail } from './errors.mjs';

export async function verifyModeBReceipt({
  receiptPath,
  filesystem = createProductionFilesystem(),
  verifierAttemptId = createAttemptId('verify'),
  repositoryRoot,
}) {
  const receiptRelativePath = normalizeReceiptCliPath(receiptPath);
  return filesystem.withVerifierLease(
    { receiptRelativePath, attemptId: verifierAttemptId },
    async (observation) => {
      const envelope = parseModeBReceiptEnvelope(observation.bytes);
      if (
        receiptRelativePath !==
        `receipts/receipt-${envelope.requestId}.${envelope.attemptId}.json`
      ) fail('E_RECEIPT_SCHEMA');
      const descriptorContext = await loadTrustedModeBDescriptor(
        envelope.descriptor.path,
        repositoryRoot,
      );
      const receipt = parseModeBReceiptBytes(observation.bytes, descriptorContext);
      if (receipt.local.relativePath !== null) {
        await observation.verifyLocalBinding({
          relativePath: receipt.local.relativePath,
          expectedBytes: descriptorContext.value.expectedBytes,
          expectedSha256: descriptorContext.value.expectedSha256,
        });
      } else if (receipt.local.disposition === 'partial-deleted') {
        await observation.verifyPartialAbsent({ attemptId: receipt.attemptId });
      }
      return Object.freeze({
        receiptRelativePath,
        outcome: receipt.outcome,
        stableFixtureIdentity: false,
        registryAdopted: false,
        g0Credit: false,
      });
    },
  );
}
