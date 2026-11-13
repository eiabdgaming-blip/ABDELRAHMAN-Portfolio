export function supabaseConfig(url: string | undefined, key: string | undefined) {
  // A secret or legacy service-role key must never be accepted as public configuration.
  if (!url || !key?.startsWith('sb_publishable_')) return null
  return { url, key }
}
