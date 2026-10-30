import * as XLSX from 'xlsx';
import type { Product, UnitType, GstRate, TaxType } from '../types';

export type ImportMode = 'CREATE_AND_UPDATE' | 'CREATE_ONLY' | 'UPDATE_PRICES_ONLY';

export interface ColumnMapping {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  packInfo: string;
  unit: string;
  mrp: string;
  purchaseRate: string;
  saleRate: string;
  hsnCode: string;
  gstRate: string;
  taxType: string;
  stockQty: string;
  minStockLevel: string;
  isActive: string;
}

export interface ValidatedImportRow {
  rowNumber: number;
  status: 'valid' | 'warning' | 'error';
  action: 'create' | 'update' | 'skip' | 'error';
  errors: string[];
  warnings: string[];
  rawRow: Record<string, any>;
  parsedProduct: Partial<Product>;
  isExistingInDb: boolean;
}

export interface ImportSummaryResult {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: { rowNumber: number; sku: string; name: string; errors: string[] }[];
}

export const STANDARD_IMPORT_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'sku', label: 'SKU / Item Code', required: true },
  { key: 'name', label: 'Product Name', required: true },
  { key: 'saleRate', label: 'Selling Rate (₹)', required: true },
  { key: 'gstRate', label: 'GST Rate %', required: true },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'packInfo', label: 'Pack Info', required: false },
  { key: 'unit', label: 'Unit', required: false },
  { key: 'mrp', label: 'MRP (₹)', required: false },
  { key: 'purchaseRate', label: 'Purchase Rate (₹)', required: false },
  { key: 'hsnCode', label: 'HSN Code', required: false },
  { key: 'taxType', label: 'Tax Type (inclusive/exclusive)', required: false },
  { key: 'stockQty', label: 'Stock Quantity', required: false },
  { key: 'minStockLevel', label: 'Min Stock Threshold', required: false },
  { key: 'isActive', label: 'Is Active (true/false)', required: false },
];

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const findMatch = (candidates: string[]) => {
    return headers.find(h => candidates.some(c => h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c.toLowerCase()))) || '';
  };

  return {
    sku: findMatch(['sku', 'itemcode', 'code', 'productcode']),
    barcode: findMatch(['barcode', 'upc', 'ean']),
    name: findMatch(['productname', 'name', 'title', 'itemname', 'description']),
    category: findMatch(['category', 'group']),
    packInfo: findMatch(['pack', 'packinfo', 'packaging']),
    unit: findMatch(['unit', 'uom']),
    mrp: findMatch(['mrp', 'maxretailprice']),
    purchaseRate: findMatch(['purchaserate', 'costprice', 'buyprice', 'cost']),
    saleRate: findMatch(['sellingrate', 'salerate', 'rate', 'price', 'saleprice']),
    hsnCode: findMatch(['hsn', 'hsncode', 'sac']),
    gstRate: findMatch(['gst', 'gstrate', 'tax', 'taxrate']),
    taxType: findMatch(['taxtype', 'taxmode']),
    stockQty: findMatch(['stock', 'stockquantity', 'qty', 'quantity', 'balance']),
    minStockLevel: findMatch(['minstock', 'lowstock', 'reorder', 'threshold']),
    isActive: findMatch(['isactive', 'active', 'status']),
  };
}

export function parseSpreadsheetBuffer(buffer: ArrayBuffer): { headers: string[]; rows: Record<string, any>[] } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  if (jsonData.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = Object.keys(jsonData[0]);
  return { headers, rows: jsonData };
}

export function validateImportBatch(
  rows: Record<string, any>[],
  mapping: ColumnMapping,
  existingProducts: Product[],
  importMode: ImportMode
): ValidatedImportRow[] {
  const existingSkuMap = new Map<string, Product>();
  const existingBarcodeMap = new Map<string, Product>();

  existingProducts.forEach(p => {
    if (p.sku) existingSkuMap.set(p.sku.toLowerCase().trim(), p);
    if (p.barcode) existingBarcodeMap.set(p.barcode.toLowerCase().trim(), p);
  });

  const fileSkusSeen = new Map<string, number>();
  const fileBarcodesSeen = new Map<string, number>();

  return rows.map((rawRow, index) => {
    const rowNumber = index + 2; // 1-indexed row count including header
    const errors: string[] = [];
    const warnings: string[] = [];

    const getVal = (key: keyof ColumnMapping) => {
      const mappedCol = mapping[key];
      if (!mappedCol) return '';
      return rawRow[mappedCol] !== undefined ? String(rawRow[mappedCol]).trim() : '';
    };

    const sku = getVal('sku');
    const name = getVal('name');
    const barcode = getVal('barcode');
    const category = getVal('category') || 'General Supplies';
    const packInfo = getVal('packInfo') || '1 Pcs';
    const unitStr = getVal('unit') || 'Pcs';
    const mrpStr = getVal('mrp');
    const purchaseRateStr = getVal('purchaseRate');
    const saleRateStr = getVal('saleRate');
    const hsnCode = getVal('hsnCode');
    const gstRateStr = getVal('gstRate');
    const taxTypeStr = getVal('taxType').toLowerCase();
    const stockQtyStr = getVal('stockQty');
    const minStockLevelStr = getVal('minStockLevel');
    const isActiveStr = getVal('isActive').toLowerCase();

    // 1. Required Fields Validation
    if (!sku) errors.push('SKU / Item Code is missing.');
    if (!name) errors.push('Product Name is missing.');
    if (!saleRateStr && importMode !== 'UPDATE_PRICES_ONLY') errors.push('Selling Rate is missing.');
    if (!gstRateStr && importMode !== 'UPDATE_PRICES_ONLY') errors.push('GST Rate is missing.');

    // 2. Numeric Validations
    const mrp = mrpStr !== '' ? parseFloat(mrpStr) : (saleRateStr !== '' ? parseFloat(saleRateStr) : 0);
    if (isNaN(mrp) || mrp < 0) errors.push('MRP must be a valid non-negative number.');

    const purchaseRate = purchaseRateStr !== '' ? parseFloat(purchaseRateStr) : 0;
    if (isNaN(purchaseRate) || purchaseRate < 0) errors.push('Purchase Rate must be a valid non-negative number.');

    const saleRate = saleRateStr !== '' ? parseFloat(saleRateStr) : mrp;
    if (isNaN(saleRate) || saleRate < 0) errors.push('Selling Rate must be a valid non-negative number.');

    let gstRate: GstRate = 12;
    if (gstRateStr !== '') {
      const parsedGst = parseFloat(gstRateStr);
      if ([0, 5, 12, 18, 28].includes(parsedGst)) {
        gstRate = parsedGst as GstRate;
      } else {
        errors.push(`Invalid GST Rate (${gstRateStr}%). Must be 0, 5, 12, 18, or 28.`);
      }
    }

    let stockQty = stockQtyStr !== '' ? parseFloat(stockQtyStr) : 0;
    if (stockQtyStr !== '' && (isNaN(stockQty) || stockQty < 0)) {
      errors.push('Stock Quantity must be a valid non-negative number.');
    }

    let minStockLevel = minStockLevelStr !== '' ? parseFloat(minStockLevelStr) : 10;
    if (minStockLevelStr !== '' && (isNaN(minStockLevel) || minStockLevel < 0)) {
      errors.push('Low Stock Threshold must be a valid non-negative number.');
    }

    const validUnits: UnitType[] = ['Pcs', 'Pkt', 'Box', 'Dozen', 'Ream', 'Set', 'Roll', 'Pad'];
    let unit: UnitType = 'Pcs';
    if (unitStr) {
      const match = validUnits.find(u => u.toLowerCase() === unitStr.toLowerCase());
      if (match) {
        unit = match;
      } else {
        warnings.push(`Unknown unit "${unitStr}". Defaulted to "Pcs".`);
      }
    }

    const taxType: TaxType = taxTypeStr.includes('excl') ? 'exclusive' : 'inclusive';
    const isActive = !(isActiveStr === 'false' || isActiveStr === '0' || isActiveStr === 'no' || isActiveStr === 'inactive');

    // 3. File Level Duplicate Detection
    if (sku) {
      const skuLower = sku.toLowerCase();
      if (fileSkusSeen.has(skuLower)) {
        errors.push(`Duplicate SKU "${sku}" found multiple times in this import file (Row ${fileSkusSeen.get(skuLower)} and Row ${rowNumber}).`);
      } else {
        fileSkusSeen.set(skuLower, rowNumber);
      }
    }

    if (barcode) {
      const barcodeLower = barcode.toLowerCase();
      if (fileBarcodesSeen.has(barcodeLower)) {
        errors.push(`Duplicate Barcode "${barcode}" found multiple times in this import file (Row ${fileBarcodesSeen.get(barcodeLower)} and Row ${rowNumber}).`);
      } else {
        fileBarcodesSeen.set(barcodeLower, rowNumber);
      }
    }

    // 4. Database Level Duplicate Check & Action Determination
    const existingSkuProd = sku ? existingSkuMap.get(sku.toLowerCase()) : undefined;
    const existingBarcodeProd = barcode ? existingBarcodeMap.get(barcode.toLowerCase()) : undefined;

    let isExistingInDb = false;
    let action: 'create' | 'update' | 'skip' | 'error' = 'create';

    if (existingSkuProd) {
      isExistingInDb = true;
      if (importMode === 'CREATE_ONLY') {
        action = 'skip';
        warnings.push(`SKU "${sku}" already exists in database. Skipped due to CREATE_ONLY mode.`);
      } else {
        action = 'update';
        warnings.push(`SKU "${sku}" exists. Product will be updated.`);
      }
    } else if (existingBarcodeProd && barcode) {
      errors.push(`Barcode "${barcode}" belongs to existing product "${existingBarcodeProd.name}" (SKU: ${existingBarcodeProd.sku}). Barcodes must be unique.`);
    }

    // Protection: In update mode with blank stock, preserve existing stock
    if (isExistingInDb && existingSkuProd && stockQtyStr === '') {
      stockQty = existingSkuProd.stockQty;
      warnings.push(`Stock column was blank. Preserved existing stock (${existingSkuProd.stockQty}).`);
    }

    const status: 'valid' | 'warning' | 'error' = errors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'valid');
    if (errors.length > 0) action = 'error';

    const parsedProduct: Partial<Product> = {
      sku,
      barcode,
      name,
      category,
      packInfo,
      unit,
      mrp,
      purchaseRate,
      saleRate,
      hsnCode,
      gstRate,
      taxType,
      stockQty,
      minStockLevel,
      isActive
    };

    return {
      rowNumber,
      status,
      action,
      errors,
      warnings,
      rawRow,
      parsedProduct,
      isExistingInDb
    };
  });
}

export function generateSampleTemplateCSV(): string {
  const headers = ['SKU', 'Barcode', 'ProductName', 'Category', 'PackInfo', 'Unit', 'MRP', 'PurchaseRate', 'SellingRate', 'HSNCode', 'GSTRate', 'TaxType', 'StockQuantity', 'LowStockThreshold', 'IsActive'];
  const sampleRows = [
    ['SHIRT-COT-001', '8901234567890', 'Cotton Casual Shirt Slim Fit (Size 40)', 'Shirts & Casuals', 'Size 40', 'Pcs', '999', '450', '799', '6205', '12', 'inclusive', '30', '5', 'true'],
    ['JEAN-DNM-002', '8901234567891', 'Men Slim Fit Denim Jeans (Size 32)', 'Jeans & Denims', 'Size 32', 'Pcs', '1499', '700', '1199', '6203', '12', 'inclusive', '25', '5', 'true'],
    ['TSHIRT-POL-003', '8901234567892', 'Classic Polo Collar T-Shirt (Size L)', 'T-Shirts & Polos', 'Size L', 'Pcs', '699', '280', '499', '6109', '5', 'inclusive', '50', '10', 'true'],
    ['TROUSER-CHN-004', '8901234567893', 'Cotton Chino Trousers Khaki (Size 34)', 'Trousers & Chinos', 'Size 34', 'Pcs', '1299', '550', '999', '6203', '12', 'inclusive', '20', '4', 'true'],
    ['KURTA-ETH-005', '8901234567894', 'Pure Linen Men Kurta (Size 40)', 'Ethnic & Kurta', 'Size 40', 'Pcs', '1599', '650', '1299', '6205', '12', 'inclusive', '15', '3', 'true']
  ];

  return [headers.join(','), ...sampleRows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
}

export function generateErrorReportCSV(validatedRows: ValidatedImportRow[]): string {
  const errorRows = validatedRows.filter(r => r.status === 'error');
  if (errorRows.length === 0) return '';

  const headers = ['RowNumber', 'SKU', 'ProductName', 'ImportErrors', ...Object.keys(errorRows[0].rawRow)];
  const csvLines = errorRows.map(r => {
    const errorStr = `"${r.errors.join(' | ')}"`;
    const sku = `"${r.parsedProduct.sku || ''}"`;
    const name = `"${r.parsedProduct.name || ''}"`;
    const rawVals = Object.values(r.rawRow).map(val => `"${String(val).replace(/"/g, '""')}"`);
    return [r.rowNumber, sku, name, errorStr, ...rawVals].join(',');
  });

  return [headers.join(','), ...csvLines].join('\n');
}
