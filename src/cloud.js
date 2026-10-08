import { createClient } from '@supabase/supabase-js'
import { TABLES } from './library'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** null when the env vars aren't set: the app then runs local-only. */
export const supabase = url && key ? createClient(url, key) : null
export const cloudEnabled = !!supabase

const check = ({ error }) => {
  if (error) throw error
}

export async function fetchRows() {
  const out = {}
  for (const t of TABLES) {
    const { data, error } = await supabase.from(t).select('*')
    if (error) throw error
    out[t] = data
  }
  return out
}

/** Apply a diff in an order that respects foreign keys: parents first to write, children first to delete. */
export async function pushDiff({ upserts, deletes }) {
  for (const t of TABLES) if (upserts[t].length) check(await supabase.from(t).upsert(upserts[t]))
  for (const t of [...TABLES].reverse()) if (deletes[t].length) check(await supabase.from(t).delete().in('id', deletes[t]))
}

/** Remove everything this teacher has stored. Classes cascade to students and charts. */
export async function deleteAllMine() {
  const any = '00000000-0000-0000-0000-000000000000'
  check(await supabase.from('classes').delete().neq('id', any))
  check(await supabase.from('rooms').delete().neq('id', any))
}
