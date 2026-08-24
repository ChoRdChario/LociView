import { AcquisitionError, publicError } from './acquisition/errors.mjs';
import { restoreModeB } from './acquisition/restore.mjs';

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--descriptor' || typeof argv[1] !== 'string') {
    throw new AcquisitionError('E_USAGE');
  }
  return argv[1];
}

function writeFailure(result) {
  const hop = result.error.hopIndex === null ? '' : ` hop=${result.error.hopIndex}`;
  process.stderr.write(`${result.error.code}${hop}\n`);
  process.exitCode = result.exitCode;
}

let descriptorPath;
try {
  descriptorPath = parseArguments(process.argv.slice(2));
} catch {
  process.stderr.write('E_USAGE\n');
  process.exitCode = 2;
}

if (descriptorPath !== undefined) {
  try {
    const result = await restoreModeB({ descriptorPath });
    if (result.ok) {
      process.stdout.write(
        'Mode-B restore committed locally; fixture adoption and G0 credit remain false.\n',
      );
    } else {
      writeFailure(result);
    }
  } catch (error) {
    const fixed = publicError(error);
    process.stderr.write(`${fixed.code}\n`);
    process.exitCode = fixed.exitCode;
  }
}
