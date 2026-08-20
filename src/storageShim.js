/* ---------------------------------------------------------------------------
   storageShim.js — window.storage, backed by Supabase

   App.jsx was written against the key/value storage API it had inside Claude:

     await window.storage.get(key, shared)     -> { key, value } | null
     await window.storage.set(key, value, shared)
     await window.storage.delete(key, shared)
     await window.storage.list(prefix, shared)

   This reproduces that interface on top of one Postgres table, so the app
   itself never has to know where the data went. `value` is always a STRING at
   this boundary — the app hands over JSON.stringify(...) and expects the same
   string back.

   The `shared` argument is accepted and ignored: there is a single shared
   table and no per-user scoping. Everyone with the link sees the same show.

   IMPORTANT: set() throws on failure rather than swallowing the error. App.jsx
   relies on that — it retries once and only then tells the user a change did
   not save. A shim that silently succeeded would turn every failed write into
   invisible data loss.
--------------------------------------------------------------------------- */

import { supabase, isConfigured, TABLE } from './supabaseClient';

/* Values are stored as real jsonb rather than as an opaque string, so the
   Supabase table stays readable and queryable in the dashboard — which is
   what makes the history/restore in supabase-setup.sql actually usable.

   Reads tolerate both shapes. An older row written as a JSON *string* scalar
   comes back as a string and is passed through untouched; a row written as an
   object or array is re-stringified. Without that, rows saved by an earlier
   build would come back double-encoded and fail to parse. */
function toStored(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value; // not JSON — store the string as-is
  }
}

function fromStored(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function requireClient() {
  if (!isConfigured || !supabase) {
    throw new Error(
      'BrushScore storage is not configured — set VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY and rebuild.'
    );
  }
}

async function get(key) {
  requireClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('key, value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { key: data.key, value: fromStored(data.value) };
}

async function set(key, value) {
  requireClient();
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value: toStored(value), updated_at: new Date().toISOString() },
            { onConflict: 'key' });
  if (error) throw error;
  return { key, value };
}

async function del(key) {
  requireClient();
  const { error } = await supabase.from(TABLE).delete().eq('key', key);
  if (error) throw error;
  return { key, deleted: true };
}

async function list(prefix = '') {
  requireClient();
  let q = supabase.from(TABLE).select('key');
  if (prefix) q = q.like('key', `${prefix}%`);
  const { data, error } = await q;
  if (error) throw error;
  return { keys: (data || []).map((r) => r.key), prefix };
}

/* Attached before React renders (see main.jsx) so the first load can read
   straight away. */
window.storage = { get, set, delete: del, list };

/* Diagnostic, callable from the browser console as brushscoreCheck().
   Exercises read, write and read-back against a scratch key and reports
   exactly which step fails and why — which is far quicker than inferring a
   cause from a "not saved" toast. */
window.brushscoreCheck = async function brushscoreCheck() {
  const out = (label, ok, extra) =>
    // eslint-disable-next-line no-console
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`, extra ?? '');

  out('env vars present', isConfigured, isConfigured ? '' : 'set VITE_SUPABASE_* and REDEPLOY');
  if (!isConfigured) return;

  try {
    const cfg = await get('brushscore:config');
    out('read config', true, cfg ? `${(cfg.value || '').length} bytes` : 'no row yet');
  } catch (e) {
    out('read config', false, e);
    return;
  }

  // Writes are restricted to the app's three keys, so test on a real one by
  // reading it and writing the identical value straight back.
  try {
    const existing = await get('brushscore:groups');
    const value = existing ? existing.value : '{}';
    await set('brushscore:groups', value);
    out('write groups', true, `${value.length} bytes`);
  } catch (e) {
    out('write groups', false, {
      message: e?.message, code: e?.code, details: e?.details, hint: e?.hint,
    });
    // eslint-disable-next-line no-console
    console.log(
      'A code of 42501 or a message about row-level security means the ' +
      'write policy is rejecting it — re-run section 3 of supabase-setup.sql.'
    );
    return;
  }

  try {
    const entries = await get('brushscore:entries');
    const list = entries ? JSON.parse(entries.value) : [];
    out('entries parse', Array.isArray(list), `${Array.isArray(list) ? list.length : '?'} entries`);
  } catch (e) {
    out('entries parse', false, e);
  }
};

export default window.storage;
