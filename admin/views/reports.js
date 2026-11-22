// Reportes: KPIs vs targets, SVG charts, CSV export (report_summary RPC + orders query).
import { sb, S, $, esc, q, toast, errMsg, money, num, laDate, addDays, storeOpts, isAdmin, myStore, storeName, CHANNEL, SERVICE, STATUS, PAYMENT, PAY_STATUS, downloadCSV, empty, laDateTime } from "../lib.js";

// targets from the ops research (prep ≤15, OTD ≤20, delivery ≤35–40, cancel <3%)
const TARGET = { prep: 15, otd: 20, delivery: 40, cancel: 3, late: 20 };

export function kpiTiles(r) {
  const flag = (v, t, lowerIsBetter = true) => (v == null ? "" : (lowerIsBetter ? v <= t : v >= t) ? "kpi--good" : "kpi--bad");
  const mins = (v) => (v == null ? "—" : `${num(v, 1)} min`);
  return `<div class="kpis">
    <div class="kpi kpi--hero"><span>Ventas</span><b>${esc(money(r.revenue))}</b></div>
    <div class="kpi"><span>Pedidos</span><b>${num(r.orders)}</b></div>
    <div class="kpi"><span>Ticket promedio</span><b>${esc(money(r.aov))}</b></div>
    <div class="kpi"><span>Clientes</span><b>${num(r.customers)}</b><small>${num(r.new_customers)} nuevos</small></div>
    <div class="kpi ${flag(r.cancel_rate, TARGET.cancel)}"><span>Cancelados</span><b>${num(r.cancel_rate, 1)}%</b><small>${num(r.cancelled)} · meta &lt; ${TARGET.cancel}%</small></div>
    <div class="kpi ${flag(r.avg_prep_min, TARGET.prep)}"><span>Preparación</span><b>${mins(r.avg_prep_min)}</b><small>meta ≤ ${TARGET.prep} min</small></div>
    <div class="kpi ${flag(r.avg_otd_min, TARGET.otd)}"><span>Salida (OTD)</span><b>${mins(r.avg_otd_min)}</b><small>meta ≤ ${TARGET.otd} min</small></div>
    <div class="kpi ${flag(r.avg_delivery_min, TARGET.delivery)}"><span>Entrega</span><b>${mins(r.avg_delivery_min)}</b><small>meta ≤ 35–40 min · ${num(r.late_pct, 1)}% tarde</small></div>
  </div>`;
}

function bars(rows, { label, value, fmt = (v) => num(v), max, color = "var(--red)", h = 180 }) {
  if (!rows.length) return `<p class="muted">Sin datos en el período.</p>`;
  const W = 640, pad = 28, bw = (W - pad) / rows.length, top = max || Math.max(...rows.map(value), 1);
  return `<svg class="chart" viewBox="0 0 ${W} ${h + 34}" role="img" aria-label="Gráfico">
    ${[0.25, 0.5, 0.75, 1].map((f) => `<line x1="${pad}" x2="${W}" y1="${h - h * f + 8}" y2="${h - h * f + 8}" class="chart__grid"/>`).join("")}
    ${rows.map((r, i) => {
      const v = value(r), bh = Math.max(2, (v / top) * h), x = pad + i * bw + bw * 0.14, w = bw * 0.72;
      return `<g><rect x="${x}" y="${h - bh + 8}" width="${w}" height="${bh}" rx="4" fill="${color}"><title>${esc(label(r))}: ${esc(fmt(v))}</title></rect>
        ${rows.length <= 16 ? `<text x="${x + w / 2}" y="${h - bh + 2}" class="chart__val">${esc(fmt(v))}</text>` : ""}
        <text x="${x + w / 2}" y="${h + 26}" class="chart__lbl">${esc(label(r))}</text></g>`;
    }).join("")}
  </svg>`;
}
function hbars(rows, { label, value, fmt = (v) => num(v) }) {
  if (!rows.length) return `<p class="muted">Sin datos.</p>`;
  const top = Math.max(...rows.map(value), 1);
  return `<ul class="hbars">${rows.map((r) => `<li><span>${esc(label(r))}</span><i style="--w:${(value(r) / top) * 100}%"></i><b>${esc(fmt(value(r)))}</b></li>`).join("")}</ul>`;
}

export async function render(el) {
  const today = laDate();
  const PRE = {
    hoy: () => [today, today], ayer: () => [addDays(today, -1), addDays(today, -1)], "7d": () => [addDays(today, -6), today],
    mes: () => [today.slice(0, 8) + "01", today],
    mespasado: () => { const d = new Date(today.slice(0, 8) + "01T12:00:00Z"); d.setUTCDate(0); const end = d.toISOString().slice(0, 10); return [end.slice(0, 8) + "01", end]; },
  };
  let [from, to] = PRE["7d"](), store = isAdmin() ? "" : myStore(), preset = "7d";
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">Ventas y operación</p><h1>Reportes</h1></div>
      <div class="page__tools"><button class="btn btn--ghost btn--sm" id="csv">⬇ Pedidos (CSV)</button></div></header>
    <div class="filters card">
      <div class="chips" id="pre">${Object.entries({ hoy: "Hoy", ayer: "Ayer", "7d": "7 días", mes: "Este mes", mespasado: "Mes pasado" }).map(([k, l]) => `<button class="chip ${k === preset ? "is-on" : ""}" data-pre="${k}">${l}</button>`).join("")}</div>
      <label class="inline">Desde<input type="date" id="from" value="${from}" /></label><label class="inline">Hasta<input type="date" id="to" value="${to}" /></label>
      ${isAdmin() ? `<select id="store" aria-label="Sucursal">${storeOpts("", "Todas las sucursales")}</select>` : `<span class="chip">${esc(storeName(store))}</span>`}
    </div>
    <div id="out">${empty("Calculando…", "⏳")}</div>
  </div>`;
  const out = $("#out", el);

  async function load() {
    out.innerHTML = empty("Calculando…", "⏳");
    let r;
    try { r = await q(sb.rpc("report_summary", { p_from: from, p_to: to, p_store: store || null })); }
    catch (e) { out.innerHTML = empty(errMsg(e), "😵"); return; }
    const days = r.by_day || [], hours = Array.from({ length: 24 }, (_, h) => (r.by_hour || []).find((x) => x.hour === h) || { hour: h, orders: 0 }).filter((x) => x.hour >= 10);
    out.innerHTML = `${kpiTiles(r)}
      <div class="cols2">
        <section class="card"><h2>Ventas por día</h2>${bars(days, { label: (d) => d.day.slice(8, 10) + "/" + d.day.slice(5, 7), value: (d) => +d.revenue, fmt: (v) => (v >= 1000 ? num(v / 1000, 1) + "k" : num(v)) })}</section>
        <section class="card"><h2>Pedidos por hora</h2>${bars(hours, { label: (d) => d.hour + "h", value: (d) => +d.orders, color: "var(--mustard-2)" })}</section>
      </div>
      <div class="cols3">
        ${isAdmin() && !store ? `<section class="card"><h2>Por sucursal</h2>${hbars(r.by_store || [], { label: (x) => x.store, value: (x) => +x.revenue, fmt: money })}</section>` : ""}
        <section class="card"><h2>Por canal</h2>${hbars(r.by_channel || [], { label: (x) => CHANNEL[x.channel] || x.channel, value: (x) => +x.orders, fmt: (v) => `${num(v)} ped.` })}</section>
        <section class="card"><h2>Por tipo</h2>${hbars(r.by_service || [], { label: (x) => SERVICE[x.service] || x.service, value: (x) => +x.orders, fmt: (v) => `${num(v)} ped.` })}</section>
        <section class="card"><h2>Motivos de cancelación</h2>${hbars(r.cancel_reasons || [], { label: (x) => x.reason, value: (x) => +x.orders })}</section>
      </div>
      <section class="card card--flush"><h2 class="pad">Productos más vendidos</h2>
        ${(r.top_items || []).length ? `<div class="tablewrap"><table class="table"><thead><tr><th>#</th><th>Producto</th><th class="num">Unidades</th><th class="num">Ventas</th></tr></thead>
        <tbody>${r.top_items.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.name)}</td><td class="num">${num(t.qty)}</td><td class="num">${esc(money(t.revenue))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted pad">Sin ventas en el período.</p>`}
      </section>`;
  }
  el.addEventListener("click", (e) => {
    const p = e.target.closest("[data-pre]");
    if (!p) return;
    preset = p.dataset.pre; [from, to] = PRE[preset]();
    $("#from", el).value = from; $("#to", el).value = to;
    el.querySelectorAll("[data-pre]").forEach((b) => b.classList.toggle("is-on", b === p));
    load();
  });
  ["from", "to"].forEach((idf) => $(`#${idf}`, el).addEventListener("change", () => {
    from = $("#from", el).value; to = $("#to", el).value;
    if (from > to) [from, to] = [to, from];
    el.querySelectorAll("[data-pre]").forEach((b) => b.classList.remove("is-on"));
    load();
  }));
  $("#store", el)?.addEventListener("change", (e) => { store = e.target.value; load(); });
  $("#csv", el).addEventListener("click", async () => {
    try {
      let query = sb.from("orders").select("*, order_items(name, qty, unit_price, line_total)").gte("business_day", from).lte("business_day", to).order("created_at").limit(5000);
      if (store) query = query.eq("store_id", store);
      const rows = await q(query);
      downloadCSV(rows.map((o) => ({
        codigo: o.code, numero: o.order_no, dia: o.business_day, hora: laDateTime(o.created_at), sucursal: storeName(o.store_id), canal: CHANNEL[o.channel],
        tipo: SERVICE[o.service], estado: STATUS[o.status], cliente: o.customer_name, telefono: o.customer_phone, productos: o.order_items.map((i) => `${i.qty}x ${i.name}`).join(" | "),
        subtotal: o.subtotal, envio: o.delivery_fee, descuento: o.discount, total: o.total, pago: PAYMENT[o.payment_method] || "", estado_pago: PAY_STATUS[o.payment_status],
        motivo_cancelacion: o.cancel_reason || "", nit_ci: o.nit_ci || "", razon_social: o.razon_social || "", factura: o.invoice_requested ? "si" : "no",
        prep_min: o.ready_at ? Math.round((new Date(o.ready_at) - new Date(o.confirmed_at || o.created_at)) / 60000) : "",
        entrega_min: o.delivered_at ? Math.round((new Date(o.delivered_at) - new Date(o.created_at)) / 60000) : "",
      })), `pedidos-zapi-${from}_${to}.csv`);
    } catch (e) { toast(errMsg(e), "err"); }
  });
  await load();
}
