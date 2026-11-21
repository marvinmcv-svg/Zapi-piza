// Zap-IA's deterministic tools. The model proposes a call; this file validates and executes it.
// Every price, total, deal, opening hour and order fact comes from here (and js/data.js), never from the model.
//
// A conversation carries a small `state` object between turns (the browser keeps it and sends it back):
//   cart      { itemId: qty }           — the same cart as the website's (localStorage)
//   prevCart  { itemId: qty } | null    — for "undo"
//   order     { service, branch, address, reference, location, when, payment, name, notes }
//   stage     "browsing" | "awaiting_confirmation" | "placed"
//   token     confirmation token issued by prepare_order (a hash of cart + details)
//   upsold, newsShown                   — "at most once per session" rules
//   history   [{ id, at, branch, service, cart, total }]   — "Mi Pedido": last orders, newest first
// The browser's copy is untrusted: sanitizeState() re-validates all of it on every request.
const Z = require("../js/data.js");

const CATALOG = Z.catalog();
const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MAX_QTY = 50, MAX_LINES = 30;
const bs = (n) => `Bs ${n}`;
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9: ]+/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n = 200) => String(s == null ? "" : s).slice(0, n).trim();

/* ---------------- time & branches ---------------- */
function nowLocal(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: Z.config.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: +get("hour") * 60 + +get("minute"), hhmm: `${get("hour")}:${get("minute")}`, date: `${get("day")}/${get("month")}/${get("year")}` };
}
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
function branchStatus(b, minutes) {
  const o = toMin(b.open), c = toMin(b.close);
  if (minutes >= o && minutes < c) return c - minutes <= 30 ? { open: true, text: `abierta, cierra a las ${b.close}` } : { open: true, text: "abierta" };
  if (minutes < o) return { open: false, text: `cerrada, abre hoy a las ${b.open}` };
  return { open: false, text: `cerrada, abre mañana a las ${b.open}` };
}
const fmtPhone = (n) => n.replace(/^591/, "").replace(/(\d{4})(\d{4})/, "$1 $2");
function findBranch(name) {
  const q = norm(name);
  if (!q) return null;
  return Z.branches.find((b) => norm(b.name) === q) || Z.branches.find((b) => norm(b.name).includes(q) || q.includes(norm(b.name))) || null;
}
const mapsLink = (b) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.plus ? `${b.plus} Santa Cruz de la Sierra` : `Zapi Piza ${b.name} Santa Cruz de la Sierra Bolivia`)}`;

/* ---------------- menu search ---------------- */
// Spanish/English/slang → words that appear in our menu. Extend from the misses log (see README).
const SYNONYMS = {
  vegetariano: ["veg"], vegetariana: ["veg"], vegano: ["veg"], "sin carne": ["veg"], veggie: ["veg"], vegetarian: ["veg"],
  queso: ["queso", "quesos", "muzza", "cheddar", "cheese"], cheese: ["queso", "quesos", "cheddar", "cheese"],
  jamon: ["jamon"], ham: ["jamon"], tocino: ["tocino", "panceti", "toci"], bacon: ["tocino", "panceti"], panceta: ["tocino"],
  chorizo: ["chori", "chorizo"], sausage: ["chori", "chorizo"], salchicha: ["chori"],
  pepperoni: ["pepperoni", "peppe"], peperoni: ["pepperoni", "peppe"], peperonni: ["pepperoni", "peppe"],
  carne: ["carne"], meat: ["carne", "carnivora"], beef: ["carne"],
  champinon: ["champinon", "champi"], champinones: ["champinon", "champi"], hongos: ["champinon"], mushroom: ["champinon"], mushrooms: ["champinon"],
  choclo: ["choclo"], maiz: ["choclo"], corn: ["choclo"], pina: ["pina", "hawai"], pineapple: ["pina", "hawai"], anana: ["pina"],
  cebolla: ["cebolla", "fugazzeta"], onion: ["cebolla"], onions: ["cebolla"], pimenton: ["pimenton"], pimiento: ["pimenton"], pepper: ["pimenton"],
  tomate: ["tomate"], tomato: ["tomate"], espinaca: ["espinaca"], spinach: ["espinaca"],
  doritos: ["doritos", "doriloco"], picante: ["picante", "doriloco"], spicy: ["picante", "doriloco"],
  bebida: ["soda"], bebidas: ["soda"], gaseosa: ["soda"], refresco: ["soda"], soda: ["soda"], coca: ["soda", "coca"], drink: ["soda"], drinks: ["soda"], pepsi: ["soda"], guarana: ["soda"],
  combo: ["combo"], combos: ["combo"], promo: ["combo", "yapa"], promos: ["combo", "yapa"],
  borde: ["borde"], crust: ["borde"], catupiry: ["catupiry"], salsa: ["salsa"], sauce: ["salsa"], extra: ["extra"],
  chica: ["jr"], pequena: ["jr"], personal: ["jr"], small: ["jr"], junior: ["jr"], grande: ["familiar"], familiar: ["familiar"], large: ["familiar"], big: ["familiar"],
  hawaiana: ["hawaiana"], hawaiian: ["hawaiana"], barbacoa: ["barbacoa"], bbq: ["barbacoa"],
};
const STOP = new Set(["la", "el", "los", "las", "de", "del", "con", "y", "una", "un", "pizza", "pizzas", "zapi", "quiero", "tienen", "hay", "algo", "the", "a", "with", "and", "any", "have", "you", "do"]);
function searchText(it) { return norm(`${it.name} ${it.desc || ""} ${it.cat || ""} ${it.kind} ${it.size || ""} ${it.veg ? "veg" : ""} ${it.id}`); }

function searchMenu(query) {
  const q = norm(query);
  const raw = q.split(" ").filter((w) => w && !STOP.has(w));
  const terms = new Set();
  // two-word synonyms first ("sin carne")
  Object.keys(SYNONYMS).filter((k) => k.includes(" ") && q.includes(k)).forEach((k) => SYNONYMS[k].forEach((t) => terms.add(t)));
  raw.forEach((w) => { terms.add(w); (SYNONYMS[w] || []).forEach((t) => terms.add(t)); });
  if (!terms.size) return [];
  const scored = Object.values(CATALOG).map((it) => {
    const text = searchText(it), name = norm(it.name);
    let score = 0;
    terms.forEach((t) => { if (name.includes(t)) score += 3; else if (text.includes(t)) score += 1; });
    if (name === q || it.id === q) score += 10;
    return { it, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.it.price - b.it.price);
  return scored.slice(0, 12).map(({ it }) => itemCard(it));
}
const itemCard = (it) => ({ id: it.id, name: it.name, price: it.price, ...(it.desc ? { desc: it.desc } : {}), ...(it.veg ? { sin_carne: true } : {}), ...(it.hot ? { nueva: true } : {}) });

// Resolve a model/customer reference ("chori", "Chori Jr.", "jr-chori", "coca 2 litros") to one catalog id.
function resolveItem(ref, size) {
  if (!ref) return { error: "Falta el producto." };
  if (CATALOG[ref]) return { id: ref };
  const q = norm(ref);
  const byId = Object.keys(CATALOG).find((id) => norm(id) === q);
  if (byId) return { id: byId };
  let hits = Object.values(CATALOG).filter((it) => {
    const n = norm(it.name), base = norm(it.name.replace(/\s*\((familiar|jr\.)\)/i, "").replace(/ jr\.?$/i, ""));
    return n === q || base === q || base === q.replace(/\b(jr|junior|familiar|grande|chica)\b/g, "").trim();
  });
  if (!hits.length) hits = searchMenu(ref).slice(0, 6).map((c) => CATALOG[c.id]);
  const s = norm(size) || (/\b(jr|junior|chica|pequena|personal)\b/.test(q) ? "jr" : /\b(familiar|grande)\b/.test(q) ? "familiar" : "");
  if (s && hits.length > 1) {
    const sized = hits.filter((h) => h.size === (s === "jr" ? "jr" : "familiar"));
    if (sized.length) hits = sized;
  }
  if (hits.length > 1) { // "coca 2 litros", "soda 500": prefer names containing the number + unit
    const m = q.match(/\b\d+(?: (?:litros?|ml|l))?\b/);
    const narrowed = m ? hits.filter((h) => norm(h.name).includes(m[0])) : [];
    if (narrowed.length) hits = narrowed;
  }
  if (hits.length === 1) return { id: hits[0].id };
  if (!hits.length) return { error: `No encontré "${clip(ref, 60)}" en el menú.` };
  return { ambiguous: hits.slice(0, 6).map(itemCard) };
}

/* ---------------- cart helpers ---------------- */
function sanitizeCart(c) {
  const out = {};
  if (!c || typeof c !== "object") return out;
  for (const [id, q] of Object.entries(c).slice(0, MAX_LINES)) {
    const n = Math.floor(Number(q));
    if (CATALOG[id] && n > 0) out[id] = Math.min(n, MAX_QTY);
  }
  return out;
}
const cartTotal = (cart) => Object.entries(cart).reduce((s, [id, q]) => s + CATALOG[id].price * q, 0);
const cartCount = (cart) => Object.values(cart).reduce((s, q) => s + q, 0);
function cartSummary(cart) {
  const lines = Object.entries(cart).map(([id, q]) => ({ id, name: CATALOG[id].name, qty: q, unit: CATALOG[id].price, subtotal: CATALOG[id].price * q }));
  return { lines, items: cartCount(cart), total: cartTotal(cart), total_text: bs(cartTotal(cart)) };
}

/* ---------------- deals ---------------- */
function todayPromo(day) {
  const w = Z.weekly.find((x) => x.day === day);
  if (!w) return null;
  return { dia: `${w.name} ${w.title}`, detalle: `${w.desc} a ${w.from ? "desde " : ""}${bs(w.price)}`, ahorro: w.save, categorias: w.cats || [],
    nota: w.pale ? "Paletas Palé en el local." : "La sucursal aplica el precio de promo al confirmar tu pedido." };
}
function comboValue(c) { return c.parts.reduce((s, id) => s + CATALOG[id].price, 0); }
function dealHints(cart, day) {
  const hints = [];
  for (const c of Z.combos) {
    const have = c.parts.filter((id) => cart[id] > 0);
    const value = comboValue(c);
    if (have.length === c.parts.length) {
      hints.push({ tipo: "cambiar_a_combo", combo_id: c.id, combo: c.name, mensaje: `Ya tenés todo lo del ${c.name}: pasalo a combo y pagás ${bs(c.price)} en vez de ${bs(value)} (ahorrás ${bs(value - c.price)}).`, ahorro: value - c.price });
    } else if (have.length && have.length === c.parts.length - 1) {
      const missing = c.parts.find((id) => !cart[id]);
      const paidNow = have.reduce((s, id) => s + CATALOG[id].price, 0);
      hints.push({ tipo: "casi_combo", combo_id: c.id, combo: c.name, falta: CATALOG[missing].name,
        mensaje: `Por ${bs(c.price - paidNow)} más te llevás también ${CATALOG[missing].name}: es el ${c.name} a ${bs(c.price)} (por separado ${bs(value)}, ahorrás ${bs(value - c.price)}).`, ahorro: value - c.price });
    }
  }
  const p = todayPromo(day);
  if (p && p.categorias.length) {
    const eligible = Object.keys(cart).filter((id) => p.categorias.includes(CATALOG[id].cat));
    if (eligible.length) hints.push({ tipo: "promo_del_dia", mensaje: `Hoy es ${p.dia}: ${p.detalle}. Aplica a ${eligible.map((id) => CATALOG[id].name).join(", ")}. ${p.nota}` });
  }
  if (cart["jamon-pimenton"]) hints.push({ tipo: "yapa", mensaje: `La Jamón y Pimentón familiar está en Yapa del mes a ${bs(Z.yapa.price)} (normal ${bs(Z.yapa.regular)}). Puedo cambiarla por la Yapa.`, item_id: Z.yapa.id });
  return hints.sort((a, b) => (b.ahorro || 0) - (a.ahorro || 0));
}

/* ---------------- order helpers ---------------- */
const SERVICES = { delivery: "a domicilio", pickup: "para recoger" };
function missingDetails(st) {
  const o = st.order, miss = [];
  if (!cartCount(st.cart)) miss.push("productos");
  if (!SERVICES[o.service]) miss.push("service (delivery o pickup)");
  if (!o.branch) miss.push("branch (sucursal)");
  if (o.service === "delivery" && !o.address && !o.location) miss.push("address o ubicación (pin)");
  if (!o.name) miss.push("name (nombre)");
  return miss;
}
function hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
const orderToken = (st) => hash(JSON.stringify([Object.entries(st.cart).sort(), st.order]));
function whenText(o) { return o.when && o.when !== "asap" ? `Para las ${o.when}` : "Lo antes posible"; }
function buildWhatsApp(st, id) {
  const o = st.order, L = [];
  L.push(`¡Hola Zapi! 🍕 Quiero hacer un pedido ${o.service === "delivery" ? "*a domicilio*" : "*para recoger*"}:`, "");
  for (const [itemId, q] of Object.entries(st.cart)) L.push(`• ${q} × ${CATALOG[itemId].name}: ${bs(CATALOG[itemId].price * q)}`);
  L.push("", `*Total productos: ${bs(cartTotal(st.cart))}*`, "");
  L.push(`👤 ${o.name}`, `📍 Sucursal: ${o.branch}`);
  if (o.service === "delivery") {
    if (o.address) L.push(`🏠 Dirección: ${o.address}`);
    if (o.reference) L.push(`↪ Referencia: ${o.reference}`);
    if (o.location) L.push(`📌 Ubicación: https://maps.google.com/?q=${o.location.lat},${o.location.lng}`);
  }
  L.push(`🕒 ${whenText(o)}`);
  if (o.payment) L.push(`💵 Pago: ${o.payment}`);
  if (o.notes) L.push(`💬 Nota: ${o.notes}`);
  L.push("", `Pedido ${id} · armado con Zap-IA`);
  return L.join("\n");
}

/* ---------------- state ---------------- */
function sanitizeState(s) {
  s = s && typeof s === "object" ? s : {};
  const o = s.order && typeof s.order === "object" ? s.order : {};
  const loc = o.location && Number.isFinite(+o.location.lat) && Number.isFinite(+o.location.lng)
    && Math.abs(o.location.lat) <= 90 && Math.abs(o.location.lng) <= 180 ? { lat: +(+o.location.lat).toFixed(6), lng: +(+o.location.lng).toFixed(6) } : null;
  const branch = findBranch(o.branch);
  const history = Array.isArray(s.history) ? s.history.slice(0, 3).map((h) => ({
    id: clip(h && h.id, 20), at: clip(h && h.at, 40), branch: findBranch(h && h.branch) ? findBranch(h.branch).name : "",
    service: SERVICES[h && h.service] ? h.service : "", cart: sanitizeCart(h && h.cart),
  })).filter((h) => cartCount(h.cart)) : [];
  return {
    cart: sanitizeCart(s.cart),
    prevCart: s.prevCart ? sanitizeCart(s.prevCart) : null,
    order: {
      service: SERVICES[o.service] ? o.service : "",
      branch: branch ? branch.name : "",
      address: clip(o.address), reference: clip(o.reference), location: loc,
      when: /^([01]\d|2[0-3]):[0-5]\d$/.test(o.when) ? o.when : "asap",
      payment: clip(o.payment, 80), name: clip(o.name, 60), notes: clip(o.notes),
    },
    stage: ["browsing", "awaiting_confirmation", "placed"].includes(s.stage) ? s.stage : "browsing",
    token: clip(s.token, 20) || null,
    upsold: !!s.upsold, newsShown: !!s.newsShown,
    history,
  };
}

/* ---------------- the tools ---------------- */
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const TOOLS = [
  { name: "search_menu", description: "Busca en el menú por nombre, ingrediente o tipo (ej. 'vegetariana', 'algo con tocino', 'bebidas', 'combos'). Devuelve ids, nombres y precios reales.",
    schema: { query: str("Lo que busca el cliente") }, required: ["query"] },
  { name: "get_item_details", description: "Ingredientes, tamaño, precio y promos que aplican a un producto. Úsalo para preguntas de ingredientes.",
    schema: { item: str("id o nombre del producto") }, required: ["item"] },
  { name: "get_whats_new", description: "Novedades del menú y promos vigentes hoy (para '¿qué hay de nuevo?' o al saludar con carrito vacío).", schema: {}, required: [] },
  { name: "get_branches", description: "Sucursales con horario, si están abiertas ahora, WhatsApp, dirección y link de mapa. Filtro opcional por nombre.",
    schema: { name: str("Nombre de sucursal (opcional)") }, required: [] },
  { name: "get_deals", description: "Promos y combos vigentes + sugerencias de ahorro según el carrito actual (cambiar a combo, casi combo, promo del día). Úsalo cuando pidan promo/oferta.",
    schema: {}, required: [] },
  { name: "cart_add", description: "Agrega productos al carrito. Usa ids de search_menu cuando puedas. Si el tamaño no está claro, el tool devuelve opciones para preguntar.",
    schema: { items: { type: "array", description: "Productos a agregar", items: { type: "object", properties: { item: str("id o nombre"), qty: { type: "integer", minimum: 1, maximum: MAX_QTY }, size: str("familiar o jr (opcional)") }, required: ["item"] } } }, required: ["items"] },
  { name: "cart_remove", description: "Quita un producto (o algunas unidades) del carrito.",
    schema: { item: str("id o nombre"), qty: { type: "integer", minimum: 1, description: "Unidades a quitar; omitir para quitar todo" } }, required: ["item"] },
  { name: "cart_set_qty", description: "Cambia la cantidad de un producto del carrito (0 lo quita).",
    schema: { item: str("id o nombre"), qty: { type: "integer", minimum: 0, maximum: MAX_QTY } }, required: ["item", "qty"] },
  { name: "cart_swap_to_combo", description: "Reemplaza en el carrito las partes de un combo por el combo (más barato). Solo si get_deals lo sugirió.",
    schema: { combo_id: str("id del combo") }, required: ["combo_id"] },
  { name: "cart_view", description: "Muestra el carrito con total calculado.", schema: {}, required: [] },
  { name: "cart_undo", description: "Deshace el último cambio del carrito.", schema: {}, required: [] },
  { name: "cart_clear", description: "Vacía el carrito (empezar de nuevo).", schema: {}, required: [] },
  { name: "suggest_upsell", description: "Una sola sugerencia adicional apropiada para el carrito (máximo una vez por conversación).", schema: {}, required: [] },
  { name: "get_my_orders", description: "Últimos pedidos de este cliente en este dispositivo ('Mi Pedido'), para 'lo de siempre' o 'lo mismo de la otra vez'.", schema: {}, required: [] },
  { name: "reorder", description: "Carga en el carrito un pedido anterior (index 0 = el más reciente). Reemplaza el carrito actual.",
    schema: { index: { type: "integer", minimum: 0, maximum: 2 } }, required: ["index"] },
  { name: "set_order_details", description: "Guarda datos del pedido. Solo los campos que el cliente dijo. service: 'delivery' o 'pickup'. when: 'asap' o 'HH:MM' (24 h). Devuelve qué falta.",
    schema: { service: str("delivery | pickup", { enum: ["delivery", "pickup"] }), branch: str("Nombre de la sucursal"), address: str("Calle, número, barrio o anillo"), reference: str("Referencia (portón rojo, frente a...)"), when: str("'asap' o 'HH:MM'"), name: str("Nombre del cliente"), payment: str("Solo si el cliente lo menciona (ej. 'efectivo, cambio de 100')"), notes: str("Pedido especial: sin cebolla, cortada en 12...") }, required: [] },
  { name: "request_location", description: "Muestra el botón para compartir la ubicación exacta (Entrega con Pin). Útil si no sabe la dirección o es un lugar sin número.", schema: {}, required: [] },
  { name: "prepare_order", description: "Arma el resumen final (productos, total, sucursal, entrega, hora) y un token de confirmación. Léelo al cliente y pedí un 'sí' explícito.", schema: {}, required: [] },
  { name: "place_order", description: "Confirma el pedido SOLO después de que el cliente dijo que sí al resumen. Genera el envío por WhatsApp a la sucursal.",
    schema: { token: str("Token que devolvió prepare_order") }, required: ["token"] },
  { name: "get_order_status", description: "Estado del último pedido de este cliente ('¿dónde está mi pizza?').", schema: {}, required: [] },
  { name: "handoff_to_human", description: "Pasa la conversación a una persona de Zapi por WhatsApp (reclamos, eventos grandes, alergias severas, o si no entendés tras 2 intentos).",
    schema: { reason: str("Motivo breve"), summary: str("Resumen para la persona") }, required: ["reason"] },
  { name: "show_options", description: "Muestra 2 a 4 botones de respuesta rápida al cliente (ej. tamaños, sucursales, 'Sí, confirmar').",
    schema: { options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["options"] },
  { name: "log_miss", description: "Registra algo que no entendiste o un producto que el cliente pidió y no existe, para mejorar el asistente.",
    schema: { text: str("Lo que dijo el cliente"), reason: str("Por qué no se pudo resolver") }, required: ["text", "reason"] },
];

function openaiTools() {
  return TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", properties: t.schema, required: t.required } } }));
}
function anthropicTools() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: { type: "object", properties: t.schema, required: t.required } }));
}

// Runs one tool. Mutates `st`, pushes UI events into `events`. Returns a JSON-able result for the model.
function runTool(name, args, st, events, now = new Date()) {
  args = args && typeof args === "object" ? args : {};
  const t = nowLocal(now);
  const cartChanged = (before) => {
    st.prevCart = before;
    if (st.stage !== "browsing") { st.stage = "browsing"; st.token = null; }
    events.push({ type: "cart", cart: st.cart });
    return cartSummary(st.cart);
  };
  switch (name) {
    case "search_menu": {
      const r = searchMenu(args.query);
      if (!r.length) console.log(JSON.stringify({ evt: "zapia_miss", kind: "search_empty", text: clip(args.query, 120) }));
      return r.length ? { resultados: r } : { resultados: [], nota: "No hay nada así en el menú. Ofrecé lo más parecido o el menú por categoría." };
    }
    case "get_item_details": {
      const r = resolveItem(args.item);
      if (r.error || r.ambiguous) return r;
      const it = CATALOG[r.id], out = { ...itemCard(it) };
      if (it.kind === "pizza") {
        out.tamano = Z.sizes[it.size];
        out.ingredientes = `${Z.base}, ${it.desc}`;
        const p = Z.weekly.find((w) => (w.cats || []).includes(it.cat));
        if (p) out.promo_semanal = `${p.name} ${p.title}: ${p.desc} a ${p.from ? "desde " : ""}${bs(p.price)}`;
        const combos = Z.combos.filter((c) => c.parts.includes(it.id)).map((c) => `${c.name} (${c.note}) ${bs(c.price)}`);
        if (combos.length) out.en_combos = combos;
        if (it.id === "jamon-pimenton") out.yapa = `Yapa del mes a ${bs(Z.yapa.price)}`;
      }
      out.alergenos = "No tengo información de alérgenos ni trazas; para alergias, consultar a la sucursal.";
      return out;
    }
    case "get_whats_new": {
      st.newsShown = true;
      return {
        nuevo: Object.values(CATALOG).filter((i) => i.hot).map(itemCard),
        yapa_del_mes: `${Z.yapa.name}: ${bs(Z.yapa.price)} (normal ${bs(Z.yapa.regular)})`,
        combos: Z.combos.map((c) => ({ id: c.id, name: c.name, price: c.price, incluye: c.note })),
        promo_de_hoy: todayPromo(t.day) || `Hoy (${DAYS[t.day]}) no hay promo diaria; siguen la Yapa y los combos.`,
      };
    }
    case "get_branches": {
      let list = Z.branches;
      if (args.name) { const b = findBranch(args.name); list = b ? [b] : list; }
      const rows = list.map((b) => ({ nombre: b.name, horario: `${b.open} a ${b.close}, lunes a domingo`, estado: branchStatus(b, t.minutes).text,
        whatsapp: fmtPhone(b.whatsapp), ...(b.address ? { direccion: b.address } : {}), mapa: mapsLink(b) }));
      return { hora_actual: t.hhmm, abiertas_ahora: Z.branches.filter((b) => branchStatus(b, t.minutes).open).length, sucursales: rows,
        nota: "Las direcciones exactas que no figuran se ven con el link de mapa." };
    }
    case "get_deals":
      return {
        promo_de_hoy: todayPromo(t.day) || `Hoy (${DAYS[t.day]}) no hay promo diaria.`,
        yapa_del_mes: { id: Z.yapa.id, detalle: `${Z.yapa.name}: ${bs(Z.yapa.price)} en vez de ${bs(Z.yapa.regular)}` },
        combos: Z.combos.map((c) => ({ id: c.id, name: c.name, price: c.price, incluye: c.note, por_separado: bs(comboValue(c)), ahorro: bs(comboValue(c) - c.price) })),
        para_tu_carrito: dealHints(st.cart, t.day),
      };
    case "cart_add": {
      const items = Array.isArray(args.items) ? args.items.slice(0, 10) : [];
      const before = { ...st.cart }, added = [], problems = [];
      for (const x of items) {
        const r = resolveItem(x && x.item, x && x.size);
        if (r.id) {
          const q = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(x.qty) || 1)));
          if (Object.keys(st.cart).length >= MAX_LINES && !st.cart[r.id]) { problems.push({ item: x.item, error: "Carrito lleno" }); continue; }
          st.cart[r.id] = Math.min(MAX_QTY, (st.cart[r.id] || 0) + q);
          added.push(`${q} × ${CATALOG[r.id].name}`);
        } else problems.push({ item: x && x.item, ...r });
      }
      const res = added.length ? { agregado: added, carrito: cartChanged(before) } : { carrito: cartSummary(st.cart) };
      if (problems.length) res.problemas = problems;
      return res;
    }
    case "cart_remove":
    case "cart_set_qty": {
      const r = resolveItem(args.item);
      const id = r.id || (r.ambiguous || []).map((c) => c.id).find((cid) => st.cart[cid]);
      if (!id || !st.cart[id]) return { error: "Ese producto no está en el carrito.", carrito: cartSummary(st.cart) };
      const before = { ...st.cart };
      const q = name === "cart_set_qty" ? Math.max(0, Math.min(MAX_QTY, Math.floor(Number(args.qty) || 0)))
        : args.qty ? Math.max(0, st.cart[id] - Math.floor(Number(args.qty))) : 0;
      if (q) st.cart[id] = q; else delete st.cart[id];
      return { ok: true, carrito: cartChanged(before) };
    }
    case "cart_swap_to_combo": {
      const c = Z.combos.find((x) => x.id === args.combo_id);
      if (!c) return { error: "Combo desconocido." };
      if (!c.parts.every((id) => st.cart[id] > 0)) return { error: `El carrito no tiene todo lo del ${c.name}. Usá get_deals.` };
      const before = { ...st.cart };
      c.parts.forEach((id) => { if (--st.cart[id] <= 0) delete st.cart[id]; });
      st.cart[c.id] = (st.cart[c.id] || 0) + 1;
      return { ok: true, ahorro: bs(comboValue(c) - c.price), carrito: cartChanged(before) };
    }
    case "cart_view":
      events.push({ type: "cart", cart: st.cart });
      return cartSummary(st.cart);
    case "cart_undo": {
      if (!st.prevCart) return { error: "No hay nada para deshacer." };
      const before = { ...st.cart };
      st.cart = st.prevCart;
      const res = cartChanged(before);
      st.prevCart = null;
      return { ok: true, carrito: res };
    }
    case "cart_clear": {
      const before = { ...st.cart };
      st.cart = {};
      return { ok: true, carrito: cartChanged(before) };
    }
    case "suggest_upsell": {
      if (st.upsold) return { sugerencia: null, nota: "Ya sugeriste algo en esta conversación." };
      st.upsold = true;
      const hint = dealHints(st.cart, t.day).find((h) => h.tipo === "cambiar_a_combo" || h.tipo === "casi_combo");
      if (hint) return { sugerencia: hint.mensaje, combo_id: hint.combo_id };
      const ids = Object.keys(st.cart);
      const pizzas = ids.filter((id) => ["pizza", "promo", "combo"].includes(CATALOG[id].kind)).reduce((s, id) => s + st.cart[id], 0);
      const hasDrink = ids.some((id) => CATALOG[id].kind === "drink" || CATALOG[id].kind === "combo");
      if (pizzas && !hasDrink) { const d = CATALOG[pizzas > 1 ? "soda-2l" : "soda-15"]; return { sugerencia: `¿Le sumamos ${d.name} por ${bs(d.price)}?`, item_id: d.id }; }
      if (pizzas && !ids.some((id) => CATALOG[id].kind === "borde")) return { sugerencia: `¿Borde Catupiry por ${bs(Z.addons.bordes.price)}?`, item_id: "borde:Borde Catupiry" };
      return { sugerencia: null };
    }
    case "get_my_orders":
      return st.history.length
        ? { pedidos: st.history.map((h, i) => ({ index: i, id: h.id, fecha: h.at, sucursal: h.branch, entrega: SERVICES[h.service] || "", ...cartSummary(h.cart) })) }
        : { pedidos: [], nota: "No hay pedidos anteriores en este dispositivo." };
    case "reorder": {
      const h = st.history[Math.floor(Number(args.index) || 0)];
      if (!h) return { error: "No encontré ese pedido." };
      const before = { ...st.cart };
      st.cart = { ...h.cart };
      if (h.branch && !st.order.branch) st.order.branch = h.branch;
      if (h.service && !st.order.service) st.order.service = h.service;
      return { ok: true, carrito: cartChanged(before), sucursal_sugerida: h.branch || null };
    }
    case "set_order_details": {
      const o = st.order, errors = [];
      if (args.service) { if (SERVICES[args.service]) o.service = args.service; else errors.push("service debe ser delivery o pickup"); }
      if (args.branch) {
        const b = findBranch(args.branch);
        if (b) o.branch = b.name; else errors.push(`No existe la sucursal "${clip(args.branch, 40)}". Opciones: ${Z.branches.map((x) => x.name).join(", ")}`);
      }
      if (args.address) o.address = clip(args.address);
      if (args.reference) o.reference = clip(args.reference);
      if (args.name) o.name = clip(args.name, 60);
      if (args.payment) o.payment = clip(args.payment, 80);
      if (args.notes) o.notes = clip(args.notes);
      if (args.when) {
        const w = String(args.when).trim().toLowerCase();
        if (["asap", "ya", "ahora", "now"].includes(w)) o.when = "asap";
        else if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(w)) o.when = w.padStart(5, "0");
        else errors.push("when debe ser 'asap' o 'HH:MM' (24 h)");
      }
      if (st.stage !== "browsing") { st.stage = "browsing"; st.token = null; }
      const res = { guardado: { ...o, location: o.location ? "compartida" : null }, falta: missingDetails(st) };
      const b = findBranch(o.branch);
      if (b) {
        const at = o.when === "asap" ? t.minutes : toMin(o.when);
        const s = branchStatus(b, at);
        if (!s.open) res.aviso = o.when === "asap" ? `${b.name} está ${s.text}. Ofrecé programar para cuando abra u otra sucursal abierta.` : `${b.name} no atiende a las ${o.when} (horario ${b.open}–${b.close}).`;
        else if (o.when !== "asap" && toMin(o.when) <= t.minutes) res.aviso = `Las ${o.when} ya pasaron hoy (son las ${t.hhmm}).`;
      }
      if (errors.length) res.errores = errors;
      events.push({ type: "state" });
      return res;
    }
    case "request_location":
      events.push({ type: "location" });
      return { ok: true, nota: "Se mostró el botón 'Compartir mi ubicación'. Esperá a que el cliente la comparta (llega como mensaje)." };
    case "prepare_order": {
      const miss = missingDetails(st);
      if (miss.length) return { error: "Faltan datos", falta: miss };
      const b = findBranch(st.order.branch), at = st.order.when === "asap" ? t.minutes : toMin(st.order.when);
      if (!branchStatus(b, at).open) return { error: `${b.name} no atiende a esa hora (${b.open}–${b.close}). Programá para otra hora u otra sucursal.` };
      st.stage = "awaiting_confirmation";
      st.token = orderToken(st);
      const o = st.order;
      const resumen = {
        ...cartSummary(st.cart),
        entrega: o.service === "delivery" ? `A domicilio${o.address ? `: ${o.address}` : ""}${o.location ? " (con pin de ubicación)" : ""}` : `Para recoger en ${o.branch}`,
        sucursal: o.branch, cuando: whenText(o), nombre: o.name, ...(o.payment ? { pago: o.payment } : {}), ...(o.notes ? { nota: o.notes } : {}),
        aclaracion: "El pedido se envía por WhatsApp a la sucursal, que confirma precio final, promos del día, costo de envío si corresponde y tiempo de entrega.",
      };
      events.push({ type: "readback", summary: resumen });
      return { resumen, token: st.token, siguiente: "Leé el resumen y pedí un 'sí' explícito. Recién entonces llamá place_order con este token." };
    }
    case "place_order": {
      if (st.stage === "placed" && st.history[0] && st.token === args.token) return { ok: true, ya_enviado: true, pedido: st.history[0].id };
      if (st.stage !== "awaiting_confirmation" || !st.token) return { error: "Primero llamá prepare_order y obtené un 'sí'." };
      if (args.token !== st.token || orderToken(st) !== st.token) { st.stage = "browsing"; st.token = null; return { error: "El pedido cambió desde el resumen. Volvé a llamar prepare_order." }; }
      const id = `ZP-${st.token.slice(0, 5).toUpperCase()}`;
      const b = findBranch(st.order.branch);
      const url = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(buildWhatsApp(st, id))}`;
      const entry = { id, at: `${t.date} ${t.hhmm}`, branch: b.name, service: st.order.service, cart: { ...st.cart }, total: cartTotal(st.cart) };
      st.history = [entry, ...st.history.filter((h) => h.id !== id)].slice(0, 3);
      st.stage = "placed";
      events.push({ type: "order", id, url, branch: b.name, total: bs(entry.total), entry });
      return { ok: true, pedido: id, siguiente: `Decile que toque "Enviar por WhatsApp" para mandarlo a ${b.name}; la sucursal confirma por ahí.` };
    }
    case "get_order_status": {
      const h = st.history[0];
      if (!h) return { pedido: null, nota: "No hay pedidos de este dispositivo. Si pidió por otro medio, que consulte a su sucursal." };
      const b = findBranch(h.branch);
      return { pedido: h.id, enviado: h.at, sucursal: h.branch, total: bs(cartTotal(h.cart)),
        estado: "El seguimiento (preparación y envío) lo confirma la sucursal por WhatsApp.", whatsapp_sucursal: b ? fmtPhone(b.whatsapp) : null,
        link: b ? `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(`¡Hola! Quería saber el estado de mi pedido ${h.id} 🍕`)}` : null };
    }
    case "handoff_to_human": {
      const b = findBranch(st.order.branch);
      const number = b ? b.whatsapp : Z.config.callCenter;
      const text = `¡Hola Zapi! Vengo de Zap-IA en la web. Motivo: ${clip(args.reason, 120)}.${args.summary ? `\n${clip(args.summary, 400)}` : ""}`;
      const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
      console.log(JSON.stringify({ evt: "zapia_handoff", reason: clip(args.reason, 120) }));
      events.push({ type: "handoff", url, to: b ? `Zapi ${b.name}` : "Call Center Zapi" });
      return { ok: true, a: b ? `Zapi ${b.name}` : "Call Center", nota: "Se mostró el botón para hablar con una persona por WhatsApp." };
    }
    case "show_options": {
      const opts = (Array.isArray(args.options) ? args.options : []).map((x) => clip(x, 40)).filter(Boolean).slice(0, 4);
      if (opts.length) events.push({ type: "options", options: opts });
      return { ok: true };
    }
    case "log_miss":
      console.log(JSON.stringify({ evt: "zapia_miss", kind: "model", text: clip(args.text, 200), reason: clip(args.reason, 200) }));
      return { ok: true };
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

module.exports = { TOOLS, openaiTools, anthropicTools, runTool, sanitizeState, cartSummary, nowLocal, branchStatus, searchMenu, resolveItem, CATALOG };
