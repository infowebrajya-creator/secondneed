import { create } from 'zustand';
import type { Product, StockMovement, UnitType, GstRate, TaxType } from '../types';
import { db } from '../lib/db';
import { getSupabaseClient } from '../lib/supabase';
import type { ValidatedImportRow, ImportMode, ImportSummaryResult } from '../lib/importProcessor';

interface ProductState {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  selectedCategory: string;
  statusFilter: 'all' | 'active' | 'inactive';

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string) => void;
  setStatusFilter: (status: 'all' | 'active' | 'inactive') => void;
  loadProducts: (force?: boolean) => Promise<void>;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  toggleProductActiveStatus: (id: string) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  adjustStock: (productId: string, quantityChange: number, reason: string) => Promise<void>;
  seedDefaultProducts: () => Promise<number>;
  commitBatchImport: (rowsToCommit: ValidatedImportRow[], mode: ImportMode) => Promise<ImportSummaryResult>;
  syncWithSupabase: () => Promise<{ success: boolean; message: string }>;
}

export const CLOTHING_CATEGORIES = [
  'All Categories',
  'Shirts & Casuals',
  'T-Shirts & Polos',
  'Jeans & Denims',
  'Trousers & Chinos',
  'Formal & Suiting',
  'Ethnic & Kurta',
  'Winterwear & Jackets',
  'Innerwear & Loungewear',
  'Belts & Accessories',
  'Footwear',
  'General Merchandise',
  'Uncategorized'
];

export const STATIONERY_CATEGORIES = CLOTHING_CATEGORIES;

export const INITIAL_STATIONERY_PRODUCTS: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[] = [];

let productRealtimeSubscribed = false;

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  selectedCategory: 'All Categories',
  statusFilter: 'all',

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),

  loadProducts: async (force = false) => {
    // Avoid redundant network calls if products are already loaded in memory
    if (!force && get().products.length > 0) {
      return;
    }

    // 1. Instant 0ms Load from Local Dexie Cache First
    const localProducts = await db.products.toArray().catch(() => []);
    if (localProducts.length > 0) {
      set({ products: localProducts, isLoading: false, error: null });
    } else {
      set({ isLoading: true, error: null });
    }

    // 2. Non-blocking Background Cloud Refresh
    try {
      const client = getSupabaseClient();
      if (client) {
        if (!productRealtimeSubscribed) {
          try {
            client
              .channel('public:products_sync')
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                async (payload) => {
                  if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    const item = payload.new;
                    if (item) {
                      const p: Product = {
                        id: item.id || item.sku,
                        sku: item.sku || '',
                        barcode: item.barcode || '',
                        name: item.name || item.product_name || '',
                        category: item.category || 'General Supplies',
                        packInfo: item.pack_info || item.pack || '1*1',
                        unit: (item.unit as UnitType) || 'Pcs',
                        mrp: Number(item.mrp ?? item.sale_rate ?? 0),
                        purchaseRate: Number(item.purchase_rate ?? item.purchase_price ?? 0),
                        saleRate: Number(item.sale_rate ?? item.selling_rate ?? 0),
                        hsnCode: item.hsn_code || '4820',
                        gstRate: (Number(item.gst_rate ?? 12) as GstRate),
                        taxType: (item.tax_type as TaxType) || 'inclusive',
                        stockQty: Number(item.stock_qty ?? item.stock_quantity ?? 0),
                        minStockLevel: Number(item.min_stock_level ?? item.low_stock_threshold ?? 5),
                        isActive: item.is_active !== undefined ? Boolean(item.is_active) : true,
                        createdAt: item.created_at || new Date().toISOString(),
                        updatedAt: item.updated_at || new Date().toISOString(),
                        synced: true
                      };
                      await db.products.put(p).catch(() => {});
                      const current = get().products;
                      const idx = current.findIndex(x => x.id === p.id);
                      if (idx >= 0) {
                        const copy = [...current];
                        copy[idx] = p;
                        set({ products: copy });
                      } else {
                        set({ products: [p, ...current] });
                      }
                    }
                  } else if (payload.eventType === 'DELETE') {
                    if (payload.old?.id) {
                      await db.products.delete(payload.old.id).catch(() => {});
                      set({ products: get().products.filter(x => x.id !== payload.old.id) });
                    }
                  }
                }
              )
              .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                  productRealtimeSubscribed = true;
                }
              });
          } catch (e) {
            console.warn('[useProductStore] Realtime channel warning:', e);
          }
        }

        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await client
            .from('products')
            .select('*')
            .range(from, from + pageSize - 1);

          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allData = allData.concat(data);
            if (data.length < pageSize) {
              hasMore = false;
            } else {
              from += pageSize;
            }
          }
        }

        const currentLocal = await db.products.toArray().catch(() => []);

        if (allData.length > 0) {
          const mappedProducts: Product[] = allData.map((item: any) => ({
            id: item.id || item.sku,
            sku: item.sku || '',
            barcode: item.barcode || '',
            name: item.name || item.product_name || '',
            category: item.category || 'General Supplies',
            packInfo: item.pack_info || item.pack || '1*1',
            unit: (item.unit as UnitType) || 'Pcs',
            mrp: Number(item.mrp ?? item.sale_rate ?? 0),
            purchaseRate: Number(item.purchase_rate ?? item.purchase_price ?? 0),
            saleRate: Number(item.sale_rate ?? item.selling_rate ?? 0),
            hsnCode: item.hsn_code || '4820',
            gstRate: (Number(item.gst_rate ?? 12) as GstRate),
            taxType: (item.tax_type as TaxType) || 'inclusive',
            stockQty: Number(item.stock_qty ?? item.stock_quantity ?? 0),
            minStockLevel: Number(item.min_stock_level ?? item.low_stock_threshold ?? 5),
            isActive: item.is_active !== undefined ? Boolean(item.is_active) : true,
            createdAt: item.created_at || new Date().toISOString(),
            updatedAt: item.updated_at || new Date().toISOString(),
            synced: true
          }));

          const remoteIdSet = new Set(mappedProducts.map((p) => p.id));
          
          // Purge stale local products that were synced previously but are now deleted from Supabase
          const staleLocal = currentLocal.filter((p) => p.synced && !remoteIdSet.has(p.id));
          if (staleLocal.length > 0) {
            await db.products.bulkDelete(staleLocal.map((p) => p.id)).catch(() => {});
          }

          // Preserve only truly unsynced offline products
          const unsyncedLocal = currentLocal.filter((p) => !p.synced && !remoteIdSet.has(p.id));

          await db.products.bulkPut(mappedProducts);
          if (unsyncedLocal.length > 0) {
            await db.products.bulkPut(unsyncedLocal);
          }
          const allMerged = await db.products.toArray();
          set({ products: allMerged, isLoading: false });
          return;
        } else {
          // Cloud catalog is empty (clean slate) - Purge local synced/demo products
          const staleLocal = currentLocal.filter((p) => p.synced);
          if (staleLocal.length > 0) {
            await db.products.bulkDelete(staleLocal.map((p) => p.id)).catch(() => {});
          }
          const remaining = await db.products.toArray().catch(() => []);
          set({ products: remaining, isLoading: false });
          return;
        }
      }

      if (localProducts.length === 0) {
        const freshLocal = await db.products.toArray().catch(() => []);
        set({ products: freshLocal, isLoading: false });
      }
    } catch (err: any) {
      if (localProducts.length === 0) {
        const freshLocal = await db.products.toArray().catch(() => []);
        set({ products: freshLocal, isLoading: false });
      }
    }
  },

  addProduct: async (prodData) => {
    const now = new Date().toISOString();
    const cleanBarcode = (prodData.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '');
    const newProduct: Product = {
      ...prodData,
      barcode: cleanBarcode,
      id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: now,
      updatedAt: now,
      synced: false
    };

    await db.products.put(newProduct);
    // Optimistically update in-memory store immediately
    set((state) => ({
      products: [newProduct, ...state.products.filter(p => p.id !== newProduct.id)]
    }));

    // Reconcile with Dexie IndexedDB cache
    await get().loadProducts(true);
    get().syncWithSupabase().catch(() => {});
    return newProduct;
  },

  updateProduct: async (id, updates) => {
    const existing = await db.products.get(id);
    if (!existing) return;

    const cleanBarcode = updates.barcode !== undefined 
      ? (updates.barcode || '').trim().replace(/[\s\r\n\t>]+/g, '')
      : existing.barcode;

    const updated: Product = {
      ...existing,
      ...updates,
      barcode: cleanBarcode,
      updatedAt: new Date().toISOString(),
      synced: false
    };

    await db.products.put(updated);
    set((state) => ({
      products: state.products.map(p => p.id === id ? updated : p)
    }));
    await get().loadProducts(true);
    get().syncWithSupabase().catch(() => {});
  },

  toggleProductActiveStatus: async (id) => {
    const existing = await db.products.get(id);
    if (!existing) return;

    const newStatus = !existing.isActive;
    const now = new Date().toISOString();
    await db.products.update(id, {
      isActive: newStatus,
      updatedAt: now,
      synced: false
    });
    set((state) => ({
      products: state.products.map(p => p.id === id ? { ...p, isActive: newStatus, updatedAt: now } : p)
    }));
    get().syncWithSupabase().catch(() => {});
  },

  deleteProduct: async (id) => {
    await db.products.delete(id);
    set((state) => ({
      products: state.products.filter(p => p.id !== id)
    }));
    get().syncWithSupabase().catch(() => {});
  },

  adjustStock: async (productId, quantityChange, reason) => {
    const product = await db.products.get(productId);
    if (!product) return;

    const previousStock = product.stockQty;
    const newStock = Math.max(0, previousStock + quantityChange);
    const now = new Date().toISOString();

    const movement: StockMovement = {
      id: 'sm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      productId,
      productName: product.name,
      type: 'adjustment',
      quantityChange,
      previousStock,
      newStock,
      reason,
      createdAt: now
    };

    await db.transaction('rw', db.products, db.stockMovements, async () => {
      await db.products.update(productId, {
        stockQty: newStock,
        updatedAt: now,
        synced: false
      });
      await db.stockMovements.put(movement);
    });

    set((state) => ({
      products: state.products.map(p => p.id === productId ? { ...p, stockQty: newStock, updatedAt: now } : p)
    }));
    get().syncWithSupabase().catch(() => {});
  },

  seedDefaultProducts: async () => {
    const now = new Date().toISOString();
    const productsToInsert: Product[] = INITIAL_STATIONERY_PRODUCTS.map((item, index) => ({
      ...item,
      id: `prod_seed_${index + 100}`,
      createdAt: now,
      updatedAt: now,
      synced: false
    }));

    await db.products.bulkPut(productsToInsert);
    await get().loadProducts(true);
    return productsToInsert.length;
  },

  commitBatchImport: async (rowsToCommit, mode) => {
    const now = new Date().toISOString();
    const existingMap = new Map<string, Product>();
    const currentProducts = await db.products.toArray();
    currentProducts.forEach(p => existingMap.set(p.sku.toLowerCase().trim(), p));

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    const productsToSave: Product[] = [];
    const stockMovements: StockMovement[] = [];

    await db.transaction('rw', db.products, db.stockMovements, async () => {
      for (const row of rowsToCommit) {
        if (row.status === 'error') {
          failedCount++;
          continue;
        }

        const parsed = row.parsedProduct;
        const skuKey = (parsed.sku || '').toLowerCase().trim();
        const existing = existingMap.get(skuKey);

        if (existing) {
          if (mode === 'CREATE_ONLY') {
            skippedCount++;
            continue;
          }

          let updatedProd: Product;
          if (mode === 'UPDATE_PRICES_ONLY') {
            updatedProd = {
              ...existing,
              mrp: parsed.mrp !== undefined ? parsed.mrp : existing.mrp,
              purchaseRate: parsed.purchaseRate !== undefined ? parsed.purchaseRate : existing.purchaseRate,
              saleRate: parsed.saleRate !== undefined ? parsed.saleRate : existing.saleRate,
              gstRate: parsed.gstRate !== undefined ? parsed.gstRate : existing.gstRate,
              updatedAt: now,
              synced: false
            };
          } else {
            updatedProd = {
              ...existing,
              name: parsed.name || existing.name,
              barcode: parsed.barcode !== undefined ? parsed.barcode : existing.barcode,
              category: parsed.category || existing.category,
              packInfo: parsed.packInfo || existing.packInfo,
              unit: parsed.unit || existing.unit,
              mrp: parsed.mrp !== undefined ? parsed.mrp : existing.mrp,
              purchaseRate: parsed.purchaseRate !== undefined ? parsed.purchaseRate : existing.purchaseRate,
              saleRate: parsed.saleRate !== undefined ? parsed.saleRate : existing.saleRate,
              hsnCode: parsed.hsnCode !== undefined ? parsed.hsnCode : existing.hsnCode,
              gstRate: parsed.gstRate !== undefined ? parsed.gstRate : existing.gstRate,
              taxType: parsed.taxType || existing.taxType,
              stockQty: parsed.stockQty !== undefined ? parsed.stockQty : existing.stockQty,
              minStockLevel: parsed.minStockLevel !== undefined ? parsed.minStockLevel : existing.minStockLevel,
              isActive: parsed.isActive !== undefined ? parsed.isActive : existing.isActive,
              updatedAt: now,
              synced: false
            };
          }

          productsToSave.push(updatedProd);
          updatedCount++;
        } else {
          if (mode === 'UPDATE_PRICES_ONLY') {
            skippedCount++;
            continue;
          }

          const newProd: Product = {
            id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            sku: parsed.sku || `SKU-${Date.now()}`,
            barcode: parsed.barcode || '',
            name: parsed.name || 'New Product',
            category: parsed.category || 'General Supplies',
            packInfo: parsed.packInfo || '1 Pcs',
            unit: parsed.unit || 'Pcs',
            mrp: parsed.mrp || 0,
            purchaseRate: parsed.purchaseRate || 0,
            saleRate: parsed.saleRate || 0,
            hsnCode: parsed.hsnCode || '',
            gstRate: parsed.gstRate || 12,
            taxType: parsed.taxType || 'inclusive',
            stockQty: parsed.stockQty || 0,
            minStockLevel: parsed.minStockLevel || 10,
            isActive: parsed.isActive !== undefined ? parsed.isActive : true,
            createdAt: now,
            updatedAt: now,
            synced: false
          };

          productsToSave.push(newProd);
          createdCount++;

          if (newProd.stockQty > 0) {
            stockMovements.push({
              id: 'sm_imp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
              productId: newProd.id,
              productName: newProd.name,
              type: 'purchase',
              quantityChange: newProd.stockQty,
              previousStock: 0,
              newStock: newProd.stockQty,
              reason: 'Bulk Import Initial Stock',
              createdAt: now
            });
          }
        }
      }

      if (productsToSave.length > 0) {
        await db.products.bulkPut(productsToSave);
      }
      if (stockMovements.length > 0) {
        await db.stockMovements.bulkPut(stockMovements);
      }
    });

    await get().loadProducts(true);

    return {
      totalRows: rowsToCommit.length,
      createdCount,
      updatedCount,
      skippedCount,
      failedCount,
      errors: []
    };
  },

  syncWithSupabase: async () => {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Supabase is not configured. Go to Settings to set URL and Key.' };
    }

    try {
      const unSynced = await db.products.filter(p => !p.synced).toArray();
      if (unSynced.length === 0) {
        return { success: true, message: 'All products are already in sync with Supabase.' };
      }

      const payload = unSynced.map((p) => ({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode || null,
        name: p.name,
        category: p.category || 'General Supplies',
        category_id: p.categoryId || null,
        pack_info: p.packInfo || '1*1',
        unit: p.unit || 'Pcs',
        mrp: Number(p.mrp || 0),
        purchase_rate: Number(p.purchaseRate || 0),
        purchase_price: Number(p.purchaseRate || 0),
        sale_rate: Number(p.saleRate || 0),
        selling_rate: Number(p.saleRate || 0),
        hsn_code: p.hsnCode || '4820',
        gst_rate: Number(p.gstRate || 12),
        tax_type: p.taxType || 'inclusive',
        stock_qty: Number(p.stockQty || 0),
        stock_quantity: Number(p.stockQty || 0),
        min_stock_level: Number(p.minStockLevel || 5),
        low_stock_threshold: Number(p.minStockLevel || 5),
        is_active: p.isActive !== false,
        created_at: p.createdAt || new Date().toISOString(),
        updated_at: p.updatedAt || new Date().toISOString()
      }));

      const { error } = await client.from('products').upsert(payload, { onConflict: 'id' });

      if (error) {
        return { success: false, message: `Supabase Sync Error: ${error.message}` };
      }

      await db.transaction('rw', db.products, async () => {
        for (const p of unSynced) {
          await db.products.update(p.id, { synced: true });
        }
      });

      await get().loadProducts(true);
      return { success: true, message: `Successfully synced ${unSynced.length} products to Supabase!` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Sync failed.' };
    }
  }
}));
