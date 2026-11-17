import { fetchEntries, toCategoryMap } from "./source.mjs";
import { computeDiff, checkGuardrail } from "./diff.mjs";
import { createClient, listAll, applyChanges } from "./kvs.mjs";

const KVS_ARN = process.env.KVS_ARN;

export const handler = async () => {
  // Download first: if it fails the store is left untouched (the previous content stays in place).
  const entries = await fetchEntries();
  const { map: desired, unknown } = toCategoryMap(entries);
  if (unknown.size > 0) console.warn("Unmapped categories skipped:", Object.fromEntries(unknown));

  const client = createClient();
  const current = await listAll(client, KVS_ARN);
  checkGuardrail(current, desired);

  const diff = computeDiff(current, desired);
  const batches = await applyChanges(client, KVS_ARN, diff);

  const summary = { source: desired.size, store: current.size, added: 0, changed: 0, removed: diff.deletes.length, batches };
  for (const { Key } of diff.puts) current.has(Key) ? summary.changed++ : summary.added++;
  console.log("asn-kvs-sync done", JSON.stringify(summary));
  return summary;
};
