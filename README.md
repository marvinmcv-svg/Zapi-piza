# Zapi Piza: website

The marketing and ordering site for **Zapi Piza** (Santa Cruz de la Sierra, Bolivia).
All content and media come from the brand's Instagram, [@zapi.piza](https://www.instagram.com/zapi.piza/). Nothing was AI-generated.

## Stack
A static site (semantic HTML, modern CSS, vanilla JS, no build step) plus one Vercel serverless function for **Zap-IA**.

```
index.html        page structure + SEO (Open Graph, schema.org Restaurant)
css/styles.css    design system (brand tokens at the top)
js/data.js        ← all content: full menu, promos, combos, branches (shared by site + Zap-IA)
api/zapia.js      Zap-IA endpoint (streams replies; NVIDIA NIM or Claude)
api/_prompt.js    builds Zap-IA's knowledge from js/data.js + live time/open branches
js/app.js         rendering, cart, WhatsApp checkout, live open/closed status
assets/img        Instagram posts (webp, 900px)
assets/video      Instagram reels (540p H.264, muted, faststart) + webp posters
```

## Features
- **Brand palette sampled from the posts**: red `#DF2F38`, deep red `#A10715`, cream `#FEF6D7`, mustard `#F7C344`, and Palé pink `#EC4E9B`. The checkered tablecloth edge appears throughout.
- **Weekly promos**: the current day in Bolivia time is highlighted automatically.
- **Cart + WhatsApp checkout**: the cart is saved in localStorage. Checkout builds the order message (items, total, branch, pick-up or delivery, address and notes).
- **9 branches with a live "Abierto / Cierra pronto / Cerrado" status** (America/La_Paz), each linked to Google Maps.
- **Reels carousel**: videos play only while on screen and load lazily.
- Responsive and accessible: skip link, focus styles, `prefers-reduced-motion`, and Esc closes the cart.

## Zap-IA (AI receptionist)
Floating chat button on every page. It answers questions about the menu, prices, promos, branches and opening hours, using only `js/data.js`. It never invents prices or phone numbers, and it sends customers to the WhatsApp funnel to order.

Set these in Vercel → Project → Settings → Environment Variables (never in the code):
| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | NVIDIA NIM key (current provider) |
| `ZAPIA_NVIDIA_MODEL` | optional, default `nvidia/nemotron-3-ultra-550b-a55b` |
| `ZAPIA_THINKING` | optional, `true` enables reasoning mode (slower) |
| `ANTHROPIC_API_KEY` | optional alternative provider (Claude); used if no NVIDIA key |

Without a key, the chat shows a friendly "coming soon" message and points to the menu and the WhatsApp funnel.

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
npx vercel dev
```

## Updating content
Edit `js/data.js`. Promos, prices and hours are all there. The Instagram media URLs expire, so new media must be downloaded into `assets/` (do not hotlink).
