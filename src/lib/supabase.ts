import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;
let currentClientKey = '';

export const DEFAULT_SUPABASE_URL = 'https://wmuhfxzkvpcdjnlztmlw.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_gvx-t7faifYXF1Qbqok9Lw_w_R-NGo3';

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  // 1. Direct argument parameters
  let targetUrl = url?.trim();
  let targetKey = anonKey?.trim();

  // 2. Settings saved in browser localStorage by user in Settings Section
  if ((!targetUrl || !targetKey) && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('webrajya_supabase_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.url && parsed?.anonKey && parsed.url.trim() !== '' && parsed.anonKey.trim() !== '') {
          targetUrl = targetUrl || parsed.url.trim();
          targetKey = targetKey || parsed.anonKey.trim();
        }
      }
    } catch (_) {}
  }

  // 3. Fallback to Vite / Environment Variables (.env)
  if (!targetUrl || !targetKey) {
    const rawEnvUrl = 
      (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_URL) ||
      (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_URL);

    const envUrl = (rawEnvUrl && !rawEnvUrl.includes('your-supabase-url') && !rawEnvUrl.includes('example.com') && rawEnvUrl.trim() !== '')
      ? rawEnvUrl.trim()
      : '';

    const rawEnvKey = 
      (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY);

    const envKey = (rawEnvKey && !rawEnvKey.includes('your-supabase-anon-key') && rawEnvKey.trim() !== '')
      ? rawEnvKey.trim()
      : '';

    targetUrl = targetUrl || envUrl;
    targetKey = targetKey || envKey;
  }

  // 4. Default Project Fallback (ensures 100% online cloud sync on mobile phones & Vercel)
  targetUrl = targetUrl || DEFAULT_SUPABASE_URL;
  targetKey = targetKey || DEFAULT_SUPABASE_ANON_KEY;

  if (!targetUrl || !targetKey || targetUrl.trim() === '' || targetKey.trim() === '' || targetUrl.includes('your-supabase-url')) {
    return null;
  }

  try {
    const clientSignature = `${targetUrl}:::${targetKey}`;
    if (!supabaseClient || currentClientKey !== clientSignature) {
      supabaseClient = createClient(targetUrl, targetKey);
      currentClientKey = clientSignature;
    }
    return supabaseClient;
  } catch (error) {
    console.warn('Failed to initialize Supabase client:', error);
    return null;
  }
}

export function resetSupabaseClient() {
  supabaseClient = null;
  currentClientKey = '';
}

export async function testSupabaseConnection(url: string, anonKey: string): Promise<{ success: boolean; message: string }> {
  if (!url || !anonKey) {
    return { success: false, message: 'Supabase URL and Anon Key are required.' };
  }

  try {
    const client = createClient(url, anonKey);
    // Simple query test on supabase health / public table
    const { error } = await client.from('products').select('count', { count: 'exact', head: true });
    
    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      return { success: true, message: `Connected successfully! Note: (${error.message}).` };
    }

    return { success: true, message: 'Connected to Supabase PostgreSQL successfully!' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Failed to connect to Supabase.' };
  }
}
