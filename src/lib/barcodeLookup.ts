/**
 * Uppslag av en skannad streckkod. Ordning: lokalt först – egna livsmedel och cachade
 * produkter, egna måltider och tillskott med sparad streckkod – och bara om inget finns
 * lokalt Open Food Facts. En lokal träff ger alltså inga nätverksanrop.
 *
 * En streckkod som finns lokalt men på "fel" ställe (ett tillskott som skannas i Mat,
 * eller ett livsmedel som skannas under Tillskott) ger `elsewhere`, så att vyn kan
 * föreslå rätt ställe i stället för att slå upp koden igen.
 */
import type { SavedMeal, StoredFood, Supplement } from '../db/db.ts';
import {
  fetchOffProduct,
  parseOffProduct,
  parseOffSupplement,
  type OffSupplement,
} from './barcode.ts';
import type { FoodItem } from './foodSearch.ts';

export type ScanContext = 'mat' | 'tillskott';

/** Lokala uppslag (IndexedDB i appen, påhittade i tester). */
export interface LocalLookup {
  food: (ean: string) => Promise<StoredFood | null>;
  meal: (ean: string) => Promise<SavedMeal | null>;
  supplement: (ean: string) => Promise<Supplement | null>;
}

export interface LookupOptions {
  context: ScanContext;
  local: LocalLookup;
  /** Slås tillskott/mat av räknas deras lokala träffar inte (de visas ju inte). */
  supplementsEnabled: boolean;
  foodEnabled: boolean;
  fetchFn?: typeof fetch;
}

export type BarcodeResult =
  | { kind: 'food'; food: StoredFood }
  | { kind: 'meal'; meal: SavedMeal }
  | { kind: 'supplement'; supplement: Supplement }
  | { kind: 'elsewhere'; target: ScanContext; name: string; ean: string }
  | { kind: 'off-food'; food: FoodItem }
  | { kind: 'off-supplement'; prefill: OffSupplement }
  | { kind: 'not-found'; ean: string }
  | { kind: 'error'; message: string };

export async function lookupBarcode(ean: string, options: LookupOptions): Promise<BarcodeResult> {
  const { context, local } = options;
  const [food, meal, supplement] = await Promise.all([
    options.foodEnabled || context === 'mat' ? local.food(ean) : Promise.resolve(null),
    options.foodEnabled || context === 'mat' ? local.meal(ean) : Promise.resolve(null),
    options.supplementsEnabled || context === 'tillskott'
      ? local.supplement(ean)
      : Promise.resolve(null),
  ]);

  if (context === 'mat') {
    if (food) return { kind: 'food', food };
    if (meal) return { kind: 'meal', meal };
    if (supplement) {
      return { kind: 'elsewhere', target: 'tillskott', name: supplement.name, ean };
    }
  } else {
    if (supplement) return { kind: 'supplement', supplement };
    const other = food ?? meal;
    if (other) return { kind: 'elsewhere', target: 'mat', name: other.name, ean };
  }

  const result = await fetchOffProduct(ean, options.fetchFn);
  if (result.kind === 'error') return result;
  if (result.kind === 'not-found') return { kind: 'not-found', ean };
  if (context === 'mat') {
    const item = parseOffProduct(ean, result.body);
    return item ? { kind: 'off-food', food: item } : { kind: 'not-found', ean };
  }
  const prefill = parseOffSupplement(ean, result.body);
  return prefill ? { kind: 'off-supplement', prefill } : { kind: 'not-found', ean };
}
