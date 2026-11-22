/* Public backend config (safe to ship: the publishable key only allows what row-level security permits).
 * Supabase project: zapi-piza (sa-east-1). Staff log in at /admin. */
(function (root) {
  const CONFIG = {
    supabaseUrl: "https://ovjokicahfkqtlyeezhx.supabase.co",
    supabaseKey: "sb_publishable_v1tKngK4lOXc0rl3K3smog_qbQsy_x7",
    siteUrl: "https://zapi-piza.vercel.app",
  };
  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else root.ZAPI_CONFIG = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
