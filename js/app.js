(() => {
  "use strict";
  const Z = window.ZAPI;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- time in Santa Cruz (America/La_Paz) ---------- */
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
    if (t < o) return o - t <= 60 ? { cls: "soon", text: `Abre ${b.open}` } : { cls: "closed", text: `Abre ${b.open}` };
    return { cls: "closed", text: "Cerrado" };
  }

  /* ---------- catalog (only items with a published price can be ordered) ---------- */
  const catalog = {};
  Z.combos.forEach((c) => (catalog[c.id] = { name: c.name, price: c.price }));
  Z.featured.filter((f) => f.price).forEach((f) => (catalog[f.id] = { name: `${f.name} (${f.tag})`, price: f.price }));

  /* ---------- render: stats ---------- */
  const statsEl = $("[data-stats]");
  statsEl.innerHTML = Z.stats.map((s) =>
    `<div><dt data-count="${s.value}" data-dec="${s.decimals || 0}" data-suffix="${esc(s.suffix)}">0${esc(s.suffix)}</dt><dd>${esc(s.label)}</dd></div>`
  ).join("");

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

  /* ---------- render: weekly promos ---------- */
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

  /* ---------- render: combos ---------- */
  const comboIcons = ["🌭", "🧀", "🔥", "🎉"];
  $("[data-combos]").innerHTML = Z.combos.map((c, i) => `
    <article class="combo reveal ${c.star ? "combo--star" : ""}" style="transition-delay:${i * 70}ms">
      ${c.star ? '<span class="combo__flag">Para compartir</span>' : c.hot ? '<span class="combo__flag">Favorito</span>' : ""}
      <div class="combo__icon" aria-hidden="true">${comboIcons[i] || "🍕"}</div>
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.note)}</p>
      <div class="combo__foot">
        <div class="combo__price"><small>Bs</small>${c.price}</div>
        <button class="addbtn" data-add="${c.id}" aria-label="Agregar ${esc(c.name)} al pedido">+</button>
      </div>
    </article>`).join("");

  /* ---------- render: featured ---------- */
  $("[data-featured]").innerHTML = Z.featured.map((f, i) => `
    <article class="feat reveal" style="transition-delay:${i * 80}ms">
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
          ${f.price
            ? `<div class="combo__price"><small>Bs</small>${f.price}</div><button class="addbtn" data-add="${f.id}" aria-label="Agregar ${esc(f.name)}">+</button>`
            : `<span class="feat__ask">Consultá precio en tu sucursal</span>`}
        </div>
      </div>
    </article>`).join("");

  /* ---------- render: reels ---------- */
  $("[data-reels]").innerHTML = Z.reels.map((r) => `
    <a class="reel" href="${r.url}" target="_blank" rel="noopener" aria-label="${esc(r.caption)} — ver en Instagram">
      <video src="${r.src}.mp4" poster="${r.src}.webp" muted loop playsinline preload="none" data-autoplay></video>
      <span class="reel__play" aria-hidden="true">▶</span>
      <span class="reel__cap">${esc(r.caption)}<small>Ver en Instagram ↗</small></span>
    </a>`).join("");
  const reels = $("[data-reels]");
  const scrollReels = (dir) => reels.scrollBy({ left: dir * (reels.querySelector(".reel").offsetWidth + 18) * 2, behavior: "smooth" });
  $("[data-reel-prev]").addEventListener("click", () => scrollReels(-1));
  $("[data-reel-next]").addEventListener("click", () => scrollReels(1));

  /* ---------- render: branches (live open/closed) ---------- */
  function renderBranches() {
    const n = nowInBolivia();
    const openCount = Z.branches.filter((b) => n.minutes >= toMin(b.open) && n.minutes < toMin(b.close)).length;
    $("[data-branches]").innerHTML = Z.branches.map((b) => {
      const s = branchStatus(b, n);
      const q = encodeURIComponent(`Zapi Piza ${b.name} Santa Cruz de la Sierra Bolivia`);
      return `<a class="branch" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">
        <div class="branch__top"><h3>${esc(b.name)}</h3><span class="pill pill--${s.cls}">${s.text}</span></div>
        <p class="branch__hours">${b.open} – ${b.close} · Lun a Dom</p>
        ${b.address ? `<p class="branch__addr">📍 ${esc(b.address)}</p>` : ""}
        <span class="branch__map">Cómo llegar ↗</span>
      </a>`;
    }).join("");
    $("[data-now]").innerHTML = `${n.label} en Santa Cruz · <b>${openCount} de ${Z.branches.length}</b> abiertas`;
  }
  renderBranches();
  setInterval(renderBranches, 60_000);

  /* ---------- render: feed ---------- */
  $("[data-feed]").innerHTML = Z.feed.map((p, i) => `
    <a class="reveal" style="transition-delay:${(i % 4) * 60}ms" href="${p.url}" target="_blank" rel="noopener">
      <img src="${p.img}" alt="${esc(p.alt)}" loading="lazy" />
    </a>`).join("");

  $("[data-year]").textContent = new Date().getFullYear();

  /* ---------- nav ---------- */
  const nav = $("[data-nav]");
  const onScroll = () => nav.classList.toggle("is-solid", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  const burger = $("[data-burger]");
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", open);
  });
  $$(".nav__links a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("is-open"); burger.setAttribute("aria-expanded", false); }));

  /* ---------- reveal + counters ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      if (e.target.matches("[data-stats]")) $$("[data-count]", e.target).forEach(countUp);
      io.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ---------- videos: only play what's on screen ---------- */
  const vio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const v = e.target;
      if (e.isIntersecting && !reduceMotion) { v.preload = "auto"; v.play().catch(() => {}); }
      else v.pause();
    });
  }, { threshold: 0.35 });
  $$("video[data-autoplay]").forEach((v) => vio.observe(v));
  const heroVideo = $(".hero__video");
  if (reduceMotion) heroVideo.pause();

  /* ---------- cart ---------- */
  const KEY = "zapi.cart.v1";
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { cart = {}; }
  Object.keys(cart).forEach((id) => { if (!catalog[id]) delete cart[id]; });

  const drawer = $("[data-drawer]");
  const listEl = $("[data-cart-list]");
  const form = $("[data-checkout]");
  const submit = $("[data-checkout-submit]");
  const branchSel = $("[data-branch-select]");
  branchSel.innerHTML = Z.branches.map((b) => `<option>${esc(b.name)}</option>`).join("");

  const fmt = (n) => `${Z.config.currency} ${n}`;
  const total = () => Object.entries(cart).reduce((s, [id, q]) => s + catalog[id].price * q, 0);
  const count = () => Object.values(cart).reduce((s, q) => s + q, 0);

  function renderCart() {
    localStorage.setItem(KEY, JSON.stringify(cart));
    const ids = Object.keys(cart);
    listEl.innerHTML = ids.map((id) => `
      <li>
        <strong>${esc(catalog[id].name)}</strong>
        <div class="qty">
          <button data-dec="${id}" aria-label="Quitar uno">−</button><b>${cart[id]}</b><button data-inc="${id}" aria-label="Agregar uno">+</button>
        </div>
        <span>${fmt(catalog[id].price)} c/u · ${fmt(catalog[id].price * cart[id])}</span>
      </li>`).join("");
    const empty = ids.length === 0;
    $("[data-cart-empty]").hidden = !empty;
    form.hidden = empty;
    submit.disabled = empty;
    $("[data-cart-total]").textContent = fmt(total());
    const c = $("[data-cart-count]");
    c.textContent = count();
    c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
  }

  let lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    drawer.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => $(".drawer__head .iconbtn").focus(), 50);
  }
  function closeCart() {
    drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  const toastEl = $("[data-toast]");
  let toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-add],[data-inc],[data-dec],[data-cart-open],[data-cart-close]");
    if (!t) return;
    if (t.dataset.add) { cart[t.dataset.add] = (cart[t.dataset.add] || 0) + 1; renderCart(); toast(`🍕 ${catalog[t.dataset.add].name} agregado`); }
    else if (t.dataset.inc) { cart[t.dataset.inc]++; renderCart(); }
    else if (t.dataset.dec) { if (--cart[t.dataset.dec] <= 0) delete cart[t.dataset.dec]; renderCart(); }
    else if (t.hasAttribute("data-cart-open")) openCart();
    else if (t.hasAttribute("data-cart-close")) closeCart();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("is-open")) closeCart(); });

  form.mode.addEventListener("change", () => {
    $("[data-address-field]").hidden = form.mode.value !== "Delivery";
  });

  submit.addEventListener("click", () => {
    if (!form.reportValidity()) return;
    if (form.mode.value === "Delivery" && !form.address.value.trim()) { form.address.focus(); toast("Contanos tu dirección 📍"); return; }
    const lines = [
      "¡Hola Zapi! 🍕 Quiero hacer un pedido:",
      "",
      ...Object.entries(cart).map(([id, q]) => `• ${q} × ${catalog[id].name} — ${fmt(catalog[id].price * q)}`),
      "",
      `*Total: ${fmt(total())}*`,
      "",
      `Nombre: ${form.name.value.trim()}`,
      `Modalidad: ${form.mode.value}`,
      `Sucursal: ${form.branch.value}`,
    ];
    if (form.mode.value === "Delivery") lines.push(`Dirección: ${form.address.value.trim()}`);
    if (form.note.value.trim()) lines.push(`Nota: ${form.note.value.trim()}`);
    const text = encodeURIComponent(lines.join("\n"));
    const num = (Z.config.whatsapp || "").replace(/\D/g, "");
    window.open(num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`, "_blank", "noopener");
  });

  renderCart();
  $("[data-cart-count]").classList.remove("bump");
})();
