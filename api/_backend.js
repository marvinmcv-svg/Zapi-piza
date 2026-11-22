// Calls the Supabase backend from Vercel functions with the publishable key (the same one the browser uses).
// Only the public RPCs are reachable this way: place_order (server-priced, idempotent) and track_order.
const CONFIG = require("../js/config.js");

async function rpc(fn, body, timeoutMs = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: CONFIG.supabaseKey, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: (data && data.message) || `http_${res.status}`, status: res.status };
    return { data };
  } catch (err) {
    return { error: err.name === "AbortError" ? "timeout" : "network", network: true };
  } finally {
    clearTimeout(timer);
  }
}

const trackingUrl = (token) => `${CONFIG.siteUrl}/seguimiento/?t=${token}`;

module.exports = {
  placeOrder: (payload) => rpc("place_order", { payload }),
  trackOrder: (token) => rpc("track_order", { p_token: token }),
  trackingUrl,
};
