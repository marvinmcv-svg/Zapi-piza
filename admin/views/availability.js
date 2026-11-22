// Disponibilidad ("86"): mark items sold out per store. Big touch targets for the kitchen tablet.
import { sb, S, $, $$, esc, q, toast, errMsg, money, storeOpts, isAdmin, myStore, storeName, CATEGORY, empty } from "../lib.js";

const CAT_ORDER = ["combo", "promo", "clasica", "eco", "especial", "premium", "jr", "drink", "borde", "extra", "salsa"];

export async function render(el) {
  let store = myStore() || localStorage.getItem("zapi.admin.store") || S.stores[0]?.id;
  let out = new Set(), cat = "all", term = "";
  const menu = S.menu.filter((m) => m.active);
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">Productos agotados ("86")</p><h1>Disponibilidad</h1></div>
      <div class="page__tools">${isAdmin() ? `<select id="store" aria-label="Sucursal">${storeOpts(store)}</select>` : `<span class="chip">${esc(storeName(store))}</span>`}</div></header>
    <p class="muted">Lo agotado no se puede pedir por la web, Zap-IA ni en "Nuevo pedido" de esta sucursal.</p>
    <div class="filters card"><input type="search" id="term" placeholder="Buscar producto…" aria-label="Buscar" />
      <div class="chips" id="cats"><button class="chip is-on" data-cat="all">Todo</button>${CAT_ORDER.filter((c) => menu.some((m) => m.category === c)).map((c) => `<button class="chip" data-cat="${c}">${esc(CATEGORY[c])}</button>`).join("")}</div>
      <span class="chip chip--warn" id="count"></span></div>
    <div class="avail" id="list">${empty("Cargando…", "⏳")}</div>
  </div>`;

  async function load() {
    const rows = await q(sb.from("store_item_availability").select("item_id, available").eq("store_id", store));
    out = new Set(rows.filter((r) => !r.available).map((r) => r.item_id));
    draw();
  }
  function draw() {
    const t = term.toLowerCase();
    const list = menu.filter((m) => (cat === "all" || m.category === cat) && (!t || m.name.toLowerCase().includes(t)));
    $("#count", el).textContent = `${out.size} agotado${out.size === 1 ? "" : "s"}`;
    $("#list", el).innerHTML = list.length ? list.map((m) => `<button class="avail__item ${out.has(m.id) ? "is-out" : ""}" data-item="${esc(m.id)}" aria-pressed="${out.has(m.id)}">
      <span><b>${esc(m.name)}</b><small>${esc(CATEGORY[m.category] || "")} · ${esc(money(m.price))}</small></span>
      <em>${out.has(m.id) ? "Agotado" : "Disponible"}</em></button>`).join("") : empty("Nada coincide.");
  }
  el.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-cat]");
    if (c) { cat = c.dataset.cat; $$("#cats .chip", el).forEach((b) => b.classList.toggle("is-on", b === c)); return draw(); }
    const b = e.target.closest("[data-item]");
    if (!b) return;
    const id = b.dataset.item, available = out.has(id);
    b.disabled = true;
    try {
      await q(sb.from("store_item_availability").upsert({ store_id: store, item_id: id, available, updated_by: S.user.id, updated_at: new Date().toISOString() }));
      available ? out.delete(id) : out.add(id);
      toast(`${S.menu.find((m) => m.id === id).name}: ${available ? "disponible" : "agotado"}`, available ? "ok" : "warn");
      draw();
    } catch (err) { toast(errMsg(err), "err"); b.disabled = false; }
  });
  $("#term", el).addEventListener("input", (e) => { term = e.target.value.trim(); draw(); });
  $("#store", el)?.addEventListener("change", (e) => { store = e.target.value; load(); });
  const ch = sb.channel(`avail-${Date.now()}`).on("postgres_changes", { event: "*", schema: "public", table: "store_item_availability" }, (p) => { if ((p.new || p.old)?.store_id === store) load(); }).subscribe();
  await load();
  return () => sb.removeChannel(ch);
}
