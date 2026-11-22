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
  const catalog = Z.catalog();

  /* =========================================================
     Static renders
     ========================================================= */
  /* ---------- promo ticker ---------- */
  const slice = '<span class="ticker__sep" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6.5C9 3 15 3 21 6.5L12 21Z"/><path d="M4.6 9.3c4.8-2.3 10-2.3 14.8 0"/><circle cx="10" cy="11.5" r="1.1"/><circle cx="14.2" cy="14" r="1.1"/><circle cx="11.6" cy="16.6" r=".9"/></svg></span>';
  function renderTicker() {
    const day = nowInBolivia().day;
    const today = Z.weekly.find((w) => w.day === day);
    const cheapest = Math.min(...Z.combos.map((c) => c.price));
    const items = [
      `Combos aniversario con soda incluida <b>desde ${fmt(cheapest)}</b>`,
      `La Yapa del mes: <b>${esc(Z.yapa.name.split(" · ")[0])} a ${fmt(Z.yapa.price)}</b>`,
      today ? `Hoy es <b>${esc(today.name)} ${esc(today.title)}</b>: ${esc(today.desc)} a ${today.from ? "desde " : ""}${fmt(today.price)}`
            : `Probá la nueva <b>Doriloco</b> en tu Zapi más cercana`,
      `Pedí por WhatsApp a <b>tu sucursal</b> o encontranos en Yango`,
    ];
    const run = items.map((t) => `<span class="ticker__item">${t}</span>${slice}`).join("");
    $("[data-ticker]").innerHTML = run + `<span style="display:contents" aria-hidden="true">${run}</span>`;
  }
  renderTicker();

  /* ---------- offers row ---------- */
  const offersEl = $("[data-offers]");
  offersEl.innerHTML = Z.offers.map((o) => `<a class="offer" href="${o.href}"><img src="${o.img}" alt="${esc(o.alt)}" loading="lazy" width="900" height="1125" /></a>`).join("");
  const offerStep = () => (offersEl.querySelector(".offer").offsetWidth + 20) * (innerWidth > 1080 ? 2 : 1);
  const syncOfferArrows = () => {
    $("[data-offers-prev]").disabled = offersEl.scrollLeft < 8;
    $("[data-offers-next]").disabled = offersEl.scrollLeft + offersEl.clientWidth > offersEl.scrollWidth - 8;
  };
  $("[data-offers-prev]").addEventListener("click", () => offersEl.scrollBy({ left: -offerStep(), behavior: "smooth" }));
  $("[data-offers-next]").addEventListener("click", () => offersEl.scrollBy({ left: offerStep(), behavior: "smooth" }));
  offersEl.addEventListener("scroll", syncOfferArrows, { passive: true });
  addEventListener("resize", syncOfferArrows); syncOfferArrows();

  /* ---------- la semana Zapi: one card per promo day, with its Instagram artwork ---------- */
  function renderWeek() {
    const today = nowInBolivia().day;
    $("[data-week]").innerHTML = Z.weekly.map((w, i) => {
      const isToday = w.day === today;
      const cat = (w.cats || [])[0];
      const link = w.pale ? `<a class="day__go" href="#pale">Ver Palé →</a>`
        : cat ? `<a class="day__go" href="#menu" data-week-cat="${esc(cat)}">Ver ${esc(w.title.replace(/^de /, "").split(" ")[0])} →</a>` : "";
      return `<article class="day reveal${isToday ? " is-today" : ""}${w.pale ? " day--pale" : ""}" style="transition-delay:${i * 70}ms">
        <div class="day__art">
          ${w.img ? `<img src="${w.img}" alt="${esc(`${w.name} ${w.title}: ${w.desc} a Bs ${w.price}`)}" loading="lazy" width="900" height="1125" />` : ""}
          ${isToday ? '<span class="day__today">Hoy</span>' : ""}
        </div>
        <div class="day__body">
          <p class="day__name">${esc(w.name)}</p>
          <h3 class="day__title">${esc(w.title)}</h3>
          <p class="day__desc">${esc(w.desc)}</p>
          <div class="day__price"><small>Bs</small>${esc(w.price)}${w.was ? `<s>Bs ${esc(w.was)}</s>` : ""}</div>
          <div class="day__foot"><span class="day__save">${esc(w.save)}</span>${link}</div>
        </div>
      </article>`;
    }).join("");
  }
  renderWeek();
  $("[data-week]").addEventListener("click", (e) => {
    const go = e.target.closest("[data-week-cat]");
    if (!go) return;
    const tab = $(`[data-cat="${go.dataset.weekCat}"]`);
    if (tab) tab.click();
  });

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
  const obForm = $("[data-orderbox]"), obBranch = $("[data-ob-branch]");
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
    const obCurrent = obBranch.value;
    obBranch.innerHTML = `<option value="">Elegí tu sucursal</option>` + Z.branches.map((b) =>
      `<option value="${esc(b.name)}">${esc(b.name)} · ${branchStatus(b, n).text}</option>`).join("");
    obBranch.value = obCurrent;
    $("[data-fbranches]").innerHTML = Z.branches.map((b) =>
      `<li><a href="#sucursales">${esc(b.name)} · ${b.open}–${b.close}</a></li>`).join("");
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
  const tickH = () => $("[data-ticker-wrap]").offsetHeight;
  const onScroll = () => nav.classList.toggle("is-solid", scrollY > tickH() + 10);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("[data-burger]");
  burger.addEventListener("click", () => burger.setAttribute("aria-expanded", nav.classList.toggle("is-open")));
  $$(".nav__links a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", false); }));

  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("is-in");
    io.unobserve(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  const vio = new IntersectionObserver((entries) => entries.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting && !reduceMotion) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
  }), { threshold: 0.35 });
  $$("video[data-autoplay]").forEach((v) => vio.observe(v));
  /* ---------- hero: live status + pointer parallax ---------- */
  function renderHeroLive() {
    const n = nowInBolivia();
    const open = Z.branches.filter((b) => n.minutes >= toMin(b.open) && n.minutes < toMin(b.close)).length;
    const firstOpen = Z.branches.map((b) => b.open).sort()[0];
    const lastClose = Z.branches.map((b) => b.close).sort().at(-1);
    const status = open
      ? `<b>${open} de ${Z.branches.length}</b> sucursales abiertas ahora`
      : n.minutes >= toMin(lastClose) ? `Volvemos mañana desde las <b>${firstOpen}</b>` : `Abrimos hoy desde las <b>${firstOpen}</b>`;
    $("[data-hero-live]").innerHTML = `<span class="dot${open ? "" : " dot--off"}"></span><span>${status}</span>`;
    $("[data-nav-open] span:last-child").textContent = open ? `${open} de ${Z.branches.length} abiertas` : "Sucursales";
  }
  renderHeroLive();
  setInterval(renderHeroLive, 60_000);

  /* ---------- hero: promo carousel ---------- */
  const hero = $("[data-hero]"), slides = $$("[data-slide]"), dots = $$("[data-dots] button");
  let cur = 0, timer = 0, paused = false;
  function show(i) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((sl, k) => {
      const on = k === cur;
      sl.classList.toggle("is-active", on);
      sl.toggleAttribute("inert", !on);
      const v = sl.querySelector("video");
      if (v) { if (on && !reduceMotion) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause(); }
    });
    dots.forEach((d, k) => d.setAttribute("aria-selected", k === cur));
    const light = slides[cur].dataset.tone === "light";
    hero.classList.toggle("on-light", light);
    nav.classList.toggle("on-light", light);
  }
  const SLIDE_MS = 6500;
  function schedule() {
    clearTimeout(timer);
    if (reduceMotion || paused || document.hidden) return;
    timer = setTimeout(() => { show(cur + 1); schedule(); }, SLIDE_MS);
  }
  dots.forEach((d, k) => d.addEventListener("click", () => { show(k); schedule(); }));
  const slidesEl = $("[data-slides]");
  slidesEl.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { paused = true; clearTimeout(timer); } });
  slidesEl.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { paused = false; schedule(); } });
  hero.addEventListener("focusin", () => { paused = true; clearTimeout(timer); });
  hero.addEventListener("focusout", () => { paused = false; schedule(); });
  document.addEventListener("visibilitychange", schedule);
  let x0 = null;
  slidesEl.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  slidesEl.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) { show(cur + (dx < 0 ? 1 : -1)); schedule(); }
  });
  hero.addEventListener("keydown", (e) => {
    if (!e.target.closest("[data-dots]")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      show(cur + (e.key === "ArrowRight" ? 1 : -1)); dots[cur].focus();
    }
  });
  // pause the carousel's video when the hero scrolls away
  new IntersectionObserver(([e]) => {
    const v = slides[cur].querySelector("video");
    if (v) { if (e.isIntersecting && !reduceMotion) v.play().catch(() => {}); else v.pause(); }
  }, { threshold: 0.2 }).observe(hero);
  show(0); schedule();

  /* ---------- WhatsApp QR card ---------- */
  const qr = $("[data-qr]");
  if (sessionStorage.getItem("zapi.qr.closed")) qr.hidden = true;
  $("[data-qr-close]").addEventListener("click", () => { qr.hidden = true; sessionStorage.setItem("zapi.qr.closed", "1"); });

  /* ---------- footer link groups: one open at a time ---------- */
  const fgroups = $$("[data-fgroups] details");
  fgroups.forEach((d) => d.addEventListener("toggle", () => { if (d.open) fgroups.forEach((o) => { if (o !== d) o.open = false; }); }));
  document.addEventListener("click", (e) => {
    if (innerWidth > 860 && !e.target.closest("[data-fgroups]")) fgroups.forEach((d) => (d.open = false));
  });

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
  obForm.addEventListener("submit", (e) => {
    e.preventDefault();
    F.intent = obForm.elements.ob.value;
    form.querySelector(`input[name="intent"][value="${F.intent}"]`).checked = true;
    if (obBranch.value) branchSel.value = obBranch.value;
    go(2);
    $("#pedir").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
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
     Zap-IA (AI ordering assistant): chat + live cart + voice
     Server streams NDJSON events (text, cart, options, readback, location, order, handoff, state, error).
     ========================================================= */
  const zapia = $("[data-zapia]"), zbtn = $(".zbtn"), zlog = $("[data-zlog]"), zform = $("[data-zform]"), zinput = zform.elements.q;
  const zchips = $("[data-zchips]"), zsend = $(".zapia__send"), zmic = $("[data-zmic]");
  const zvoice = $("[data-zvoice]"), zvstatus = $("[data-zvstatus]"), zhands = $("[data-zhands]");
  const ZKEY = "zapi.zapia.v1", SKEY = "zapi.zapia.state.v2", MKEY = "zapi.mipedido.v1";
  const load = (store, k, d) => { try { const v = JSON.parse(store.getItem(k)); return v == null ? d : v; } catch { return d; } };
  let history = load(sessionStorage, ZKEY, []);
  if (!Array.isArray(history)) history = [];
  let zstate = load(sessionStorage, SKEY, {});
  if (!zstate || typeof zstate !== "object" || Array.isArray(zstate)) zstate = {};
  let mipedido = load(localStorage, MKEY, []);
  if (!Array.isArray(mipedido)) mipedido = [];
  let busy = false;
  const GREETING = "¡Hola! Soy **Zap-IA** 🍕, la recepcionista virtual de Zapi. Te ayudo con el menú, las promos y a armar tu pedido. Escribime o tocá el micrófono 🎙️ y pedime por voz.";
  const DEFAULT_CHIPS = ["¿Qué promos hay hoy?", "Quiero una pizza", "¿Qué sucursales están abiertas?", "Opciones sin carne"];

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
  const scrollLog = () => { zlog.scrollTop = zlog.scrollHeight; };
  function addMsg(role, html) {
    const el = document.createElement("div");
    el.className = `zmsg zmsg--${role}`;
    el.innerHTML = html;
    zlog.appendChild(el);
    scrollLog();
    return el;
  }
  function addCard(cls, html) {
    const el = document.createElement("div");
    el.className = `zcard ${cls}`;
    el.innerHTML = html;
    zlog.appendChild(el);
    scrollLog();
    return el;
  }
  function renderChips() {
    const list = history.length ? [] : (mipedido.length ? ["🍕 Lo de siempre", ...DEFAULT_CHIPS.slice(0, 3)] : DEFAULT_CHIPS);
    zchips.innerHTML = list.map((t) => `<button type="button" data-zsend="${esc(t)}">${esc(t)}</button>`).join("");
    zchips.hidden = !list.length;
  }
  function renderLog() {
    zlog.innerHTML = "";
    addMsg("bot", md(GREETING));
    history.forEach((m) => addMsg(m.role === "user" ? "me" : "bot", md(m.content)));
    renderChips();
  }
  function saveZ() {
    sessionStorage.setItem(ZKEY, JSON.stringify(history.slice(-20)));
    sessionStorage.setItem(SKEY, JSON.stringify(zstate));
    localStorage.setItem(MKEY, JSON.stringify(mipedido.slice(0, 3)));
  }

  /* ---------- cards ---------- */
  function applyCart(next) {
    const clean = {};
    Object.entries(next || {}).forEach(([id, q]) => { const n = Math.floor(Number(q)); if (catalog[id] && n > 0) clean[id] = Math.min(n, 50); });
    cart = clean;
    renderCart();
  }
  function cartCardHtml() {
    const ids = Object.keys(cart);
    if (!ids.length) return `<p class="zcard__title">Tu pedido está vacío</p>`;
    return `<p class="zcard__title">Tu pedido · ${count()} ${count() === 1 ? "producto" : "productos"}</p>
      <ul class="zcard__lines">${ids.map((id) => `<li><span><b>${cart[id]} ×</b> ${esc(catalog[id].name)}</span><em>${fmt(catalog[id].price * cart[id])}</em></li>`).join("")}</ul>
      <div class="zcard__total"><span>Total productos</span><strong>${fmt(total())}</strong></div>
      <div class="zcard__actions"><button type="button" class="zbtn2" data-zcart-open>Ver pedido</button></div>`;
  }
  function readbackHtml(s) {
    const rows = [["Entrega", s.entrega], ["Sucursal", s.sucursal], ["Cuándo", s.cuando], ["Nombre", s.nombre], ["Pago", s.pago], ["Nota", s.nota]].filter(([, v]) => v);
    return `<p class="zcard__title">Resumen de tu pedido</p>
      <ul class="zcard__lines">${(s.lines || []).map((l) => `<li><span><b>${esc(l.qty)} ×</b> ${esc(l.name)}</span><em>${fmt(l.subtotal)}</em></li>`).join("")}</ul>
      <div class="zcard__total"><span>Total productos</span><strong>${esc(s.total_text || "")}</strong></div>
      <dl class="zcard__dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${s.aclaracion ? `<p class="zcard__fine">${esc(s.aclaracion)}</p>` : ""}
      <div class="zopts"><button type="button" class="is-main" data-zsend="Sí, confirmar">Sí, confirmar</button><button type="button" data-zsend="Cambiar algo">Cambiar algo</button></div>`;
  }
  const WA_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z"/></svg>';
  const safeUrl = (u) => (/^https:\/\/wa\.me\//.test(String(u || "")) ? String(u) : "");
  function orderHtml(ev) {
    const url = safeUrl(ev.url);
    return `<p class="zcard__title">Pedido ${esc(ev.id || "")} listo 🎉</p>
      <p class="zcard__sub">Para ${esc(ev.branch || "tu sucursal")}${ev.total ? ` · ${esc(ev.total)}` : ""}</p>
      ${url ? `<a class="zwa" href="${esc(url)}" target="_blank" rel="noopener">${WA_ICON} Enviar pedido por WhatsApp</a>` : ""}
      <p class="zcard__fine">Tocá enviar en WhatsApp. La sucursal te confirma el pedido y el tiempo de entrega por ahí.</p>`;
  }
  function handoffHtml(ev) {
    const url = safeUrl(ev.url);
    return url ? `<a class="zwa zwa--ghost" href="${esc(url)}" target="_blank" rel="noopener">${WA_ICON} Hablar con una persona (${esc(ev.to || "Zapi")})</a>` : "";
  }

  /* ---------- open / close ---------- */
  function openZapia() {
    renderLog();
    zapia.classList.add("is-open"); zapia.setAttribute("aria-hidden", "false");
    zbtn.classList.add("is-hidden");
    document.body.classList.add("zapia-open");
    setTimeout(() => zinput.focus(), 200);
  }
  function closeZapia() {
    stopVoice();
    zapia.classList.remove("is-open"); zapia.setAttribute("aria-hidden", "true");
    zbtn.classList.remove("is-hidden");
    document.body.classList.remove("zapia-open");
    if (getComputedStyle(zbtn).display !== "none") zbtn.focus();
  }
  $$("[data-zapia-open]").forEach((b) => b.addEventListener("click", openZapia));
  $("[data-zapia-close]").addEventListener("click", closeZapia);
  zchips.addEventListener("click", (e) => { const b = e.target.closest("[data-zsend]"); if (b) ask(b.dataset.zsend); });
  zform.addEventListener("submit", (e) => { e.preventDefault(); ask(zinput.value); });
  zlog.addEventListener("click", (e) => {
    if (e.target.closest("[data-zgo]")) return closeZapia();
    const s = e.target.closest("[data-zsend]");
    if (s && !busy) return ask(s.dataset.zsend);
    if (e.target.closest("[data-zcart-open]")) return openCart();
    if (e.target.closest("[data-zloc]")) return shareLocation(e.target.closest("[data-zloc]"));
  });

  function shareLocation(btn) {
    if (!navigator.geolocation) { addMsg("bot", md("Tu navegador no me deja ver la ubicación. Escribime la dirección y una referencia (ej. *frente a la plaza*) 📍")); return; }
    btn.disabled = true; btn.textContent = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition((pos) => {
      zstate.order = { ...(zstate.order || {}), location: { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) } };
      saveZ();
      btn.textContent = "📍 Ubicación compartida";
      ask("📍 Te comparto mi ubicación");
    }, () => {
      btn.disabled = false; btn.textContent = "📍 Compartir mi ubicación";
      addMsg("bot", md("No pude obtener tu ubicación 😅. Escribime la dirección y una referencia (ej. *portón rojo, frente a la plaza*) y seguimos."));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  const fallbackHtml = (lead) => `${lead} Mientras tanto, mirá <a href="#menu" data-zgo>el menú</a> o hacé tu pedido con <a href="#pedir" data-zgo>Pedir por WhatsApp</a> 🍕`;

  async function ask(q, opts = {}) {
    q = (q || "").trim();
    if (!q || busy) return;
    const voice = !!opts.voice;
    stopSpeaking();
    busy = true; zinput.value = ""; zsend.disabled = true;
    zchips.hidden = true;
    $$(".zopts", zlog).forEach((o) => o.remove()); // old quick replies are stale now
    history.push({ role: "user", content: q.slice(0, 600) });
    addMsg("me", md(q));
    if (voice) setV("thinking", "Pensando…");
    let bubble = addMsg("bot", '<span class="zdots"><i></i><i></i><i></i></span>'), bubbleText = "";
    const parts = [], seen = new Set();
    let cartCard = null, gotState = false;
    const newBubble = () => { if (!bubble) { bubble = addMsg("bot", ""); bubbleText = ""; } };
    const closeBubble = () => { if (bubble && !bubbleText) bubble.remove(); bubble = null; };
    function onEvent(ev) {
      if (!ev || typeof ev !== "object") return;
      switch (ev.type) {
        case "text":
          if (typeof ev.text !== "string" || !ev.text) return;
          newBubble();
          bubbleText += ev.text;
          bubble.innerHTML = md(bubbleText);
          if (!parts.length || parts[parts.length - 1].card) parts.push({ text: "" });
          parts[parts.length - 1].text += ev.text;
          break;
        case "cart":
          applyCart(ev.cart);
          closeBubble();
          if (cartCard) { cartCard.innerHTML = cartCardHtml(); zlog.appendChild(cartCard); } else cartCard = addCard("zcard--cart", cartCardHtml());
          parts.push({ card: true });
          seen.add("carrito");
          break;
        case "options": {
          const o = (Array.isArray(ev.options) ? ev.options : []).filter((x) => typeof x === "string" && x.trim()).slice(0, 4);
          if (!o.length) return;
          closeBubble();
          const el = document.createElement("div");
          el.className = "zopts";
          el.innerHTML = o.map((t) => `<button type="button" data-zsend="${esc(t)}">${esc(t)}</button>`).join("");
          zlog.appendChild(el);
          parts.push({ card: true });
          break;
        }
        case "readback":
          closeBubble();
          addCard("zcard--receipt", readbackHtml(ev.summary || {}));
          parts.push({ card: true });
          seen.add("resumen del pedido");
          break;
        case "location":
          closeBubble();
          addCard("zcard--loc", `<button type="button" class="zbtn2 zbtn2--loc" data-zloc>📍 Compartir mi ubicación</button><p class="zcard__fine">Ideal si no tenés número de casa: mandamos el pin a la sucursal.</p>`);
          parts.push({ card: true });
          break;
        case "order":
          closeBubble();
          addCard("zcard--order", orderHtml(ev));
          parts.push({ card: true });
          seen.add(`pedido ${ev.id || ""}`.trim());
          toast(`🎉 Pedido ${ev.id || ""} listo: envialo por WhatsApp`);
          break;
        case "handoff": {
          const h = handoffHtml(ev);
          if (!h) return;
          closeBubble();
          addCard("zcard--handoff", h);
          parts.push({ card: true });
          break;
        }
        case "state": {
          const s = ev.state || {};
          gotState = true;
          zstate = { prevCart: s.prevCart || null, order: s.order || {}, stage: s.stage || "browsing", token: s.token || null, upsold: !!s.upsold, newsShown: !!s.newsShown };
          if (Array.isArray(s.history)) mipedido = s.history.slice(0, 3);
          if (s.cart) applyCart(s.cart);
          if (cartCard) cartCard.innerHTML = cartCardHtml();
          break;
        }
        case "error":
          throw { kind: "net" };
      }
      scrollLog();
    }
    try {
      const res = await fetch("/api/zapia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-16), state: { ...zstate, cart, history: mipedido }, channel: voice ? "voice" : "text" }),
      });
      if (res.status === 503 || res.status === 404 || res.status === 501 || res.status === 405) throw { kind: "setup" };
      if (res.status === 429) throw { kind: "rate" };
      if (!res.ok || !res.body) throw { kind: "net" };
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      const flush = (final) => {
        const lines = buf.split("\n");
        buf = final ? "" : lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          onEvent(ev);
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        flush(false);
      }
      buf += dec.decode();
      flush(true);
      const text = parts.filter((p) => !p.card).map((p) => p.text.trim()).filter(Boolean).join("\n\n");
      if (!text && !seen.size && !gotState) throw { kind: "net" };
      if (bubble && !bubbleText) { bubble.remove(); bubble = null; }
      history.push({ role: "assistant", content: (text || `(Zap-IA mostró: ${[...seen].join(", ") || "opciones"})`).slice(0, 4000) });
      saveZ();
      busy = false; zsend.disabled = false;
      if (voice && text) speak(text);
      else { if (voice) setV("idle"); zinput.focus(); }
    } catch (err) {
      history.pop(); // don't keep an unanswered question in the context
      if (!bubble) bubble = addMsg("bot", "");
      bubble.className = "zmsg zmsg--err";
      bubble.innerHTML = fallbackHtml(
        err.kind === "setup" ? "Zap-IA se está preparando y muy pronto va a estar atendiendo 🛠️."
        : err.kind === "rate" ? "¡Uf, muchas preguntas seguidas! Esperá un minutito 🙏."
        : "Se me cortó la conexión 😅. Probá de nuevo en un rato.");
      saveZ();
      busy = false; zsend.disabled = false;
      if (voice) { handsFree = false; zhands.checked = false; setV("idle"); }
      zinput.focus();
    }
  }

  /* ---------- voice mode (Web Speech API) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let rec = null, vmode = "idle", handsFree = false, wakeLock = null, ttsVoice = null;
  const VSTATUS = { idle: "Tocá el micrófono y hablame", listening: "Te escucho…", thinking: "Pensando…", speaking: "Hablando… tocá para interrumpir" };
  if (SR) { zmic.hidden = false; zvoice.hidden = false; }
  function setV(mode, status) {
    vmode = mode;
    zapia.dataset.voice = mode;
    zvstatus.textContent = status || VSTATUS[mode];
    zmic.setAttribute("aria-pressed", String(mode === "listening"));
    zmic.setAttribute("aria-label", mode === "listening" ? "Dejar de escuchar" : mode === "speaking" ? "Interrumpir y hablar" : "Hablar con Zap-IA");
    syncWake();
  }
  async function syncWake() {
    const want = (vmode !== "idle" || handsFree) && zapia.classList.contains("is-open");
    if (want && !wakeLock && "wakeLock" in navigator && document.visibilityState === "visible") {
      try { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } catch { wakeLock = null; }
    } else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncWake(); });

  function pickVoice() {
    if (!canSpeak) return null;
    const voices = speechSynthesis.getVoices();
    const lang = (v) => (v.lang || "").replace("_", "-").toLowerCase();
    for (const pref of ["es-bo", "es-419", "es-mx", "es-us", "es-es"]) { const v = voices.find((x) => lang(x).startsWith(pref)); if (v) return v; }
    return voices.find((x) => lang(x).startsWith("es")) || null;
  }
  if (canSpeak) { ttsVoice = pickVoice(); speechSynthesis.addEventListener?.("voiceschanged", () => { ttsVoice = pickVoice(); }); }
  function forSpeech(t) {
    return String(t)
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\*\*?|__|`|#+\s/g, "")
      .replace(/^\s*[-•*]\s+/gm, "")
      .replace(/Bs\.?\s?(\d+(?:[.,]\d+)?)/g, "$1 bolivianos")
      .replace(/×/g, " por ").replace(/c\/u/g, "cada una")
      .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍]/gu, "")
      .replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
  }
  function stopSpeaking() {
    if (canSpeak && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
    if (vmode === "speaking") setV("idle");
  }
  function speak(text) {
    const said = forSpeech(text);
    if (!canSpeak || !said) { afterSpeak(); return; }
    // Chrome cuts long utterances: queue sentence-sized chunks
    const chunks = said.match(/[^.!?¿¡]+[.!?]*|[¿¡][^.!?]+[.!?]*/g) || [said];
    const merged = [];
    chunks.forEach((c) => { c = c.trim(); if (!c) return; if (merged.length && (merged[merged.length - 1] + " " + c).length < 180) merged[merged.length - 1] += " " + c; else merged.push(c); });
    speechSynthesis.cancel();
    setV("speaking");
    merged.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (ttsVoice) { u.voice = ttsVoice; u.lang = ttsVoice.lang; } else u.lang = "es-ES";
      u.rate = 1.05;
      if (i === merged.length - 1) u.onend = () => { if (vmode === "speaking") afterSpeak(); };
      u.onerror = () => { if (vmode === "speaking") afterSpeak(); };
      speechSynthesis.speak(u);
    });
  }
  function afterSpeak() {
    setV("idle");
    if (handsFree && zapia.classList.contains("is-open") && !busy) listen(true);
  }
  function listen(auto = false) {
    if (!SR || busy) return;
    if (canSpeak) speechSynthesis.cancel(); // barge-in
    if (rec) { try { rec.abort(); } catch {} rec = null; }
    const r = new SR();
    rec = r;
    r.lang = "es-BO"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let finalText = "", err = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
      }
      zinput.value = (finalText + interim).trim();
    };
    r.onerror = (e) => { err = e.error || "error"; };
    r.onend = () => {
      if (rec !== r) return;
      rec = null;
      const t = (finalText || zinput.value).trim();
      if (t && !err) { ask(t, { voice: true }); return; }
      zinput.value = "";
      setV("idle");
      if (err === "not-allowed" || err === "service-not-allowed") {
        handsFree = false; zhands.checked = false; syncWake();
        addMsg("bot", md("No tengo permiso para usar el micrófono 🎙️. Activalo en tu navegador o escribime nomás, te ayudo igual."));
      } else if (err === "aborted") {
        /* user or app stopped it */
      } else if (auto || err === "no-speech") {
        if (handsFree) { handsFree = false; zhands.checked = false; syncWake(); }
        zvstatus.textContent = "No te escuché. Tocá el micrófono para intentar de nuevo.";
      } else if (err) {
        addMsg("bot", md("Se me complicó escucharte 😅. Probá de nuevo o escribime."));
      }
    };
    try { r.start(); setV("listening"); } catch { rec = null; setV("idle"); }
  }
  function stopVoice() {
    handsFree = false; zhands.checked = false;
    if (rec) { const r = rec; rec = null; try { r.abort(); } catch {} }
    if (canSpeak) speechSynthesis.cancel();
    setV("idle");
  }
  zmic.addEventListener("click", () => {
    if (vmode === "listening" && rec) { try { rec.stop(); } catch {} return; }
    listen();
  });
  zvoice.addEventListener("click", (e) => { if (vmode === "speaking" && !e.target.closest(".zapia__hands")) { stopSpeaking(); zinput.focus(); } });
  zhands.addEventListener("change", () => {
    handsFree = zhands.checked;
    if (handsFree && vmode === "idle" && !busy) listen(); else syncWake();
  });
  setV("idle");

  /* ---------- mobile action bar: visible after the hero, hidden over the funnel ---------- */
  const mbar = $("[data-mbar]");
  const vis = { hero: true, funnel: false, footer: false };
  const syncBar = () => {
    mbar.classList.toggle("is-on", !vis.hero && !vis.funnel && !vis.footer);
    zbtn.classList.toggle("is-away", vis.footer); // the footer has its own "Ayuda" button
  };
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
