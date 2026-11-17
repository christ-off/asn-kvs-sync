// A value starting with this prefix is a manual override: the sync never
// updates or deletes it (e.g. "!hosting" forces hosting for an ASN).
export const OVERRIDE_PREFIX = "!";

/**
 * Compare the store content with the desired content (both Map<key, value>).
 * Returns the keys to put (new or changed) and to delete (no longer in the
 * source), leaving manual overrides untouched.
 */
export function computeDiff(current, desired) {
  const puts = [];
  const deletes = [];
  for (const [key, value] of desired) {
    const existing = current.get(key);
    if (existing?.startsWith(OVERRIDE_PREFIX)) continue;
    if (existing !== value) puts.push({ Key: key, Value: value });
  }
  for (const [key, value] of current) {
    if (!desired.has(key) && !value.startsWith(OVERRIDE_PREFIX)) deletes.push({ Key: key });
  }
  return { puts, deletes };
}

/**
 * Refuse to sync a source that looks truncated: empty, or far smaller than
 * what the store holds (managed keys only, overrides excluded).
 */
export function checkGuardrail(current, desired, minRatio = 0.9) {
  if (desired.size === 0) throw new Error("Guardrail: source is empty, nothing written");
  let managed = 0;
  for (const value of current.values()) {
    if (!value.startsWith(OVERRIDE_PREFIX)) managed++;
  }
  if (managed > 0 && desired.size < managed * minRatio) {
    throw new Error(`Guardrail: source has ${desired.size} entries, store has ${managed} (< ${minRatio * 100}%), nothing written`);
  }
}

export function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
