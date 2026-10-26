import type { ProjectMetadataSource } from './source';
import type { MetadataEdit } from './commands';
import { json } from './persistence';
import { fail } from './format';

/** Process-local, single preparation authority. Neither JSON nor a saved receipt. */
export interface PointAnchorProof { readonly pointAnchorProof: unique symbol }
const proofs = new WeakMap<object, { source: ProjectMetadataSource; command: string; transactionId: string }>();
/** Session calls only after its owned content port returns the exact canonical anchor. */
export function issuePointAnchorProof(source: ProjectMetadataSource, command: MetadataEdit, transactionId: string): PointAnchorProof {
  const proof = Object.freeze({}); proofs.set(proof, { source, command: json(command), transactionId }); return proof as PointAnchorProof;
}
export function usePointAnchorProof(proof: PointAnchorProof | undefined, source: ProjectMetadataSource, command: MetadataEdit, transactionId: string): boolean {
  if (!proof) return false;
  const binding = proofs.get(proof); proofs.delete(proof);
  if (!binding || binding.source !== source || binding.command !== json(command) || binding.transactionId !== transactionId) return fail('point-anchor-proof');
  return true;
}
