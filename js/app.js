(() => {
  "use strict";
  const Z = window.ZAPI;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => `${Z.config.currency} ${n}`;

  /* =========================================================
     Time in Santa Cruz (America/La_Paz)
     ========================================================= */
  function nowInBolivia() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: Z.config.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    return { day, minutes: +get("hour") * 60 + +get("minute"), label: `${get("hour")}:${get("minute")}` };
  }
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  function branchStatus(b, now) {
    const o = toMin(b.open), c = toMin(b.close), t = now.minutes;
    if (t >= o && t < c) return c - t <= 30 ? { cls: "soon", text: "Cierra pronto" } : { cls: "open", text: "Abierto" };
    if (t < o) return { cls: o - t <= 60 ? "soon" : "closed", text: `Abre ${b.open}` };
    return { cls: "closed", text: "Cerrado" };
  }

  /* =========================================================
     Catalog: everything that can go in the cart
     ========================================================= */
  const catalog = {};
  const sizeShort = { familiar: "Familiar", jr: "Jr." };
  Z.menu.forEach((cat) => cat.items.forEach((it) => {
    catalog[it.id] = { name: cat.size === "jr" ? it.name : `${it.name} (${sizeShort[cat.size]})`, price: it.price };
  }));
  Z.combos.forEach((c) => (catalog[c.id] = { name: c.name, price: c.price }));
  catalog[Z.yapa.id] = { name: Z.yapa.name, price: Z.yapa.price };
  Z.addons.sodas.forEach((s) => (catalog[s.id] = { name: s.name, price: s.price }));
  const addonGroups = { extra: ["Extra", Z.addons.extras], salsa: ["Salsa", Z.addons.salsas], borde: ["", Z.addons.bordes] };
  Object.entries(addonGroups).forEach(([key, [label, g]]) => g.items.forEach((name) => {
    catalog[`${key}:${name}`] = { name: label ? `${label} ${name.toLowerCase()}` : name, price: g.price };
  }));

  /* =========================================================
     Static renders
     ========================================================= */
  $("[data-stats]").innerHTML = Z.stats.map((s) =>
    `<div><dt data-count="${s.value}" data-dec="${s.decimals || 0}" data-suffix="${esc(s.suffix)}">0${esc(s.suffix)}</dt><dd>${esc(s.label)}</dd></div>`).join("");
  function countUp(el) {
    const end = +el.dataset.count, dec = +el.dataset.dec, suf = el.dataset.suffix;
    if (reduceMotion) { el.textContent = end.toFixed(dec) + suf; return; }
    const t0 = performance.now(), dur = 1400;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = (end * e).toFixed(dec) + suf;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const now = nowInBolivia();
  $("[data-week]").innerHTML = Z.weekly.map((d, i) => {
    const today = d.day === now.day;
    return `<article class="day reveal ${today ? "is-today" : ""} ${d.pale ? "day--pale" : ""}" style="transition-delay:${i * 70}ms">
      ${today ? '<span class="day__today">Hoy</span>' : ""}
      <span class="day__name">${esc(d.name)}</span>
      <h3 class="day__title">${esc(d.title)}</h3>
      <p class="day__desc">${esc(d.desc)}</p>
      <div class="day__price">${d.from ? "<em>desde</em>" : ""}<small>Bs</small>${esc(d.price)}</div>
      <span class="day__save">${esc(d.save)}</span>
    </article>`;
  }).join("");

  /* ---------- carta ---------- */
  const tabsEl = $("[data-tabs]"), cartaEl = $("[data-carta]");
  tabsEl.innerHTML = Z.menu.map((c, i) =>
    `<button class="tab" role="tab" aria-selected="${i === 0}" data-cat="${c.id}">${esc(c.name)}<small>${c.size === "jr" ? "20 cm" : "35 cm"}</small></button>`).join("");
  function renderCarta(catId) {
    const cat = Z.menu.find((c) => c.id === catId);
    cartaEl.innerHTML = cat.items.map((it) => `
      <article class="dish">
        <h3>${esc(it.name)}${it.hot ? ' <span class="badge">Nueva</span>' : ""}${it.veg ? ' <span class="badge badge--veg">Sin carne</span>' : ""}${it.id === "jamon-pimenton" ? ' <span class="badge badge--promo">Yapa Bs 46</span>' : ""}</h3>
        <p>${esc(it.desc)}</p>
        <div class="dish__price"><small>Bs</small>${it.price}</div>
        <button class="addbtn" data-add="${it.id}" aria-label="Agregar ${esc(catalog[it.id].name)}">+</button>
      </article>`).join("");
    cartaEl.style.animation = "none"; void cartaEl.offsetWidth; cartaEl.style.animation = "";
    // phones: show 6 items, then "Ver las N"
    const more = $("[data-carta-more]");
    cartaEl.classList.toggle("is-collapsed", cat.items.length > 6);
    more.hidden = cat.items.length <= 6;
    more.textContent = `Ver las ${cat.items.length} de ${cat.name} ↓`;
  }
  tabsEl.addEventListener("click", (e) => {
    const t = e.target.closest("[data-cat]"); if (!t) return;
    $$("[data-cat]", tabsEl).forEach((b) => b.setAttribute("aria-selected", b === t));
    renderCarta(t.dataset.cat);
  });
  renderCarta(Z.menu[0].id);
  $("[data-carta-more]").addEventListener("click", (e) => {
    cartaEl.classList.remove("is-collapsed");
    e.currentTarget.hidden = true;
  });

  const A = Z.addons;
  $("[data-addons]").innerHTML = `
    <div class="addon">
      <h3>Extras <span>Bs ${A.extras.price}</span></h3>
      <p>Sumale lo que quieras a tu pizza.</p>
      <div class="chips">${A.extras.items.map((n) => `<button class="chip" data-add="extra:${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>
    </div>
    <div class="addon">
      <h3>Bordes <span>Bs ${A.bordes.price}</span></h3>
      <p>El toque catupiry.</p>
      <div class="chips">${A.bordes.items.map((n) => `<button class="chip" data-add="borde:${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>
      <h3 style="margin-top:18px">Salsas <span>Bs ${A.salsas.price}</span></h3>
      <div class="chips">${A.salsas.items.map((n) => `<button class="chip" data-add="salsa:${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>
    </div>
    <div class="addon">
      <h3>Sodas</h3>
      <p>Para acompañar.</p>
      <ul class="sodas">${A.sodas.map((s) => `<li>${esc(s.name)} <button data-add="${s.id}" aria-label="Agregar ${esc(s.name)}">Bs ${s.price} +</button></li>`).join("")}</ul>
    </div>`;

  /* ---------- combos + featured ---------- */
  $("[data-combos]").innerHTML = Z.combos.map((c, i) => `
    <article class="combo reveal ${c.star ? "combo--star" : ""}" style="transition-delay:${i * 70}ms">
      <div class="combo__media">
        <img src="${c.img}" alt="${esc(c.name)}: ${esc(c.note)}" loading="lazy" width="720" height="540" />
        ${c.star ? '<span class="combo__flag">Para compartir</span>' : c.hot ? '<span class="combo__flag">Favorito</span>' : ""}
      </div>
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.note)}</p>
      <div class="combo__foot">
        <div class="combo__price"><small>Bs</small>${c.price}</div>
        <button class="addbtn" data-add="${c.id}" aria-label="Agregar ${esc(c.name)} al pedido">+</button>
      </div>
    </article>`).join("");

  $("[data-featured]").innerHTML = Z.featured.map((f, i) => {
    const item = catalog[f.ref];
    return `<article class="feat reveal" style="transition-delay:${i * 80}ms">
      <div class="feat__media">
        ${f.video
          ? `<video src="${f.video}" poster="${f.img}" muted loop playsinline preload="none" data-autoplay aria-label="${esc(f.name)}"></video>`
          : `<img src="${f.img}" alt="${esc(f.name)}" loading="lazy" />`}
        <span class="feat__tag">${esc(f.tag)}</span>
      </div>
      <div class="feat__body">
        <h3>${esc(f.name)}</h3>
        <p>${esc(f.desc)}</p>
        <div class="feat__foot">
          <div class="combo__price"><small>Bs</small>${item.price}</div>
          <button class="addbtn" data-add="${f.ref}" aria-label="Agregar ${esc(f.name)}">+</button>
        </div>
      </div>
    </article>`;
  }).join("");

  /* ---------- reels ---------- */
  $("[data-reels]").innerHTML = Z.reels.map((r) => `
    <a class="reel" href="${r.url}" target="_blank" rel="noopener" aria-label="${esc(r.caption)}, ver en Instagram">
      <video src="${r.src}.mp4" poster="${r.src}.webp" muted loop playsinline preload="none" data-autoplay></video>
      <span class="reel__play" aria-hidden="true">▶</span>
      <span class="reel__cap">${esc(r.caption)}<small>Ver en Instagram ↗</small></span>
    </a>`).join("");
  const reels = $("[data-reels]");
  const scrollReels = (dir) => reels.scrollBy({ left: dir * (reels.querySelector(".reel").offsetWidth + 18) * 2, behavior: "smooth" });
  $("[data-reel-prev]").addEventListener("click", () => scrollReels(-1));
  $("[data-reel-next]").addEventListener("click", () => scrollReels(1));

  /* ---------- branches ---------- */
  const branchSel = $("[data-branch-select]");
  const CALL_CENTER = "Call Center";
  const fmtPhone = (n) => n.replace(/^591/, "").replace(/(\d{4})(\d{4})/, "$1 $2");
  const branchByName = (name) => Z.branches.find((b) => b.name === name);
  function renderBranches() {
    const n = nowInBolivia();
    const openCount = Z.branches.filter((b) => n.minutes >= toMin(b.open) && n.minutes < toMin(b.close)).length;
    $("[data-branches]").innerHTML = Z.branches.map((b) => {
      const s = branchStatus(b, n);
      const q = encodeURIComponent(b.plus ? `${b.plus} Santa Cruz de la Sierra` : `Zapi Piza ${b.name} Santa Cruz de la Sierra Bolivia`);
      return `<article class="branch">
        <div class="branch__top"><h3>${esc(b.name)}</h3><span class="pill pill--${s.cls}">${s.text}</span></div>
        <p class="branch__hours">${b.open} – ${b.close} · Lun a Dom</p>
        ${b.address ? `<p class="branch__addr">📍 ${esc(b.address)}</p>` : ""}
        <div class="branch__actions">
          <a class="branch__map" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Cómo llegar ↗</a>
          <a class="branch__wa" href="https://wa.me/${b.whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp de ${esc(b.name)}">WhatsApp ${esc(fmtPhone(b.whatsapp))}</a>
        </div>
      </article>`;
    }).join("");
    $("[data-now]").innerHTML = `${n.label} en Santa Cruz · <b>${openCount} de ${Z.branches.length}</b> abiertas`;
    const current = branchSel.value;
    branchSel.innerHTML = `<option value="">Elegí una sucursal</option>` + Z.branches.map((b) => {
      const s = branchStatus(b, n);
      return `<option value="${esc(b.name)}">${esc(b.name)} · ${s.text}</option>`;
    }).join("") + `<option value="${CALL_CENTER}" data-cc>Call Center · consultas generales</option>`;
    branchSel.value = current;
  }
  renderBranches();
  setInterval(renderBranches, 60_000);

  $("[data-feed]").innerHTML = Z.feed.map((p, i) => `
    <a class="reveal" style="transition-delay:${(i % 4) * 60}ms" href="${p.url}" target="_blank" rel="noopener">
      <img src="${p.img}" alt="${esc(p.alt)}" loading="lazy" />
    </a>`).join("");
  $("[data-year]").textContent = new Date().getFullYear();

  /* =========================================================
     Nav, reveal, video
     ========================================================= */
  const nav = $("[data-nav]");
  const onScroll = () => nav.classList.toggle("is-solid", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("[data-burger]");
  burger.addEventListener("click", () => burger.setAttribute("aria-expanded", nav.classList.toggle("is-open")));
  $$(".nav__links a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", false); }));

  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("is-in");
    if (e.target.matches("[data-stats]")) $$("[data-count]", e.target).forEach(countUp);
    io.unobserve(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  const vio = new IntersectionObserver((entries) => entries.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting && !reduceMotion) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
  }), { threshold: 0.35 });
  $$("video[data-autoplay]").forEach((v) => vio.observe(v));
  /* ---------- hero: live status + pointer parallax ---------- */
  const fanVideos = $$(".fan video");
  if (reduceMotion) fanVideos.forEach((v) => { v.removeAttribute("autoplay"); v.pause(); });
  function renderHeroLive() {
    const n = nowInBolivia();
    const open = Z.branches.filter((b) => n.minutes >= toMin(b.open) && n.minutes < toMin(b.close)).length;
    const promo = Z.weekly.find((w) => w.day === n.day);
    const firstOpen = Z.branches.map((b) => b.open).sort()[0];
    const lastClose = Z.branches.map((b) => b.close).sort().at(-1);
    const status = open
      ? `<b>${open} de ${Z.branches.length}</b> sucursales abiertas`
      : n.minutes >= toMin(lastClose) ? `Volvemos mañana desde las <b>${firstOpen}</b>` : `Abrimos hoy desde las <b>${firstOpen}</b>`;
    $("[data-hero-live]").innerHTML = `<span class="dot"></span><span>${status}${promo && open ? ` · Hoy: ${esc(promo.name)} ${esc(promo.title)}` : ""}</span>`;
  }
  renderHeroLive();
  setTimeout(() => $$(".hero [data-count]").forEach(countUp), reduceMotion ? 0 : 700);
  setInterval(renderHeroLive, 60_000);
  const fan = $("[data-fan]");
  if (!reduceMotion && matchMedia("(pointer: fine)").matches) {
    let raf = 0;
    $(".hero").addEventListener("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        fan.style.setProperty("--mx", ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
        fan.style.setProperty("--my", ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
      });
    });
  }

  const toastEl = $("[data-toast]");
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  }

  /* =========================================================
     Cart (shared by drawer + funnel)
     ========================================================= */
  const KEY = "zapi.cart.v2";
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { cart = {}; }
  Object.keys(cart).forEach((id) => { if (!catalog[id] || !(cart[id] > 0)) delete cart[id]; });
  const total = () => Object.entries(cart).reduce((s, [id, q]) => s + catalog[id].price * q, 0);
  const count = () => Object.values(cart).reduce((s, q) => s + q, 0);
  const qtyHtml = (id) => `<div class="qty"><button type="button" data-dec="${esc(id)}" aria-label="Quitar uno">−</button><b>${cart[id]}</b><button type="button" data-inc="${esc(id)}" aria-label="Agregar uno">+</button></div>`;

  const drawer = $("[data-drawer]");
  function renderCart(bump = true) {
    localStorage.setItem(KEY, JSON.stringify(cart));
    const ids = Object.keys(cart), empty = !ids.length;
    $("[data-cart-list]").innerHTML = ids.map((id) => `
      <li><strong>${esc(catalog[id].name)}</strong>${qtyHtml(id)}
        <span>${fmt(catalog[id].price)} c/u · ${fmt(catalog[id].price * cart[id])}</span></li>`).join("");
    $("[data-cart-empty]").hidden = !empty;
    $("[data-goto-funnel]").disabled = empty;
    $("[data-cart-total]").textContent = fmt(total());
    const c = $("[data-cart-count]");
    c.textContent = count();
    $("[data-mbar-count]").textContent = count();
    $("[data-mbar-total]").textContent = fmt(total());
    $(".mbar__cart").hidden = empty;
    if (bump) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
    renderFunnelCart();
    updatePreview();
  }

  let lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    drawer.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => $(".drawer__head .iconbtn").focus(), 50);
  }
  function closeCart(restore = true) {
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (restore && lastFocus) lastFocus.focus();
  }

  /* =========================================================
     WhatsApp funnel
     ========================================================= */
  const form = $("[data-funnel]");
  const F = { step: 1, intent: "", occasion: "", topic: "", when: "Lo antes posible" };
  const intentLabel = { delivery: "Pedido a domicilio", pickup: "Recojo en sucursal", event: "Mesa o evento", question: "Consulta" };
  const isOrder = () => F.intent === "delivery" || F.intent === "pickup";

  // in-funnel picker
  const pickerCats = [...Z.menu.map((c) => ({ id: c.id, name: c.name.replace("Zapi ", ""), items: c.items.map((i) => i.id) })),
    { id: "combos", name: "Combos", items: [Z.yapa.id, ...Z.combos.map((c) => c.id)] },
    { id: "bebidas", name: "Sodas y extras", items: [...Z.addons.sodas.map((s) => s.id), ...Z.addons.bordes.items.map((n) => `borde:${n}`)] }];
  const ftabs = $("[data-ftabs]"), fpicker = $("[data-fpicker]");
  ftabs.innerHTML = pickerCats.map((c, i) => `<button type="button" class="tab" aria-selected="${i === 0}" data-fcat="${c.id}">${esc(c.name)}</button>`).join("");
  function renderPicker(id) {
    fpicker.innerHTML = pickerCats.find((c) => c.id === id).items.map((iid) =>
      `<button type="button" class="fpick" data-add="${esc(iid)}"><span>${esc(catalog[iid].name)}</span><em>${fmt(catalog[iid].price)}</em><i>+</i></button>`).join("");
  }
  ftabs.addEventListener("click", (e) => {
    const t = e.target.closest("[data-fcat]"); if (!t) return;
    $$("[data-fcat]", ftabs).forEach((b) => b.setAttribute("aria-selected", b === t));
    renderPicker(t.dataset.fcat);
  });
  renderPicker(pickerCats[0].id);

  function renderFunnelCart() {
    const ids = Object.keys(cart);
    $("[data-fcart]").innerHTML = ids.length
      ? ids.map((id) => `<div class="fcart__row"><strong>${esc(catalog[id].name)}</strong>${qtyHtml(id)}<em>${fmt(catalog[id].price * cart[id])}</em></div>`).join("")
        + `<div class="fcart__total"><span>Total productos</span><b>${fmt(total())}</b></div>`
      : `<div class="fcart__empty">Tu pedido está vacío. Elegí tus Zapis abajo 👇</div>`;
  }

  const val = (n) => (form.elements[n] ? form.elements[n].value.trim() : "");
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-BO", { weekday: "long", day: "2-digit", month: "2-digit" });
  }

  function buildMessage() {
    if (!F.intent) return "¡Hola Zapi! 👋";
    const L = [];
    const name = val("name"), branch = val("branch"), note = val("note");
    if (isOrder()) {
      L.push(`¡Hola Zapi! 🍕 Quiero hacer un pedido ${F.intent === "delivery" ? "*a domicilio*" : "*para recoger*"}:`, "");
      const ids = Object.keys(cart);
      if (ids.length) {
        ids.forEach((id) => L.push(`• ${cart[id]} × ${catalog[id].name}: ${fmt(catalog[id].price * cart[id])}`));
        L.push("", `*Total productos: ${fmt(total())}*`);
      } else L.push("(elegí tus pizzas)");
      L.push("");
      if (name) L.push(`👤 ${name}`);
      if (branch) L.push(`📍 Sucursal: ${branch}`);
      if (F.intent === "delivery") {
        if (val("address")) L.push(`🏠 Dirección: ${val("address")}`);
        if (val("reference")) L.push(`↪ Referencia: ${val("reference")}`);
      }
      L.push(`🕒 ${F.when === "Programar" ? `Para las ${val("whenTime") || "…"}` : "Lo antes posible"}`);
    } else if (F.intent === "event") {
      L.push(`¡Hola Zapi! 🎉 Quiero reservar para ${F.occasion ? `un *${F.occasion.toLowerCase()}*` : "un evento"}:`, "");
      if (val("date")) L.push(`📅 ${fmtDate(val("date"))}${val("time") ? `, ${val("time")}` : ""}`);
      if (val("people")) L.push(`👥 ${val("people")} personas`);
      if (val("eventNote")) L.push(`📝 ${val("eventNote")}`);
      L.push("");
      if (name) L.push(`👤 ${name}`);
      if (branch) L.push(`📍 Sucursal: ${branch}`);
    } else {
      L.push(`¡Hola Zapi! 👋 Tengo una consulta${F.topic ? ` sobre *${F.topic.toLowerCase()}*` : ""}:`, "");
      L.push(val("question") || "…");
      L.push("");
      if (name) L.push(`👤 ${name}`);
      if (branch) L.push(`📍 Sucursal: ${branch}`);
    }
    if (note) L.push(`💬 Nota: ${note}`);
    return L.join("\n");
  }

  function recipient() {
    const b = branchByName(val("branch"));
    return b ? { number: b.whatsapp, label: `Zapi ${b.name}` } : { number: Z.config.callCenter, label: "Zapi Call Center" };
  }
  const phoneOut = $("[data-phone-out]"), phoneChat = $("[data-phone-chat]");
  function updatePreview() {
    const to = recipient();
    $("[data-phone-name]").textContent = to.label;
    $("[data-phone-num]").textContent = `+591 ${fmtPhone(to.number)}`;
    const t = new Date().toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false });
    phoneOut.innerHTML = esc(buildMessage()).replace(/\*(.+?)\*/g, "<b>$1</b>") + `<time>${t}</time>`;
    $$("[data-phone-time]").forEach((el) => (el.textContent = t));
    phoneChat.scrollTop = phoneChat.scrollHeight;
  }

  function validate(step) {
    if (step === 1 && !F.intent) return "Elegí una opción para seguir";
    if (step === 2) {
      if (isOrder() && !count()) return "Agregá al menos una pizza 🍕";
      if (F.intent === "event" && (!val("date") || !val("people"))) return "Contanos la fecha y cuántas personas";
      if (F.intent === "question" && !val("question")) return "Escribí tu consulta";
    }
    if (step === 3) {
      if (!val("name")) return "¿Cómo te llamás?";
      if (!val("branch")) return "Elegí una sucursal";
      if (val("branch") === CALL_CENTER && F.intent !== "question") return "Elegí la sucursal que va a preparar tu pedido";
      if (F.intent === "delivery" && !val("address")) return "Necesitamos tu dirección 📍";
      if (isOrder() && F.when === "Programar" && !val("whenTime")) return "¿A qué hora la querés?";
    }
    return "";
  }

  function renderSummary() {
    const rows = [["Tipo", intentLabel[F.intent]]];
    if (isOrder()) rows.push(["Pedido", Object.keys(cart).map((id) => `${cart[id]} × ${esc(catalog[id].name)}`).join("<br/>")], ["Total", `<b>${fmt(total())}</b>`]);
    if (F.intent === "event") rows.push(["Cuándo", `${esc(fmtDate(val("date")))} ${esc(val("time"))}`], ["Personas", esc(val("people"))]);
    if (F.intent === "question") rows.push(["Consulta", esc(val("question"))]);
    const to = recipient();
    rows.push(["Nombre", esc(val("name"))], ["Sucursal", esc(val("branch"))], ["Se envía a", `${esc(to.label)} · WhatsApp +591 ${fmtPhone(to.number)}`]);
    if (F.intent === "delivery") rows.push(["Dirección", esc(val("address"))]);
    $("[data-summary]").innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl><button type="button" data-goto-step="1">Editar desde el inicio</button>`;
  }

  const msgEl = $("[data-fmsg]");
  function go(step) {
    F.step = step;
    $$("[data-step]", form).forEach((f) => (f.hidden = +f.dataset.step !== step));
    $$("[data-step-tab]").forEach((li) => {
      const n = +li.dataset.stepTab;
      li.classList.toggle("is-active", n === step);
      li.classList.toggle("is-done", n < step);
    });
    $$("[data-detail]", form).forEach((d) => (d.hidden = d.dataset.detail !== (isOrder() ? "order" : F.intent)));
    $$("[data-only]", form).forEach((d) => (d.hidden = !d.dataset.only.split(" ").includes(F.intent)));
    const cc = branchSel.querySelector("[data-cc]");
    if (cc) cc.hidden = F.intent !== "question";
    if (F.intent !== "question" && branchSel.value === CALL_CENTER) branchSel.value = "";
    $("[data-prev]", form).style.visibility = step === 1 ? "hidden" : "visible";
    $("[data-next]", form).hidden = step === 4;
    $("[data-send]", form).hidden = step !== 4;
    if (step === 4) renderSummary();
    msgEl.textContent = "";
    updatePreview();
  }

  form.addEventListener("change", (e) => {
    if (e.target.name === "intent") {
      F.intent = e.target.value;
      setTimeout(() => go(2), 180);
    }
    updatePreview();
  });
  form.addEventListener("input", updatePreview);
  form.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-chip]");
    if (chip) {
      const group = chip.closest("[data-chipgroup]").dataset.chipgroup;
      $$("[data-chip]", chip.parentElement).forEach((c) => c.classList.toggle("is-on", c === chip));
      F[group] = chip.dataset.chip;
      if (group === "when") $("[data-when-time]").hidden = F.when !== "Programar";
      updatePreview();
    }
    if (e.target.closest("[data-goto-step]")) go(+e.target.closest("[data-goto-step]").dataset.gotoStep);
  });
  $("[data-next]", form).addEventListener("click", () => {
    const err = validate(F.step);
    if (err) { msgEl.textContent = err; return; }
    go(F.step + 1);
  });
  $("[data-prev]", form).addEventListener("click", () => go(Math.max(1, F.step - 1)));
  $("[data-send]", form).addEventListener("click", () => {
    for (const s of [1, 2, 3]) { const err = validate(s); if (err) { go(s); msgEl.textContent = err; return; } }
    const text = encodeURIComponent(buildMessage());
    const to = recipient();
    window.open(`https://wa.me/${to.number}?text=${text}`, "_blank", "noopener");
    toast(`¡Listo! Terminá de enviarlo a ${to.label} en WhatsApp 📲`);
  });
  function gotoFunnel() {
    closeCart(false);
    if (!isOrder()) { F.intent = "delivery"; const r = form.querySelector('input[value="delivery"]'); r.checked = true; }
    go(2);
    $("#pedir").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  /* =========================================================
     Global click delegation
     ========================================================= */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-add],[data-inc],[data-dec],[data-cart-open],[data-cart-close],[data-goto-funnel]");
    if (!t) return;
    if (t.dataset.add) {
      const id = t.dataset.add;
      cart[id] = (cart[id] || 0) + 1; renderCart(); toast(`🍕 ${catalog[id].name} agregado`);
    } else if (t.dataset.inc) { cart[t.dataset.inc]++; renderCart(); }
    else if (t.dataset.dec) { if (--cart[t.dataset.dec] <= 0) delete cart[t.dataset.dec]; renderCart(); }
    else if (t.hasAttribute("data-goto-funnel")) gotoFunnel();
    else if (t.hasAttribute("data-cart-open")) openCart();
    else if (t.hasAttribute("data-cart-close")) closeCart();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (drawer.classList.contains("is-open")) closeCart();
    else if (zapia.classList.contains("is-open")) closeZapia();
  });

  /* =========================================================
     Zap-IA (AI receptionist)
     ========================================================= */
  const zapia = $("[data-zapia]"), zbtn = $(".zbtn"), zlog = $("[data-zlog]"), zform = $("[data-zform]"), zinput = zform.elements.q;
  const ZKEY = "zapi.zapia.v1";
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(ZKEY)) || []; } catch { history = []; }
  let busy = false;
  const GREETING = "¡Hola! Soy **Zap-IA** 🍕, la recepcionista virtual de Zapi. Preguntame por el menú, precios, promos o sucursales y te ayudo al toque.";

  function md(text) {
    const lines = esc(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
    let html = "", list = false;
    for (const ln of lines) {
      const m = ln.match(/^\s*[-•*]\s+(.*)/);
      if (m) { if (!list) { html += "<ul>"; list = true; } html += `<li>${m[1]}</li>`; continue; }
      if (list) { html += "</ul>"; list = false; }
      html += ln.trim() ? `<p>${ln}</p>` : "";
    }
    return html + (list ? "</ul>" : "");
  }
  function addMsg(role, html) {
    const el = document.createElement("div");
    el.className = `zmsg zmsg--${role}`;
    el.innerHTML = html;
    zlog.appendChild(el);
    zlog.scrollTop = zlog.scrollHeight;
    return el;
  }
  function renderLog() {
    zlog.innerHTML = "";
    addMsg("bot", md(GREETING));
    history.forEach((m) => addMsg(m.role === "user" ? "me" : "bot", md(m.content)));
    $("[data-zchips]").hidden = history.length > 0;
  }
  function openZapia() {
    renderLog();
    zapia.classList.add("is-open"); zapia.setAttribute("aria-hidden", "false");
    zbtn.classList.add("is-hidden");
    document.body.classList.add("zapia-open");
    setTimeout(() => zinput.focus(), 200);
  }
  function closeZapia() {
    zapia.classList.remove("is-open"); zapia.setAttribute("aria-hidden", "true");
    zbtn.classList.remove("is-hidden");
    document.body.classList.remove("zapia-open");
    if (getComputedStyle(zbtn).display !== "none") zbtn.focus();
  }
  $$("[data-zapia-open]").forEach((b) => b.addEventListener("click", openZapia));
  $("[data-zapia-close]").addEventListener("click", closeZapia);
  $("[data-zchips]").addEventListener("click", (e) => { if (e.target.matches("button")) ask(e.target.textContent); });
  zform.addEventListener("submit", (e) => { e.preventDefault(); ask(zinput.value); });
  zlog.addEventListener("click", (e) => { if (e.target.closest("[data-zgo]")) closeZapia(); });

  const fallbackHtml = (lead) => `${lead} Mientras tanto, mirá <a href="#menu" data-zgo>el menú</a> o hacé tu pedido con <a href="#pedir" data-zgo>Pedir por WhatsApp</a> 🍕`;

  async function ask(q) {
    q = (q || "").trim();
    if (!q || busy) return;
    busy = true; zinput.value = ""; zform.querySelector("button").disabled = true;
    $("[data-zchips]").hidden = true;
    history.push({ role: "user", content: q.slice(0, 600) });
    addMsg("me", md(q));
    const bot = addMsg("bot", '<span class="zdots"><i></i><i></i><i></i></span>');
    let text = "";
    try {
      const res = await fetch("/api/zapia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-16) }),
      });
      if (res.status === 503 || res.status === 404 || res.status === 501 || res.status === 405) throw { kind: "setup" };
      if (res.status === 429) throw { kind: "rate" };
      if (!res.ok || !res.body) throw { kind: "net" };
      const reader = res.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        if (text.includes("[[error]]")) throw { kind: "net" };
        bot.innerHTML = md(text);
        zlog.scrollTop = zlog.scrollHeight;
      }
      if (!text.trim()) throw { kind: "net" };
      history.push({ role: "assistant", content: text.trim() });
    } catch (err) {
      history.pop(); // don't keep an unanswered question in the context
      bot.className = "zmsg zmsg--err";
      bot.innerHTML = fallbackHtml(
        err.kind === "setup" ? "Zap-IA se está preparando y muy pronto va a estar atendiendo 🛠️."
        : err.kind === "rate" ? "¡Uf, muchas preguntas seguidas! Esperá un minutito 🙏."
        : "Se me cortó la conexión 😅. Probá de nuevo en un rato.");
    }
    sessionStorage.setItem(ZKEY, JSON.stringify(history.slice(-20)));
    busy = false; zform.querySelector("button").disabled = false; zinput.focus();
  }

  /* ---------- mobile action bar: visible after the hero, hidden over the funnel ---------- */
  const mbar = $("[data-mbar]");
  const vis = { hero: true, funnel: false, footer: false };
  const syncBar = () => mbar.classList.toggle("is-on", !vis.hero && !vis.funnel && !vis.footer);
  const barIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.target.matches(".hero")) vis.hero = e.isIntersecting;
      else if (e.target.matches("#pedir")) vis.funnel = e.isIntersecting;
      else vis.footer = e.isIntersecting;
    });
    syncBar();
  }, { rootMargin: "-35% 0px -35% 0px" });
  [$(".hero"), $("#pedir"), $(".footer")].forEach((el) => barIO.observe(el));

  /* ---------- boot ---------- */
  go(1);
  renderCart(false);
})();
