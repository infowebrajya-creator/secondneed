export type UnitType = 'Pcs' | 'Pkt' | 'Box' | 'Dozen' | 'Ream' | 'Set' | 'Roll' | 'Pad';
export type TaxType = 'inclusive' | 'exclusive';
export type GstRate = 0 | 5 | 12 | 18 | 28;
export type PaymentMode = 'cash' | 'upi' | 'card' | 'credit';
export type InvoiceStatus = 'completed' | 'draft' | 'cancelled';
export type InvoiceType = 'gst' | 'simple' | 'quotation';
export type StockMovementType = 'sale' | 'purchase' | 'adjustment' | 'return';

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  categoryId?: string;
  packInfo: string;
  unit: UnitType;
  mrp: number;
  purchaseRate: number;
  saleRate: number;
  hsnCode: string;
  gstRate: GstRate;
  taxType: TaxType;
  stockQty: number;
  minStockLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  synced?: boolean;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string;
  hsnCode: string;
  pack: string;
  remark?: string;
  unit: UnitType;
  qty: number;
  freeQty: number;
  mrp: number;
  unitRate: number;
  schemeDiscountPct: number;
  schemeDiscountAmount: number;
  addlDiscountPct: number;
  addlDiscountAmount: number;
  discountPct: number;
  discountAmount: number;
  gstRate: GstRate;
  taxType: TaxType;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  availableStock: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  date: string;
  time: string;
  customerName: string;
  customerMobile: string;
  customerGstin?: string;
  customerAddress?: string;
  items: InvoiceItem[];
  subtotal: number;
  totalDiscount: number;
  totalGst: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  freightAmount: number;
  roundOff: number;
  netPayable: number;
  paymentMode: PaymentMode;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
  isInterstate: boolean;
  notes?: string;
  idempotencyKey?: string;
  upiReference?: string;
  transactionRef?: string;
  createdAt: string;
  synced?: boolean;
}

export interface DraftInvoice {
  id: string;
  draftName: string;
  customerName: string;
  customerMobile: string;
  customerGstin?: string;
  invoiceType?: InvoiceType;
  items: InvoiceItem[];
  paymentMode: PaymentMode;
  isInterstate: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  creditBalance: number;
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdAt: string;
  referenceId?: string;
}

export interface ShopProfile {
  shopName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  pincode: string;
  bankName: string;
  accountNo: string;
  ifscCode: string;
  upiId: string;
  invoicePrefix: string;
  termsAndConditions: string;
}

export type PaperSize = '80mm' | '58mm' | 'A5' | 'A4' | 'Thermal';
export type PrintEngine = 'auto' | 'usb' | 'bluetooth' | 'browser';

export interface PrintSettings {
  paperSize: PaperSize;
  printEngine: PrintEngine;
  autoCutPaper: boolean;
  openCashDrawer: boolean;
  showGstBreakdown: boolean;
  showBankDetails: boolean;
  showTerms: boolean;
  autoPrintOnSave: boolean;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
  lastSyncAt: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  tableName: string;
  recordId: string;
  details: Record<string, any>;
  createdBy?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  mobile?: string;
  gstin?: string;
  address?: string;
  balancePayable: number;
  createdAt: string;
}

export interface PurchaseInvoiceItem {
  id: string;
  purchaseInvoiceId?: string;
  productId?: string;
  rawName: string;
  matchedProductName?: string;
  hsnCode?: string;
  qty: number;
  freeQty?: number;
  unit: UnitType;
  purchaseRate: number;
  mrp: number;
  saleRate?: number;
  discountPct?: number;
  gstRate: GstRate;
  totalAmount: number;
  isNewProduct?: boolean;
}

export interface PurchaseInvoice {
  id: string;
  supplierName: string;
  supplierGstin?: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalItems: number;
  subtotal: number;
  totalGst: number;
  grandTotal: number;
  billImageUrl?: string;
  status: 'completed' | 'draft' | 'cancelled';
  items: PurchaseInvoiceItem[];
  createdAt: string;
  synced?: boolean;
}

export interface PettyExpense {
  id: string;
  category: 'Tea & Refreshments' | 'Transport & Loading' | 'Packing Material' | 'Cleaning & Maintenance' | 'Courier & Post' | 'Bank Deposit' | 'Other';
  amount: number;
  description: string;
  time: string;
  createdAt: string;
}

export interface DenominationCount {
  c500: number;
  c200: number;
  c100: number;
  c50: number;
  c20: number;
  c10: number;
  coins: number;
}

export interface DailyRegisterData {
  date: string;
  openingCash: number;
  closingCashCounted: number;
  expenses: PettyExpense[];
  notes?: string;
  closedAt?: string;
}

