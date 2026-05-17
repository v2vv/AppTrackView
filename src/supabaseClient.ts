import { createClient } from '@supabase/supabase-js'

export const getSupabase = (url: string, key: string) => {
  return createClient(url, key)
}
