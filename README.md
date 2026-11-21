# Zapi Piza: website

The marketing and ordering site for **Zapi Piza** (Santa Cruz de la Sierra, Bolivia).
All content and media come from the brand's Instagram, [@zapi.piza](https://www.instagram.com/zapi.piza/). Nothing was AI-generated.

## Stack
A static site (semantic HTML, modern CSS, vanilla JS, no build step) plus one Vercel serverless function for **Zap-IA**.

```
index.html          page structure + SEO (Open Graph, schema.org Restaurant)
css/styles.css      design system (brand tokens at the top)
js/data.js          ← all content + catalog(): menu, promos, combos, branches (shared by site + Zap-IA)
js/app.js           rendering, carousel, cart, WhatsApp checkout, live open/closed status, Zap-IA chat + voice
api/zapia.js        Zap-IA endpoint: tool-calling agent loop, streams NDJSON events (NVIDIA NIM or Claude)
api/_tools.js       deterministic tools: menu, deals, cart, order details, read-back, WhatsApp order, handoff
api/_prompt.js      system prompt + live context (time, open branches, today's promo, customer state)
api/_persona.js     Zap-IA's original catchphrases and easter eggs
tests/              golden tests for the tools (npm test)
assets/img          Instagram posts (webp, 900px)
assets/video        Instagram reels (540p H.264, muted, faststart) + webp posters
```

## Features
- **Top of page (UX inspired by big delivery chains):** a scrolling promo ticker; a header with a floating pill menu; and a full-width **promo carousel**:
  - Slides: Combo Zuper Peppe, Yapa del mes, La Doriloco.
  - Behaviour: autoplay, dots, swipe, and it pauses on hover or focus.
  - **"¿Dónde querés tu pedido?" box:** pick delivery or pick-up and a branch, and it jumps into the WhatsApp funnel already filled in.
  - A dismissible WhatsApp QR card.
  - Slide prices and photos are written in `index.html`. Keep them in sync with `js/data.js` when promos change.
- **"Descubrí nuestras promos" row** of current promo posts (`offers` in `js/data.js`).
- **Footer:** dark band with an "Ayuda" button (opens Zap-IA) and dropdown link groups, plus a red bar with the call centre, logo and socials.
- **Brand palette sampled from the posts**: red `#DF2F38`, deep red `#A10715`, cream `#FEF6D7`, mustard `#F7C344`, and Palé pink `#EC4E9B`. The checkered tablecloth edge appears throughout.
- **Weekly promos**: the current day in Bolivia time is highlighted automatically.
- **Cart + WhatsApp checkout**: the cart is saved in localStorage. Checkout builds the order message (items, total, branch, pick-up or delivery, address and notes).
- **9 branches with a live "Abierto / Cierra pronto / Cerrado" status** (America/La_Paz), each linked to Google Maps.
- **Reels carousel**: videos play only while on screen and load lazily.
- Responsive and accessible: skip link, focus styles, `prefers-reduced-motion`, and Esc closes the cart.

## Zap-IA (AI ordering assistant)
Floating chat on every page (also the "Ayuda" buttons and "Zap-IA ✨" in the menu). It takes a full order by text or voice and keeps the page's cart in sync while it talks. Prices, totals, deals, hours and orders come only from **deterministic tools** in `api/_tools.js`; the model never calculates or invents them.

What it does:
- **Order in one sentence** ("una chori y una peppe con coca de 2 litros"), asks one missing detail at a time, offers quick-reply chips.
- **Menu answers:** ingredients (from `js/data.js`, with an allergen disclaimer), meat-free options, what's new, branches and opening hours.
- **Deals:** today's promo, the Yapa, and combo savings for the current cart ("por Bs 8 más te llevás la soda"); one upsell per conversation.
- **Checkout:** delivery or pick-up, branch, address or a shared map pin (**Entrega con Pin**), time; full read-back, then an explicit "sí". It then shows a "Send via WhatsApp" button to the chosen branch. Duplicate "sí" never creates a second order.
- **Mi Pedido:** the last 3 orders are saved on the device; "lo de siempre" or 🍕 reloads them.
- **Order status** (last order + the branch's WhatsApp) and **human handoff** (complaints, big events, allergies) to the branch or the call centre.
- **Voice mode:** a mic button (Web Speech API) with listening/thinking/speaking states, push-to-talk or hands-free, tap to interrupt, and the screen kept awake. It reads prices as words. Hidden on browsers without speech recognition.

The endpoint streams one JSON event per line: `text`, `cart`, `options`, `readback`, `location`, `order`, `handoff`, `state`, `error`. The conversation state (cart, order details, stage, token, Mi Pedido) lives in the browser and is re-validated on the server on every request.

Set these in Vercel → Project → Settings → Environment Variables (never in the code):
| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | NVIDIA NIM key (current provider) |
| `ZAPIA_NVIDIA_MODEL` | optional NIM model; must support tool calling |
| `ANTHROPIC_API_KEY` | Claude key (alternative provider) |
| `ZAPIA_MODEL` | optional Claude model for text (default `claude-sonnet-5-5`) |
| `ZAPIA_VOICE_MODEL` | optional Claude model for voice turns (default `claude-haiku-5-5`) |
| `ZAPIA_PROVIDER` | optional, forces `nvidia` or `anthropic` when both keys exist |

Without a key, the chat shows a friendly "coming soon" message and points to the menu and the WhatsApp funnel.

**Tests:** `npm test` runs the golden tests for the tools (no API key needed).

**Teaching it new words:** when a search finds nothing (or the model can't resolve something), the function logs a line like `{"evt":"zapia_miss","kind":"search_empty","text":"..."}`. In Vercel → Project → Logs, search for `zapia_miss`. Then add the customers' words to `SYNONYMS` in `api/_tools.js` (for example `"salame": ["pepperoni"]`), add a test in `tests/tools.test.js`, and deploy.

**Not built yet (needs a backend, POS or payments):** live order tracking and GPS, payments in chat, rewards, a WhatsApp Business bot, a phone voice agent. See the roadmap in `MASTERPROMPT.md`.

## WhatsApp funnel ("Pedí en 4 pasos")
1. What do you need: delivery, pick-up, table/event booking, or a question.
2. Details: pizza picker and cart / date, guests and occasion / question topic.
3. Customer details: name, branch, address and reference, when.
4. Review and send.

A live WhatsApp phone mockup previews the exact message as it is filled in.

## WhatsApp routing
Each branch has its own WhatsApp (from linktr.ee/zapi.piza), stored in `js/data.js` → `branches[].whatsapp`.
The funnel sends orders and bookings to the selected branch's number. General questions can go to the Call Center (`config.callCenter`, 76044549).
If a branch changes its number, update it there.

## Run locally
```bash
npm install
npm test
npx vercel dev
```

## Updating content
Edit `js/data.js`. Promos, prices and hours are all there. The Instagram media URLs expire, so new media must be downloaded into `assets/` (do not hotlink).
