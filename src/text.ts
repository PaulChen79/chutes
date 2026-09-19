/**
 * English pluralisation for the small set of nouns the CLI prints.
 *
 * Irregular plurals are passed explicitly rather than guessed, because the
 * guess is wrong exactly where it is most visible.
 */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The length of the longest string, for padding a two-column list. */
export function widestOf(values: string[]): number {
  return Math.max(0, ...values.map((value) => value.length));
}
