// Pedidos: live kanban board per store (Supabase Realtime + refetch on reconnect/visibility).
import {
  sb, S, $, $$, esc, q, toast, errMsg, money, laDate, laTime, minutesSince, firstName, beep, storeOpts, isAdmin, myStore, storeName,
  STATUS, CHANNEL, SERVICE, PAYMENT, nextStatus, NEXT_LABEL, canSetStatus, hasRole, empty, isManager,
} from "../lib.js";
import { advance, cancelOrder, openOrder } from "./order-actions.js";

const COLS = [
  { key: "nuevo", label: "Nuevo", st: ["nuevo"] },
  { key: "confirmado", label: "Confirmado", st: ["confirmado"] },
  { key: "prep", label: "Preparando", st: ["en_preparacion", "en_horno"] },
  { key: "listo", label: "Listo", st: ["listo"] },
  { key: "en_camino", label: "En camino", st: ["en_camino"] },
  { key: "entregado", label: "Entregados hoy", st: ["entregado"], done: true },
  { key: "cancelado", label: "Cancelados hoy", st: ["cancelado"], done: true },
];
const STORE_KEY = "zapi.admin.store";

export async function render(el) {
  let store = isAdmin() ? localStorage.getItem(STORE_KEY) || "" : myStore();
  let orders = [], known = new Set(), first = true, mobileCol = hasRole("rider") ? "listo" : "nuevo", showDone = false, newCount = 0;
  const notifOk = "Notification" in window && Notification.permission === "granted";

  el.innerHTML = `<div class="page page--board">
    <header class="page__head">
      <div><p class="eyebrow">Tablero en vivo</p><h1>Pedidos <span class="live" id="live" title="Conexión en vivo"><i></i>en vivo</span></h1></div>
      <div class="page__tools">
        ${isAdmin() ? `<select id="store" aria-label="Sucursal">${storeOpts(store, "Todas las sucursales")}</select>` : `<span class="chip">${esc(storeName(store))}</span>`}
        <label class="switch"><input type="checkbox" id="done" /><span>Ver cerrados</span></label>
        ${"Notification" in window && !notifOk ? `<button class="btn btn--ghost btn--sm" id="notif">🔔 Activar avisos</button>` : ""}
        ${hasRole("owner", "admin", "manager", "cashier") ? `<a class="btn btn--primary btn--sm" href="#/nuevo">+ Nuevo pedido</a>` : ""}
      </div>
    </header>
    <nav class="coltabs" id="coltabs" aria-label="Columnas"></nav>
    <div class="board" id="board">${empty("Cargando pedidos…", "⏳")}</div>
  </div>`;
  const board = $("#board", el), tabs = $("#coltabs", el);

  async function fetchOrders() {
    const today = laDate();
    let query = sb.from("orders").select("*, order_items(name, qty, notes)")
      .or(`status.not.in.(entregado,cancelado),business_day.eq.${today}`)
      .order("created_at", { ascending: true }).limit(400);
    if (store) query = query.eq("store_id", store);
    try {
      const data = await q(query);
      const fresh = data.filter((o) => !known.has(o.id));
      if (!first && fresh.some((o) => o.status === "nuevo")) alertNew(fresh.filter((o) => o.status === "nuevo"));
      data.forEach((o) => known.add(o.id));
      orders = data; first = false;
      draw();
    } catch (e) { toast(errMsg(e), "err"); }
  }

  function alertNew(list) {
    beep();
    newCount += list.length;
    const badge = $("#nav-new");
    if (badge) { badge.hidden = false; badge.textContent = newCount; }
    document.title = `(${newCount}) Pedidos · Zapi`;
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      list.forEach((o) => new Notification(`Nuevo pedido ${o.code}`, { body: `${storeName(o.store_id)} · ${SERVICE[o.service]} · ${money(o.total)}`, icon: "/assets/brand/icon-192.png" }));
    }
    list.forEach((o) => setTimeout(() => $(`[data-id="${o.id}"]`, board)?.classList.add("is-new"), 50));
  }
  const clearNew = () => { newCount = 0; const b = $("#nav-new"); if (b) b.hidden = true; document.title = "Pedidos · Zapi"; };

  const ageClass = (o) => {
    if (["entregado", "cancelado"].includes(o.status)) return "done";
    const ref = o.scheduled_for && new Date(o.scheduled_for) > new Date(o.created_at) ? o.scheduled_for : o.created_at;
    const m = minutesSince(ref);
    return m < 0 ? "future" : m < 10 ? "g" : m < 20 ? "a" : "r";
  };
  const ageText = (o) => {
    const ref = o.scheduled_for && new Date(o.scheduled_for) > new Date(o.created_at) ? o.scheduled_for : o.created_at;
    const m = minutesSince(ref);
    return m < 0 ? `en ${-m} min` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60}`;
  };

  function card(o) {
    const n = nextStatus(o);
    const canNext = n && canSetStatus(n) && !["entregado", "cancelado"].includes(o.status);
    const items = (o.order_items || []);
    return `<article class="ocard age--${ageClass(o)}" data-id="${o.id}" tabindex="0">
      <header><b class="ocard__no">#${o.order_no ?? "—"}</b><span class="ocard__code">${esc(o.code)}</span><span class="ocard__age" data-age="${o.id}">${esc(ageText(o))}</span></header>
      <div class="ocard__badges">
        <span class="b b--${o.service}">${esc(SERVICE[o.service])}</span><span class="b">${esc(CHANNEL[o.channel])}</span>
        ${!store ? `<span class="b b--store">${esc(storeName(o.store_id))}</span>` : ""}
        ${o.scheduled_for ? `<span class="b b--sched">⏰ ${esc(laTime(o.scheduled_for))}</span>` : ""}
        ${o.status === "en_horno" ? `<span class="b b--oven">🔥 horno</span>` : ""}
        ${o.possible_duplicate ? `<span class="b b--warn">⚠ posible duplicado</span>` : ""}
      </div>
      <p class="ocard__cust">${esc(firstName(o.customer_name))}${o.service === "delivery" && o.address ? ` · <span class="muted">${esc(o.address.slice(0, 34))}</span>` : ""}</p>
      <ul class="ocard__items">${items.slice(0, 6).map((i) => `<li><b>${i.qty}×</b> ${esc(i.name)}${i.notes ? ` <i>· ${esc(i.notes)}</i>` : ""}</li>`).join("")}${items.length > 6 ? `<li class="muted">+${items.length - 6} más…</li>` : ""}</ul>
      ${o.notes ? `<p class="ocard__note">📝 ${esc(o.notes)}</p>` : ""}
      <footer>
        <span class="ocard__total">${esc(money(o.total))}</span>
        <span class="pay pay--${o.payment_status}">${o.payment_method ? esc(PAYMENT[o.payment_method]) : "Pago ?"}${o.payment_status === "pagado" ? " ✓" : ""}</span>
      </footer>
      <div class="ocard__actions">
        ${canNext ? `<button class="btn btn--next" data-next="${o.id}">${esc(NEXT_LABEL[n])} →</button>` : ""}
        ${!["entregado", "cancelado"].includes(o.status) && !hasRole("rider") && (["nuevo", "confirmado"].includes(o.status) || isManager()) ? `<button class="iconbtn" data-cancel="${o.id}" title="Cancelar" aria-label="Cancelar ${esc(o.code)}">✕</button>` : ""}
        <button class="iconbtn" data-open="${o.id}" title="Detalle" aria-label="Ver detalle ${esc(o.code)}">⋯</button>
      </div>
    </article>`;
  }

  function draw() {
    const cols = COLS.filter((c) => showDone || !c.done);
    tabs.innerHTML = cols.map((c) => {
      const n = orders.filter((o) => c.st.includes(o.status)).length;
      return `<button data-col="${c.key}" class="${c.key === mobileCol ? "is-on" : ""}">${esc(c.label)} <b>${n}</b></button>`;
    }).join("");
    if (!cols.find((c) => c.key === mobileCol)) mobileCol = cols[0].key;
    board.style.setProperty("--cols", cols.length);
    board.innerHTML = cols.map((c) => {
      const list = orders.filter((o) => c.st.includes(o.status));
      if (c.done) list.reverse();
      return `<section class="col col--${c.key} ${c.key === mobileCol ? "is-on" : ""}" aria-label="${esc(c.label)}">
        <h2>${esc(c.label)} <b>${list.length}</b></h2>
        <div class="col__list">${list.length ? list.map(card).join("") : `<p class="col__empty">Sin pedidos</p>`}</div>
      </section>`;
    }).join("");
  }

  // live age timers without full re-render
  const ticker = setInterval(() => {
    orders.forEach((o) => {
      const a = $(`[data-age="${o.id}"]`, board);
      if (!a) return;
      a.textContent = ageText(o);
      const c = a.closest(".ocard");
      c.className = c.className.replace(/age--\w+/, `age--${ageClass(o)}`);
    });
  }, 20000);

  board.addEventListener("click", async (e) => {
    const nx = e.target.closest("[data-next]"), cx = e.target.closest("[data-cancel]"), ox = e.target.closest("[data-open]");
    const find = (id) => orders.find((o) => o.id === id);
    if (nx) { nx.disabled = true; nx.textContent = "…"; if (await advance(find(nx.dataset.next))) fetchOrders(); else draw(); return; }
    if (cx) { if (await cancelOrder(find(cx.dataset.cancel))) fetchOrders(); return; }
    const c = ox || e.target.closest(".ocard");
    if (c) { clearNew(); c.classList.remove("is-new"); openOrder(c.dataset.open || c.dataset.id, fetchOrders); }
  });
  board.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".ocard")) openOrder(e.target.dataset.id, fetchOrders); });
  tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-col]"); if (b) { mobileCol = b.dataset.col; draw(); } });
  $("#store", el)?.addEventListener("change", (e) => { store = e.target.value; localStorage.setItem(STORE_KEY, store); known.clear(); first = true; subscribe(); fetchOrders(); });
  $("#done", el).addEventListener("change", (e) => { showDone = e.target.checked; draw(); });
  $("#notif", el)?.addEventListener("click", async (e) => { const p = await Notification.requestPermission(); if (p === "granted") { e.target.remove(); toast("Avisos activados"); } });
  el.addEventListener("pointerdown", clearNew);

  // realtime
  let channel, debounce;
  const live = $("#live", el);
  const queue = () => { clearTimeout(debounce); debounce = setTimeout(fetchOrders, 700); };
  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel(`board-${store || "all"}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(store ? { filter: `store_id=eq.${store}` } : {}) }, queue)
      .subscribe((status) => {
        live.classList.toggle("is-off", status !== "SUBSCRIBED");
        if (status === "SUBSCRIBED") queue();
      });
  }
  const onVis = () => { if (!document.hidden) fetchOrders(); };
  document.addEventListener("visibilitychange", onVis);
  const poll = setInterval(fetchOrders, 60000); // safety net if a realtime event is missed

  subscribe();
  await fetchOrders();
  return () => {
    clearInterval(ticker); clearInterval(poll); clearTimeout(debounce);
    document.removeEventListener("visibilitychange", onVis);
    if (channel) sb.removeChannel(channel);
    document.title = "Zapi Backoffice";
  };
}
