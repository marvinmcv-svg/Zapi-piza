// Live end-to-end checks of the Supabase backend (RLS, RPCs, roles). Not part of `npm test` (needs passwords):
//   node tests/backend.e2e.js <ownerPassword> <managerPassword> <kitchenPassword>
// Creates test orders; delete them afterwards (see README → Backend).
// End-to-end checks against the live Supabase API (anon + staff logins, RLS, RPCs).
const URL = "https://ovjokicahfkqtlyeezhx.supabase.co";
const KEY = "sb_publishable_v1tKngK4lOXc0rl3K3smog_qbQsy_x7";
const [ownerPw, mgrPw, kitPw] = process.argv.slice(2);
let fails = 0;
const ok = (cond, msg, extra) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}${extra ? " — " + extra : ""}`); if (!cond) fails++; };
async function call(path, { method = "GET", body, token } = {}) {
  const r = await fetch(URL + path, { method, headers: { apikey: KEY, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}
const rpc = (fn, body, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", body, token });
const login = async (email, password) => (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } })).j.access_token;
(async () => {
  const ref = "test-" + Date.now();
  const payload = { client_ref: ref, channel: "web", store: "Piraí", service: "delivery", customer_name: "Prueba Test", customer_phone: "7 845-9620",
    address: "Calle Falsa 123", reference: "portón rojo", items: [{ id: "chori", qty: 2 }, { id: "soda-2l", qty: 1 }], total: 1 };
  // public order
  let r = await rpc("place_order", { payload });
  ok(r.status === 200 && r.j.code && r.j.total == 122, "anon place_order prices from DB (2×52+18=122, client total ignored)", JSON.stringify(r.j).slice(0, 120));
  const code = r.j.code, token = r.j.tracking_token;
  r = await rpc("place_order", { payload });
  ok(r.j.duplicate === true && r.j.code === code, "same client_ref → same order (idempotent)");
  r = await rpc("place_order", { payload: { ...payload, client_ref: ref + "b", channel: "telefono" } });
  ok(r.status >= 400, "anon cannot use staff channels", r.j.message);
  r = await rpc("place_order", { payload: { ...payload, client_ref: ref + "c", customer_phone: "123" } });
  ok(r.status >= 400 && /invalid_phone/.test(r.j.message), "anon needs a valid Bolivian phone");
  r = await rpc("place_order", { payload: { ...payload, client_ref: ref + "d", items: [{ id: "caviar" }] } });
  ok(r.status >= 400 && /unknown_item/.test(r.j.message), "unknown item rejected");
  // tracking
  r = await rpc("track_order", { p_token: token });
  ok(r.j && r.j.code === code && r.j.status === "nuevo" && !JSON.stringify(r.j).includes("Falsa") && !("customer_phone" in r.j) && !("address" in r.j), "track_order by token, no address/phone leaked");
  // anon cannot read tables
  r = await call("/rest/v1/orders?select=*");
  ok(r.status >= 400 || (Array.isArray(r.j) && r.j.length === 0), "anon cannot read orders", `status ${r.status}`);
  r = await call("/rest/v1/customers?select=*");
  ok(r.status >= 400 || (Array.isArray(r.j) && r.j.length === 0), "anon cannot read customers");
  // staff
  const owner = await login("dueno@zapipiza.bo", ownerPw), mgr = await login("gerente.pirai@zapipiza.bo", mgrPw), kit = await login("cocina.pirai@zapipiza.bo", kitPw);
  ok(owner && mgr && kit, "3 staff logins work");
  r = await call(`/rest/v1/orders?select=id,code,store_id,total&code=eq.${code}`, { token: mgr });
  ok(r.j.length === 1, "Piraí manager sees Piraí order");
  const orderId = r.j[0].id;
  // a second store order by owner (manual, phone channel)
  r = await rpc("place_order", { payload: { client_ref: ref + "e", channel: "telefono", store: "plan-3000", service: "pickup", customer_name: "Walk In", items: [{ id: "muzza" }] } }, owner);
  ok(r.status === 200 && r.j.code, "owner creates manual phone order at Plan 3000", r.j.message);
  const plan = r.j.code;
  r = await call(`/rest/v1/orders?select=id&code=eq.${plan}`, { token: mgr });
  ok(r.j.length === 0, "Piraí manager can NOT see Plan 3000 order (RLS)");
  r = await call(`/rest/v1/orders?select=id&code=eq.${plan}`, { token: owner });
  ok(r.j.length === 1, "owner sees all stores");
  r = await call(`/rest/v1/customers?select=phone,orders_count,total_spent&phone=eq.%2B59178459620`, { token: mgr });
  ok(r.j[0] && r.j[0].orders_count === 1 && +r.j[0].total_spent === 122, "CRM stats updated by trigger", JSON.stringify(r.j));
  r = await call(`/rest/v1/customers?select=phone`, { token: kit });
  ok(Array.isArray(r.j) && r.j.length === 0, "kitchen cannot read customers");
  // status flow
  r = await rpc("set_order_status", { p_order: orderId, p_status: "confirmado" }, kit);
  ok(r.status === 200, "kitchen confirms", r.j.message);
  r = await rpc("set_order_status", { p_order: orderId, p_status: "en_preparacion" }, kit);
  r = await rpc("set_order_status", { p_order: orderId, p_status: "confirmado" }, kit);
  ok(r.status >= 400 && /manager_required/.test(r.j.message), "kitchen cannot move an order backwards");
  r = await rpc("set_order_status", { p_order: orderId, p_status: "cancelado", p_cancel_reason: "cliente_desistio" }, kit);
  ok(r.status >= 400, "kitchen cannot cancel once in preparation", r.j.message);
  r = await rpc("set_order_status", { p_order: orderId, p_status: "en_camino" }, kit);
  ok(r.status >= 400 && /forbidden_status/.test(r.j.message), "kitchen cannot dispatch");
  for (const s of ["listo", "en_camino", "entregado"]) { r = await rpc("set_order_status", { p_order: orderId, p_status: s }, mgr); ok(r.status === 200, `manager → ${s}`, r.j.message); }
  // direct status update blocked; payment update allowed
  r = await call(`/rest/v1/orders?id=eq.${orderId}`, { method: "PATCH", body: { status: "nuevo" }, token: mgr });
  ok(r.status >= 400, "status can't be PATCHed directly", `status ${r.status}`);
  r = await call(`/rest/v1/orders?id=eq.${orderId}`, { method: "PATCH", body: { payment_method: "qr", payment_status: "pagado", discount: 10 }, token: mgr });
  ok(r.status < 300, "manager records payment + discount", JSON.stringify(r.j).slice(0, 100));
  r = await call(`/rest/v1/orders?select=total&id=eq.${orderId}`, { token: mgr });
  ok(+r.j[0].total === 112, "total recomputed after discount (122-10)", JSON.stringify(r.j));
  r = await rpc("track_order", { p_token: token });
  ok(r.j.status === "entregado" && r.j.events.length === 6, "tracking shows the full timeline", `${r.j.status} ${r.j.events.length} events`);
  // reports + staff admin
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  r = await rpc("report_summary", { p_from: today, p_to: today }, owner);
  ok(r.status === 200 && r.j.orders >= 2, "owner report", `orders ${r.j.orders} revenue ${r.j.revenue}`);
  r = await rpc("report_summary", { p_from: today, p_to: today, p_store: "plan-3000" }, mgr);
  ok(r.status === 200 && r.j.by_store.every((x) => x.store === "Piraí"), "manager report is forced to own store");
  r = await rpc("report_summary", { p_from: today, p_to: today }, kit);
  ok(r.status >= 400, "kitchen has no reports");
  r = await rpc("admin_create_staff", { p_email: "x@zapipiza.bo", p_password: "12345678xx", p_full_name: "X", p_role: "cashier", p_store: "pirai" }, mgr);
  ok(r.status >= 400, "manager cannot create staff");
  r = await call(`/rest/v1/audit_log?select=action,entity&limit=3`, { token: mgr });
  ok(Array.isArray(r.j) && r.j.length === 0, "audit log hidden from managers");
  r = await call(`/rest/v1/audit_log?select=action,entity,entity_id&order=id.desc&limit=3`, { token: owner });
  ok(Array.isArray(r.j) && r.j.length > 0, "audit log has entries for owner", JSON.stringify(r.j).slice(0, 150));
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  console.log("cleanup codes:", code, plan);
})();
