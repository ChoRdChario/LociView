import { createModeBTransportForTest } from './transport-core.mjs';
import { NODE_RAW_PORT } from './transport-node.mjs';

const productionTransport = createModeBTransportForTest(NODE_RAW_PORT);

export function openModeBResponse(input) {
  return productionTransport.openModeBResponse(input);
}
