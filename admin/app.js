// Zapi Backoffice — auth, base data, role-based navigation, hash router.
import { sb, S, $, $$, esc, q, toast, errMsg, ROLE_LABEL, storeName, hasRole, closeDrawer, unlockAudio, loading } from "./lib.js";

const NAV = [
  { id: "hoy", label: "Hoy", icon: "☀️", roles: ["owner", "admin", "manager"] },
  { id: "pedidos", label: "Pedidos", icon: "🍕", roles: ["owner", "admin", "manager", "cashier", "kitchen", "rider"] },
  { id: "nuevo", label: "Nuevo pedido", icon: "➕", roles: ["owner", "admin", "manager", "cashier"] },
  { id: "clientes", label: "Clientes", icon: "👥", roles: ["owner", "admin", "manager", "cashier"] },
  { id: "sucursales", label: "Sucursales", icon: "🏪", roles: ["owner", "admin", "manager"] },
  { id: "disponibilidad", label: "Disponibilidad", icon: "🚫", roles: ["owner", "admin", "manager", "cashier", "kitchen"] },
  { id: "menu", label: "Menú", icon: "📋", roles: ["owner", "admin"] },
  { id: "reportes", label: "Reportes", icon: "📊", roles: ["owner", "admin", "manager", "cashier"] },
  { id: "equipo", label: "Equipo", icon: "🧑‍🍳", roles: ["owner", "admin"] },
  { id: "auditoria", label: "Auditoría", icon: "🔎", roles: ["owner", "admin"] },
  { id: "cuenta", label: "Mi cuenta", icon: "🔑", roles: ["owner", "admin", "manager", "cashier", "kitchen", "rider"] },
];
const VIEWS = {
  hoy: () => import("./views/home.js"),
  pedidos: () => import("./views/orders.js"),
  nuevo: () => import("./views/neworder.js"),
  clientes: () => import("./views/customers.js"),
  sucursales: () => import("./views/stores.js"),
  disponibilidad: () => import("./views/availability.js"),
  menu: () => import("./views/menu.js"),
  reportes: () => import("./views/reports.js"),
  equipo: () => import("./views/team.js"),
  auditoria: () => import("./views/audit.js"),
  cuenta: () => import("./views/account.js"),
};
const allowed = (id) => NAV.find((n) => n.id === id)?.roles.includes(S.staff.role);
const landing = () => (hasRole("owner", "admin", "manager") ? "hoy" : "pedidos");

/* ---------------- auth ---------------- */
async function boot() {
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(data.session.user);
  else showLogin();
}
function showLogin(msg = "") {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-err").textContent = msg;
  setTimeout(() => $("#login-form [name=email]").focus(), 50);
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  unlockAudio();
  const f = e.currentTarget, btn = $("button[type=submit]", f);
  btn.disabled = true; btn.textContent = "Ingresando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  btn.disabled = false; btn.textContent = "Ingresar";
  if (error) return ($("#login-err").textContent = errMsg(error));
  f.password.value = "";
  await enter(data.user);
});
async function enter(user) {
  S.user = user;
  const { data: staff } = await sb.from("staff").select("*").eq("user_id", user.id).maybeSingle();
  if (!staff || !staff.active) {
    await sb.auth.signOut();
    return showLogin("Sin acceso: tu usuario no está habilitado en el equipo de Zapi.");
  }
  S.staff = staff;
  try {
    S.staffList = (await sb.from("staff").select("user_id, full_name, role, store_id, active")).data || [];
    [S.stores, S.menu, S.reasons] = await Promise.all([
      q(sb.from("stores").select("*").order("sort")),
      q(sb.from("menu_items").select("*").order("sort")),
      q(sb.from("cancel_reasons").select("*").order("sort")),
    ]);
  } catch (err) { toast(errMsg(err), "err"); }
  $("#login").hidden = true;
  $("#app").hidden = false;
  renderChrome();
  if (!location.hash || location.hash === "#/") location.hash = `#/${landing()}`;
  else route();
}
export async function logout() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  sb.removeAllChannels();
  await sb.auth.signOut();
  S.staff = null;
  location.hash = "";
  showLogin();
}
sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT" && S.staff) { S.staff = null; showLogin("Tu sesión terminó. Ingresá de nuevo."); } });

/* ---------------- chrome ---------------- */
function renderChrome() {
  const items = NAV.filter((n) => n.roles.includes(S.staff.role));
  $("#nav").innerHTML = items.map((n) => `<a href="#/${n.id}" data-nav="${n.id}"><i aria-hidden="true">${n.icon}</i><span>${esc(n.label)}</span>${n.id === "pedidos" ? '<b class="nav__badge" id="nav-new" hidden>0</b>' : ""}</a>`).join("");
  $("#me").innerHTML = `<div class="me__who"><b>${esc(S.staff.full_name)}</b><small>${esc(ROLE_LABEL[S.staff.role])}${S.staff.store_id ? " · " + esc(storeName(S.staff.store_id)) : " · Todas las sucursales"}</small></div>
    <button class="btn btn--ghost btn--sm" id="logout">Salir</button>`;
  $("#logout").addEventListener("click", logout);
  document.body.dataset.role = S.staff.role;
}

/* ---------------- router ---------------- */
let cleanup = null, routeSeq = 0;
async function route() {
  if (!S.staff) return;
  const [id, ...params] = location.hash.replace(/^#\/?/, "").split("/");
  const view = id || landing();
  if (!VIEWS[view] || !allowed(view)) { location.hash = `#/${landing()}`; return; }
  const seq = ++routeSeq;
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  closeDrawer();
  $$("#nav a").forEach((a) => a.classList.toggle("is-on", a.dataset.nav === view));
  // fresh element per route, so listeners from the previous view can't pile up
  const old = $("#view"), el = old.cloneNode(false);
  old.replaceWith(el);
  el.innerHTML = loading();
  el.dataset.view = view;
  try {
    const mod = await VIEWS[view]();
    if (seq !== routeSeq) return;
    cleanup = (await mod.render(el, params.map(decodeURIComponent))) || null;
  } catch (err) {
    console.error(err);
    el.innerHTML = `<div class="page"><div class="empty"><span>😵</span><p>${esc(errMsg(err))}</p></div></div>`;
  }
  el.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);
document.addEventListener("click", (e) => { if (e.target.closest("[data-close-drawer]")) closeDrawer(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#drawer").hidden && $("#modal").hidden) closeDrawer(); });
document.addEventListener("pointerdown", unlockAudio, { once: true });

boot();
