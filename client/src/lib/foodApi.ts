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
  source: "openfoodfacts" | "usda" | "custom";
}

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
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      barcode
    )}.json?fields=product_name,abbreviated_product_name,brands,serving_size,nutriments,code`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    return parseOFFProduct(data.product as Record<string, unknown>);
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

// ── In-memory search cache (5-minute TTL) ─────────────────────────────────────

const _cache = new Map<string, { results: FoodSearchResult[]; at: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function getCached(key: string): FoodSearchResult[] | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.results;
}

function setCached(key: string, results: FoodSearchResult[]) {
  _cache.set(key, { results, at: Date.now() });
  if (_cache.size > 100) {
    const firstKey = _cache.keys().next().value;
    if (firstKey !== undefined) _cache.delete(firstKey);
  }
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
  const q = query.toLowerCase().trim();

  if (nameLower === q)                    score += 60;
  else if (nameLower.startsWith(q + " ")) score += 40;
  else if (nameLower.startsWith(q))       score += 35;
  else if (nameLower.includes(" " + q))   score += 15;

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

async function searchUSDA(query: string, signal?: AbortSignal): Promise<FoodSearchResult[]> {
  try {
    const key = getUsdaKey();
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(
      query
    )}&api_key=${key}&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&pageSize=10`;
    const res = await fetch(url, { signal });
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

// ── Combined Search ───────────────────────────────────────────────────────────

/** Search for foods matching the query string.
 *  Calls onPartial progressively — up to 3 times:
 *    1) Instant: prefix-filtered results from a related cached query
 *    2) Fast:    OFF results re-ranked by locale (~800ms)
 *    3) Full:    OFF + USDA merged (~1.5s)
 *  Results are cached in-memory for 30 minutes. */
export async function searchFoods(
  query: string,
  signal?: AbortSignal,
  onPartial?: (results: FoodSearchResult[]) => void,
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cached = getCached(q);
  if (cached) {
    onPartial?.(cached);
    return cached;
  }

  const { lang, country } = getUserLocale();

  // ── 1. Instant prefix-cache results ────────────────────────────────────────
  // If a related query is cached, filter and display matching items immediately.
  if (onPartial) {
    for (const [key, entry] of Array.from(_cache.entries())) {
      if (Date.now() - entry.at > CACHE_TTL_MS) continue;
      const ql = q.toLowerCase();
      const kl = key.toLowerCase();
      if (ql.startsWith(kl) || kl.startsWith(ql)) {
        const words = ql.split(/\s+/).filter(Boolean);
        const filtered = entry.results.filter((r: FoodSearchResult) =>
          words.every(w =>
            r.name.toLowerCase().includes(w) ||
            (r.brand?.toLowerCase() ?? "").includes(w)
          )
        );
        if (filtered.length > 0) { onPartial(filtered); break; }
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function rerankOFF(offResults: OffResultWithMeta[]): FoodSearchResult[] {
    return offResults
      .map((item, i) => ({ item, score: scoreOFFResult(item, q, lang, country, i) }))
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => {
        const { _lang, _countries, ...rest } = item;
        void _lang; void _countries;
        return rest as FoodSearchResult;
      });
  }

  function mergeResults(off: FoodSearchResult[], usda: FoodSearchResult[]): FoodSearchResult[] {
    const seen = new Set<string>();
    const merged: FoodSearchResult[] = [];
    for (const item of [...off, ...usda]) {
      const key = `${item.name.toLowerCase()}|${item.brand?.toLowerCase() ?? ""}`;
      if (!seen.has(key)) { seen.add(key); merged.push(item); }
    }
    return merged.slice(0, 20);
  }

  // ── 2. Fire both requests independently ────────────────────────────────────
  const offFetch = fetch(
    `https://world.openfoodfacts.org/cgi/search.pl?action=process` +
    `&search_terms=${encodeURIComponent(q)}&json=1` +
    `&fields=product_name,abbreviated_product_name,brands,serving_size,nutriments,code,lang,countries_tags` +
    `&page_size=12&sort_by=popularity_key`,
    { signal }
  )
    .then(r => r.ok ? r.json() : { products: [] })
    .then((d): OffResultWithMeta[] =>
      (d.products ?? [])
        .map((p: Record<string, unknown>) => parseOFFProductWithMeta(p))
        .filter((r: OffResultWithMeta | null): r is OffResultWithMeta => r !== null && r.caloriesPer100g > 0)
    )
    .catch((e): OffResultWithMeta[] => {
      if ((e as Error)?.name === "AbortError") throw e;
      return [];
    });

  const usdaFetch = searchUSDA(q, signal);

  // Show OFF results as soon as they arrive, without waiting for USDA
  let rerankedOff: FoodSearchResult[] = [];
  offFetch.then(off => {
    if (signal?.aborted) return;
    rerankedOff = rerankOFF(off);
    onPartial?.(rerankedOff);
  }).catch(() => {});

  // ── 3. Wait for both, merge, cache, fire final onPartial ──────────────────
  const [offRaw, usdaResults] = await Promise.all([offFetch, usdaFetch]);
  if (rerankedOff.length === 0) rerankedOff = rerankOFF(offRaw);

  const results = mergeResults(rerankedOff, usdaResults);
  setCached(q, results);
  onPartial?.(results);
  return results;
}
