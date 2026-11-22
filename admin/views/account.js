// Mi cuenta: profile summary + change own password.
import { sb, S, $, esc, toast, errMsg, ROLE_LABEL, storeName } from "../lib.js";

export async function render(el) {
  el.innerHTML = `<div class="page page--narrow">
    <header class="page__head"><div><p class="eyebrow">${esc(ROLE_LABEL[S.staff.role])}</p><h1>Mi cuenta</h1></div></header>
    <section class="card"><dl class="deflist"><dt>Nombre</dt><dd>${esc(S.staff.full_name)}</dd><dt>Email</dt><dd>${esc(S.staff.email)}</dd>
      <dt>Sucursal</dt><dd>${esc(S.staff.store_id ? storeName(S.staff.store_id) : "Todas")}</dd></dl></section>
    <form class="card" id="pf"><h2>Cambiar contraseña</h2>
      <label>Nueva contraseña<input type="password" name="pw" minlength="8" autocomplete="new-password" required /></label>
      <label>Repetila<input type="password" name="pw2" minlength="8" autocomplete="new-password" required /></label>
      <button class="btn btn--primary" type="submit">Actualizar</button></form>
  </div>`;
  $("#pf", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (f.pw.value.length < 8) return toast("Mínimo 8 caracteres", "warn");
    if (f.pw.value !== f.pw2.value) return toast("Las contraseñas no coinciden", "warn");
    const { error } = await sb.auth.updateUser({ password: f.pw.value });
    if (error) return toast(errMsg(error), "err");
    f.reset(); toast("Contraseña actualizada");
  });
}
