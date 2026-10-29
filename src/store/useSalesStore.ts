import { create } from 'zustand';
import type { Invoice, PaymentMode, StockMovement, AuditLog } from '../types';
import { db } from '../lib/db';
import { getSupabaseClient } from '../lib/supabase';
import { generateInvoiceNumber, calculateNextInvoiceNumber } from '../utils/formatters';
import { useCustomerStore } from './useCustomerStore';


interface SalesState {
  invoices: Invoice[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  paymentFilter: PaymentMode | 'all';
  dateRange: 'today' | 'yesterday' | 'week' | 'month' | 'all';

  setSearchQuery: (query: string) => void;
  setPaymentFilter: (filter: PaymentMode | 'all') => void;
  setDateRange: (range: 'today' | 'yesterday' | 'week' | 'month' | 'all') => void;

  loadInvoices: (isSilent?: boolean) => Promise<void>;
  createCompletedInvoice: (
    invoiceData: Omit<Invoice, 'id' | 'invoiceNumber' | 'date' | 'time' | 'status' | 'createdAt'>,
    invoicePrefix?: string
  ) => Promise<Invoice>;
  createCreditNote: (params: {
    originalInvoice: Invoice;
    returnedItems: { item: any; returnQty: number }[];
    returnReason: string;
  }) => Promise<Invoice>;
  cancelInvoice: (invoiceId: string, restoreStock?: boolean, reason?: string) => Promise<void>;
  syncInvoicesWithSupabase: () => Promise<{ success: boolean; message: string }>;
  clearAllSalesData: (alsoClearSupabase?: boolean) => Promise<void>;
}

let realtimeSubscribed = false;

function mapLocalInvoiceToRemote(inv: Invoice) {
  const cleanNotes = (inv.notes || '').replace(/\[\[meta:[^\]]+\]\]/g, '').trim();
  const metaParts = [`pm=${inv.paymentMode}`, `type=${inv.invoiceType}`, `status=${inv.status}`];
  if (inv.originalInvoiceNumber) metaParts.push(`origNum=${inv.originalInvoiceNumber}`);
  if (inv.originalInvoiceDate) metaParts.push(`origDate=${inv.originalInvoiceDate}`);
  if (inv.returnReason) metaParts.push(`retReason=${encodeURIComponent(inv.returnReason)}`);
  const taggedNotes = `[[meta:${metaParts.join('|')}]] ${cleanNotes}`.trim();

  const invoiceRow = {
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    invoice_date: inv.date,
    invoice_time: inv.time,
    customer_name: inv.customerName || 'Cash Customer',
    customer_mobile: inv.customerMobile || null,
    customer_gstin: inv.customerGstin || null,
    customer_address: inv.customerAddress || null,
    subtotal: inv.subtotal,
    total_discount: inv.totalDiscount,
    total_gst: inv.totalGst,
    cgst_total: inv.cgstTotal,
    sgst_total: inv.sgstTotal,
    igst_total: inv.igstTotal,
    freight_amount: inv.freightAmount,
    round_off: inv.roundOff,
    net_payable: inv.netPayable,
    paid_amount: inv.paidAmount,
    balance_amount: inv.balanceAmount,
    is_interstate: inv.isInterstate || false,
    idempotency_key: inv.idempotencyKey || null,
    transaction_ref: inv.transactionRef || inv.upiReference || null,
    notes: taggedNotes,
    created_at: inv.createdAt
  };

  const itemRows = (inv.items || []).map((it, idx) => ({
    id: `item_${inv.id}_${idx}_${it.productId}`,
    invoice_id: inv.id,
    product_id: it.productId,
    product_name: it.productName,
    sku: it.sku || '',
    barcode: it.barcode || null,
    pack_info: it.pack || null,
    remark: it.remark || null,
    unit: it.unit || 'Pcs',
    qty: it.qty,
    free_qty: it.freeQty || 0,
    unit_rate: it.unitRate,
    mrp: it.mrp || 0,
    scheme_discount_pct: it.schemeDiscountPct || 0,
    addl_discount_pct: it.addlDiscountPct || 0,
    discount_pct: it.discountPct || 0,
    discount_amount: it.discountAmount || 0,
    hsn_code: it.hsnCode || null,
    gst_rate: it.gstRate || 12,
    gst_amount: ((it.cgstAmount || 0) + (it.sgstAmount || 0) + (it.igstAmount || 0)) || 0,
    total_amount: it.totalAmount,
    created_at: inv.createdAt
  }));

  return { invoiceRow, itemRows };
}

function mapRemoteInvoiceToLocal(remoteInv: any): Invoice {
  let paymentMode: PaymentMode = 'cash';
  let invoiceType: any = 'gst';
  let status: any = 'completed';
  let originalInvoiceNumber: string | undefined;
  let originalInvoiceDate: string | undefined;
  let returnReason: string | undefined;
  let cleanNotes = remoteInv.notes || '';

  if (cleanNotes.includes('[[meta:')) {
    const metaMatch = cleanNotes.match(/\[\[meta:([^\]]+)\]\]/);
    if (metaMatch) {
      const parts = metaMatch[1].split('|');
      for (const part of parts) {
        const [k, v] = part.split('=');
        if (k === 'pm' && v) paymentMode = v as PaymentMode;
        if (k === 'type' && v) invoiceType = v;
        if (k === 'status' && v) status = v;
        if (k === 'origNum' && v) originalInvoiceNumber = v;
        if (k === 'origDate' && v) originalInvoiceDate = v;
        if (k === 'retReason' && v) returnReason = decodeURIComponent(v);
      }
      cleanNotes = cleanNotes.replace(/\[\[meta:[^\]]+\]\]/, '').trim();
    }
  } else if (cleanNotes.includes('[[pm:')) {
    const match = cleanNotes.match(/\[\[pm:([a-z]+)\]\]/);
    if (match) paymentMode = match[1] as PaymentMode;
    cleanNotes = cleanNotes.replace(/\[\[pm:[a-z]+\]\]/, '').trim();
  } else if (remoteInv.transaction_ref?.startsWith('UPI') || remoteInv.transaction_ref?.length > 0) {
    paymentMode = 'upi';
  }

  const items = (remoteInv.invoice_items || []).map((it: any) => ({
    id: it.id || `item_${remoteInv.id}_${it.product_id}`,
    productId: it.product_id,
    productName: it.product_name,
    sku: it.sku || '',
    barcode: it.barcode || '',
    hsnCode: it.hsn_code || '4820',
    pack: it.pack_info || '1*1',
    remark: it.remark || '',
    unit: (it.unit as any) || 'Pcs',
    qty: Number(it.qty || 1),
    freeQty: Number(it.free_qty || 0),
    mrp: Number(it.mrp || 0),
    unitRate: Number(it.unit_rate || 0),
    schemeDiscountPct: Number(it.scheme_discount_pct || 0),
    schemeDiscountAmount: 0,
    addlDiscountPct: Number(it.addl_discount_pct || 0),
    addlDiscountAmount: 0,
    discountPct: Number(it.discount_pct || 0),
    discountAmount: Number(it.discount_amount || 0),
    gstRate: Number(it.gst_rate || 12) as any,
    taxType: 'inclusive' as any,
    taxableAmount: Number(it.total_amount || 0),
    cgstAmount: Number(it.gst_amount ? it.gst_amount / 2 : 0),
    sgstAmount: Number(it.gst_amount ? it.gst_amount / 2 : 0),
    igstAmount: 0,
    totalAmount: Number(it.total_amount || 0),
    availableStock: 0
  }));

  const createdDate = remoteInv.created_at ? new Date(remoteInv.created_at) : null;
  const localDate = createdDate && !isNaN(createdDate.getTime())
    ? createdDate.toLocaleDateString('en-CA')
    : (remoteInv.invoice_date || new Date().toLocaleDateString('en-CA'));
  const localTime = createdDate && !isNaN(createdDate.getTime())
    ? createdDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    : (remoteInv.invoice_time || '');

  return {
    id: remoteInv.id,
    invoiceNumber: remoteInv.invoice_number,
    invoiceType,
    date: localDate,
    time: localTime,
    customerName: remoteInv.customer_name || 'Cash Customer',
    customerMobile: remoteInv.customer_mobile || '',
    customerGstin: remoteInv.customer_gstin || undefined,
    customerAddress: remoteInv.customer_address || undefined,
    items,
    subtotal: Number(remoteInv.subtotal || 0),
    totalDiscount: Number(remoteInv.total_discount || 0),
    totalGst: Number(remoteInv.total_gst || 0),
    cgstTotal: Number(remoteInv.cgst_total || 0),
    sgstTotal: Number(remoteInv.sgst_total || 0),
    igstTotal: Number(remoteInv.igst_total || 0),
    freightAmount: Number(remoteInv.freight_amount || 0),
    roundOff: Number(remoteInv.round_off || 0),
    netPayable: Number(remoteInv.net_payable || 0),
    paymentMode,
    paidAmount: Number(remoteInv.paid_amount || 0),
    balanceAmount: Number(remoteInv.balance_amount || 0),
    status,
    isInterstate: Boolean(remoteInv.is_interstate),
    notes: cleanNotes || undefined,
    originalInvoiceNumber,
    originalInvoiceDate,
    returnReason,
    idempotencyKey: remoteInv.idempotency_key || undefined,
    transactionRef: remoteInv.transaction_ref || undefined,
    upiReference: remoteInv.transaction_ref || undefined,
    createdAt: remoteInv.created_at || new Date().toISOString(),
    synced: true
  };
}

async function ensureProductsExistInSupabase(client: any, items: any[]) {
  if (!client || !items || items.length === 0) return;
  try {
    const productIds = Array.from(new Set(items.map((it: any) => it.product_id || it.productId).filter(Boolean)));
    if (productIds.length === 0) return;

    const { data: existing, error } = await client
      .from('products')
      .select('id')
      .in('id', productIds);

    if (error) {
      console.warn('Check products existence error:', error);
      return;
    }

    const existingSet = new Set((existing || []).map((p: any) => p.id));
    const missing = items.filter((it: any) => !existingSet.has(it.product_id || it.productId));

    if (missing.length > 0) {
      const toUpsert = missing.map((it: any) => ({
        id: it.product_id || it.productId,
        sku: it.sku || `SKU-${(it.product_id || it.productId).slice(-6)}`,
        name: it.product_name || it.productName || 'Stationery Item',
        unit: it.unit || 'Pcs',
        mrp: Number(it.mrp || it.unit_rate || it.unitRate || 0),
        sale_rate: Number(it.unit_rate || it.unitRate || 0),
        hsn_code: it.hsn_code || it.hsnCode || '4820',
        gst_rate: Number(it.gst_rate || it.gstRate || 12),
        category: 'General Supplies',
        is_active: true
      }));

      const { error: upsertErr } = await client.from('products').upsert(toUpsert, { onConflict: 'id' });
      if (upsertErr) {
        console.warn('Upsert missing products error:', upsertErr);
      }
    }
  } catch (e) {
    console.warn('ensureProductsExistInSupabase exception:', e);
  }
}

export const useSalesStore = create<SalesState>((set, get) => ({
  invoices: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  paymentFilter: 'all',
  dateRange: 'all',

  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setPaymentFilter: (paymentFilter) => set({ paymentFilter }),
  setDateRange: (dateRange) => set({ dateRange }),

  loadInvoices: async (isSilent = false) => {
    // 1. Instant 0ms Load from Local Dexie Cache First
    const initialLocal = await db.invoices.orderBy('createdAt').reverse().toArray().catch(() => []);
    if (initialLocal.length > 0) {
      set({ invoices: initialLocal, isLoading: false, error: null });
    } else if (!isSilent) {
      set({ isLoading: true, error: null });
    }

    // 2. Cloud Sync & Refresh
    try {
      const client = getSupabaseClient();

      if (client) {
        // Setup Realtime subscription once for automatic cross-device sync
        if (!realtimeSubscribed) {
          try {
            client
              .channel('public:invoices_sync')
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'invoices' },
                () => {
                  get().loadInvoices(true);
                }
              )
              .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                  realtimeSubscribed = true;
                }
              });
          } catch (e) {
            console.warn('Realtime channel warning:', e);
          }
        }

        // 1. Direct Supabase Query: Always pull latest database records
        const { data: remoteInvoices, error: fetchErr } = await client
          .from('invoices')
          .select('*, invoice_items(*)')
          .order('created_at', { ascending: false })
          .limit(500);

        if (!fetchErr && remoteInvoices) {
          const mapped = remoteInvoices.map(mapRemoteInvoiceToLocal);
          const remoteIdSet = new Set(mapped.map((i) => i.id));

          // Load local Dexie storage
          const localInvoices = await db.invoices.toArray().catch(() => []);

          // Purge stale ghost/test invoices that are marked synced but do not exist in current Supabase DB
          const staleSynced = localInvoices.filter((i) => i.synced && !remoteIdSet.has(i.id));
          if (staleSynced.length > 0) {
            await db.invoices.bulkDelete(staleSynced.map(s => s.id)).catch(() => {});
          }

          // Update local Dexie storage with active remote invoices
          if (mapped.length > 0) {
            await db.invoices.bulkPut(mapped).catch(() => {});
          }

          // Only keep truly unsynced pending local invoices (created offline, synced !== true)
          const genuinelyPendingLocal = localInvoices.filter((i) => !i.synced && !remoteIdSet.has(i.id));

          const combined = [...genuinelyPendingLocal, ...mapped].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          set({ invoices: combined, isLoading: false });

          // Also push any local-only unsynced invoices up to Supabase in background
          const unsynced = await db.invoices.filter((i) => !i.synced).toArray();
          for (const un of unsynced) {
            try {
              await ensureProductsExistInSupabase(client, un.items);
              const { invoiceRow, itemRows } = mapLocalInvoiceToRemote(un);
              const { error: upErr } = await client.from('invoices').upsert(invoiceRow, { onConflict: 'id' });
              if (!upErr) {
                if (itemRows.length > 0) {
                  await client.from('invoice_items').upsert(itemRows, { onConflict: 'id' });
                }
                await db.invoices.update(un.id, { synced: true });
              }
            } catch (syncErr) {
              console.warn('Sync push error:', syncErr);
            }
          }

          return;
        }
      }

      // Offline fallback: load from IndexedDB
      const localInvoices = await db.invoices.orderBy('createdAt').reverse().toArray();
      set({ invoices: localInvoices, isLoading: false });
    } catch (err: any) {
      if (!isSilent) console.warn('Failed to load invoices from Supabase:', err);
      const fallbackInvoices = await db.invoices.orderBy('createdAt').reverse().toArray();
      set({ invoices: fallbackInvoices, isLoading: false });
    }
  },

  createCompletedInvoice: async (invoiceData, invoicePrefix = 'INV-') => {
    // 1. VALIDATION CHECKS
    if (!invoiceData.items || invoiceData.items.length === 0) {
      throw new Error('CANNOT_COMPLETE_SALE: Invoice must contain at least one item.');
    }

    for (const item of invoiceData.items) {
      if (item.qty <= 0) {
        throw new Error(`INVALID_QUANTITY: Item "${item.productName}" quantity must be greater than zero.`);
      }
      if (item.schemeDiscountPct < 0 || item.schemeDiscountPct > 100 || item.addlDiscountPct < 0 || item.addlDiscountPct > 100) {
        throw new Error(`INVALID_DISCOUNT: Item "${item.productName}" discount percentage must be between 0% and 100%.`);
      }
    }

    // 2. STOCK AVAILABILITY CHECK (Pre-transaction Guard)
    for (const item of invoiceData.items) {
      const product = await db.products.get(item.productId);
      if (product) {
        const totalDeduct = item.qty + (item.freeQty || 0);
        if (product.stockQty < totalDeduct) {
          throw new Error(`INSUFFICIENT_STOCK: Item "${item.productName}" has only ${product.stockQty} in stock, but ${totalDeduct} requested.`);
        }
      }
    }

    // 3. IDEMPOTENCY CHECK (Local DB)
    if (invoiceData.idempotencyKey) {
      const existing = await db.invoices.where('idempotencyKey').equals(invoiceData.idempotencyKey).first();
      if (existing) {
        console.info(`[Idempotency] Sale already processed for key "${invoiceData.idempotencyKey}". Replaying existing invoice.`);
        return existing;
      }
    }

    // 4. COLLISION-FREE INVOICE NUMBER GENERATION
    const localInvoices = await db.invoices.toArray().catch(() => []);
    const inMemoryInvoices = get().invoices || [];
    const allKnownNumbers = Array.from(new Set([
      ...localInvoices.map((i: any) => i.invoiceNumber),
      ...inMemoryInvoices.map((i: any) => i.invoiceNumber)
    ]));

    let invoiceNumber = calculateNextInvoiceNumber(allKnownNumbers, invoicePrefix);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const newInvoice: Invoice = {
      ...invoiceData,
      id: 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      invoiceNumber,
      date: dateStr,
      time: timeStr,
      status: 'completed',
      createdAt: now.toISOString(),
      synced: false
    };

    let resultInvoice: Invoice = newInvoice;

    // 5. LOCAL ATOMIC DEXIE TRANSACTION FIRST (Toyota Instant Counter Guarantee: < 30ms)
    await db.transaction('rw', db.invoices, db.products, db.stockMovements, db.customers, async () => {
      // Re-verify idempotency inside transaction lock
      if (invoiceData.idempotencyKey) {
        const existingInTx = await db.invoices.where('idempotencyKey').equals(invoiceData.idempotencyKey).first();
        if (existingInTx) {
          resultInvoice = existingInTx;
          return;
        }
      }

      // Re-verify stock inside transaction lock to strictly prevent concurrent race-condition overselling
      for (const item of newInvoice.items) {
        const product = await db.products.get(item.productId);
        if (product) {
          const totalDeduct = item.qty + (item.freeQty || 0);
          if (product.stockQty < totalDeduct) {
            throw new Error(`INSUFFICIENT_STOCK: Item "${item.productName}" has only ${product.stockQty} in stock, but ${totalDeduct} requested.`);
          }
        }
      }

      await db.invoices.put(newInvoice);

      // Update Khata customer ledger only for real named parties or mobile numbers
      const custName = (invoiceData.customerName || '').trim();
      const isNamedCustomer = custName && custName.toLowerCase() !== 'cash customer';
      if (invoiceData.customerMobile || isNamedCustomer) {
        const customerStore = useCustomerStore.getState();
        const existingCust = await customerStore.findOrCreateCustomer(
          custName || (invoiceData.customerMobile ? `Client (${invoiceData.customerMobile})` : 'Counter Client'),
          invoiceData.customerMobile || '',
          invoiceData.customerGstin || '',
          invoiceData.customerAddress || ''
        );

        if (existingCust && invoiceData.paymentMode === 'credit') {
          await customerStore.updateCustomer(existingCust.id, {
            creditBalance: (existingCust.creditBalance || 0) + invoiceData.netPayable
          });
        }
      }

      for (const item of newInvoice.items) {
        const product = await db.products.get(item.productId);
        if (product) {
          const prevStock = product.stockQty;
          const totalDeduct = item.qty + (item.freeQty || 0);
          const newStock = Math.max(0, prevStock - totalDeduct);

          await db.products.update(product.id, {
            stockQty: newStock,
            updatedAt: now.toISOString(),
            synced: false
          });

          const movement: StockMovement = {
            id: 'sm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            productId: product.id,
            productName: product.name,
            type: 'sale',
            quantityChange: -totalDeduct,
            previousStock: prevStock,
            newStock,
            reason: `Invoice ${newInvoice.invoiceNumber}`,
            createdAt: now.toISOString(),
            referenceId: newInvoice.id
          };
          await db.stockMovements.put(movement);
        }
      }
    });

    // 6. Update in-memory state immediately so UI updates with zero lag
    set((state) => ({
      invoices: [resultInvoice, ...state.invoices.filter((i) => i.id !== resultInvoice.id)]
    }));

    // 7. Non-blocking asynchronous cloud sync to Supabase
    const client = getSupabaseClient();
    if (client) {
      (async () => {
        try {
          await ensureProductsExistInSupabase(client, resultInvoice.items);
          const { invoiceRow, itemRows } = mapLocalInvoiceToRemote(resultInvoice);
          const res = await client.from('invoices').upsert(invoiceRow, { onConflict: 'id' });
          if (!res.error) {
            if (itemRows.length > 0) {
              let { error: itemErr } = await client.from('invoice_items').upsert(itemRows, { onConflict: 'id' });
              if (itemErr && (itemErr.message?.includes('remark') || itemErr.code === 'PGRST204')) {
                const fallbackRows = itemRows.map(({ remark, ...rest }: any) => rest);
                await client.from('invoice_items').upsert(fallbackRows, { onConflict: 'id' });
              }
            }
            await db.invoices.update(resultInvoice.id, { synced: true });
          }
        } catch (syncErr) {
          console.warn('Background Supabase invoice sync warning:', syncErr);
        }
      })();
    }

    return resultInvoice;
  },

  createCreditNote: async ({ originalInvoice, returnedItems, returnReason }) => {
    if (!originalInvoice) {
      throw new Error('Original invoice is required to issue a credit note.');
    }
    const validReturns = returnedItems.filter(r => r.returnQty > 0);
    if (validReturns.length === 0) {
      throw new Error('At least one item must have return quantity greater than 0.');
    }
    for (const r of validReturns) {
      if (r.returnQty > r.item.qty) {
        throw new Error(`Return quantity for "${r.item.productName}" cannot exceed original billed quantity (${r.item.qty}).`);
      }
    }
    if (!returnReason.trim()) {
      throw new Error('Please specify a statutory reason for the sales return / credit note.');
    }

    // 1. Calculate credit items and tax reversals
    const creditItems: any[] = validReturns.map((r, idx) => {
      const ratio = r.returnQty / r.item.qty;
      const taxable = Math.round(r.item.taxableAmount * ratio * 100) / 100;
      const cgst = Math.round((r.item.cgstAmount || 0) * ratio * 100) / 100;
      const sgst = Math.round((r.item.sgstAmount || 0) * ratio * 100) / 100;
      const igst = Math.round((r.item.igstAmount || 0) * ratio * 100) / 100;
      const disc = Math.round((r.item.discountAmount || 0) * ratio * 100) / 100;
      const total = Math.round(r.item.totalAmount * ratio * 100) / 100;

      return {
        ...r.item,
        id: `cn_item_${Date.now()}_${idx}_${r.item.productId}`,
        qty: r.returnQty,
        freeQty: 0,
        taxableAmount: taxable,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        discountAmount: disc,
        totalAmount: total,
      };
    });

    const subtotal = creditItems.reduce((acc, it) => acc + it.taxableAmount, 0);
    const cgstTotal = creditItems.reduce((acc, it) => acc + (it.cgstAmount || 0), 0);
    const sgstTotal = creditItems.reduce((acc, it) => acc + (it.sgstAmount || 0), 0);
    const igstTotal = creditItems.reduce((acc, it) => acc + (it.igstAmount || 0), 0);
    const totalGst = cgstTotal + sgstTotal + igstTotal;
    const totalDiscount = creditItems.reduce((acc, it) => acc + (it.discountAmount || 0), 0);
    const rawNet = creditItems.reduce((acc, it) => acc + it.totalAmount, 0);
    const roundedNet = Math.round(rawNet);
    const roundOff = Math.round((roundedNet - rawNet) * 100) / 100;

    // 2. Generate sequential Credit Note number
    const localInvoices = await db.invoices.toArray().catch(() => []);
    const inMemoryInvoices = get().invoices || [];
    const allKnownNumbers = Array.from(new Set([
      ...localInvoices.map((i: any) => i.invoiceNumber),
      ...inMemoryInvoices.map((i: any) => i.invoiceNumber)
    ]));
    const cnNumber = calculateNextInvoiceNumber(allKnownNumbers, 'CN-');

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA');
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const creditNote: Invoice = {
      id: 'cn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      invoiceNumber: cnNumber,
      invoiceType: 'credit_note',
      date: dateStr,
      time: timeStr,
      customerName: originalInvoice.customerName || 'Cash Customer',
      customerMobile: originalInvoice.customerMobile || '',
      customerGstin: originalInvoice.customerGstin,
      customerAddress: originalInvoice.customerAddress,
      placeOfSupply: originalInvoice.placeOfSupply || 'Madhya Pradesh (23)',
      placeOfSupplyCode: originalInvoice.placeOfSupplyCode || '23',
      reverseCharge: false,
      copyType: 'original',
      originalInvoiceId: originalInvoice.id,
      originalInvoiceNumber: originalInvoice.invoiceNumber,
      originalInvoiceDate: originalInvoice.date,
      returnReason: returnReason.trim(),
      items: creditItems,
      subtotal,
      totalDiscount,
      totalGst,
      cgstTotal,
      sgstTotal,
      igstTotal,
      freightAmount: 0,
      roundOff,
      netPayable: roundedNet,
      paymentMode: originalInvoice.paymentMode,
      paidAmount: roundedNet,
      balanceAmount: 0,
      status: 'completed',
      isInterstate: originalInvoice.isInterstate || false,
      notes: `Credit Note issued against Original Invoice #${originalInvoice.invoiceNumber} dt. ${originalInvoice.date}. Reason: ${returnReason.trim()}`,
      createdAt: now.toISOString(),
      synced: false
    };

    // 3. Atomic Dexie transaction
    await db.transaction('rw', db.invoices, db.products, db.stockMovements, db.customers, db.auditLogs, async () => {
      await db.invoices.put(creditNote);

      for (const ret of validReturns) {
        const product = await db.products.get(ret.item.productId);
        if (product) {
          const prevStock = product.stockQty;
          const newStock = prevStock + ret.returnQty;

          await db.products.update(product.id, {
            stockQty: newStock,
            updatedAt: now.toISOString(),
            synced: false
          });

          const movement: StockMovement = {
            id: 'sm_cn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            productId: product.id,
            productName: product.name,
            type: 'return',
            quantityChange: ret.returnQty,
            previousStock: prevStock,
            newStock,
            reason: `Credit Note ${cnNumber} against Inv #${originalInvoice.invoiceNumber}`,
            createdAt: now.toISOString(),
            referenceId: creditNote.id
          };
          await db.stockMovements.put(movement);
        }
      }

      if (originalInvoice.paymentMode === 'credit' && originalInvoice.customerMobile) {
        const customer = await db.customers.where('mobile').equals(originalInvoice.customerMobile).first();
        if (customer && customer.creditBalance) {
          const newCreditBalance = Math.max(0, customer.creditBalance - roundedNet);
          await db.customers.update(customer.id, {
            creditBalance: newCreditBalance,
            updatedAt: now.toISOString()
          });
        }
      }

      const auditEntry: AuditLog = {
        id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        action: 'CREDIT_NOTE_ISSUED',
        tableName: 'invoices',
        recordId: creditNote.id,
        details: {
          creditNoteNumber: cnNumber,
          originalInvoiceNumber: originalInvoice.invoiceNumber,
          originalInvoiceDate: originalInvoice.date,
          netPayable: roundedNet,
          reason: returnReason.trim(),
          itemCount: creditItems.length
        },
        createdAt: now.toISOString()
      };
      await db.auditLogs.put(auditEntry);
    });

    // 4. Update in-memory state
    set((state) => ({
      invoices: [creditNote, ...state.invoices]
    }));

    // 5. Background Supabase sync
    const client = getSupabaseClient();
    if (client) {
      (async () => {
        try {
          await ensureProductsExistInSupabase(client, creditNote.items);
          const { invoiceRow, itemRows } = mapLocalInvoiceToRemote(creditNote);
          const res = await client.from('invoices').upsert(invoiceRow, { onConflict: 'id' });
          if (!res.error) {
            if (itemRows.length > 0) {
              await client.from('invoice_items').upsert(itemRows, { onConflict: 'id' });
            }
            await db.invoices.update(creditNote.id, { synced: true });
          }
        } catch (syncErr) {
          console.warn('Background Supabase credit note sync warning:', syncErr);
        }
      })();
    }

    return creditNote;
  },

  cancelInvoice: async (invoiceId, restoreStock = true, reason = 'Invoice Reversal') => {
    const invoice = await db.invoices.get(invoiceId);
    if (!invoice) return;

    if (invoice.status === 'cancelled') {
      throw new Error('Invoice is already cancelled / reversed.');
    }

    const now = new Date().toISOString();
    const cleanNotes = (invoice.notes || '').replace(/\[\[meta:[^\]]+\]\]/g, '').trim();
    const taggedNotes = `[[meta:pm=${invoice.paymentMode}|type=${invoice.invoiceType}|status=cancelled]] ${cleanNotes}`.trim();

    await db.transaction('rw', db.invoices, db.products, db.stockMovements, db.auditLogs, async () => {
      await db.invoices.update(invoiceId, { 
        status: 'cancelled', 
        notes: taggedNotes,
        synced: false 
      });

      if (restoreStock && invoice.items) {
        for (const item of invoice.items) {
          const product = await db.products.get(item.productId);
          if (product) {
            const prevStock = product.stockQty;
            const totalReturn = item.qty + (item.freeQty || 0);
            const newStock = prevStock + totalReturn;

            await db.products.update(product.id, {
              stockQty: newStock,
              updatedAt: now,
              synced: false
            });

            const movement: StockMovement = {
              id: 'sm_cancel_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              productId: product.id,
              productName: product.name,
              type: 'return',
              quantityChange: totalReturn,
              previousStock: prevStock,
              newStock,
              reason: `Reversal of Invoice ${invoice.invoiceNumber}: ${reason}`,
              createdAt: now,
              referenceId: invoice.id
            };
            await db.stockMovements.put(movement);
          }
        }
      }

      // Record Audit Log Entry
      const auditEntry: AuditLog = {
        id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        action: 'INVOICE_REVERSAL',
        tableName: 'invoices',
        recordId: invoice.id,
        details: {
          invoiceNumber: invoice.invoiceNumber,
          netPayable: invoice.netPayable,
          reason,
          restoredStock: restoreStock
        },
        createdAt: now
      };
      await db.auditLogs.put(auditEntry);
    });

    // Update in-memory state immediately so UI updates with zero lag
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === invoiceId
          ? { ...inv, status: 'cancelled', notes: taggedNotes, synced: false }
          : inv
      )
    }));

    const client = getSupabaseClient();
    if (client) {
      try {
        const updatedInv = await db.invoices.get(invoiceId);
        if (updatedInv) {
          const { invoiceRow } = mapLocalInvoiceToRemote(updatedInv);
          const { error } = await client.from('invoices').upsert(invoiceRow, { onConflict: 'id' });
          if (!error) {
            await db.invoices.update(invoiceId, { synced: true });
          }
        }
      } catch (e) {
        console.warn('Failed to sync cancellation to Supabase:', e);
      }
    }
  },

  syncInvoicesWithSupabase: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Supabase not configured' };
    }

    try {
      // 1. Push all unsynced local invoices to cloud
      const unSynced = await db.invoices.filter((i) => !i.synced).toArray();
      let pushCount = 0;

      for (const un of unSynced) {
        try {
          await ensureProductsExistInSupabase(client, un.items);
          const { invoiceRow, itemRows } = mapLocalInvoiceToRemote(un);
          const { error: invErr } = await client.from('invoices').upsert(invoiceRow, { onConflict: 'id' });
          if (!invErr) {
            if (itemRows.length > 0) {
              await client.from('invoice_items').upsert(itemRows, { onConflict: 'id' });
            }
            await db.invoices.update(un.id, { synced: true });
            pushCount++;
          }
        } catch (e) {
          console.warn('Failed pushing invoice in batch:', un.id, e);
        }
      }

      // 2. Pull remote invoices down from Supabase
      const { data: remoteInvoices, error: fetchErr } = await client
        .from('invoices')
        .select('*, invoice_items(*)')
        .order('created_at', { ascending: false })
        .limit(500);

      if (fetchErr) {
        return { success: false, message: fetchErr.message };
      }

      if (remoteInvoices && remoteInvoices.length > 0) {
        const mapped = remoteInvoices.map(mapRemoteInvoiceToLocal);
        await db.invoices.bulkPut(mapped);
      }

      await get().loadInvoices();
      return {
        success: true,
        message: `Cloud sync complete! Pushed ${pushCount} local invoices, downloaded ${remoteInvoices?.length || 0} cloud invoices.`
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Invoice sync failed' };
    }
  },

  clearAllSalesData: async (alsoClearSupabase = false) => {
    set({ isLoading: true, error: null });
    try {
      await db.invoices.clear();
      await db.stockMovements.clear();

      if (alsoClearSupabase) {
        const client = getSupabaseClient();
        if (client) {
          await client.from('invoice_items').delete().neq('id', 'all_rows_delete');
          await client.from('invoices').delete().neq('id', 'all_rows_delete');
        }
      }

      set({ invoices: [], isLoading: false });
    } catch (e: any) {
      set({ isLoading: false, error: e.message });
      throw e;
    }
  }
}));
