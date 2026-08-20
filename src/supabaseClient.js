import { createClient } from '@supabase/supabase-js';

/* Vite inlines these at build time, which is why adding them in the Vercel
   dashboard requires a redeploy — a refresh will not pick them up. */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

/* Missing configuration used to surface as "your show has vanished" — the app
   would fall back to the setup wizard as though it were a brand new install,
   which looks identical to data loss and is alarming for no reason. Saying so
   in the console makes the real cause findable. */
if (!isConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    '[BrushScore] Supabase is not configured. VITE_SUPABASE_URL and ' +
    'VITE_SUPABASE_ANON_KEY must be set at BUILD time. Locally, put them in ' +
    '.env and restart the dev server. On Vercel/Netlify, add them in the ' +
    'project settings and REDEPLOY — env vars are baked into the bundle, so ' +
    'a page refresh will not pick them up. Until then the app has no storage ' +
    'and will show the setup wizard.'
  );
}

export const supabase = isConfigured ? createClient(url, anonKey) : null;

export const TABLE = 'brushscore_kv';
