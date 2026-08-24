import { AcquisitionError, publicError } from './acquisition/errors.mjs';
import { verifyModeBReceipt } from './acquisition/verify-receipt.mjs';

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--receipt' || typeof argv[1] !== 'string') {
    throw new AcquisitionError('E_USAGE');
  }
  return argv[1];
}

function writeFailure(error) {
  const fixed = publicError(error);
  const hop = fixed.hopIndex === null ? '' : ` hop=${fixed.hopIndex}`;
  process.stderr.write(`${fixed.code}${hop}\n`);
  process.exitCode = fixed.exitCode;
}

try {
  const receiptPath = parseArguments(process.argv.slice(2));
  const result = await verifyModeBReceipt({ receiptPath });
  process.stdout.write(
    `Mode-B receipt verified; outcome=${result.outcome}; fixture adoption and G0 credit remain false.\n`,
  );
} catch (error) {
  writeFailure(error);
}
