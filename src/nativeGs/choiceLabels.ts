export interface NativeNamedChoiceV1 {
  readonly id: string;
  readonly name: string;
}

/**
 * Keeps the durable ID as the value while making equal human names distinguishable.
 * Input order is the only ordering authority; internal IDs are never exposed as labels.
 */
export function nativeChoiceLabelsByIdV1(
  choices: readonly NativeNamedChoiceV1[],
): ReadonlyMap<string, string> {
  const totals = new Map<string, number>();
  for (const choice of choices) totals.set(choice.name, (totals.get(choice.name) ?? 0) + 1);
  const ordinals = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const choice of choices) {
    const total = totals.get(choice.name) ?? 1;
    if (total === 1) {
      labels.set(choice.id, choice.name);
      continue;
    }
    const ordinal = (ordinals.get(choice.name) ?? 0) + 1;
    ordinals.set(choice.name, ordinal);
    labels.set(choice.id, `${choice.name}（同名 ${ordinal}/${total}）`);
  }
  return labels;
}
