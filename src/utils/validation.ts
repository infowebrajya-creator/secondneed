import { z } from 'zod';

export const ProductSchema = z.object({
  sku: z.string().min(1, 'SKU / Item Code is required'),
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  barcode: z.string().optional().default(''),
  hsnCode: z.string().optional().default(''),
  category: z.string().min(1, 'Category is required'),
  packInfo: z.string().optional().default('1 Pcs'),
  unit: z.enum(['Pcs', 'Pkt', 'Box', 'Dozen', 'Ream', 'Set', 'Roll', 'Pad']),
  mrp: z.number().min(0, 'MRP cannot be negative'),
  purchaseRate: z.number().min(0, 'Purchase rate cannot be negative').optional().default(0),
  saleRate: z.number().min(0, 'Selling rate cannot be negative'),
  gstRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  taxType: z.enum(['inclusive', 'exclusive']),
  stockQty: z.number().min(0, 'Stock quantity cannot be negative'),
  minStockLevel: z.number().min(0, 'Min stock alert level must be 0 or greater'),
  isActive: z.boolean().default(true),
});

export const CustomerSchema = z.object({
  name: z.string().min(2, 'Customer name is required'),
  mobile: z.string().regex(/^[0-9]{10}$/, 'Mobile number must be 10 digits').or(z.literal('')),
  email: z.string().email('Invalid email address').or(z.literal('')).optional(),
  address: z.string().optional(),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format').or(z.literal('')).optional(),
});

export const ShopProfileSchema = z.object({
  shopName: z.string().trim().min(1, 'Shop Name is compulsory'),
  tagline: z.string().optional().default(''),
  address: z.string().trim().min(1, 'Shop Address is compulsory'),
  phone: z.string().trim().min(5, 'Phone Number is compulsory (min 5 digits)'),
  email: z.string().email('Invalid email address').or(z.literal('')).optional().default(''),
  gstin: z.string().trim().refine(val => val === '' || val.length === 15, 'GSTIN must be 15 characters if provided').optional().default(''),
  state: z.string().optional().default(''),
  pincode: z.string().optional().default(''),
  bankName: z.string().optional().default(''),
  accountNo: z.string().optional().default(''),
  ifscCode: z.string().optional().default(''),
  upiId: z.string().optional().default(''),
  invoicePrefix: z.string().trim().min(1, 'Invoice Prefix is compulsory (e.g. INV- or CTC-)'),
  termsAndConditions: z.string().optional().default(''),
});
