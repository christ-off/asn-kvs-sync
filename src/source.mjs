export const SOURCE_URL = "https://raw.githubusercontent.com/ipverse/as-metadata/master/as.json";

// Stored as-is (readable in the store, ~1.5 MB of the 5 MB KVS limit).
export const CATEGORIES = new Set(["isp", "hosting", "business", "education_research", "government_admin"]);

/**
 * Map the upstream as.json entries to { asn: category }. ASNs without a category are
 * left out. Categories missing from CATEGORIES are skipped and counted so a
 * new upstream category is visible in the logs instead of silently dropped.
 */
export function toCategoryMap(entries) {
  const map = new Map();
  const unknown = new Map();
  for (const entry of entries) {
    const category = entry.metadata?.category;
    if (!category) continue;
    if (CATEGORIES.has(category)) {
      map.set(String(entry.asn), category);
    } else {
      unknown.set(category, (unknown.get(category) ?? 0) + 1);
    }
  }
  return { map, unknown };
}

export async function fetchEntries(url = SOURCE_URL, fetchFn = fetch) {
  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`Source download failed: HTTP ${response.status}`);
  }
  const entries = await response.json();
  if (!Array.isArray(entries)) {
    throw new Error("Source is not a JSON array");
  }
  return entries;
}
