import type { Product, UnitType, GstRate } from '../types';

export interface MatchResult {
  rawName: string;
  matchedProduct: Product | null;
  confidence: number; // 0.0 to 1.0
  matchReason: 'barcode' | 'sku' | 'fuzzy_name' | 'unmatched';
  isNewProduct: boolean;
  rateDifference?: {
    previousRate: number;
    newRate: number;
    percentChange: number;
  };
}

// Common retail, garment & wholesale abbreviation expansions
const ABBREVIATIONS: Record<string, string> = {
  // Garments & Retail
  sht: 'shirt',
  shrt: 'shirt',
  ctn: 'cotton',
  cotn: 'cotton',
  slm: 'slim',
  ft: 'fit',
  trs: 'trousers',
  pant: 'trousers',
  pnt: 'trousers',
  jns: 'jeans',
  denm: 'denim',
  tst: 'tshirt',
  tshrt: 'tshirt',
  tee: 'tshirt',
  krt: 'kurta',
  sz: 'size',
  fml: 'formal',
  csl: 'casual',
  lyc: 'lycra',
  poly: 'polyester',
  wht: 'white',
  blk: 'black',
  blu: 'blue',
  gry: 'grey',
  grn: 'green',
  mrp: 'mrp',
  pcs: 'pcs',
  // Common wholesale brands & stationery legacy
  clsmt: 'classmate',
  nb: 'notebook',
  bk: 'book',
  pgs: 'pgs',
  pkt: 'pack',
  pk: 'pack',
  copr: 'copier',
  ppr: 'paper',
  stk: 'stick',
  fev: 'fevicol',
  fbc: 'faber castell',
  faber: 'faber castell',
  cas: 'casio',
  calc: 'calculator',
  kng: 'kangaro',
  stp: 'stapler',
  sol: 'solo',
  rey: 'reynolds',
  trm: 'trimax',
  hau: 'hauser',
  nat: 'nataraj',
  aps: 'apsara',
  cam: 'camlin',
  lux: 'luxor',
  pst: 'post-it',
  wnd: 'wonder'
};

/**
 * Normalizes a product name by removing punctuation, splitting tokens,
 * and expanding known abbreviations.
 */
export function normalizeText(text: string): string[] {
  if (!text) return [];
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const words = clean.split(/\s+/).filter(w => w.length > 0);
  return words.map(w => ABBREVIATIONS[w] || w);
}

/**
 * Calculates Token Jaccard Similarity between two strings.
 */
export function calculateTokenSimilarity(strA: string, strB: string): number {
  const tokensA = new Set(normalizeText(strA));
  const tokensB = new Set(normalizeText(strB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersectionCount++;
    } else {
      // Check partial substring match for tokens >= 3 chars
      for (const tb of tokensB) {
        if (tb.length >= 3 && t.length >= 3 && (tb.includes(t) || t.includes(tb))) {
          intersectionCount += 0.75;
          break;
        }
      }
    }
  }

  const unionSize = tokensA.size + tokensB.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

/**
 * Calculates Character Bigram Dice Coefficient for fine-grained spelling variations.
 */
export function calculateDiceCoefficient(a: string, b: string): number {
  const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanB = b.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (cleanA === cleanB) return 1.0;
  if (cleanA.length < 2 || cleanB.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < cleanA.length - 1; i++) {
    const bg = cleanA.substring(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let matches = 0;
  for (let i = 0; i < cleanB.length - 1; i++) {
    const bg = cleanB.substring(i, i + 2);
    const count = bigramsA.get(bg) || 0;
    if (count > 0) {
      bigramsA.set(bg, count - 1);
      matches++;
    }
  }

  return (2 * matches) / (cleanA.length - 1 + cleanB.length - 1);
}

/**
 * Matches an extracted bill line item against the shop's local product catalog.
 */
export function matchCatalogItem(
  item: {
    rawName: string;
    barcode?: string;
    sku?: string;
    hsnCode?: string;
    purchaseRate?: number;
    mrp?: number;
  },
  catalog: Product[],
  matchThreshold = 0.50
): MatchResult {
  const { rawName, barcode, sku, purchaseRate } = item;

  // 1. Direct Barcode Match (Priority 1)
  if (barcode && barcode.trim().length >= 5) {
    const cleanBarcode = barcode.trim().toLowerCase();
    const barcodeMatch = catalog.find(p => p.barcode && p.barcode.trim().toLowerCase() === cleanBarcode);
    if (barcodeMatch) {
      return buildResult(rawName, barcodeMatch, 1.0, 'barcode', purchaseRate);
    }
  }

  // 2. Direct SKU Match (Priority 2)
  if (sku && sku.trim().length >= 3) {
    const cleanSku = sku.trim().toLowerCase();
    const skuMatch = catalog.find(p => p.sku && p.sku.trim().toLowerCase() === cleanSku);
    if (skuMatch) {
      return buildResult(rawName, skuMatch, 1.0, 'sku', purchaseRate);
    }
  }

  // Check if rawName directly equals SKU of any product
  const cleanRawName = rawName.trim().toLowerCase();
  const directSkuMatch = catalog.find(p => p.sku && p.sku.trim().toLowerCase() === cleanRawName);
  if (directSkuMatch) {
    return buildResult(rawName, directSkuMatch, 0.98, 'sku', purchaseRate);
  }

  // 3. Fuzzy String Semantic Match (Priority 3)
  let bestMatch: Product | null = null;
  let bestScore = 0;

  for (const product of catalog) {
    const tokenScore = calculateTokenSimilarity(rawName, product.name);
    const diceScore = calculateDiceCoefficient(rawName, product.name);
    let combinedScore = (tokenScore * 0.65) + (diceScore * 0.35);

    // Boost score if HSN code matches
    if (item.hsnCode && product.hsnCode && item.hsnCode.trim() === product.hsnCode.trim()) {
      combinedScore += 0.08;
    }

    // Boost score if MRP matches exactly
    if (item.mrp && product.mrp && Math.abs(item.mrp - product.mrp) < 0.5) {
      combinedScore += 0.08;
    }

    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      bestMatch = product;
    }
  }

  if (bestMatch && bestScore >= matchThreshold) {
    return buildResult(rawName, bestMatch, Math.min(1.0, bestScore), 'fuzzy_name', purchaseRate);
  }

  // 4. Unmatched: Flag as New Product
  return {
    rawName,
    matchedProduct: null,
    confidence: bestScore,
    matchReason: 'unmatched',
    isNewProduct: true
  };
}

function buildResult(
  rawName: string,
  matchedProduct: Product,
  confidence: number,
  matchReason: 'barcode' | 'sku' | 'fuzzy_name',
  newRate?: number
): MatchResult {
  let rateDifference: MatchResult['rateDifference'];
  if (newRate !== undefined && matchedProduct.purchaseRate > 0) {
    const diff = newRate - matchedProduct.purchaseRate;
    const percent = (diff / matchedProduct.purchaseRate) * 100;
    rateDifference = {
      previousRate: matchedProduct.purchaseRate,
      newRate,
      percentChange: Math.round(percent * 10) / 10
    };
  }

  return {
    rawName,
    matchedProduct,
    confidence,
    matchReason,
    isNewProduct: false,
    rateDifference
  };
}

/**
 * Creates clean suggested default product attributes when adding an unmatched item
 */
export function createSuggestedProduct(
  rawName: string,
  defaults?: {
    purchaseRate?: number;
    mrp?: number;
    gstRate?: GstRate;
    hsnCode?: string;
    unit?: UnitType;
    category?: string;
  }
): Omit<Product, 'id' | 'createdAt' | 'updatedAt'> {
  const purchaseRate = defaults?.purchaseRate || 0;
  const mrp = defaults?.mrp || (purchaseRate > 0 ? Math.round(purchaseRate * 1.35) : 50);
  const saleRate = Math.round(mrp * 0.95) || purchaseRate;

  // Generate clean readable SKU prefix
  const skuPrefix = rawName
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map(w => w.substring(0, 3).toUpperCase())
    .join('-');

  return {
    sku: `${skuPrefix || 'SKU'}-${Date.now().toString().slice(-4)}`,
    barcode: '',
    name: rawName,
    category: defaults?.category || inferCategoryFromName(rawName),
    packInfo: '1 Pcs',
    unit: defaults?.unit || 'Pcs',
    mrp,
    purchaseRate,
    saleRate,
    hsnCode: defaults?.hsnCode || '4820',
    gstRate: defaults?.gstRate || 12,
    taxType: 'inclusive',
    stockQty: 0,
    minStockLevel: 10,
    isActive: true
  };
}

function inferCategoryFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('book') || lower.includes('notebook') || lower.includes('register') || lower.includes('diary')) {
    return 'Notebooks & Registers';
  }
  if (lower.includes('pen') || lower.includes('ball') || lower.includes('gel') || lower.includes('pencil') || lower.includes('marker')) {
    return 'Pens';
  }
  if (lower.includes('paper') || lower.includes('ream') || lower.includes('sheet') || lower.includes('copier')) {
    return 'Paper & Sheets';
  }
  if (lower.includes('glue') || lower.includes('tape') || lower.includes('fevicol') || lower.includes('fevistick')) {
    return 'Adhesives';
  }
  if (lower.includes('file') || lower.includes('folder') || lower.includes('cobra')) {
    return 'Files & Folders';
  }
  if (lower.includes('calc') || lower.includes('instrument') || lower.includes('geometry')) {
    return 'Calculators';
  }
  return 'Office Supplies';
}
