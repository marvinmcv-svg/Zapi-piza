// Zap-IA: Zapi Piza's AI receptionist (Vercel Node serverless function).
// POST /api/zapia  { messages: [{ role: "user" | "assistant", content: string }, ...] }
// Streams the reply as plain text.
//
// Providers (chosen by which key is set in Vercel → Settings → Environment Variables):
//   NVIDIA_API_KEY     → NVIDIA NIM (OpenAI-compatible), model ZAPIA_NVIDIA_MODEL
//   ANTHROPIC_API_KEY  → Claude (used if NVIDIA_API_KEY is not set)
// Optional: ZAPIA_PROVIDER=nvidia|anthropic to force one, ZAPIA_THINKING=true for NVIDIA reasoning mode.
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");

const MAX_TURNS = 16;   // conversation messages kept per request
const MAX_CHARS = 1200; // per user message
const RATE = { windowMs: 60_000, max: 12 }; // per IP, best effort (per warm instance)

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

/* ---------- NVIDIA NIM (OpenAI-compatible) ---------- */
let nvidia;
async function streamNvidia(messages, write) {
  const mod = require("openai");
  const OpenAI = mod.default || mod;
  nvidia = nvidia || new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY });
  const stream = await nvidia.chat.completions.create({
    model: process.env.ZAPIA_NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
    messages: [
      // Static prompt first, live context (time, open branches, today's promo) appended.
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${liveContext()}` },
      ...messages,
    ],
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: process.env.ZAPIA_THINKING === "true" ? 8192 : 1024,
    stream: true,
    chat_template_kwargs: { enable_thinking: process.env.ZAPIA_THINKING === "true" },
  });
  let finish = null;
  for await (const chunk of stream) {
    const choice = chunk.choices && chunk.choices[0];
    if (!choice) continue;
    // reasoning_content (thinking mode) is never shown to customers; only the answer is streamed.
    if (choice.delta && choice.delta.content) write(choice.delta.content);
    if (choice.finish_reason) finish = choice.finish_reason;
  }
  if (finish === "length") write("…");
}

/* ---------- Claude (Anthropic) ---------- */
let anthropic;
async function streamAnthropic(messages, write) {
  const sdk = require("@anthropic-ai/sdk");
  const Anthropic = sdk.default || sdk;
  anthropic = anthropic || new Anthropic();
  const stream = anthropic.beta.messages.stream({
    model: process.env.ZAPIA_MODEL || "claude-opus-5-5",
    max_tokens: 4096,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [...messages, { role: "system", content: liveContext() }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") write(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") write("\n\nPerdón, con eso no te puedo ayudar 🙏 ¿Te ayudo con el menú, las promos o las sucursales?");
  else if (final.stop_reason === "max_tokens") write("…");
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

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  const write = (t) => res.write(t);
  try {
    if (provider === "nvidia") await streamNvidia(messages, write);
    else await streamAnthropic(messages, write);
  } catch (err) {
    console.error("zapia_error", provider, err && err.status, err && err.message);
    res.write("\n\n[[error]]");
  }
  res.end();
};
