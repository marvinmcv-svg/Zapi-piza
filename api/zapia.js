// Zap-IA: Zapi Piza's AI ordering assistant (Vercel Node serverless function).
// POST /api/zapia  { messages: [{ role, content }], state: {...}, channel: "text" | "voice" }
// Streams newline-delimited JSON events (application/x-ndjson):
//   {type:"text", text}              reply text, streamed
//   {type:"cart", cart}              the cart changed (the page updates live)
//   {type:"options", options}        quick-reply chips
//   {type:"readback", summary}       order summary to confirm
//   {type:"location"}                show "share my location" (Entrega con Pin)
//   {type:"order", id, url, ...}     confirmed: WhatsApp link to the branch
//   {type:"handoff", url, to}        talk to a person on WhatsApp
//   {type:"state", state}            final conversation state (always last)
//   {type:"error"}                   something failed mid-stream
//
// The model only proposes tool calls; api/_tools.js validates and executes them (prices, cart, order).
// Providers (Vercel → Settings → Environment Variables):
//   NVIDIA_API_KEY     → NVIDIA NIM (OpenAI-compatible tool calling), model ZAPIA_NVIDIA_MODEL
//   ANTHROPIC_API_KEY  → Claude: ZAPIA_MODEL (text, default claude-sonnet-5-5), ZAPIA_VOICE_MODEL (voice, default claude-haiku-5-5)
// ZAPIA_PROVIDER=nvidia|anthropic forces one when both keys exist.
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");
const { openaiTools, anthropicTools, runTool, sanitizeState, buildWhatsApp } = require("./_tools.js");
const backend = require("./_backend.js");
const Z = require("../js/data.js");

const BACKEND_ERRORS = {
  sold_out: "Ese producto está agotado en esa sucursal hoy.",
  store_paused: "Esa sucursal pausó los pedidos por un momento.",
  delivery_unavailable: "Esa sucursal no está tomando pedidos a domicilio ahora.",
  pickup_unavailable: "Esa sucursal no está tomando pedidos para recoger ahora.",
  invalid_phone: "El número de WhatsApp no es válido.",
  customer_blocked: "No se pudo tomar el pedido; que el cliente escriba a la sucursal.",
  rate_limited: "Hay demasiados pedidos seguidos con ese número; esperá unos minutos.",
};
const STATUS_LABEL = { nuevo: "Recibido, esperando confirmación de la sucursal", confirmado: "Confirmado por la sucursal", en_preparacion: "En preparación",
  en_horno: "En el horno", listo: "Listo", en_camino: "En camino", entregado: "Entregado", cancelado: "Cancelado" };

const MAX_TURNS = 16;   // conversation messages kept per request
const MAX_CHARS = 1200; // per message
const MAX_ROUNDS = 6;   // model ↔ tools round trips per reply
const RATE = { windowMs: 60_000, max: 15 }; // per IP, best effort (per warm instance)

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE.max;
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return null;
  const msgs = input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

function pickProvider() {
  const forced = (process.env.ZAPIA_PROVIDER || "").toLowerCase();
  if (forced === "nvidia" && process.env.NVIDIA_API_KEY) return "nvidia";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

// "Sí", "sí, confirmo", "dale", "de una", "ok", "yes"… but not "sí, pero cambiá…" or "no".
function isYes(text) {
  const t = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (/\b(no|pero|cambi\w*|quit\w*|agreg\w*|espera|mejor)\b/.test(t)) return false;
  return /^(si+|sip|claro|dale|de una|confirm\w*|ok(ay)?|listo|yes|yep|perfecto|correcto|esta bien|va|vamos|bueno|manda\w*|hacelo|envia\w*)\b/.test(t) && t.length <= 60;
}

const toolResult = (r) => JSON.stringify(r).slice(0, 6000);
function parseArgs(s) { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }

/* ---------- NVIDIA NIM (OpenAI-compatible) ---------- */
let nvidia;
async function loopNvidia({ messages, state, channel, emit, exec }) {
  const mod = require("openai");
  const OpenAI = mod.default || mod;
  nvidia = nvidia || new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY });
  const convo = [{ role: "system", content: `${SYSTEM_PROMPT}\n\n${liveContext(state, channel)}` }, ...messages];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await nvidia.chat.completions.create({
      model: process.env.ZAPIA_NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
      messages: convo,
      tools: openaiTools(),
      tool_choice: "auto",
      temperature: 0.4,
      top_p: 0.95,
      max_tokens: 1024,
      stream: true,
      chat_template_kwargs: { enable_thinking: false },
    });
    let text = "";
    const calls = [];
    for await (const chunk of stream) {
      const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
      if (!d) continue;
      if (d.content) { text += d.content; emit.text(d.content); }
      for (const tc of d.tool_calls || []) {
        const c = (calls[tc.index || 0] = calls[tc.index || 0] || { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function && tc.function.name) c.name += tc.function.name;
        if (tc.function && tc.function.arguments) c.args += tc.function.arguments;
      }
    }
    const real = calls.filter((c) => c && c.name);
    if (!real.length) return;
    convo.push({ role: "assistant", content: text || null,
      tool_calls: real.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
    for (const [i, c] of real.entries()) {
      convo.push({ role: "tool", tool_call_id: c.id || `call_${round}_${i}`, content: toolResult(await exec(c.name, parseArgs(c.args))) });
    }
    emit.round();
  }
}

/* ---------- Claude (Anthropic) ---------- */
let anthropic;
async function loopAnthropic({ messages, state, channel, emit, exec }) {
  const sdk = require("@anthropic-ai/sdk");
  const Anthropic = sdk.default || sdk;
  anthropic = anthropic || new Anthropic();
  const model = channel === "voice" ? process.env.ZAPIA_VOICE_MODEL || "claude-haiku-5-5" : process.env.ZAPIA_MODEL || "claude-sonnet-5-5";
  const convo = [...messages];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: liveContext(state, channel) },
      ],
      tools: anthropicTools(),
      messages: convo,
    });
    stream.on("text", (t) => emit.text(t));
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") { emit.text("\n\nPerdón, con eso no te puedo ayudar 🙏 ¿Te ayudo con el menú o tu pedido?"); return; }
    const uses = final.content.filter((b) => b.type === "tool_use");
    if (final.stop_reason !== "tool_use" || !uses.length) return;
    convo.push({ role: "assistant", content: final.content });
    const results = [];
    for (const u of uses) results.push({ type: "tool_result", tool_use_id: u.id, content: toolResult(await exec(u.name, u.input)) });
    convo.push({ role: "user", content: results });
    emit.round();
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const provider = pickProvider();
  if (!provider) return res.status(503).json({ error: "not_configured" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (rateLimited(ip)) return res.status(429).json({ error: "rate_limited" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const messages = cleanMessages(body && body.messages);
  if (!messages) return res.status(400).json({ error: "bad_request" });
  const state = sanitizeState(body.state);
  const channel = body.channel === "voice" ? "voice" : "text";

  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");
  // Text from a later round starts a new paragraph, so "Un segundito…" + the answer don't run together.
  // Only after a finished sentence, so "¡" + tool call + "Listo!" stays "¡Listo!".
  let wrote = false, gap = false, last = "";
  const emit = {
    text: (t) => {
      if (!t) return;
      if (gap && wrote && /[.!?…:)\]]\s*$/.test(last)) send({ type: "text", text: "\n\n" });
      gap = false; wrote = true; last = t;
      send({ type: "text", text: t });
    },
    round: () => { gap = true; },
  };
  // place_order is only valid for a read-back shown in an EARLIER turn, answered with a yes in THIS turn.
  const tokenAtStart = state.stage === "awaiting_confirmation" ? state.token : null;
  const saidYes = isYes(messages[messages.length - 1].content);
  const exec = async (name, args) => {
    const events = [];
    let result;
    if (name === "place_order" && !(tokenAtStart && saidYes && state.token === tokenAtStart)) {
      return { error: "Todavía no: mostrá el resumen y esperá que el cliente responda 'sí' en su próximo mensaje. El pedido se confirma solo con su sí." };
    }
    try { result = runTool(name, args, state, events); }
    catch (err) { console.error("zapia_tool_error", name, err && err.message); result = { error: "La herramienta falló." }; }
    for (const e of events) {
      if (e.type === "order" && e.backend) result = await recordOrder(e, result);
    }
    if (name === "get_order_status" && result && result.track_token) {
      events.push({ type: "track", url: backend.trackingUrl(result.track_token), code: result.pedido });
      result = await liveStatus(result);
    }
    events.filter((e) => e.type !== "state" && !e.dropped).forEach((e) => { delete e.backend; send(e); });
    return result;
  };

  // Record a confirmed order in the backend (orders board, CRM, tracking). The database re-prices it.
  // Business errors (sold out, branch paused…) undo the placement so the model can tell the customer;
  // if the backend is unreachable, the WhatsApp order still goes out with the local code.
  async function recordOrder(ev, result) {
    const r = await backend.placeOrder(ev.backend);
    if (r.data && r.data.code) {
      const code = r.data.code, track = backend.trackingUrl(r.data.tracking_token);
      const b = Z.branches.find((x) => x.name === ev.branch);
      ev.id = code; ev.track = track;
      ev.url = `https://wa.me/${b.whatsapp}?text=${encodeURIComponent(buildWhatsApp(state, code, track))}`;
      ev.entry.id = code; ev.entry.track = r.data.tracking_token; ev.total = `Bs ${r.data.total}`;
      state.history[0] = ev.entry;
      return { ...result, pedido: code, total_confirmado: `Bs ${r.data.total}`, seguimiento: "El cliente puede seguir su pedido con el botón en pantalla." };
    }
    if (r.network) { console.error("zapia_backend_unreachable", r.error); return result; }
    console.log(JSON.stringify({ evt: "zapia_backend_rejected", error: r.error }));
    ev.dropped = true;
    state.history = state.history.filter((h) => h !== ev.entry);
    state.stage = "awaiting_confirmation";
    const msg = BACKEND_ERRORS[(r.error || "").split(":")[0]] || "La sucursal no pudo recibir el pedido.";
    return { error: `${msg}${r.error && r.error.includes(":") ? ` (${r.error.split(":").slice(1).join(":")})` : ""}`, siguiente: "Explicale al cliente y ofrecé una alternativa (otra sucursal, quitar el producto o programar)." };
  }
  async function liveStatus(result) {
    const r = await backend.trackOrder(result.track_token);
    const { track_token, ...rest } = result;
    if (!r.data) return rest;
    const ev = r.data.events || [];
    return { ...rest, estado_en_vivo: STATUS_LABEL[r.data.status] || r.data.status, desde: ev.length ? ev[ev.length - 1].at : null,
      seguimiento: "Hay un link de seguimiento en vivo en el botón.", estado: undefined };
  }

  // A clear "yes" to the read-back places the order deterministically (the model only acknowledges it).
  if (tokenAtStart && saidYes) await exec("place_order", { token: tokenAtStart });

  try {
    if (provider === "nvidia") await loopNvidia({ messages, state, channel, emit, exec });
    else await loopAnthropic({ messages, state, channel, emit, exec });
    if (!wrote) send({ type: "text", text: "Listo 👍 ¿Algo más?" });
  } catch (err) {
    console.error("zapia_error", provider, err && err.status, err && err.message);
    send({ type: "error" });
  }
  send({ type: "state", state });
  res.end();
};
