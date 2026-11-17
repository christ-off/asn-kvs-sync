/**
 * Compare the store content with the desired content (both Map<key, value>).
 * Returns the keys to put (new or changed) and to delete (no longer in the
 * source).
 */
export function computeDiff(current, desired) {
  const puts = [];
  const deletes = [];
  for (const [key, value] of desired) {
    if (current.get(key) !== value) puts.push({ Key: key, Value: value });
  }
  for (const key of current.keys()) {
    if (!desired.has(key)) deletes.push({ Key: key });
  }
  return { puts, deletes };
}

/**
 * Refuse to sync a source that looks truncated: empty, or far smaller than
 * what the store holds.
 */
export function checkGuardrail(current, desired, minRatio = 0.9) {
  if (desired.size === 0) throw new Error("Guardrail: source is empty, nothing written");
  if (current.size > 0 && desired.size < current.size * minRatio) {
    throw new Error(`Guardrail: source has ${desired.size} entries, store has ${current.size} (< ${minRatio * 100}%), nothing written`);
  }
}

export function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
