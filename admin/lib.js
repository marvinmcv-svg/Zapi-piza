// Zapi Backoffice — shared helpers: Supabase client, session state, formatting, UI primitives.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CFG = window.ZAPI_CONFIG;
export const sb = createClient(CFG.supabaseUrl, CFG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "zapi-admin-auth" },
});
export const SITE = CFG.siteUrl;
export const TZ = "America/La_Paz";

// session-wide state, filled after login
export const S = { user: null, staff: null, stores: [], menu: [], reasons: [], staffList: [] };

/* ---------------- roles ---------------- */
export const ROLE_LABEL = { owner: "Dueño", admin: "Administrador", manager: "Gerente", cashier: "Cajero", kitchen: "Cocina", rider: "Repartidor" };
export const isAdmin = () => ["owner", "admin"].includes(S.staff?.role);
export const isManager = () => ["owner", "admin", "manager"].includes(S.staff?.role);
export const hasRole = (...r) => r.includes(S.staff?.role);
export const myStore = () => (isAdmin() ? null : S.staff?.store_id);
export const storeName = (id) => S.stores.find((s) => s.id === id)?.name || id || "—";

/* ---------------- labels ---------------- */
export const STATUS = {
  nuevo: "Nuevo", confirmado: "Confirmado", en_preparacion: "Preparando", en_horno: "En el horno",
  listo: "Listo", en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado",
};
export const CHANNEL = { web: "Web", zapia: "Zap-IA", whatsapp: "WhatsApp", telefono: "Teléfono", local: "Mostrador", yango: "Yango" };
export const SERVICE = { delivery: "Delivery", pickup: "Recoge", local: "En el local" };
export const PAYMENT = { efectivo: "Efectivo", qr: "QR", tarjeta: "Tarjeta", yango: "Yango", otro: "Otro" };
export const PAY_STATUS = { pendiente: "Pendiente", pagado: "Pagado", reembolsado: "Reembolsado" };
export const CATEGORY = { clasica: "Zapi Clásica", eco: "Zapi Eco", especial: "Zapi Especial", premium: "Zapi Premium", jr: "Menú Jr.", combo: "Combos", promo: "Promos", drink: "Bebidas", extra: "Extras", salsa: "Salsas", borde: "Bordes" };

// the order flow, per service
const FLOW = ["nuevo", "confirmado", "en_preparacion", "en_horno", "listo", "en_camino", "entregado"];
export function flowFor(service) { return service === "delivery" ? FLOW : FLOW.filter((s) => s !== "en_camino"); }
export function nextStatus(o) {
  const f = flowFor(o.service), i = f.indexOf(o.status);
  return i >= 0 && i < f.length - 1 ? f[i + 1] : null;
}
export function prevStatus(o) {
  const f = flowFor(o.service), i = f.indexOf(o.status);
  return i > 0 ? f[i - 1] : null;
}
export const NEXT_LABEL = { confirmado: "Confirmar", en_preparacion: "Preparar", en_horno: "Al horno", listo: "¡Listo!", en_camino: "Despachar", entregado: "Entregar" };
// which statuses a role may set (mirrors set_order_status in the DB)
export function canSetStatus(status) {
  const r = S.staff?.role;
  if (r === "kitchen") return ["confirmado", "en_preparacion", "en_horno", "listo"].includes(status);
  if (r === "rider") return ["en_camino", "entregado"].includes(status);
  return true;
}

/* ---------------- formatting ---------------- */
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const money = (n) => `Bs ${Number(n || 0).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const num = (n, d = 0) => Number(n || 0).toLocaleString("es-BO", { maximumFractionDigits: d });
export const laDate = (d = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
export const laTime = (d) => (d ? new Date(d).toLocaleTimeString("es-BO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
export const laDateTime = (d) => (d ? new Date(d).toLocaleString("es-BO", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
export const laDay = (d) => (d ? new Date(d).toLocaleDateString("es-BO", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" }) : "—");
export function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const minutesSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 60000);
export function ago(d) {
  const m = minutesSince(d);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d`;
}
export const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "—";
export const waDigits = (phone) => String(phone || "").replace(/\D/g, "");
export function normalizePhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("591") && d.length === 11) d = d.slice(3);
  if (d.length === 9 && d.startsWith("0")) d = d.slice(1);
  return d.length === 8 && /^[67]/.test(d) ? `+591${d}` : null;
}
export const fmtPhone = (p) => (p ? String(p).replace(/^\+591(\d{4})(\d{4})$/, "$1 $2") : "—");
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "x" + Math.random().toString(36).slice(2) + Date.now().toString(36));

/* store open now? (hours + pause, La Paz) */
export function storeState(s) {
  const now = new Date();
  const hm = now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
  const t = toMin(hm), o = toMin(s.open_time), c = toMin(s.close_time);
  const paused = s.is_paused && (!s.paused_until || new Date(s.paused_until) > now);
  if (!s.active) return { cls: "off", text: "Inactiva" };
  if (paused) return { cls: "paused", text: s.paused_until ? `Pausada hasta ${laTime(s.paused_until)}` : "Pausada" };
  if (t >= o && t < c) return { cls: "open", text: "Abierta" };
  return { cls: "closed", text: t < o ? `Abre ${String(s.open_time).slice(0, 5)}` : "Cerrada" };
}

/* ---------------- errors ---------------- */
const ERR = {
  manager_required: "Solo un gerente puede hacer eso.",
  forbidden_status: "Tu rol no puede poner el pedido en ese estado.",
  forbidden_store: "Ese pedido es de otra sucursal.",
  cancel_reason_required: "Elegí un motivo de cancelación.",
  cancel_note_required: "Explicá el motivo en la nota.",
  not_delivery: "Este pedido no es delivery.",
  order_closed: "El pedido ya está cerrado.",
  order_cancelled: "El pedido está cancelado.",
  not_staff: "Tu usuario no está habilitado.",
  invalid_store: "Sucursal inválida.",
  invalid_items: "Agregá al menos un producto.",
  invalid_phone: "Teléfono inválido (8 dígitos, empieza con 6 o 7).",
  missing_name: "Falta el nombre del cliente.",
  missing_address: "Falta la dirección para el delivery.",
  invalid_channel: "Canal inválido.",
  invalid_service: "Tipo de pedido inválido.",
  customer_blocked: "Este cliente está bloqueado.",
  store_paused: "La sucursal tiene los pedidos pausados.",
  admin_required: "Solo dueños o administradores.",
  owner_required: "Solo el dueño puede hacer eso.",
  weak_password: "La contraseña debe tener al menos 8 caracteres.",
  invalid_email: "Email inválido.",
  email_taken: "Ya existe un usuario con ese email.",
  cannot_demote_self: "No podés quitarte tu propio acceso.",
  forbidden: "No tenés permiso para ver esto.",
  "Invalid login credentials": "Email o contraseña incorrectos.",
};
export function errMsg(e) {
  const m = String(e?.message || e || "Error");
  for (const [k, v] of Object.entries(ERR)) if (m.includes(k)) return v;
  if (m.startsWith("sold_out:")) return `Agotado: ${m.slice(9)}`;
  if (m.startsWith("unknown_item:")) return `Producto inexistente: ${m.slice(13)}`;
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión. Probá de nuevo.";
  return m;
}
// run a supabase call, throw a friendly error
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(errMsg(error));
  return data;
}

/* ---------------- UI primitives ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let toastT;
export function toast(msg, type = "ok") {
  const el = $("#toast");
  el.className = `toast is-on toast--${type}`;
  el.textContent = msg;
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("is-on"), type === "err" ? 4200 : 2600);
}

// modal: returns a promise that resolves with the clicked action value (or null)
export function modal({ title, body, actions = [{ label: "Cerrar", value: null }], wide = false, onOpen }) {
  return new Promise((resolve) => {
    const root = $("#modal");
    root.innerHTML = `<div class="modal__scrim" data-x></div>
      <div class="modal__card ${wide ? "modal__card--wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-t">
        <header class="modal__head"><h3 id="modal-t">${esc(title)}</h3><button class="iconbtn" data-x aria-label="Cerrar">✕</button></header>
        <div class="modal__body">${body}</div>
        <footer class="modal__foot">${actions.map((a, i) => `<button class="btn ${a.cls || (i === actions.length - 1 ? "btn--primary" : "btn--ghost")}" data-i="${i}">${esc(a.label)}</button>`).join("")}</footer>
      </div>`;
    root.hidden = false;
    const card = $(".modal__card", root);
    const close = (v) => { root.hidden = true; root.innerHTML = ""; document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    root.addEventListener("click", async (e) => {
      if (e.target.closest("[data-x]")) return close(null);
      const b = e.target.closest("[data-i]");
      if (!b) return;
      const a = actions[+b.dataset.i];
      if (a.validate) { const err = await a.validate(card); if (err) { const m = $(".modal__err", card) || card.querySelector(".modal__body").appendChild(Object.assign(document.createElement("p"), { className: "modal__err" })); m.textContent = err; return; } }
      close(a.value === undefined ? a.label : typeof a.value === "function" ? a.value(card) : a.value);
    });
    onOpen && onOpen(card);
    setTimeout(() => ($("input,select,textarea", card) || $("[data-i]", card))?.focus(), 30);
  });
}
export const confirmBox = (title, text, okLabel = "Sí", cls = "btn--primary") =>
  modal({ title, body: `<p>${esc(text)}</p>`, actions: [{ label: "Cancelar", value: false }, { label: okLabel, value: true, cls }] });

export function drawer(html) {
  const d = $("#drawer");
  $(".drawer__body", d).innerHTML = html;
  d.hidden = false;
  requestAnimationFrame(() => d.classList.add("is-open"));
  return $(".drawer__body", d);
}
export function closeDrawer() {
  const d = $("#drawer");
  d.classList.remove("is-open");
  setTimeout(() => { d.hidden = true; $(".drawer__body", d).innerHTML = ""; }, 250);
}

// short "ding-ding" for new orders (WebAudio, no asset)
let actx;
export function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime;
    [0, 0.18].forEach((dt, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = "triangle"; o.frequency.value = i ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.3);
      o.connect(g).connect(actx.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.32);
    });
  } catch { /* audio blocked until the first click */ }
}
export function unlockAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {} }

export function downloadCSV(rows, filename) {
  if (!rows.length) return toast("No hay datos para exportar", "warn");
  const cols = Object.keys(rows[0]);
  const cell = (v) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
}

// options for a <select>
export const opts = (obj, sel, blank) =>
  (blank != null ? `<option value="">${esc(blank)}</option>` : "") +
  Object.entries(obj).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(sel ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("");
export const storeOpts = (sel, blank) => opts(Object.fromEntries(S.stores.map((s) => [s.id, s.name])), sel, blank);

export const empty = (text, icon = "🍕") => `<div class="empty"><span>${icon}</span><p>${esc(text)}</p></div>`;
export const loading = () => `<div class="loading"><i></i><i></i><i></i></div>`;
