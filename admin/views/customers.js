// Clientes (CRM): list with RFM-style segments + customer profile with history and editable fields.
import {
  sb, S, $, $$, esc, q, toast, errMsg, money, num, laDay, laDateTime, laDate, storeOpts, storeName, fmtPhone, waDigits, firstName,
  STATUS, CHANNEL, SERVICE, downloadCSV, empty, opts,
} from "../lib.js";
import { openOrder } from "./order-actions.js";

const SEG = {
  nuevo: { label: "Nuevo", cls: "seg--new" },
  frecuente: { label: "Frecuente", cls: "seg--freq" },
  vip: { label: "VIP", cls: "seg--vip" },
  riesgo: { label: "En riesgo", cls: "seg--risk" },
  perdido: { label: "Perdido", cls: "seg--lost" },
  ocasional: { label: "Ocasional", cls: "seg--occ" },
  sin_pedidos: { label: "Sin pedidos", cls: "seg--none" },
};
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : Infinity);

export function segmentsFor(list) {
  const spent = list.map((c) => +c.total_spent).filter((x) => x > 0).sort((a, b) => b - a);
  const top10 = spent.length ? spent[Math.max(0, Math.ceil(spent.length * 0.1) - 1)] : Infinity;
  return (c) => {
    const n = c.orders_count, d = daysSince(c.last_order_at), s = +c.total_spent;
    if (!n) return "sin_pedidos";
    if (d > 60) return "perdido";
    if (s >= 500 || (s >= top10 && spent.length >= 10)) return "vip";
    if (d >= 30 && n >= 2) return "riesgo";
    if (n >= 3 && d < 30) return "frecuente";
    if (n === 1) return "nuevo";
    return "ocasional";
  };
}

export async function render(el, [id]) {
  if (id) return profile(el, id);
  let list = [], seg = "", tag = "", store = "", optin = "", term = "", sort = "last";
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">CRM</p><h1>Clientes</h1></div>
      <div class="page__tools"><button class="btn btn--ghost btn--sm" id="csv">⬇ Exportar CSV</button></div></header>
    <div class="segbar" id="segbar"></div>
    <div class="filters card">
      <input type="search" id="term" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar cliente" />
      <select id="tag" aria-label="Etiqueta"><option value="">Todas las etiquetas</option></select>
      <select id="store" aria-label="Sucursal preferida">${storeOpts("", "Cualquier sucursal")}</select>
      <select id="optin" aria-label="Acepta promos">${opts({ yes: "Acepta promos", no: "No acepta promos" }, "", "Promos: todos")}</select>
      <select id="sort" aria-label="Ordenar">${opts({ last: "Último pedido", orders: "Más pedidos", spent: "Más gasto", name: "Nombre" }, "last")}</select>
    </div>
    <div class="card card--flush"><div class="tablewrap" id="table">${empty("Cargando clientes…", "⏳")}</div></div>
  </div>`;

  try {
    list = await q(sb.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(2000));
  } catch (e) { $("#table", el).innerHTML = empty(errMsg(e), "😵"); return; }
  const segOf = segmentsFor(list);
  list.forEach((c) => (c._seg = segOf(c)));
  const tags = [...new Set(list.flatMap((c) => c.tags || []))].sort();
  $("#tag", el).insertAdjacentHTML("beforeend", tags.map((t) => `<option>${esc(t)}</option>`).join(""));

  const filtered = () => {
    const t = term.toLowerCase().replace(/\s+/g, "");
    let r = list.filter((c) => (!seg || c._seg === seg) && (!tag || (c.tags || []).includes(tag)) && (!store || c.preferred_store === store)
      && (!optin || (optin === "yes") === !!c.marketing_opt_in)
      && (!t || `${c.name || ""}`.toLowerCase().replace(/\s+/g, "").includes(t) || c.phone.replace(/\D/g, "").includes(t.replace(/\D/g, "") || "§")));
    const by = { last: (a, b) => new Date(b.last_order_at || 0) - new Date(a.last_order_at || 0), orders: (a, b) => b.orders_count - a.orders_count,
      spent: (a, b) => b.total_spent - a.total_spent, name: (a, b) => String(a.name || "").localeCompare(b.name || "") };
    return r.sort(by[sort]);
  };
  function draw() {
    const counts = Object.fromEntries(Object.keys(SEG).map((k) => [k, list.filter((c) => c._seg === k).length]));
    $("#segbar", el).innerHTML = `<button class="segtile ${!seg ? "is-on" : ""}" data-seg=""><b>${list.length}</b><span>Todos</span></button>` +
      Object.entries(SEG).filter(([k]) => counts[k] || k !== "sin_pedidos").map(([k, s]) => `<button class="segtile ${s.cls} ${seg === k ? "is-on" : ""}" data-seg="${k}"><b>${counts[k]}</b><span>${s.label}</span></button>`).join("");
    const r = filtered();
    $("#table", el).innerHTML = r.length ? `<table class="table"><thead><tr><th>Cliente</th><th>Segmento</th><th class="num">Pedidos</th><th class="num">Gastado</th><th>Último pedido</th><th>Sucursal</th><th>Etiquetas</th></tr></thead>
      <tbody>${r.slice(0, 500).map((c) => `<tr data-href="#/clientes/${c.id}" tabindex="0">
        <td><b>${esc(c.name || "Sin nombre")}</b><small>${esc(fmtPhone(c.phone))}${c.blocked ? " · ⛔" : ""}</small></td>
        <td><span class="seg ${SEG[c._seg].cls}">${SEG[c._seg].label}</span></td>
        <td class="num">${c.orders_count}</td><td class="num">${esc(money(c.total_spent))}</td>
        <td>${esc(c.last_order_at ? laDay(c.last_order_at) : "—")}</td><td>${esc(storeName(c.preferred_store))}</td>
        <td>${(c.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</td></tr>`).join("")}</tbody></table>
      ${r.length > 500 ? `<p class="muted pad">Mostrando 500 de ${r.length}. Afiná la búsqueda.</p>` : ""}` : empty("No hay clientes con esos filtros.", "🔍");
  }
  el.addEventListener("click", (e) => {
    const s = e.target.closest("[data-seg]"); if (s) { seg = s.dataset.seg; draw(); return; }
    const tr = e.target.closest("[data-href]"); if (tr) location.hash = tr.dataset.href;
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset.href) location.hash = e.target.dataset.href; });
  $("#term", el).addEventListener("input", (e) => { term = e.target.value; draw(); });
  ["tag", "store", "optin", "sort"].forEach((idf) => $(`#${idf}`, el).addEventListener("change", (e) => { ({ tag: () => (tag = e.target.value), store: () => (store = e.target.value), optin: () => (optin = e.target.value), sort: () => (sort = e.target.value) })[idf](); draw(); }));
  $("#csv", el).addEventListener("click", () => downloadCSV(filtered().map((c) => ({
    nombre: c.name, telefono: c.phone, segmento: SEG[c._seg].label, pedidos: c.orders_count, gastado_bs: c.total_spent,
    ticket_promedio_bs: c.orders_count ? (c.total_spent / c.orders_count).toFixed(2) : "", primer_pedido: c.first_order_at ? laDate(c.first_order_at) : "",
    ultimo_pedido: c.last_order_at ? laDate(c.last_order_at) : "", sucursal: storeName(c.preferred_store), etiquetas: (c.tags || []).join(" "),
    acepta_promos: c.marketing_opt_in ? "si" : "no", email: c.email, cumpleanos: c.birthday, nit_ci: c.nit_ci, razon_social: c.razon_social,
  })), `clientes-zapi-${laDate()}.csv`));
  draw();
}

async function profile(el, id) {
  el.innerHTML = `<div class="page">${empty("Cargando ficha…", "⏳")}</div>`;
  let c, orders, addrs;
  try {
    [c, orders, addrs] = await Promise.all([
      q(sb.from("customers").select("*").eq("id", id).single()),
      q(sb.from("orders").select("id, code, order_no, created_at, status, total, store_id, channel, service, order_items(name, qty, item_id)").eq("customer_id", id).order("created_at", { ascending: false }).limit(200)),
      q(sb.from("customer_addresses").select("*").eq("customer_id", id).order("last_used_at", { ascending: false })),
    ]);
  } catch (e) { el.innerHTML = `<div class="page">${empty(errMsg(e), "😵")}</div>`; return; }
  const seg = segmentsFor([c])(c);
  const fav = {};
  orders.filter((o) => o.status !== "cancelado").forEach((o) => o.order_items.forEach((i) => (fav[i.name] = (fav[i.name] || 0) + i.qty)));
  const favs = Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const aov = c.orders_count ? c.total_spent / c.orders_count : 0;

  el.innerHTML = `<div class="page">
    <a class="back" href="#/clientes">← Clientes</a>
    <header class="page__head"><div><p class="eyebrow">${esc(fmtPhone(c.phone))}${c.alt_phone ? " · " + esc(c.alt_phone) : ""}</p>
      <h1>${esc(c.name || "Sin nombre")} <span class="seg ${SEG[seg].cls}">${SEG[seg].label}</span>${c.blocked ? ' <span class="seg seg--lost">Bloqueado</span>' : ""}</h1></div>
      <div class="page__tools"><a class="btn btn--wa" target="_blank" rel="noopener" href="https://wa.me/${waDigits(c.phone)}?text=${encodeURIComponent(`¡Hola ${firstName(c.name)}! Te escribimos de Zapi Piza 🍕`)}">WhatsApp</a></div></header>
    <div class="kpis">
      <div class="kpi"><span>Pedidos</span><b>${c.orders_count}</b></div>
      <div class="kpi"><span>Total gastado</span><b>${esc(money(c.total_spent))}</b></div>
      <div class="kpi"><span>Ticket promedio</span><b>${esc(money(aov))}</b></div>
      <div class="kpi"><span>Primer pedido</span><b class="sm">${esc(c.first_order_at ? laDay(c.first_order_at) : "—")}</b></div>
      <div class="kpi"><span>Último pedido</span><b class="sm">${esc(c.last_order_at ? laDay(c.last_order_at) : "—")}</b></div>
    </div>
    <div class="cols2">
      <form class="card" id="cf">
        <h2>Ficha</h2>
        <div class="grid2">
          <label>Nombre<input name="name" value="${esc(c.name || "")}" maxlength="80" /></label>
          <label>Teléfono alternativo<input name="alt_phone" value="${esc(c.alt_phone || "")}" /></label>
          <label>Email<input name="email" type="email" value="${esc(c.email || "")}" /></label>
          <label>Cumpleaños<input name="birthday" type="date" value="${esc(c.birthday || "")}" /></label>
          <label>NIT / CI<input name="nit_ci" value="${esc(c.nit_ci || "")}" /></label>
          <label>Razón social<input name="razon_social" value="${esc(c.razon_social || "")}" /></label>
          <label>Sucursal preferida<select name="preferred_store">${storeOpts(c.preferred_store, "—")}</select></label>
          <label>Etiquetas <small class="muted">(separadas por coma)</small><input name="tags" value="${esc((c.tags || []).join(", "))}" placeholder="vip, cumpleaños, empresa" /></label>
        </div>
        <label>Alergias / restricciones<input name="allergies" value="${esc(c.allergies || "")}" placeholder="Ej: sin cebolla, alergia al maní" /></label>
        <label>Notas internas<textarea name="notes" rows="3" maxlength="1000" placeholder="Vive en condominio, dejar en garita…">${esc(c.notes || "")}</textarea></label>
        <div class="checks">
          <label class="check"><input type="checkbox" name="marketing_opt_in" ${c.marketing_opt_in ? "checked" : ""}/> Acepta recibir promos por WhatsApp ${c.opt_in_at ? `<small class="muted">(desde ${esc(laDay(c.opt_in_at))}${c.opt_in_source ? ", " + esc(c.opt_in_source) : ""})</small>` : ""}</label>
          <label class="check"><input type="checkbox" name="blocked" ${c.blocked ? "checked" : ""}/> Bloqueado (no puede pedir por la web)</label>
        </div>
        <button class="btn btn--primary" type="submit">Guardar ficha</button>
      </form>
      <div>
        <section class="card"><h2>Favoritos</h2>${favs.length ? `<ol class="favs">${favs.map(([n, q2]) => `<li><span>${esc(n)}</span><b>${q2}×</b></li>`).join("")}</ol>` : `<p class="muted">Todavía sin historial.</p>`}</section>
        <section class="card"><h2>Direcciones</h2>${addrs.length ? `<ul class="addrs">${addrs.map((a) => `<li><b>${esc(a.address || "Pin de ubicación")}</b>${a.reference ? `<small>↪ ${esc(a.reference)}</small>` : ""}
          ${a.lat != null ? `<a href="https://www.google.com/maps?q=${a.lat},${a.lng}" target="_blank" rel="noopener">Mapa ↗</a>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Sin direcciones guardadas.</p>`}</section>
      </div>
    </div>
    <section class="card card--flush"><h2 class="pad">Historial de pedidos</h2>
      ${orders.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>Pedido</th><th>Fecha</th><th>Sucursal</th><th>Tipo</th><th>Estado</th><th>Productos</th><th class="num">Total</th></tr></thead>
      <tbody>${orders.map((o) => `<tr data-order="${o.id}" tabindex="0"><td><b>${esc(o.code)}</b></td><td>${esc(laDateTime(o.created_at))}</td><td>${esc(storeName(o.store_id))}</td>
        <td>${esc(SERVICE[o.service])} · ${esc(CHANNEL[o.channel])}</td><td><span class="pill pill--${o.status}">${esc(STATUS[o.status])}</span></td>
        <td class="muted">${esc(o.order_items.map((i) => `${i.qty}× ${i.name}`).join(", "))}</td><td class="num">${esc(money(o.total))}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted pad">Sin pedidos visibles para tu sucursal.</p>`}
    </section>
  </div>`;
  el.onclick = (e) => { const tr = e.target.closest("[data-order]"); if (tr) openOrder(tr.dataset.order, () => {}); };
  $("#cf", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, v = (n) => f.elements[n].value.trim() || null;
    const optIn = f.elements.marketing_opt_in.checked;
    const patch = {
      name: v("name"), alt_phone: v("alt_phone"), email: v("email"), birthday: v("birthday"), nit_ci: v("nit_ci"), razon_social: v("razon_social"),
      preferred_store: v("preferred_store"), allergies: v("allergies"), notes: v("notes"), blocked: f.elements.blocked.checked, marketing_opt_in: optIn,
      tags: [...new Set((f.elements.tags.value || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    };
    if (optIn && !c.marketing_opt_in) { patch.opt_in_at = new Date().toISOString(); patch.opt_in_source = `backoffice (${S.staff.full_name})`; }
    if (!optIn && c.marketing_opt_in) { patch.opt_in_at = null; patch.opt_in_source = null; }
    try { await q(sb.from("customers").update(patch).eq("id", id)); toast("Ficha guardada"); profile(el, id); }
    catch (err) { toast(errMsg(err), "err"); }
  });
}
