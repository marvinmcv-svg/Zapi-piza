// Hoy: today's KPIs, live counts per status, store status, latest orders.
import { sb, S, $, esc, q, errMsg, money, laDate, laTime, storeState, isAdmin, myStore, storeName, STATUS, SERVICE, CHANNEL, firstName, empty } from "../lib.js";
import { kpiTiles } from "./reports.js";
import { openOrder } from "./order-actions.js";

export async function render(el) {
  const store = isAdmin() ? "" : myStore();
  const hour = +new Date().toLocaleTimeString("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", hour12: false });
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">${esc(new Date().toLocaleDateString("es-BO", { timeZone: "America/La_Paz", weekday: "long", day: "numeric", month: "long" }))}</p>
      <h1>${hour < 12 ? "¡Buen día" : hour < 19 ? "¡Buenas tardes" : "¡Buenas noches"}, ${esc(firstName(S.staff.full_name))}!</h1></div>
      <div class="page__tools"><a class="btn btn--primary btn--sm" href="#/pedidos">Ir al tablero →</a></div></header>
    <div id="k">${empty("Cargando…", "⏳")}</div>
    <div class="cols2">
      <section class="card"><h2>En curso ahora</h2><div id="flow"></div></section>
      <section class="card"><h2>${isAdmin() ? "Sucursales" : "Tu sucursal"}</h2><div id="st"></div></section>
    </div>
    <section class="card card--flush"><h2 class="pad">Últimos pedidos</h2><div id="last"></div></section>
  </div>`;

  async function load() {
    const today = laDate();
    let oq = sb.from("orders").select("id, code, order_no, status, total, store_id, service, channel, customer_name, created_at")
      .or(`status.not.in.(entregado,cancelado),business_day.eq.${today}`).order("created_at", { ascending: false }).limit(300);
    if (store) oq = oq.eq("store_id", store);
    try {
      const [r, orders, stores] = await Promise.all([
        q(sb.rpc("report_summary", { p_from: today, p_to: today, p_store: store || null })),
        q(oq), q(sb.from("stores").select("*").order("sort")),
      ]);
      $("#k", el).innerHTML = kpiTiles(r);
      const live = ["nuevo", "confirmado", "en_preparacion", "en_horno", "listo", "en_camino"];
      $("#flow", el).innerHTML = `<div class="flow">${live.map((s) => `<a href="#/pedidos" class="flow__step pill--${s}"><b>${orders.filter((o) => o.status === s).length}</b><span>${esc(STATUS[s])}</span></a>`).join("")}</div>`;
      $("#st", el).innerHTML = `<ul class="stlist">${stores.filter((s) => !store || s.id === store).map((s) => {
        const st = storeState(s), n = orders.filter((o) => o.store_id === s.id && live.includes(o.status)).length;
        return `<li><b>${esc(s.name)}</b><span class="pill pill--st-${st.cls}">${esc(st.text)}</span><em>${n} en curso</em></li>`;
      }).join("")}</ul>`;
      $("#last", el).innerHTML = orders.length ? `<div class="tablewrap"><table class="table"><tbody>${orders.slice(0, 10).map((o) => `<tr data-order="${o.id}" tabindex="0">
        <td><b>#${o.order_no ?? "—"}</b> <small>${esc(o.code)}</small></td><td>${esc(laTime(o.created_at))}</td><td>${esc(firstName(o.customer_name))}</td>
        <td>${esc(storeName(o.store_id))}</td><td>${esc(SERVICE[o.service])} · ${esc(CHANNEL[o.channel])}</td>
        <td><span class="pill pill--${o.status}">${esc(STATUS[o.status])}</span></td><td class="num">${esc(money(o.total))}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted pad">Todavía no hay pedidos hoy.</p>`;
    } catch (e) { $("#k", el).innerHTML = empty(errMsg(e), "😵"); }
  }
  el.addEventListener("click", (e) => { const tr = e.target.closest("[data-order]"); if (tr) openOrder(tr.dataset.order, load); });
  let t;
  const ch = sb.channel(`home-${Date.now()}`).on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { clearTimeout(t); t = setTimeout(load, 800); }).subscribe();
  await load();
  return () => sb.removeChannel(ch);
}
