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

async function searchUSDA(query: string): Promise<FoodSearchResult[]> {
  try {
    const key = getUsdaKey();
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(
      query
    )}&api_key=${key}&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&pageSize=10`;
    const res = await fetch(url);
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
  } catch {
    return [];
  }
}

// ── Combined Search ───────────────────────────────────────────────────────────

/** Search for foods matching the query string.
 *  Queries Open Food Facts first, then USDA in parallel.
 *  Deduplicates by name+brand. */
export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  if (!query.trim()) return [];

  const [offResults, usdaResults] = await Promise.all([
    // Open Food Facts text search
    fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=${encodeURIComponent(
        query
      )}&json=1&fields=product_name,abbreviated_product_name,brands,serving_size,nutriments,code&page_size=15&sort_by=popularity_key`
    )
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) =>
        (d.products ?? [])
          .map((p: Record<string, unknown>) => parseOFFProduct(p))
          .filter((r: FoodSearchResult | null): r is FoodSearchResult => r !== null && r.caloriesPer100g > 0)
      )
      .catch((): FoodSearchResult[] => []),
    searchUSDA(query),
  ]);

  // Merge: OFF first (branded), USDA second (raw ingredients)
  const seen = new Set<string>();
  const merged: FoodSearchResult[] = [];
  for (const item of [...offResults, ...usdaResults]) {
    const key = `${item.name.toLowerCase()}|${item.brand?.toLowerCase() ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged.slice(0, 20);
}
