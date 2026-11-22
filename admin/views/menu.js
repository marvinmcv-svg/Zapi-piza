// Menú (owner/admin): edit name, description, price, active and meat-free per item.
import { sb, S, $, $$, esc, q, toast, errMsg, money, CATEGORY, empty, confirmBox } from "../lib.js";

const CAT_ORDER = ["combo", "promo", "clasica", "eco", "especial", "premium", "jr", "drink", "borde", "extra", "salsa"];

export async function render(el) {
  let items = [], cat = "all";
  el.innerHTML = `<div class="page">
    <header class="page__head"><div><p class="eyebrow">Carta y precios</p><h1>Menú</h1></div></header>
    <p class="alert">ℹ️ El sitio web muestra los precios de <code>js/data.js</code>. Si cambiás un precio acá, actualizá también data.js (o pedí que lo sincronicemos). Los pedidos siempre se cobran con el precio de acá.</p>
    <div class="filters card"><div class="chips" id="cats"><button class="chip is-on" data-cat="all">Todo</button>${CAT_ORDER.map((c) => `<button class="chip" data-cat="${c}">${esc(CATEGORY[c])}</button>`).join("")}</div></div>
    <div class="card card--flush"><div class="tablewrap" id="table">${empty("Cargando…", "⏳")}</div></div>
  </div>`;
  async function load() { items = await q(sb.from("menu_items").select("*").order("sort")); S.menu = items; draw(); }
  function draw() {
    const list = items.filter((m) => cat === "all" || m.category === cat);
    $("#table", el).innerHTML = `<table class="table table--edit"><thead><tr><th>Producto</th><th>Descripción</th><th class="num">Precio (Bs)</th><th>Activo</th><th>Sin carne</th><th></th></tr></thead>
      <tbody>${list.map((m) => `<tr data-id="${esc(m.id)}">
        <td><input name="name" value="${esc(m.name)}" aria-label="Nombre" /><small>${esc(CATEGORY[m.category] || m.category)} · <code>${esc(m.id)}</code></small></td>
        <td><input name="description" value="${esc(m.description || "")}" aria-label="Descripción" /></td>
        <td class="num"><input name="price" type="number" min="0" step="0.5" value="${esc(+m.price)}" aria-label="Precio" class="input--num" /></td>
        <td><label class="switch"><input type="checkbox" name="active" ${m.active ? "checked" : ""}/><span class="sr">Activo</span></label></td>
        <td><label class="switch"><input type="checkbox" name="veg" ${m.veg ? "checked" : ""}/><span class="sr">Sin carne</span></label></td>
        <td><button class="btn btn--sm btn--ghost" data-save disabled>Guardar</button></td></tr>`).join("")}</tbody></table>`;
  }
  el.addEventListener("input", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) $("[data-save]", tr).disabled = false; });
  el.addEventListener("change", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) $("[data-save]", tr).disabled = false; });
  el.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-cat]");
    if (c) { cat = c.dataset.cat; $$("#cats .chip", el).forEach((b) => b.classList.toggle("is-on", b === c)); return draw(); }
    const b = e.target.closest("[data-save]");
    if (!b) return;
    const tr = b.closest("tr"), id = tr.dataset.id, g = (n) => $(`[name=${n}]`, tr);
    const price = Number(g("price").value);
    if (!g("name").value.trim() || !(price >= 0)) return toast("Nombre y precio válidos, por favor", "warn");
    const old = items.find((m) => m.id === id);
    if (price !== +old.price && !(await confirmBox("Cambiar precio", `¿Cambiar el precio de ${old.name} de ${money(old.price)} a ${money(price)}?`, "Cambiar"))) return;
    try {
      await q(sb.from("menu_items").update({ name: g("name").value.trim(), description: g("description").value.trim() || null, price, active: g("active").checked, veg: g("veg").checked }).eq("id", id));
      toast("Producto guardado"); await load();
    } catch (err) { toast(errMsg(err), "err"); }
  });
  await load();
}
