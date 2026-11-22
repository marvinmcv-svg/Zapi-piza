// Nuevo pedido: fast manual entry for phone / walk-in / WhatsApp / Yango orders (place_order RPC, server-priced).
import {
  sb, S, $, $$, esc, q, toast, errMsg, money, storeOpts, opts, isAdmin, myStore, CHANNEL, SERVICE, PAYMENT, CATEGORY,
  normalizePhone, fmtPhone, uuid, storeName,
} from "../lib.js";

const CAT_ORDER = ["combo", "promo", "clasica", "eco", "especial", "premium", "jr", "drink", "borde", "extra", "salsa"];

export async function render(el) {
  let store = myStore() || localStorage.getItem("zapi.admin.store") || S.stores[0]?.id;
  let cart = {}, soldOut = new Set(), cat = "all", search = "", clientRef = uuid(), busy = false;
  const menu = S.menu.filter((m) => m.active);
  const byId = Object.fromEntries(menu.map((m) => [m.id, m]));
  const cats = CAT_ORDER.filter((c) => menu.some((m) => m.category === c));

  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">Teléfono · mostrador · WhatsApp · Yango</p><h1>Nuevo pedido</h1></div></header>
    <form class="neworder" id="nf" autocomplete="off">
      <div class="neworder__main">
        <section class="card">
          <div class="grid3">
            <label>Sucursal${isAdmin() ? `<select name="store">${storeOpts(store)}</select>` : `<input value="${esc(storeName(store))}" disabled />`}</label>
            <label>Canal<select name="channel">${opts({ telefono: CHANNEL.telefono, local: CHANNEL.local, whatsapp: CHANNEL.whatsapp, yango: CHANNEL.yango }, "telefono")}</select></label>
            <label>Tipo<div class="seg" role="radiogroup">${Object.entries(SERVICE).map(([v, l], i) => `<label><input type="radio" name="service" value="${v}" ${i === 1 ? "checked" : ""}/><span>${esc(l)}</span></label>`).join("")}</div></label>
          </div>
          <div class="grid3">
            <label>WhatsApp / teléfono<input name="phone" inputmode="tel" placeholder="7xxxxxxx" /><small class="hint" id="phint"></small></label>
            <label>Nombre<input name="name" placeholder="¿A nombre de quién?" /></label>
            <label>Hora <small class="muted">(vacío = lo antes posible)</small><input name="time" type="time" step="300" /></label>
          </div>
          <div class="grid2" data-delivery hidden>
            <label>Dirección<input name="address" placeholder="Calle, número, barrio / anillo" list="addr-list" /><datalist id="addr-list"></datalist></label>
            <label>Referencia<input name="reference" placeholder="Portón rojo, frente a…" /></label>
          </div>
        </section>

        <section class="card">
          <div class="picker__bar">
            <input type="search" id="search" placeholder="Buscar producto… (/)" aria-label="Buscar producto" />
            <div class="chips" id="cats"><button type="button" class="chip is-on" data-cat="all">Todo</button>${cats.map((c) => `<button type="button" class="chip" data-cat="${c}">${esc(CATEGORY[c] || c)}</button>`).join("")}</div>
          </div>
          <div class="picker" id="picker"></div>
        </section>
      </div>

      <aside class="neworder__side card">
        <h2>Resumen</h2>
        <ul class="sum" id="sum"></ul>
        <p class="sum__total"><span>Total</span><b id="total">Bs 0</b></p>
        <p class="muted small">El total final lo calcula el sistema con los precios vigentes.</p>
        <div class="grid2">
          <label>Pago<select name="payment">${opts(PAYMENT, "", "A definir")}</select></label>
          <label>Paga con<input name="change" type="number" min="0" placeholder="Bs" /></label>
        </div>
        <label>Nota para la cocina<textarea name="notes" rows="2" maxlength="500" placeholder="Sin cebolla, cortada en 12…"></textarea></label>
        <details><summary>Factura (NIT / razón social)</summary>
          <div class="grid2"><label>NIT / CI<input name="nit" /></label><label>Razón social<input name="rs" /></label></div>
        </details>
        <button class="btn btn--primary btn--lg btn--block" type="submit" id="submit">Crear pedido</button>
        <button class="btn btn--ghost btn--block" type="button" id="clear">Limpiar</button>
      </aside>
    </form>
  </div>`;
  const f = $("#nf", el), picker = $("#picker", el);

  async function loadAvailability() {
    const rows = await q(sb.from("store_item_availability").select("item_id, available").eq("store_id", store)).catch(() => []);
    soldOut = new Set(rows.filter((r) => !r.available).map((r) => r.item_id));
    Object.keys(cart).forEach((id) => { if (soldOut.has(id)) delete cart[id]; });
    drawPicker(); drawSum();
  }

  function drawPicker() {
    const s = search.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const match = (m) => (cat === "all" || m.category === cat) &&
      (!s || `${m.name} ${m.description || ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(s));
    const groups = CAT_ORDER.map((c) => [c, menu.filter((m) => m.category === c && match(m))]).filter(([, l]) => l.length);
    picker.innerHTML = groups.length ? groups.map(([c, list]) => `<h3>${esc(CATEGORY[c] || c)}</h3><div class="picker__grid">${list.map((m) => {
      const out = soldOut.has(m.id), qn = cart[m.id] || 0;
      return `<div class="pitem ${out ? "is-out" : ""} ${qn ? "is-in" : ""}">
        <button type="button" class="pitem__add" data-add="${esc(m.id)}" ${out ? "disabled" : ""}>
          <span>${esc(m.name)}</span><small>${out ? "Agotado" : esc(money(m.price))}</small></button>
        ${qn ? `<div class="qty"><button type="button" data-dec="${esc(m.id)}" aria-label="Quitar uno">−</button><b>${qn}</b><button type="button" data-add="${esc(m.id)}" aria-label="Agregar uno">+</button></div>` : ""}
      </div>`;
    }).join("")}</div>`).join("") : `<p class="muted">Nada coincide con "${esc(search)}".</p>`;
  }
  function drawSum() {
    const ids = Object.keys(cart);
    $("#sum", el).innerHTML = ids.length ? ids.map((id) => `<li><span><b>${cart[id]}×</b> ${esc(byId[id].name)}</span><em>${esc(money(byId[id].price * cart[id]))}</em>
      <button type="button" class="iconbtn iconbtn--sm" data-del="${esc(id)}" aria-label="Quitar">✕</button></li>`).join("") : `<li class="muted">Tocá los productos para sumarlos.</li>`;
    const total = ids.reduce((s, id) => s + byId[id].price * cart[id], 0) + (svc() === "delivery" ? +(S.stores.find((x) => x.id === store)?.delivery_fee || 0) : 0);
    $("#total", el).textContent = money(total);
  }
  const svc = () => f.elements.service.value;

  el.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]"), d = e.target.closest("[data-dec]"), x = e.target.closest("[data-del]"), c = e.target.closest("[data-cat]");
    if (a && !a.disabled) { cart[a.dataset.add] = Math.min(50, (cart[a.dataset.add] || 0) + 1); drawPicker(); drawSum(); }
    else if (d) { if (--cart[d.dataset.dec] <= 0) delete cart[d.dataset.dec]; drawPicker(); drawSum(); }
    else if (x) { delete cart[x.dataset.del]; drawPicker(); drawSum(); }
    else if (c) { cat = c.dataset.cat; $$("#cats .chip", el).forEach((b) => b.classList.toggle("is-on", b === c)); drawPicker(); }
  });
  $("#search", el).addEventListener("input", (e) => { search = e.target.value.trim(); drawPicker(); });
  const onKey = (e) => { if (e.key === "/" && !e.target.matches("input,textarea,select")) { e.preventDefault(); $("#search", el).focus(); } };
  document.addEventListener("keydown", onKey);
  f.addEventListener("change", (e) => {
    if (e.target.name === "service") { $("[data-delivery]", el).hidden = svc() !== "delivery"; drawSum(); }
    if (e.target.name === "store") { store = e.target.value; loadAvailability(); }
  });

  // phone lookup → CRM autofill
  let lookT;
  f.elements.phone.addEventListener("input", () => {
    clearTimeout(lookT);
    lookT = setTimeout(async () => {
      const phone = normalizePhone(f.elements.phone.value), hint = $("#phint", el);
      if (!phone) { hint.textContent = f.elements.phone.value ? "8 dígitos, empieza con 6 o 7" : ""; return; }
      const { data: c } = await sb.from("customers").select("id, name, orders_count, blocked, tags, allergies").eq("phone", phone).maybeSingle();
      if (!c) { hint.innerHTML = "Cliente nuevo ✨"; return; }
      if (!f.elements.name.value) f.elements.name.value = c.name || "";
      hint.innerHTML = `${c.blocked ? "⛔ <b>Bloqueado</b> · " : ""}${esc(c.name || "")} · ${c.orders_count} pedidos${c.allergies ? ` · ⚠ ${esc(c.allergies)}` : ""}`;
      const { data: addrs } = await sb.from("customer_addresses").select("address, reference").eq("customer_id", c.id).order("last_used_at", { ascending: false }).limit(5);
      $("#addr-list", el).innerHTML = (addrs || []).map((a) => `<option value="${esc(a.address)}">${esc(a.reference || "")}</option>`).join("");
      if (addrs?.[0] && !f.elements.address.value) { f.elements.address.value = addrs[0].address || ""; f.elements.reference.value = addrs[0].reference || ""; }
    }, 350);
  });

  const reset = () => {
    cart = {}; clientRef = uuid();
    ["phone", "name", "time", "address", "reference", "change", "notes", "nit", "rs"].forEach((n) => (f.elements[n].value = ""));
    f.elements.payment.value = ""; $("#phint", el).textContent = "";
    drawPicker(); drawSum();
  };
  $("#clear", el).addEventListener("click", reset);

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const v = (n) => f.elements[n].value.trim();
    if (!Object.keys(cart).length) return toast("Agregá al menos un producto", "warn");
    if (!v("name")) { f.elements.name.focus(); return toast("Falta el nombre del cliente", "warn"); }
    if (v("phone") && !normalizePhone(v("phone"))) { f.elements.phone.focus(); return toast("Teléfono inválido (8 dígitos, empieza con 6 o 7)", "warn"); }
    if (svc() === "delivery" && !v("address")) { f.elements.address.focus(); return toast("Falta la dirección", "warn"); }
    busy = true; $("#submit", el).disabled = true; $("#submit", el).textContent = "Creando…";
    const payload = {
      client_ref: clientRef, channel: v("channel"), store, service: svc(), customer_name: v("name"), customer_phone: v("phone") || null,
      address: v("address") || null, reference: v("reference") || null, notes: v("notes") || null, scheduled_for: v("time") || null,
      payment_method: v("payment") || null, cash_change_for: v("change") || null, nit_ci: v("nit") || null, razon_social: v("rs") || null,
      invoice_requested: !!v("nit"), items: Object.entries(cart).map(([id, qty]) => ({ id, qty })),
    };
    try {
      const r = await q(sb.rpc("place_order", { payload }));
      toast(`✅ Pedido ${r.code} (#${r.order_no}) creado · ${money(r.total)}`);
      reset();
    } catch (err) { toast(errMsg(err), "err"); }
    busy = false; $("#submit", el).disabled = false; $("#submit", el).textContent = "Crear pedido";
  });

  drawPicker(); drawSum();
  await loadAvailability();
  return () => document.removeEventListener("keydown", onKey);
}
