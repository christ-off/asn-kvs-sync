export const SOURCE_URL = "https://raw.githubusercontent.com/ipverse/as-metadata/master/as.json";

// Categories published by the source.
export const CATEGORIES = new Set(["isp", "hosting", "business", "education_research", "government_admin"]);

// The filter function allows only these; a missing key means "block". Keeping only
// them keeps the store small (~34k keys) so listing and loading it fit in one run.
export const STORED_CATEGORIES = new Set(["isp", "education_research"]);

/**
 * Map the upstream as.json entries to { asn: category } for STORED_CATEGORIES only.
 * Categories missing from CATEGORIES are counted so a new upstream category is
 * visible in the logs instead of silently ignored.
 */
export function toCategoryMap(entries) {
  const map = new Map();
  const unknown = new Map();
  for (const entry of entries) {
    const category = entry.metadata?.category;
    if (!category) continue;
    if (STORED_CATEGORIES.has(category)) {
      map.set(String(entry.asn), category);
    } else if (!CATEGORIES.has(category)) {
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
