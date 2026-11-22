// Equipo (owner/admin): staff list, create users, change role/store/active, reset passwords.
import { sb, S, $, esc, q, toast, errMsg, modal, ROLE_LABEL, storeOpts, storeName, opts, empty } from "../lib.js";

export async function render(el) {
  let staff = [];
  const roleOpts = (sel) => opts(Object.fromEntries(Object.entries(ROLE_LABEL).filter(([k]) => k !== "owner" || S.staff.role === "owner" || sel === "owner")), sel);
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">Usuarios del backoffice</p><h1>Equipo</h1></div>
      <div class="page__tools"><button class="btn btn--primary btn--sm" id="add">+ Nuevo usuario</button></div></header>
    <div class="roles card">
      <p><b>Dueño / Administrador:</b> todas las sucursales, menú, equipo, auditoría.</p>
      <p><b>Gerente:</b> su sucursal: pedidos, cancelaciones, clientes, pausar pedidos, reportes.</p>
      <p><b>Cajero:</b> tomar pedidos, cobrar, clientes. <b>Cocina:</b> tablero y agotados. <b>Repartidor:</b> despachar y entregar.</p>
    </div>
    <div class="card card--flush"><div class="tablewrap" id="table">${empty("Cargando…", "⏳")}</div></div>
  </div>`;

  async function load() {
    staff = await q(sb.from("staff").select("*").order("created_at"));
    S.staffList = staff;
    $("#table", el).innerHTML = `<table class="table table--edit"><thead><tr><th>Persona</th><th>Rol</th><th>Sucursal</th><th>Activo</th><th></th></tr></thead><tbody>
      ${staff.map((s) => `<tr data-user="${s.user_id}" class="${s.active ? "" : "is-off"}">
        <td><b>${esc(s.full_name)}</b><small>${esc(s.email)}${s.user_id === S.staff.user_id ? " · vos" : ""}</small></td>
        <td><select name="role" aria-label="Rol">${roleOpts(s.role)}</select></td>
        <td><select name="store" aria-label="Sucursal">${storeOpts(s.store_id, "Todas")}</select></td>
        <td><label class="switch"><input type="checkbox" name="active" ${s.active ? "checked" : ""}/><span class="sr">Activo</span></label></td>
        <td class="actions"><button class="btn btn--sm btn--ghost" data-save>Guardar</button><button class="btn btn--sm btn--ghost" data-pw>Contraseña</button></td></tr>`).join("")}
    </tbody></table>`;
  }

  el.addEventListener("click", async (e) => {
    if (e.target.closest("#add")) {
      const res = await modal({
        title: "Nuevo usuario",
        body: `<div class="grid2"><label>Nombre<input name="name" required /></label><label>Email<input name="email" type="email" required /></label>
          <label>Rol<select name="role">${roleOpts("cashier")}</select></label><label>Sucursal<select name="store">${storeOpts(S.stores[0]?.id)}</select></label>
          <label>Teléfono <small class="muted">(opcional)</small><input name="phone" inputmode="tel" /></label>
          <label>Contraseña temporal<input name="pw" value="${esc(tempPw())}" /></label></div>
          <p class="muted small">Compartí email y contraseña con la persona; puede cambiarla en "Mi cuenta".</p>`,
        actions: [{ label: "Cancelar", value: null }, {
          label: "Crear usuario",
          validate: (c) => { const g = (n) => $(`[name=${n}]`, c).value.trim(); if (!g("name") || !g("email")) return "Completá nombre y email."; if (g("pw").length < 8) return "La contraseña necesita 8 caracteres."; if (!["owner", "admin"].includes(g("role")) && !g("store")) return "Elegí una sucursal."; },
          value: (c) => Object.fromEntries(["name", "email", "role", "store", "phone", "pw"].map((n) => [n, $(`[name=${n}]`, c).value.trim()])),
        }],
      });
      if (!res) return;
      try {
        await q(sb.rpc("admin_create_staff", { p_email: res.email, p_password: res.pw, p_full_name: res.name, p_role: res.role, p_store: res.store || null, p_phone: res.phone || null }));
        toast(`Usuario creado: ${res.email}`); await load();
        modal({ title: "Credenciales", body: `<p>Compartí esto con ${esc(res.name)}:</p><pre class="creds">${esc(location.origin)}/admin\n${esc(res.email)}\n${esc(res.pw)}</pre>` });
      } catch (err) { toast(errMsg(err), "err"); }
      return;
    }
    const tr = e.target.closest("tr[data-user]");
    if (!tr) return;
    const id = tr.dataset.user, s = staff.find((x) => x.user_id === id);
    if (e.target.closest("[data-save]")) {
      const role = $("[name=role]", tr).value, store = $("[name=store]", tr).value || null;
      if (!["owner", "admin"].includes(role) && !store) return toast("Elegí una sucursal para ese rol", "warn");
      try { await q(sb.rpc("admin_update_staff", { p_user: id, p_role: role, p_store: store, p_active: $("[name=active]", tr).checked, p_full_name: null })); toast(`${s.full_name}: guardado`); await load(); }
      catch (err) { toast(errMsg(err), "err"); load(); }
    }
    if (e.target.closest("[data-pw]")) {
      const pw = await modal({ title: `Nueva contraseña · ${s.full_name}`, body: `<label>Contraseña<input name="pw" value="${esc(tempPw())}" /></label>`,
        actions: [{ label: "Cancelar", value: null }, { label: "Cambiar", validate: (c) => ($("[name=pw]", c).value.length < 8 ? "Mínimo 8 caracteres." : null), value: (c) => $("[name=pw]", c).value }] });
      if (!pw) return;
      try { await q(sb.rpc("admin_set_password", { p_user: id, p_password: pw })); toast("Contraseña actualizada"); } catch (err) { toast(errMsg(err), "err"); }
    }
  });
  await load();
}
function tempPw() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint32Array(10));
  return "Zapi-" + [...r].map((x) => a[x % a.length]).join("");
}
