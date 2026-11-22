// Auditoría (owner/admin): who changed what, with a readable before → after diff.
import { sb, S, $, esc, q, errMsg, laDateTime, laDate, addDays, opts, empty, STATUS } from "../lib.js";

const ENT = { orders: "Pedidos", stores: "Sucursales", menu_items: "Menú", store_item_availability: "Disponibilidad", staff: "Equipo" };
const ACT = { insert: "Creó", update: "Cambió", delete: "Borró" };
const FIELD = {
  status: "estado", cancel_reason: "motivo", discount: "descuento", delivery_fee: "envío", payment_method: "pago", payment_status: "estado de pago",
  total: "total", rider_id: "repartidor", is_paused: "pausada", pause_reason: "motivo de pausa", paused_until: "reanuda", price: "precio",
  available: "disponible", active: "activo", role: "rol", store_id: "sucursal", open_time: "abre", close_time: "cierra", name: "nombre",
};
const show = (v) => (v == null ? "—" : typeof v === "boolean" ? (v ? "sí" : "no") : STATUS[v] || (typeof v === "object" ? JSON.stringify(v) : String(v)));

export async function render(el) {
  let entity = "", from = addDays(laDate(), -6), to = laDate();
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">Registro de cambios</p><h1>Auditoría</h1></div></header>
    <div class="filters card"><select id="ent" aria-label="Tipo">${opts(ENT, "", "Todo")}</select>
      <label class="inline">Desde<input type="date" id="from" value="${from}" /></label><label class="inline">Hasta<input type="date" id="to" value="${to}" /></label></div>
    <div class="card card--flush"><div class="tablewrap" id="table">${empty("Cargando…", "⏳")}</div></div>
  </div>`;
  const who = (uid) => (uid ? S.staffList.find((s) => s.user_id === uid)?.full_name || "usuario" : "sistema / cliente web");
  async function load() {
    let query = sb.from("audit_log").select("*").gte("created_at", `${from}T04:00:00Z`).lt("created_at", `${addDays(to, 1)}T04:00:00Z`).order("id", { ascending: false }).limit(300);
    if (entity) query = query.eq("entity", entity);
    try {
      const rows = await q(query);
      $("#table", el).innerHTML = rows.length ? `<table class="table"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead><tbody>${rows.map((r) => {
        let detail;
        if (r.action === "update" && r.data) detail = Object.entries(r.data).map(([k, d]) => `<span class="diff"><b>${esc(FIELD[k] || k)}</b> ${esc(show(d?.antes))} → <em>${esc(show(d?.despues))}</em></span>`).join("");
        else detail = `<span class="muted">${esc(r.data?.name || r.data?.full_name || r.data?.code || r.entity_id || "")}</span>`;
        return `<tr><td>${esc(laDateTime(r.created_at))}</td><td>${esc(who(r.actor))}</td><td>${esc(ACT[r.action] || r.action)} · ${esc(ENT[r.entity] || r.entity)} <small>${esc(r.entity_id || "")}</small></td><td>${detail}</td></tr>`;
      }).join("")}</tbody></table>` : empty("Sin cambios en ese período.", "🔎");
    } catch (e) { $("#table", el).innerHTML = empty(errMsg(e), "😵"); }
  }
  $("#ent", el).addEventListener("change", (e) => { entity = e.target.value; load(); });
  ["from", "to"].forEach((i) => $(`#${i}`, el).addEventListener("change", () => { from = $("#from", el).value; to = $("#to", el).value; load(); }));
  await load();
}
