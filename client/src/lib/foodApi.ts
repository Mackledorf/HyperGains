/**
 * Food database API integrations.
 *
 * Priority chain:
 *  1. Open Food Facts (barcode scan + text search) — free, no key, ~3M products
 *  2. USDA FoodData Central (text search) — free DEMO_KEY, great for raw ingredients
 *
 * Future: user-configurable USDA API key stored under localStorage key "hg_usda_key"
 * Default "DEMO_KEY" allows 30 req/hr per IP — sufficient for personal use.
 */

export interface FoodSearchResult {
  /** Unique stable ID from the data source */
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  /** Canonical serving size in grams */
  servingSizeG: number;
  /** Human-readable serving label, e.g. "1 bar (50g)" */
  servingSizeLabel: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: "openfoodfacts" | "usda" | "custom" | "global";
}

import * as store from "@/lib/storage";
import _commonFoodsRaw from "./commonFoods.json";
const _commonFoods = _commonFoodsRaw as FoodSearchResult[];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract gram weight from a serving size string like "1 bar (34g)" or "100 g". */
function parseServingGrams(servingSize: string | undefined | null): number {
  if (!servingSize) return 100;
  // Prefer explicit gram weight inside parens: "(34g)" → 34
  const parenG = servingSize.match(/\((\d+\.?\d*)\s*g\)/i);
  if (parenG) return parseFloat(parenG[1]);
  // Plain "Xg" at start
  const plainG = servingSize.match(/^(\d+\.?\d*)\s*g\b/i);
  if (plainG) return parseFloat(plainG[1]);
  // Millilitres (approx 1ml ≈ 1g for most liquids)
  const mlMatch =
    servingSize.match(/\((\d+\.?\d*)\s*ml\)/i) ||
    servingSize.match(/^(\d+\.?\d*)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);
  return 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Open Food Facts ───────────────────────────────────────────────────────────

function parseOFFProduct(product: Record<string, unknown>): FoodSearchResult | null {
  const n = product.nutriments as Record<string, number> | undefined;
  if (!n) return null;

  // Calories: prefer explicit kcal field, fall back to kJ conversion
  const caloriesPer100g =
    (n["energy-kcal_100g"] as number | undefined) ??
    ((n["energy_100g"] as number | undefined)
      ? (n["energy_100g"] as number) / 4.184
      : undefined);

  if (caloriesPer100g === undefined || caloriesPer100g < 0) return null;

  const servingSizeRaw = (product.serving_size as string | undefined) ?? "";
  const servingSizeG = parseServingGrams(servingSizeRaw) || 100;

  const name =
    (product.product_name as string | undefined) ||
    (product.abbreviated_product_name as string | undefined) ||
    "";
  if (!name) return null;

  return {
    id: `off_${(product._id as string | undefined) ?? (product.code as string | undefined) ?? Math.random()}`,
    name,
    brand: (product.brands as string | undefined) || undefined,
    barcode: (product.code as string | undefined) || undefined,
    servingSizeG,
    servingSizeLabel: servingSizeRaw || `${servingSizeG}g`,
    caloriesPer100g: round1(caloriesPer100g),
    proteinPer100g: round1((n["proteins_100g"] as number | undefined) ?? 0),
    carbsPer100g: round1((n["carbohydrates_100g"] as number | undefined) ?? 0),
    fatPer100g: round1((n["fat_100g"] as number | undefined) ?? 0),
    source: "openfoodfacts",
  };
}

/** Look up a single product by barcode via Open Food Facts. */
export async function lookupBarcode(
  barcode: string
): Promise<FoodSearchResult | null> {
  try {
    const url = `https://search.openfoodfacts.org/search?code=${encodeURIComponent(
      barcode
    )}&fields=product_name,abbreviated_product_name,brands,serving_size,nutriments,code&page_size=1`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.hits ?? [])[0];
    if (!hit) return null;
    return parseOFFProduct(hit as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Locale helpers ───────────────────────────────────────────────────────────

function getUserLocale(): { lang: string; country: string } {
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en-US") || "en-US";
  const parts = nav.split("-");
  return {
    lang: parts[0].toLowerCase(),
    country: (parts[1] || "").toLowerCase(),
  };
}

// ── In-memory search cache (2-hr TTL, persisted to localStorage) ─────────────

const _cache = new Map<string, { results: FoodSearchResult[]; at: number }>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const LS_CACHE_KEY = "hg_food_cache";

// Hydrate in-memory cache from localStorage on module load
try {
  const raw = localStorage.getItem(LS_CACHE_KEY);
  if (raw) {
    const stored = JSON.parse(raw) as Record<string, { results: FoodSearchResult[]; at: number }>;
    const now = Date.now();
    for (const [k, v] of Object.entries(stored)) {
      if (now - v.at < CACHE_TTL_MS) _cache.set(k, v);
    }
  }
} catch { /* ignore */ }

function getCached(key: string): FoodSearchResult[] | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.results;
}

function setCached(key: string, results: FoodSearchResult[]) {
  const entry = { results, at: Date.now() };
  _cache.set(key, entry);
  if (_cache.size > 100) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
  // Write-through to localStorage
  try {
    const obj: Record<string, { results: FoodSearchResult[]; at: number }> = {};
    for (const [k, v] of Array.from(_cache.entries())) obj[k] = v;
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(obj));
  } catch { /* storage quota exceeded — ignore */ }
}

// ── USDA rate-limit block (persisted to localStorage) ───────────────────────────
const LS_USDA_BLOCK_KEY = "hg_usda_blocked_until";
let _usdaBlockedUntil: number = (() => {
  try { return parseInt(localStorage.getItem(LS_USDA_BLOCK_KEY) ?? "0", 10) || 0; }
  catch { return 0; }
})();

function blockUSDA(durationMs = 60 * 60 * 1000) {
  _usdaBlockedUntil = Date.now() + durationMs;
  try { localStorage.setItem(LS_USDA_BLOCK_KEY, String(_usdaBlockedUntil)); } catch { /* ignore */ }
}

function isUsdaBlocked(): boolean {
  return Date.now() < _usdaBlockedUntil;
}

// ── OFF request throttle (≥1 s between requests to avoid rate limiting) ─────────
let _lastOFFReqAt = 0;
function waitForOFFSlot(): Promise<void> {
  const now = Date.now();
  const next = _lastOFFReqAt + 1000;
  _lastOFFReqAt = Math.max(now, next);
  const delay = next - now;
  if (delay <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ── OFF extended type for re-ranking ─────────────────────────────────────────

interface OffResultWithMeta extends FoodSearchResult {
  _lang?: string;
  _countries?: string[];
}

function parseOFFProductWithMeta(product: Record<string, unknown>): OffResultWithMeta | null {
  const base = parseOFFProduct(product);
  if (!base) return null;
  return {
    ...base,
    _lang: (product.lang as string | undefined)?.toLowerCase(),
    _countries: (product.countries_tags as string[] | undefined) ?? [],
  };
}

function scoreOFFResult(
  item: OffResultWithMeta,
  query: string,
  preferredLang: string,
  preferredCountry: string,
  index: number
): number {
  // Base score preserves popularity_key ordering from OFF
  let score = Math.max(0, 40 - index);

  const nameLower = item.name.toLowerCase();
  const brandLower = (item.brand ?? "").toLowerCase();
  const combined = `${brandLower} ${nameLower}`.trim();
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);

  // Whole-query match
  if (nameLower === q)                      score += 60;
  else if (nameLower.startsWith(q + " "))   score += 40;
  else if (nameLower.startsWith(q))         score += 35;
  else if (nameLower.includes(" " + q))     score += 20;
  else if (nameLower.includes(q))           score += 10;

  // Word-level match — every query word found in name or brand raises score
  const matchedWords = words.filter(w =>
    nameLower.includes(w) || brandLower.includes(w) || combined.includes(w)
  );
  score += (matchedWords.length / Math.max(words.length, 1)) * 25;

  // Extra boost when brand word appears in query
  if (brandLower && words.some(w => brandLower.includes(w))) score += 15;

  // Boost products whose language matches the browser language
  if (item._lang && item._lang === preferredLang) score += 25;

  // Boost products sold in user's country (tags look like "en:united-states")
  if (preferredCountry && item._countries?.some(c => c.toLowerCase().includes(preferredCountry)))
    score += 20;

  return score;
}

// ── USDA FoodData Central ─────────────────────────────────────────────────────

function getUsdaKey(): string {
  return localStorage.getItem("hg_usda_key") || "DEMO_KEY";
}

interface UsdaNutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
  unitName: string;
}

function usdaCalories(nutrients: UsdaNutrient[]): number {
  // nutrientId 1008 = Energy (kcal) in FDC API
  return (
    nutrients.find((n) => n.nutrientId === 1008)?.value ??
    nutrients.find((n) =>
      n.nutrientName?.toLowerCase().includes("energy") &&
      n.unitName?.toLowerCase() === "kcal"
    )?.value ??
    0
  );
}

function usdaMacro(nutrients: UsdaNutrient[], id: number, fallbackName: string): number {
  return (
    nutrients.find((n) => n.nutrientId === id)?.value ??
    nutrients.find((n) =>
      n.nutrientName?.toLowerCase().includes(fallbackName)
    )?.value ??
    0
  );
}

async function searchUSDA(query: string, signal?: AbortSignal, onRateLimit?: () => void): Promise<FoodSearchResult[]> {
  if (isUsdaBlocked()) { onRateLimit?.(); return []; }
  try {
    const key = getUsdaKey();
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(
      query
    )}&api_key=${key}&dataType=Foundation,SR%20Legacy,Branded,Survey%20(FNDDS)&pageSize=20`;
    const res = await fetch(url, { signal });
    if (res.status === 429) { blockUSDA(); onRateLimit?.(); return []; }
    if (!res.ok) return [];
    const data = await res.json();
    const results: FoodSearchResult[] = [];
    for (const food of data.foods ?? []) {
      const nutrients: UsdaNutrient[] = food.foodNutrients ?? [];
      const calories = usdaCalories(nutrients);
      if (!calories) continue;
      const servingSizeG = food.servingSize ?? 100;
      const sizeLabel = food.servingSize
        ? `${food.servingSize}${food.servingSizeUnit ?? "g"}`
        : "100g";
      results.push({
        id: `usda_${food.fdcId}`,
        name: food.description,
        brand: food.brandOwner || food.brandName || undefined,
        servingSizeG,
        servingSizeLabel: sizeLabel,
        caloriesPer100g: round1(calories),
        proteinPer100g: round1(usdaMacro(nutrients, 1003, "protein")),
        carbsPer100g: round1(usdaMacro(nutrients, 1005, "carbohydrate")),
        fatPer100g: round1(usdaMacro(nutrients, 1004, "total lipid")),
        source: "usda",
      });
    }
    return results;
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return [];
  }
}

// ── Result merging (dedup by name+brand, cap at 30) ────────────────────────
function mergeDedup(...groups: FoodSearchResult[][]): FoodSearchResult[] {
  const seen = new Set<string>();
  const merged: FoodSearchResult[] = [];
  for (const item of groups.flat()) {
    const key = `${item.name.toLowerCase()}|${item.brand?.toLowerCase() ?? ""}`;
    if (!seen.has(key)) { seen.add(key); merged.push(item); }
  }
  return merged.slice(0, 30);
}

// ── Combined Search ───────────────────────────────────────────────────────────

/** Search for foods matching the query string.
 *  Calls onPartial progressively — up to 3 times:
 *    1) Instant: prefix-filtered results from a related cached query
 *    2) Fast:    OFF results re-ranked by locale (~800ms)
 *    3) Full:    OFF + USDA merged (~1.5s)
 *  Results are cached in-memory for 30 minutes.
 *
 *  When brand + item are provided separately (refine mode), fires three
 *  queries in parallel (combined, brand-only, item-only) and merges them
 *  so neither dimension is lost. */
export async function searchFoods(
  query: string,
  signal?: AbortSignal,
  onPartial?: (results: FoodSearchResult[]) => void,
  onError?: (type: 'search_unavailable' | 'rate_limited') => void,
  brand?: string,
  item?: string,
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cached = getCached(q);
  if (cached !== null) {
    onPartial?.(cached);
    return cached;
  }

  const { lang, country } = getUserLocale();

  // ── 1. Library + Bundled Search (instant, zero-network) ──────────────────
  const localLibrary = store.getCustomFoods() as FoodSearchResult[];
  const globalLibrary = store.getGlobalFoods() as FoodSearchResult[];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const wordMatch = (r: FoodSearchResult) =>
    words.every(w =>
      r.name.toLowerCase().includes(w) ||
      (r.brand?.toLowerCase() ?? "").includes(w)
    );

  const libraryResults = [...localLibrary, ...globalLibrary].filter(wordMatch);
  const bundledResults = _commonFoods.filter(wordMatch);
  const instantResults = mergeDedup(libraryResults, bundledResults);

  if (instantResults.length > 0) onPartial?.(instantResults);

  // Enough instant results — skip APIs entirely
  if (instantResults.length >= 5) {
    setCached(q, instantResults);
    return instantResults;
  }

  // ── 2. Prefix-cache results ─────────────────────────────────────────────────
  for (const [key, entry] of Array.from(_cache.entries())) {
    if (Date.now() - entry.at > CACHE_TTL_MS) continue;
    const ql = q.toLowerCase();
    const kl = key.toLowerCase();
    if (ql.startsWith(kl) || kl.startsWith(ql)) {
      const filtered = entry.results.filter(wordMatch);
      if (filtered.length > 0) {
        const merged = mergeDedup(instantResults, filtered);
        onPartial?.(merged);
        // Sufficient coverage — skip APIs entirely
        if (merged.length >= 8) {
          setCached(q, merged);
          return merged;
        }
        break;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function rerankOFF(offResults: OffResultWithMeta[]): FoodSearchResult[] {
    function strip(item: OffResultWithMeta): FoodSearchResult {
      const { _lang, _countries, ...rest } = item;
      void _lang; void _countries;
      return rest as FoodSearchResult;
    }

    const preferred: OffResultWithMeta[] = [];
    const foreign: OffResultWithMeta[] = [];
    offResults.forEach(item => {
      if (!item._lang || item._lang === lang) preferred.push(item);
      else foreign.push(item);
    });

    function scoreAndSort(list: OffResultWithMeta[]): FoodSearchResult[] {
      return list
        .map((item, i) => ({ item, score: scoreOFFResult(item, q, lang, country, i) }))
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => strip(item));
    }

    return [...scoreAndSort(preferred), ...scoreAndSort(foreign)];
  }

  // ── Decide which queries to fire ────────────────────────────────────────────
  // Refine mode: brand + item supplied → serialize 3 OFF queries and merge.
  // Normal mode: single query.
  const brandQ = brand?.trim() ?? "";
  const itemQ  = item?.trim()  ?? "";
  const isRefineMode = brandQ.length > 0 && itemQ.length > 0;

  const fetchOFF = async (searchQ: string, onFail?: () => void): Promise<OffResultWithMeta[]> => {
    const OFF_FIELDS = "product_name,abbreviated_product_name,brands,serving_size,nutriments,code,lang,countries_tags";
    const parseHits = (d: Record<string, unknown>): OffResultWithMeta[] =>
      ((d.hits ?? d.products ?? []) as Record<string, unknown>[])
        .map((p) => parseOFFProductWithMeta(p))
        .filter((r): r is OffResultWithMeta => r !== null && r.caloriesPer100g > 0);
    // Throttle: enforce ≥1 s between OFF requests to avoid rate limiting
    await waitForOFFSlot();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    // ── Primary: new Elasticsearch endpoint ──────────────────────────────────
    try {
      const r = await fetch(
        `https://search.openfoodfacts.org/search?q=${encodeURIComponent(searchQ)}` +
        `&fields=${OFF_FIELDS}&page_size=30&sort_by=popularity_key`,
        { signal }
      );
      if (r.ok) {
        const d = await r.json();
        const results = parseHits(d as Record<string, unknown>);
        if (results.length > 0) return results;
        // Fall through to classic endpoint if ES returned 0 results (index may be stale)
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      // swallow and fall through to classic endpoint
    }

    // ── Fallback: stable classic CGI endpoint ─────────────────────────────────
    try {
      const r = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(searchQ)}` +
        `&json=1&page_size=30&sort_by=popularity&fields=${OFF_FIELDS}`,
        { signal }
      );
      if (!r.ok) { onFail?.(); return []; }
      const d = await r.json();
      return parseHits(d as Record<string, unknown>);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      onFail?.();
      return [];
    }
  };

  let offFailed = false;
  let usdaRateLimited = false;
  let rerankedOff: FoodSearchResult[] = [];

  if (isRefineMode) {
    // Serialize OFF queries to respect the 1-req/sec throttle
    const offCombined = await fetchOFF(q, () => { offFailed = true; }).catch(() => [] as OffResultWithMeta[]);
    const offBrand    = await fetchOFF(brandQ).catch(() => [] as OffResultWithMeta[]);
    const offItem     = await fetchOFF(itemQ).catch(() => [] as OffResultWithMeta[]);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const combinedRanked = rerankOFF(offCombined);
    const brandRanked    = rerankOFF(offBrand);
    const itemRanked     = rerankOFF(offItem);
    rerankedOff = mergeDedup(combinedRanked, brandRanked, itemRanked);

    if (rerankedOff.length > 0) onPartial?.(mergeDedup(instantResults, rerankedOff));

    // USDA: lazy — only if OFF results are sparse and user has a custom key
    let usdaCombined: FoodSearchResult[] = [];
    let usdaBrand: FoodSearchResult[] = [];
    let usdaItem: FoodSearchResult[] = [];
    if (rerankedOff.length < 5 && getUsdaKey() !== "DEMO_KEY") {
      [usdaCombined, usdaBrand, usdaItem] = await Promise.all([
        searchUSDA(q, signal, () => { usdaRateLimited = true; }).catch(() => [] as FoodSearchResult[]),
        searchUSDA(brandQ, signal).catch(() => [] as FoodSearchResult[]),
        searchUSDA(itemQ, signal).catch(() => [] as FoodSearchResult[]),
      ]);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    }

    const results = mergeDedup(instantResults, rerankedOff, usdaCombined, usdaBrand, usdaItem);
    if (results.length > 0) setCached(q, results);
    else if (offFailed && !usdaCombined.length && !usdaBrand.length && !usdaItem.length && !instantResults.length) onError?.('search_unavailable');
    else if (usdaRateLimited) onError?.('rate_limited');
    onPartial?.(results);
    return results;
  }

  // ── Normal single-query path ──────────────────────────────────────────────
  const offRaw = await fetchOFF(q, () => { offFailed = true; });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  rerankedOff = (() => { try { return rerankOFF(offRaw); } catch { return []; } })();
  if (rerankedOff.length > 0) onPartial?.(mergeDedup(instantResults, rerankedOff));

  // USDA: lazy fallback — only if OFF returned fewer than 5 results and user has a custom key
  let usdaResults: FoodSearchResult[] = [];
  if (rerankedOff.length < 5 && getUsdaKey() !== "DEMO_KEY") {
    usdaResults = await searchUSDA(q, signal, () => { usdaRateLimited = true; });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }

  const results = mergeDedup(instantResults, rerankedOff, usdaResults);
  if (results.length > 0) {
    setCached(q, results);
  } else if (offFailed && !usdaResults.length && !instantResults.length) {
    onError?.('search_unavailable');
  } else if (usdaRateLimited) {
    onError?.('rate_limited');
  }
  onPartial?.(results);
  return results;
}
