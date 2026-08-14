// Re-implements the window.storage.{get,set,delete,list} interface that the
// app was originally written against (Claude artifact storage), backed by a
// single key/value table in Supabase. App.jsx is unchanged — it just calls
// window.storage as before.
import { supabase } from './supabaseClient';

const TABLE = 'BrushScore_kv';

async function get(key, _shared) {
  const { data, error } = await supabase.from(TABLE).select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { key, value: JSON.stringify(data.value), shared: true };
}

async function set(key, value, _shared) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value;
  }
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value: parsed, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  return { key, value, shared: true };
}

async function del(key, _shared) {
  const { error } = await supabase.from(TABLE).delete().eq('key', key);
  if (error) throw error;
  return { key, deleted: true, shared: true };
}

async function list(prefix = '', _shared) {
  let query = supabase.from(TABLE).select('key');
  if (prefix) query = query.like('key', `${prefix}%`);
  const { data, error } = await query;
  if (error) throw error;
  return { keys: (data || []).map((d) => d.key), prefix, shared: true };
}

if (typeof window !== 'undefined') {
  window.storage = { get, set, delete: del, list };
}
