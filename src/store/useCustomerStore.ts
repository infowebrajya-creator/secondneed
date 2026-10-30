import { create } from 'zustand';
import { Customer } from '../types';
import { db } from '../lib/db';
import { getSupabaseClient } from '../lib/supabase';

interface CustomerState {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;

  loadCustomers: (isSilent?: boolean) => Promise<void>;
  addCustomer: (data: Omit<Customer, 'id' | 'createdAt'>) => Promise<Customer>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  findOrCreateCustomer: (name: string, mobile?: string, gstin?: string, address?: string) => Promise<Customer | null>;
  recordCustomerPayment: (customerId: string, amount: number, paymentMode: 'cash' | 'upi', notes?: string) => Promise<void>;
}

let customerRealtimeSubscribed = false;

export function toSupabaseCustomerPayload(cust: Partial<Customer>) {
  const payload: Record<string, any> = {
    updated_at: cust.updatedAt || new Date().toISOString()
  };
  if (cust.id !== undefined) payload.id = cust.id;
  if (cust.name !== undefined) payload.name = cust.name.trim();
  if (cust.mobile !== undefined) payload.mobile = cust.mobile?.trim() || null;
  if (cust.gstin !== undefined) payload.gstin = cust.gstin?.trim() || null;
  if (cust.address !== undefined) payload.address = cust.address?.trim() || null;
  if (cust.creditBalance !== undefined) payload.credit_balance = Number(cust.creditBalance) || 0;
  if (cust.createdAt !== undefined) payload.created_at = cust.createdAt;
  return payload;
}

function mapRemoteCustomerToLocal(row: any): Customer {
  return {
    id: String(row.id),
    name: row.name || 'Unnamed Client',
    mobile: row.mobile || '',
    email: '',
    address: row.address || '',
    city: '',
    state: '',
    pincode: '',
    gstin: row.gstin || '',
    creditBalance: Number(row.credit_balance || 0),
    creditLimit: 0,
    notes: '',
    isActive: true,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString()
  };
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  isLoading: false,
  error: null,

  loadCustomers: async (isSilent = false) => {
    if (!isSilent && get().customers.length === 0) {
      set({ isLoading: true, error: null });
    }
    try {
      // 1. Poka-Yoke: Auto-clean any dummy 'Cash Customer' records with zero credit balance
      await db.customers.filter(c => c.name.toLowerCase() === 'cash customer' && (!c.creditBalance || c.creditBalance === 0)).delete();

      // 2. Load all local records from Dexie (excluding Cash Customer)
      const rawCustomers = await db.customers
        .filter(c => c.name.toLowerCase() !== 'cash customer')
        .toArray();

      // Sort: customers with outstanding udhar at the top, then alphabetically
      const localCustomers = rawCustomers.sort((a, b) => {
        const balDiff = (b.creditBalance || 0) - (a.creditBalance || 0);
        if (balDiff !== 0) return balDiff;
        return a.name.localeCompare(b.name);
      });

      // Display locally cached customers on initial cold start only (0ms instant UI)
      // Never flash intermediate local state during background auto-refresh
      if (get().customers.length === 0 && localCustomers.length > 0) {
        set({ customers: localCustomers });
      }

      // 3. Fetch from Supabase PostgreSQL & Subscribe to Realtime Cross-Device Channel
      const client = getSupabaseClient();
      if (client) {
        if (!customerRealtimeSubscribed) {
          customerRealtimeSubscribed = true;
          try {
            client
              .channel('public:customers_sync')
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'customers' },
                () => {
                  get().loadCustomers(true);
                }
              )
              .subscribe((status) => {
                if (status !== 'SUBSCRIBED') {
                  customerRealtimeSubscribed = false;
                }
              });
          } catch (e) {
            customerRealtimeSubscribed = false;
            console.warn('[useCustomerStore] Realtime channel warning:', e);
          }
        }

        const { data, error } = await client
          .from('customers')
          .select('*')
          .order('credit_balance', { ascending: false });

        if (error) {
          if (!isSilent) console.warn('[useCustomerStore] Supabase fetch error:', error.message);
        } else if (data) {
          const remoteList: Customer[] = data
            .filter((row: any) => (row.name || '').toLowerCase() !== 'cash customer')
            .map((row: any) => ({ ...mapRemoteCustomerToLocal(row), synced: true }));

          const remoteMap = new Map(remoteList.map((r) => [r.id, r]));

          // Purge stale local test artifacts and any customer deleted from Supabase
          const isTestCust = (c: Customer) =>
            c.name === 'Buyer 1' ||
            c.name === 'Buyer 2' ||
            c.name === 'Double Clicker' ||
            c.name === 'Return Customer' ||
            c.name === 'Ramesh Kumar' ||
            c.name === 'Priya Sharma';

          const staleCustomers = localCustomers.filter((c) => isTestCust(c) || !remoteMap.has(c.id));
          if (staleCustomers.length > 0) {
            await db.customers.bulkDelete(staleCustomers.map((s) => s.id)).catch(() => {});
          }

          // Overwrite local Dexie with verified remote list
          if (remoteList.length > 0) {
            await db.customers.bulkPut(remoteList);
          } else {
            await db.customers.clear().catch(() => {});
          }

          remoteList.sort((a, b) => {
            const balDiff = (b.creditBalance || 0) - (a.creditBalance || 0);
            if (balDiff !== 0) return balDiff;
            return a.name.localeCompare(b.name);
          });

          // Only trigger state update if customer list actually changed to prevent screen flickering
          const currentList = get().customers;
          const hasChanged = currentList.length !== remoteList.length || 
            remoteList.some((c, i) => {
              const prev = currentList[i];
              return !prev || prev.id !== c.id || prev.name !== c.name || prev.creditBalance !== c.creditBalance || prev.mobile !== c.mobile;
            });

          if (hasChanged) {
            set({ customers: remoteList, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        }
      }
    } catch (err: any) {
      if (!isSilent) {
        console.error('[useCustomerStore] Failed to load customers:', err);
        set({ error: err.message || 'Failed to load customers' });
      }
    } finally {
      if (!isSilent) {
        set({ isLoading: false });
      }
    }
  },

  addCustomer: async (customerData) => {
    const cleanName = customerData.name.trim();
    const cleanMobile = (customerData.mobile || '').trim();

    // Check if customer already exists in Dexie before inserting
    let existing = cleanMobile 
      ? await db.customers.where('mobile').equals(cleanMobile).first()
      : null;

    if (!existing) {
      existing = await db.customers.where('name').equalsIgnoreCase(cleanName).first();
    }

    if (existing) {
      // Customer already exists, update and return existing record without duplicating
      const updated: Customer = {
        ...existing,
        mobile: existing.mobile || cleanMobile || '',
        gstin: existing.gstin || customerData.gstin || undefined,
        address: existing.address || customerData.address || undefined,
        creditBalance: (existing.creditBalance || 0) + (customerData.creditBalance || 0),
        updatedAt: new Date().toISOString()
      };
      await db.customers.put(updated);
      set((state) => ({
        customers: state.customers.map((c) => (c.id === existing.id ? updated : c))
      }));

      // Cloud sync update to Supabase
      const client = getSupabaseClient();
      if (client) {
        try {
          await client
            .from('customers')
            .upsert(toSupabaseCustomerPayload(updated), { onConflict: 'id' });
        } catch (err) {
          console.warn('[useCustomerStore] Supabase upsert error on existing:', err);
        }
      }

      return updated;
    }

    const now = new Date().toISOString();
    const newId = 'cust_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());

    const newCustomer: Customer = {
      ...customerData,
      name: cleanName,
      mobile: cleanMobile || '',
      id: newId,
      createdAt: now,
      updatedAt: now,
      creditBalance: customerData.creditBalance || 0,
      isActive: customerData.isActive !== false
    };

    // 1. Save to local Dexie immediately (0ms UI latency)
    await db.customers.put(newCustomer);
    set((state) => ({ customers: [...state.customers, newCustomer].sort((a, b) => a.name.localeCompare(b.name)) }));

    // 2. Save to Supabase Cloud with clean schema
    const client = getSupabaseClient();
    if (client) {
      try {
        const payload = toSupabaseCustomerPayload(newCustomer);
        const { error } = await client.from('customers').insert([payload]);

        if (error) {
          console.warn('[useCustomerStore] Supabase insert warning:', error.message);
        }
      } catch (err) {
        console.warn('[useCustomerStore] Supabase connection error on addCustomer:', err);
      }
    }

    return newCustomer;
  },

  updateCustomer: async (id, updates) => {
    const now = new Date().toISOString();
    const existing = await db.customers.get(id);
    if (!existing) return;

    const updated: Customer = {
      ...existing,
      ...updates,
      updatedAt: now
    };

    await db.customers.put(updated);
    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? updated : c))
    }));

    const client = getSupabaseClient();
    if (client) {
      try {
        const payload: Record<string, any> = { updated_at: now };
        if (updates.name !== undefined) payload.name = updates.name.trim();
        if (updates.mobile !== undefined) payload.mobile = updates.mobile?.trim() || null;
        if (updates.address !== undefined) payload.address = updates.address?.trim() || null;
        if (updates.gstin !== undefined) payload.gstin = updates.gstin?.trim() || null;
        if (updates.creditBalance !== undefined) payload.credit_balance = Number(updates.creditBalance) || 0;

        await client.from('customers').update(payload).eq('id', id);
      } catch (err) {
        console.warn('[useCustomerStore] Supabase update warning:', err);
      }
    }
  },

  deleteCustomer: async (id) => {
    await db.customers.delete(id);
    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id)
    }));

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('customers').delete().eq('id', id);
      } catch (err) {
        console.warn('[useCustomerStore] Supabase delete warning:', err);
      }
    }
  },

  findOrCreateCustomer: async (name, mobile = '', gstin = '', address = '') => {
    const cleanName = name.trim();
    if (!cleanName || cleanName.toLowerCase() === 'cash customer') {
      return null;
    }

    const cleanMobile = mobile.trim();

    // 1. Check in Dexie directly
    let existing = cleanMobile
      ? await db.customers.where('mobile').equals(cleanMobile).first()
      : null;

    if (!existing) {
      existing = await db.customers.where('name').equalsIgnoreCase(cleanName).first();
    }

    // 2. Also check Zustand in-memory state
    if (!existing) {
      const { customers } = get();
      existing = cleanMobile 
        ? customers.find((c) => c.mobile && c.mobile.trim() === cleanMobile) || null
        : null;
      if (!existing) {
        existing = customers.find((c) => c.name.toLowerCase() === cleanName.toLowerCase()) || null;
      }
    }

    if (existing) {
      // Update missing details if provided
      let needsUpdate = false;
      const updates: Partial<Customer> = {};
      if (!existing.mobile && cleanMobile) { updates.mobile = cleanMobile; needsUpdate = true; }
      if (!existing.gstin && gstin.trim()) { updates.gstin = gstin.trim(); needsUpdate = true; }
      if (!existing.address && address.trim()) { updates.address = address.trim(); needsUpdate = true; }
      if (needsUpdate) {
        await get().updateCustomer(existing.id, updates);
        return { ...existing, ...updates };
      }
      return existing;
    }

    // Auto-create customer
    return await get().addCustomer({
      name: cleanName,
      mobile: cleanMobile || '',
      gstin: gstin.trim() || undefined,
      address: address.trim() || undefined,
      creditBalance: 0,
      isActive: true
    });
  },

  recordCustomerPayment: async (customerId, amount, paymentMode, notes = '') => {
    const existing = await db.customers.get(customerId);
    if (!existing) return;

    const prevBalance = existing.creditBalance || 0;
    const newBalance = Math.max(0, prevBalance - amount);
    await get().updateCustomer(customerId, { creditBalance: newBalance });

    // Record Audit Log Entry for Khata reconciliation
    await db.auditLogs.put({
      id: 'audit_pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      action: 'CUSTOMER_PAYMENT_RECEIVED',
      tableName: 'customers',
      recordId: customerId,
      details: {
        customerName: existing.name,
        amountReceived: amount,
        paymentMode,
        previousBalance: prevBalance,
        newBalance,
        notes
      },
      createdAt: new Date().toISOString()
    });
  }
}));
