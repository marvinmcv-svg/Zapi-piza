// Sucursales: hours, pause with auto-resume, delivery/pickup toggles, prep time, fee, contact.
import { sb, S, $, $$, esc, q, toast, errMsg, laTime, storeState, isAdmin, myStore, fmtPhone, waDigits, empty, modal } from "../lib.js";

export async function render(el) {
  let stores = [];
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">${isAdmin() ? "Las 9 sucursales" : "Tu sucursal"}</p><h1>Sucursales</h1></div>
      <div class="page__tools"><a class="btn btn--ghost btn--sm" href="#/disponibilidad">🚫 Productos agotados</a></div></header>
    <div class="stores" id="stores">${empty("Cargando…", "⏳")}</div>
  </div>`;
  const wrap = $("#stores", el);

  async function load() {
    stores = await q(sb.from("stores").select("*").order("sort"));
    S.stores = stores;
    draw();
  }
  const t5 = (t) => String(t || "").slice(0, 5);
  function draw() {
    const mine = isAdmin() ? stores : stores.filter((s) => s.id === myStore());
    wrap.innerHTML = mine.map((s) => {
      const st = storeState(s);
      return `<form class="store card" data-store="${esc(s.id)}">
        <header><div><h2>${esc(s.name)}</h2><span class="pill pill--st-${st.cls}">${esc(st.text)}</span></div>
          <button type="button" class="btn ${s.is_paused ? "btn--primary" : "btn--danger-ghost"} btn--sm" data-pause>${s.is_paused ? "▶ Reanudar pedidos" : "⏸ Pausar pedidos"}</button></header>
        ${s.is_paused ? `<p class="alert alert--warn">Pedidos web pausados${s.pause_reason ? `: ${esc(s.pause_reason)}` : ""}${s.paused_until ? ` · se reanudan solos a las ${esc(laTime(s.paused_until))}` : ""}</p>` : ""}
        <div class="grid3">
          <label>Abre<input type="time" name="open_time" value="${esc(t5(s.open_time))}" /></label>
          <label>Cierra<input type="time" name="close_time" value="${esc(t5(s.close_time))}" /></label>
          <label>Preparación (min)<input type="number" name="prep_minutes" min="5" max="120" value="${esc(s.prep_minutes)}" /></label>
          <label>Envío (Bs)<input type="number" name="delivery_fee" min="0" step="1" value="${esc(s.delivery_fee ?? "")}" placeholder="a confirmar" /></label>
          <label>WhatsApp<input name="whatsapp" value="${esc(s.whatsapp)}" inputmode="tel" /></label>
          <label>Plus code<input name="plus_code" value="${esc(s.plus_code || "")}" /></label>
        </div>
        <label>Dirección<input name="address" value="${esc(s.address || "")}" placeholder="Calle, barrio, anillo" /></label>
        <div class="checks">
          <label class="switch"><input type="checkbox" name="accepts_delivery" ${s.accepts_delivery ? "checked" : ""}/><span>Acepta delivery</span></label>
          <label class="switch"><input type="checkbox" name="accepts_pickup" ${s.accepts_pickup ? "checked" : ""}/><span>Acepta recojo</span></label>
          ${isAdmin() ? `<label class="switch"><input type="checkbox" name="active" ${s.active ? "checked" : ""}/><span>Activa</span></label>` : ""}
        </div>
        <footer><a href="https://wa.me/${waDigits(s.whatsapp)}" target="_blank" rel="noopener" class="muted">WhatsApp ${esc(fmtPhone("+" + s.whatsapp))}</a>
          <button class="btn btn--primary btn--sm" type="submit">Guardar</button></footer>
      </form>`;
    }).join("") || empty("Sin sucursal asignada.");
  }

  async function save(id, patch, msg = "Sucursal guardada") {
    try { await q(sb.from("stores").update(patch).eq("id", id).select("id").single()); toast(msg); await load(); }
    catch (e) { toast(errMsg(e), "err"); }
  }
  wrap.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, v = (n) => f.elements[n]?.value.trim();
    if (!/^\d{11}$/.test(v("whatsapp"))) return toast("WhatsApp: 11 dígitos con 591 (ej. 59178459620)", "warn");
    const patch = {
      open_time: v("open_time"), close_time: v("close_time"), prep_minutes: +v("prep_minutes") || 20,
      delivery_fee: v("delivery_fee") === "" ? null : +v("delivery_fee"), whatsapp: v("whatsapp"), plus_code: v("plus_code") || null,
      address: v("address") || null, accepts_delivery: f.elements.accepts_delivery.checked, accepts_pickup: f.elements.accepts_pickup.checked,
    };
    if (f.elements.active) patch.active = f.elements.active.checked;
    save(f.dataset.store, patch);
  });
  wrap.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pause]");
    if (!b) return;
    const id = b.closest("[data-store]").dataset.store, s = stores.find((x) => x.id === id);
    if (s.is_paused) return save(id, { is_paused: false, pause_reason: null, paused_until: null }, `${s.name}: pedidos reanudados`);
    const res = await modal({
      title: `Pausar pedidos · ${s.name}`,
      body: `<p class="muted">La web y Zap-IA no aceptan pedidos de esta sucursal mientras esté pausada. Los pedidos manuales siguen funcionando.</p>
        <label>Motivo<select name="reason"><option>Cocina saturada</option><option>Falta de repartidores</option><option>Corte de luz / gas</option><option>Inventario agotado</option><option>Otro</option></select></label>
        <label>Reanudar automáticamente<select name="until"><option value="15">en 15 min</option><option value="30" selected>en 30 min</option><option value="60">en 1 hora</option><option value="120">en 2 horas</option><option value="">Manual (hasta que la reanude)</option></select></label>`,
      actions: [{ label: "Cancelar", value: null }, { label: "Pausar", cls: "btn--danger", value: (c) => ({ reason: $("[name=reason]", c).value, until: $("[name=until]", c).value }) }],
    });
    if (!res) return;
    save(id, { is_paused: true, pause_reason: res.reason, paused_until: res.until ? new Date(Date.now() + res.until * 60000).toISOString() : null }, `${s.name}: pedidos pausados`);
  });

  const ch = sb.channel(`stores-${Date.now()}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "stores" }, () => load()).subscribe();
  const tick = setInterval(draw, 60000);
  await load();
  return () => { sb.removeChannel(ch); clearInterval(tick); };
}
