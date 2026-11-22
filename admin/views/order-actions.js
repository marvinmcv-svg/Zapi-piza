// Shared order actions + the order detail drawer (used by the board, Hoy and the CRM).
import {
  sb, S, $, esc, q, toast, errMsg, modal, confirmBox, drawer, closeDrawer, money, laTime, laDateTime, ago, firstName, fmtPhone, waDigits,
  STATUS, CHANNEL, SERVICE, PAYMENT, PAY_STATUS, nextStatus, prevStatus, NEXT_LABEL, canSetStatus, isManager, hasRole, storeName, opts,
} from "../lib.js";

export async function setStatus(order, status, extra = {}) {
  await q(sb.rpc("set_order_status", { p_order: order.id, p_status: status, p_note: extra.note || null, p_cancel_reason: extra.reason || null }));
  toast(`${order.code}: ${STATUS[status]}`);
}

export async function advance(order) {
  const n = nextStatus(order);
  if (!n || !canSetStatus(n)) return;
  try { await setStatus(order, n); return true; } catch (e) { toast(errMsg(e), "err"); }
}

export async function recall(order) {
  const p = prevStatus(order);
  if (!p) return;
  if (!(await confirmBox("Volver un paso", `¿Devolver ${order.code} a "${STATUS[p]}"?`, "Volver"))) return;
  try { await setStatus(order, p, { note: "Retrocedido desde el backoffice" }); return true; } catch (e) { toast(errMsg(e), "err"); }
}

export async function cancelOrder(order) {
  const reasons = S.reasons.length ? S.reasons : [{ code: "otro", label: "Otro", needs_note: true }];
  const res = await modal({
    title: `Cancelar ${order.code}`,
    body: `<p class="muted">El cliente no recibe aviso automático: avisale por WhatsApp.</p>
      <label>Motivo<select name="reason">${reasons.map((r) => `<option value="${esc(r.code)}" data-note="${r.needs_note}">${esc(r.label)}</option>`).join("")}</select></label>
      <label>Nota <small class="muted">(obligatoria si es "Otro")</small><textarea name="note" rows="2" maxlength="300"></textarea></label>`,
    actions: [
      { label: "Volver", value: null },
      {
        label: "Cancelar pedido", cls: "btn--danger",
        validate: (c) => ($("[name=reason]", c).value === "otro" && !$("[name=note]", c).value.trim() ? "Explicá el motivo en la nota." : null),
        value: (c) => ({ reason: $("[name=reason]", c).value, note: $("[name=note]", c).value.trim() }),
      },
    ],
  });
  if (!res) return;
  try { await setStatus(order, "cancelado", res); return true; } catch (e) { toast(errMsg(e), "err"); }
}

export function printTicket(o, items) {
  const area = $("#print-area");
  area.innerHTML = `<div class="ticket">
    <h2>ZAPI PIZA</h2><p>${esc(storeName(o.store_id))}</p>
    <h1>#${o.order_no ?? "—"} · ${esc(o.code)}</h1>
    <p>${esc(laDateTime(o.created_at))} · ${esc(CHANNEL[o.channel])} · <b>${esc(SERVICE[o.service])}</b></p>
    ${o.scheduled_for ? `<p><b>PARA LAS ${esc(laTime(o.scheduled_for))}</b></p>` : ""}
    <hr/>${items.map((i) => `<p class="t-line"><b>${i.qty} ×</b> ${esc(i.name)}${i.notes ? `<br/><i>↳ ${esc(i.notes)}</i>` : ""}</p>`).join("")}
    ${o.notes ? `<hr/><p><b>Nota:</b> ${esc(o.notes)}</p>` : ""}
    <hr/><p>Cliente: ${esc(o.customer_name)} ${o.customer_phone ? "· " + esc(fmtPhone(o.customer_phone)) : ""}</p>
    ${o.service === "delivery" ? `<p>${esc(o.address || "")}${o.reference ? "<br/>" + esc(o.reference) : ""}</p>` : ""}
    <hr/><p class="t-total">TOTAL ${esc(money(o.total))}</p>
    <p>${o.payment_method ? esc(PAYMENT[o.payment_method]) : "Pago a confirmar"} · ${esc(PAY_STATUS[o.payment_status])}${o.cash_change_for ? ` · cambio de ${esc(money(o.cash_change_for))}` : ""}</p>
  </div>`;
  window.print();
}

let riders = null;
async function loadRiders() {
  if (riders) return riders;
  const { data } = await sb.from("staff").select("user_id, full_name, store_id, role").eq("role", "rider").eq("active", true);
  riders = data || [];
  return riders;
}

// Order detail drawer. onChange() is called after any mutation so the caller can refresh.
export async function openOrder(id, onChange = () => {}) {
  const body = drawer(`<div class="loading"><i></i><i></i><i></i></div>`);
  let o;
  try {
    o = await q(sb.from("orders").select("*, order_items(*), order_events(*)").eq("id", id).single());
  } catch (e) { body.innerHTML = `<p class="muted">${esc(errMsg(e))}</p>`; return; }
  const items = (o.order_items || []).sort((a, b) => a.id - b.id);
  const events = (o.order_events || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const canEdit = !hasRole("kitchen", "rider");
  const rs = canEdit ? (await loadRiders()).filter((r) => r.store_id === o.store_id) : [];
  const n = nextStatus(o), p = prevStatus(o);
  const closed = ["entregado", "cancelado"].includes(o.status);
  const mapLink = o.lat != null ? `https://www.google.com/maps?q=${o.lat},${o.lng}` : o.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address + " Santa Cruz de la Sierra")}` : null;
  const staffName = (uid) => S.staffList.find((s) => s.user_id === uid)?.full_name;

  body.innerHTML = `
    <header class="od__head">
      <div>
        <p class="eyebrow">${esc(storeName(o.store_id))} · ${esc(CHANNEL[o.channel])} · ${esc(SERVICE[o.service])}</p>
        <h2>#${o.order_no ?? "—"} <span>${esc(o.code)}</span></h2>
        <p><span class="pill pill--${o.status}">${esc(STATUS[o.status])}</span> <span class="muted">hace ${esc(ago(o.created_at))} · ${esc(laDateTime(o.created_at))}</span></p>
      </div>
      <button class="iconbtn" data-close-drawer aria-label="Cerrar">✕</button>
    </header>
    ${o.possible_duplicate ? `<p class="alert alert--warn">⚠️ Posible pedido duplicado (mismo cliente, sucursal y monto en menos de 3 min).</p>` : ""}
    ${o.scheduled_for ? `<p class="alert">⏰ Programado para las <b>${esc(laTime(o.scheduled_for))}</b></p>` : ""}
    ${o.status === "cancelado" ? `<p class="alert alert--err">Cancelado: ${esc(S.reasons.find((r) => r.code === o.cancel_reason)?.label || o.cancel_reason || "—")}</p>` : ""}
    <div class="od__actions">
      ${n && canSetStatus(n) && o.status !== "cancelado" ? `<button class="btn btn--primary btn--lg" data-act="next">${esc(NEXT_LABEL[n])} →</button>` : ""}
      ${!closed && (o.status === "nuevo" || o.status === "confirmado" || isManager()) && !hasRole("rider") ? `<button class="btn btn--danger-ghost" data-act="cancel">Cancelar</button>` : ""}
      ${p && isManager() && o.status !== "cancelado" ? `<button class="btn btn--ghost" data-act="recall">↩ Volver a ${esc(STATUS[p])}</button>` : ""}
      <button class="btn btn--ghost" data-act="print">🖨️ Ticket</button>
      ${o.customer_phone ? `<a class="btn btn--wa" target="_blank" rel="noopener" href="https://wa.me/${waDigits(o.customer_phone)}?text=${encodeURIComponent(`¡Hola ${firstName(o.customer_name)}! Te escribimos de Zapi ${storeName(o.store_id)} por tu pedido ${o.code} 🍕`)}">WhatsApp</a>` : ""}
    </div>

    <section class="od__sec">
      <h3>Pedido</h3>
      <ul class="od__items">${items.map((i) => `<li><b>${i.qty}×</b><span>${esc(i.name)}${i.notes ? `<small>↳ ${esc(i.notes)}</small>` : ""}</span><em>${esc(money(i.line_total))}</em></li>`).join("")}</ul>
      <dl class="od__totals"><dt>Subtotal</dt><dd>${esc(money(o.subtotal))}</dd>
        ${+o.delivery_fee ? `<dt>Envío</dt><dd>${esc(money(o.delivery_fee))}</dd>` : ""}
        ${+o.discount ? `<dt>Descuento</dt><dd>− ${esc(money(o.discount))}</dd>` : ""}
        <dt class="big">Total</dt><dd class="big">${esc(money(o.total))}</dd></dl>
      ${o.notes ? `<p class="od__note">📝 ${esc(o.notes)}</p>` : ""}
    </section>

    <section class="od__sec">
      <h3>Cliente</h3>
      <p><b>${esc(o.customer_name)}</b> ${o.customer_phone ? `· ${esc(fmtPhone(o.customer_phone))}` : ""}
        ${o.customer_id && hasRole("owner", "admin", "manager", "cashier") ? ` · <a href="#/clientes/${o.customer_id}" data-close-drawer>Ver ficha →</a>` : ""}</p>
      ${o.service === "delivery" ? `<p>📍 ${esc(o.address || "Sin dirección (ver pin)")}${o.reference ? `<br/><span class="muted">↪ ${esc(o.reference)}</span>` : ""}
        ${mapLink ? `<br/><a href="${mapLink}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>` : ""}</p>` : ""}
    </section>

    ${canEdit ? `<form class="od__sec od__form" id="od-form">
      <h3>Pago, entrega y factura</h3>
      <div class="grid2">
        <label>Medio de pago<select name="payment_method">${opts(PAYMENT, o.payment_method, "Sin definir")}</select></label>
        <label>Estado del pago<select name="payment_status">${opts(PAY_STATUS, o.payment_status)}</select></label>
        <label>Paga con (cambio)<input name="cash_change_for" type="number" min="0" step="1" value="${esc(o.cash_change_for ?? "")}" placeholder="Bs" /></label>
        ${isManager() ? `<label>Descuento (Bs)<input name="discount" type="number" min="0" step="1" value="${esc(+o.discount || "")}" /></label>
        <label>Costo de envío (Bs)<input name="delivery_fee" type="number" min="0" step="1" value="${esc(+o.delivery_fee || "")}" /></label>` : ""}
        ${o.service === "delivery" ? `<label>Reparto<select name="courier">${opts({ propio: "Repartidor propio", yango: "Yango" }, o.courier, "Sin asignar")}</select></label>
        <label>Repartidor<select name="rider_id">${opts(Object.fromEntries(rs.map((r) => [r.user_id, r.full_name])), o.rider_id, rs.length ? "—" : "Sin repartidores cargados")}</select></label>
        <label>Ref. Yango / guía<input name="courier_ref" value="${esc(o.courier_ref || "")}" /></label>
        <label>Costo Yango (Bs)<input name="courier_cost" type="number" min="0" step="0.5" value="${esc(o.courier_cost ?? "")}" /></label>` : ""}
        <label>NIT / CI<input name="nit_ci" value="${esc(o.nit_ci || "")}" /></label>
        <label>Razón social<input name="razon_social" value="${esc(o.razon_social || "")}" /></label>
      </div>
      <label class="check"><input type="checkbox" name="invoice_requested" ${o.invoice_requested ? "checked" : ""}/> Pide factura</label>
      <label>Nota interna<textarea name="notes" rows="2" maxlength="500">${esc(o.notes || "")}</textarea></label>
      <button class="btn btn--primary" type="submit">Guardar cambios</button>
    </form>` : ""}

    <section class="od__sec">
      <h3>Historial</h3>
      <ol class="timeline">${events.map((e) => `<li class="tl--${e.status}"><b>${esc(STATUS[e.status])}</b><span>${esc(laTime(e.created_at))}${staffName(e.actor) ? " · " + esc(staffName(e.actor)) : e.actor ? "" : " · cliente"}</span>${e.note ? `<small>${esc(e.note)}</small>` : ""}</li>`).join("")}</ol>
    </section>`;

  const refresh = () => { onChange(); openOrder(id, onChange); };
  body.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "print") return printTicket(o, items);
    b.disabled = true;
    const ok = act === "next" ? await advance(o) : act === "cancel" ? await cancelOrder(o) : await recall(o);
    b.disabled = false;
    if (ok) refresh();
  });
  $("#od-form", body)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, v = (n) => f.elements[n]?.value.trim();
    const numOrNull = (n) => (f.elements[n] && v(n) !== "" ? Number(v(n)) : null);
    const patch = {
      payment_method: v("payment_method") || null, payment_status: v("payment_status"), cash_change_for: numOrNull("cash_change_for"),
      nit_ci: v("nit_ci") || null, razon_social: v("razon_social") || null, invoice_requested: f.elements.invoice_requested.checked, notes: v("notes") || null,
    };
    if (f.elements.discount) { patch.discount = numOrNull("discount") || 0; patch.delivery_fee = numOrNull("delivery_fee") || 0; }
    if (f.elements.courier) { patch.courier = v("courier") || null; patch.rider_id = v("rider_id") || null; patch.courier_ref = v("courier_ref") || null; patch.courier_cost = numOrNull("courier_cost"); }
    try { await q(sb.from("orders").update(patch).eq("id", id)); toast("Pedido actualizado"); refresh(); }
    catch (err) { toast(errMsg(err), "err"); }
  });
}

export { closeDrawer };
