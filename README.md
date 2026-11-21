# Zapi Piza: website

The marketing and ordering site for **Zapi Piza** (Santa Cruz de la Sierra, Bolivia).
All content and media come from the brand's Instagram, [@zapi.piza](https://www.instagram.com/zapi.piza/). Nothing was AI-generated.

## Stack
A static site with no build step: semantic HTML, modern CSS and vanilla JS. It deploys as-is to Vercel, Netlify, GitHub Pages or any CDN.

```
index.html        page structure + SEO (Open Graph, schema.org Restaurant)
css/styles.css    design system (brand tokens at the top)
js/data.js        ← all content: promos, combos, branches, reels, feed
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

## ⚠️ Configure before launch
`js/data.js` → `config.whatsapp`: the **orders** WhatsApp number isn't published on Instagram, so it is empty for now.
While it's empty, checkout opens WhatsApp's share sheet with the order pre-filled.

## Run locally
```bash
python3 -m http.server 8080
```

## Updating content
Edit `js/data.js`. Promos, prices and hours are all there. The Instagram media URLs expire, so new media must be downloaded into `assets/` (do not hotlink).
