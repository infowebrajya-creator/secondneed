import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = 
  (typeof import.meta !== "undefined" && import.meta?.env?.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  "https://wmuhfxzkvpcdjnlztmlw.supabase.co";

const supabaseKey = 
  (typeof import.meta !== "undefined" && import.meta?.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  "sb_publishable_gvx-t7faifYXF1Qbqok9Lw_w_R-NGo3";

export const createClient = () => createSupabaseClient(supabaseUrl, supabaseKey);
export default createClient;
