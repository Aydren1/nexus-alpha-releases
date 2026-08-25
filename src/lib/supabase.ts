import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const cloudEnabled = /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) && publishableKey.length > 20;

export const supabase: SupabaseClient | null = cloudEnabled
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'nexus-alpha-session',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export const requireSupabase = () => {
  if (!supabase) throw new Error('NEXUS cloud services are not configured on this build.');
  return supabase;
};
