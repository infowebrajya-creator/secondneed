import { create } from 'zustand';
import { ShopProfile, PrintSettings, BillingSettings, SupabaseConfig } from '../types';
import { db, DEFAULT_SHOP_PROFILE, DEFAULT_PRINT_SETTINGS, DEFAULT_BILLING_SETTINGS, DEFAULT_SUPABASE_CONFIG } from '../lib/db';
import { resetSupabaseClient, testSupabaseConnection } from '../lib/supabase';

interface SettingsState {
  shopProfile: ShopProfile;
  printSettings: PrintSettings;
  billingSettings: BillingSettings;
  supabaseConfig: SupabaseConfig;
  isLoading: boolean;
  isTestingConnection: boolean;
  connectionStatus: { success: boolean; message: string } | null;

  loadSettings: () => Promise<void>;
  saveShopProfile: (profile: ShopProfile) => Promise<void>;
  savePrintSettings: (settings: PrintSettings) => Promise<void>;
  saveBillingSettings: (settings: BillingSettings) => Promise<void>;
  saveSupabaseConfig: (config: SupabaseConfig) => Promise<void>;
  testConnection: (url: string, key: string) => Promise<{ success: boolean; message: string }>;
  resetToDefaults: () => Promise<void>;
  exportBackupJSON: () => Promise<string>;
  importBackupJSON: (jsonString: string) => Promise<{ success: boolean; message: string }>;
  clearAllDemoData: () => Promise<void>;
}

const LS_SHOP_KEY = 'webrajya_shop_profile';
const LS_PRINT_KEY = 'webrajya_print_settings';
const LS_BILLING_KEY = 'webrajya_billing_settings';

function getInitialShopProfile(): ShopProfile {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LS_SHOP_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.shopName) return { ...DEFAULT_SHOP_PROFILE, ...parsed };
      }
    } catch (_) {}
  }
  return DEFAULT_SHOP_PROFILE;
}

function getInitialPrintSettings(): PrintSettings {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LS_PRINT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed) return { ...DEFAULT_PRINT_SETTINGS, ...parsed };
      }
    } catch (_) {}
  }
  return DEFAULT_PRINT_SETTINGS;
}

function getInitialBillingSettings(): BillingSettings {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(LS_BILLING_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed) return { ...DEFAULT_BILLING_SETTINGS, ...parsed };
      }
    } catch (_) {}
  }
  return DEFAULT_BILLING_SETTINGS;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  shopProfile: getInitialShopProfile(),
  printSettings: getInitialPrintSettings(),
  billingSettings: getInitialBillingSettings(),
  supabaseConfig: DEFAULT_SUPABASE_CONFIG,
  isLoading: false,
  isTestingConnection: false,
  connectionStatus: null,

  loadSettings: async () => {
    try {
      // 1. Instant check from localStorage
      let localShop: ShopProfile | null = null;
      let localPrint: PrintSettings | null = null;
      let localBilling: BillingSettings | null = null;
      if (typeof window !== 'undefined') {
        const lsShop = localStorage.getItem(LS_SHOP_KEY);
        if (lsShop) {
          try { localShop = JSON.parse(lsShop); } catch (_) {}
        }
        const lsPrint = localStorage.getItem(LS_PRINT_KEY);
        if (lsPrint) {
          try { localPrint = JSON.parse(lsPrint); } catch (_) {}
        }
        const lsBilling = localStorage.getItem(LS_BILLING_KEY);
        if (lsBilling) {
          try { localBilling = JSON.parse(lsBilling); } catch (_) {}
        }
      }

      // 2. Load from Dexie IndexedDB
      const shopRec = await db.keyValueSettings.get('shopProfile');
      const printRec = await db.keyValueSettings.get('printSettings');
      const billingRec = await db.keyValueSettings.get('billingSettings');
      const supaRec = await db.keyValueSettings.get('supabaseConfig');

      let localSupa: SupabaseConfig | null = null;
      if (typeof window !== 'undefined') {
        try {
          const lsSupa = localStorage.getItem('webrajya_supabase_config');
          if (lsSupa) localSupa = JSON.parse(lsSupa);
        } catch (_) {}
      }

      let currentShop = localShop || (shopRec ? shopRec.value : DEFAULT_SHOP_PROFILE);
      if (!shopRec && !localShop) {
        currentShop = DEFAULT_SHOP_PROFILE;
        await db.keyValueSettings.put({ key: 'shopProfile', value: DEFAULT_SHOP_PROFILE });
      }

      const currentPrint = localPrint || (printRec ? { ...DEFAULT_PRINT_SETTINGS, ...printRec.value } : DEFAULT_PRINT_SETTINGS);
      const currentBilling = localBilling || (billingRec ? { ...DEFAULT_BILLING_SETTINGS, ...billingRec.value } : DEFAULT_BILLING_SETTINGS);

      set({
        shopProfile: currentShop,
        printSettings: currentPrint,
        billingSettings: currentBilling,
        supabaseConfig: localSupa || (supaRec ? supaRec.value : DEFAULT_SUPABASE_CONFIG),
        isLoading: false
      });
    } catch (err) {
      set({ isLoading: false });
    }
  },

  saveShopProfile: async (shopProfile) => {
    // Synchronously update localStorage & broadcast for 0ms cross-tab adoption
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_SHOP_KEY, JSON.stringify(shopProfile));
        window.dispatchEvent(new CustomEvent('webrajya_settings_updated', { detail: shopProfile }));
      } catch (_) {}
    }
    await db.keyValueSettings.put({ key: 'shopProfile', value: shopProfile });
    set({ shopProfile });
  },

  savePrintSettings: async (printSettings) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_PRINT_KEY, JSON.stringify(printSettings));
      } catch (_) {}
    }
    await db.keyValueSettings.put({ key: 'printSettings', value: printSettings });
    set({ printSettings });
  },

  saveBillingSettings: async (billingSettings) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LS_BILLING_KEY, JSON.stringify(billingSettings));
        window.dispatchEvent(new CustomEvent('webrajya_billing_settings_updated', { detail: billingSettings }));
      } catch (_) {}
    }
    await db.keyValueSettings.put({ key: 'billingSettings', value: billingSettings });
    set({ billingSettings });
  },

  saveSupabaseConfig: async (supabaseConfig) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('webrajya_supabase_config', JSON.stringify(supabaseConfig));
      } catch (_) {}
    }
    await db.keyValueSettings.put({ key: 'supabaseConfig', value: supabaseConfig });
    resetSupabaseClient();
    set({ supabaseConfig });
  },

  testConnection: async (url, key) => {
    set({ isTestingConnection: true, connectionStatus: null });
    const result = await testSupabaseConnection(url, key);
    set({ isTestingConnection: false, connectionStatus: result });
    return result;
  },

  resetToDefaults: async () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('webrajya_supabase_config');
        localStorage.removeItem(LS_BILLING_KEY);
      } catch (_) {}
    }
    await db.keyValueSettings.put({ key: 'shopProfile', value: DEFAULT_SHOP_PROFILE });
    await db.keyValueSettings.put({ key: 'printSettings', value: DEFAULT_PRINT_SETTINGS });
    await db.keyValueSettings.put({ key: 'billingSettings', value: DEFAULT_BILLING_SETTINGS });
    await db.keyValueSettings.put({ key: 'supabaseConfig', value: DEFAULT_SUPABASE_CONFIG });
    resetSupabaseClient();
    set({
      shopProfile: DEFAULT_SHOP_PROFILE,
      printSettings: DEFAULT_PRINT_SETTINGS,
      billingSettings: DEFAULT_BILLING_SETTINGS,
      supabaseConfig: DEFAULT_SUPABASE_CONFIG
    });
  },

  exportBackupJSON: async () => {
    const products = await db.products.toArray();
    const invoices = await db.invoices.toArray();
    const stockMovements = await db.stockMovements.toArray();
    const customers = await db.customers.toArray();
    const suppliers = await db.suppliers.toArray();
    const purchaseInvoices = await db.purchaseInvoices.toArray();
    const settings = await db.keyValueSettings.toArray();

    const data = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      products,
      invoices,
      stockMovements,
      customers,
      suppliers,
      purchaseInvoices,
      settings
    };

    return JSON.stringify(data, null, 2);
  },

  importBackupJSON: async (jsonString) => {
    try {
      const data = JSON.parse(jsonString);
      if (!data.products || !Array.isArray(data.products)) {
        return { success: false, message: 'Invalid backup file format: missing products catalog.' };
      }

      await db.transaction('rw', [db.products, db.invoices, db.stockMovements, db.customers, db.suppliers, db.purchaseInvoices, db.keyValueSettings], async () => {
        if (data.products?.length) await db.products.bulkPut(data.products);
        if (data.invoices?.length) await db.invoices.bulkPut(data.invoices);
        if (data.stockMovements?.length) await db.stockMovements.bulkPut(data.stockMovements);
        if (data.customers?.length) await db.customers.bulkPut(data.customers);
        if (data.suppliers?.length) await db.suppliers.bulkPut(data.suppliers);
        if (data.purchaseInvoices?.length) await db.purchaseInvoices.bulkPut(data.purchaseInvoices);
        if (data.settings?.length) await db.keyValueSettings.bulkPut(data.settings);
      });

      await get().loadSettings();
      return { 
        success: true, 
        message: `Imported backup successfully! (${data.products.length} products, ${data.invoices?.length || 0} bills, ${data.customers?.length || 0} customers restored).` 
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to import backup.' };
    }
  },

  clearAllDemoData: async () => {
    await db.transaction('rw', [db.products, db.invoices, db.drafts, db.stockMovements, db.customers, db.auditLogs], async () => {
      await db.products.clear();
      await db.invoices.clear();
      await db.drafts.clear();
      await db.stockMovements.clear();
      await db.customers.clear();
      await db.auditLogs.clear();
    });
  }
}));

// Cross-tab and window event listener for real-time reactive sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LS_SHOP_KEY && e.newValue) {
      try {
        const newProfile = JSON.parse(e.newValue);
        useSettingsStore.setState({ shopProfile: newProfile });
      } catch (_) {}
    } else if (e.key === LS_PRINT_KEY && e.newValue) {
      try {
        const newPrint = JSON.parse(e.newValue);
        useSettingsStore.setState({ printSettings: newPrint });
      } catch (_) {}
    } else if (e.key === LS_BILLING_KEY && e.newValue) {
      try {
        const newBilling = JSON.parse(e.newValue);
        useSettingsStore.setState({ billingSettings: newBilling });
      } catch (_) {}
    }
  });

  window.addEventListener('webrajya_settings_updated', ((e: CustomEvent) => {
    if (e.detail) {
      useSettingsStore.setState({ shopProfile: e.detail });
    }
  }) as EventListener);

  window.addEventListener('webrajya_billing_settings_updated', ((e: CustomEvent) => {
    if (e.detail) {
      useSettingsStore.setState({ billingSettings: e.detail });
    }
  }) as EventListener);
}
