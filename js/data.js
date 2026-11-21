/*
 * Zapi Piza — content source of truth.
 * Every fact below comes from @zapi.piza Instagram posts (Nov 2026).
 * Edit here; the UI renders from this file.
 */
window.ZAPI = {
  config: {
    // WhatsApp number for orders, international format without "+" (e.g. "5917XXXXXXX").
    // Left empty on purpose: the order number is not published on Instagram.
    // When empty, the checkout opens WhatsApp's share sheet with the order text pre-filled.
    whatsapp: "",
    instagram: "https://www.instagram.com/zapi.piza/",
    timezone: "America/La_Paz",
    currency: "Bs",
  },

  stats: [
    { value: 6, suffix: " años", label: "de sabor cruceño" },
    { value: 9, suffix: "", label: "sucursales en Santa Cruz" },
    { value: 5.9, suffix: "K", label: "Zapi lovers en Instagram", decimals: 1 },
  ],

  // Source: "¡LA SEMANA ZAPI EN TIEMPOS DE ANIVERSARIO SE VE ASÍ!" (DfSZzrUBk9s)
  weekly: [
    { day: 1, name: "Lunes", title: "de Premium", desc: "Tu Zapi Familia Premium", price: "56", save: "Ahorrás Bs 12" },
    { day: 2, name: "Martes", title: "de Eco", desc: "Tu Zapi Eco Familiar", price: "36", save: "Ahorrás Bs 10–12" },
    { day: 3, name: "Miércoles", title: "de Clásicas y Especiales", desc: "Tus favoritas familiares", price: "46", from: true, save: "Ahorrás Bs 8–18" },
    { day: 5, name: "Viernes", title: "de Palé", desc: "Todas las paletas Palé", price: "6", save: "Refrescá tu día", pale: true },
  ],

  // Source: "¡6 años se celebran con MUCHO más sabor!" (Df0PAsYFHL9)
  combos: [
    { id: "combo-chori", name: "Combo Chori", price: 56, note: "Pizza + soda" },
    { id: "combo-cheese", name: "Combo Cheese", price: 66, note: "Pizza + soda" },
    { id: "combo-peppe", name: "Combo Zuper Peppe", price: 76, note: "Pizza + soda", hot: true },
    { id: "combo-aniv", name: "Combo Aniversario", price: 96, note: "2 pizzas + soda", star: true },
  ],

  featured: [
    {
      id: "yapa-jyp",
      name: "Jamón y Pimentón",
      tag: "Yapa del mes",
      desc: "Pizza familiar de jamón y pimentón. La promo para disfrutar sin pensarlo dos veces.",
      price: 46,
      img: "assets/img/yapa.webp",
    },
    {
      id: "doriloco",
      name: "La Doriloco",
      tag: "Nueva",
      desc: "Llegó para conquistar tus sentidos: esa combinación, ese montón de sabor y esa pinta que no necesita presentación.",
      img: "assets/video/doriloco.webp",
      video: "assets/video/doriloco.mp4",
    },
    {
      id: "queso",
      name: "Mucho queso",
      tag: "¿Qué es el amor?",
      desc: "Una Zapi y mucho queso derritiéndose. Si esto no es amor, no sé qué lo sea.",
      img: "assets/img/amor.webp",
    },
  ],

  // Source: "¡ZAPI está más cerca de vos!" (De-Ld4kPZ6o) + Plan 3000 post (Df2y6WUBG9l)
  branches: [
    { name: "Melchor Pinto", open: "11:30", close: "23:30" },
    { name: "Santos Dumont", open: "11:30", close: "23:30" },
    { name: "Zoológico", open: "11:30", close: "23:30" },
    { name: "Piraí", open: "11:30", close: "23:30" },
    { name: "Alemana", open: "16:30", close: "23:30" },
    { name: "Remanso", open: "16:30", close: "23:30" },
    { name: "Plan 3000", open: "16:30", close: "23:30", address: "Av. Paurito, cerca de la Plaza El Mechero" },
    { name: "Villa 1ro de Mayo", open: "16:30", close: "23:30" },
    { name: "Pampa de la Isla", open: "16:30", close: "23:30" },
  ],

  reels: [
    { src: "assets/video/doriloco", caption: "La Doriloco llegó", url: "https://instagram.com/p/DffplLOOj1a" },
    { src: "assets/video/seleccionado", caption: "Fuiste seleccionado", url: "https://instagram.com/p/Dfk52yLuZxH" },
    { src: "assets/video/zapiday", caption: "Zapi Day · 6 años", url: "https://instagram.com/p/DfiUVQkBETp" },
    { src: "assets/video/cocina", caption: "Marketing en la cocina", url: "https://instagram.com/p/De4lgzsxkFy" },
    { src: "assets/video/plan3000", caption: "Plan 3000, estamos cerca", url: "https://instagram.com/p/Df2y6WUBG9l" },
    { src: "assets/video/sucursales", caption: "Nuestras 9 sucursales", url: "https://instagram.com/p/De-Ld4kPZ6o" },
    { src: "assets/video/yapa", caption: "La YAPAAAA", url: "https://instagram.com/p/DfsZJw6un8A" },
    { src: "assets/video/pale", caption: "Viernes de Palé", url: "https://instagram.com/p/DfXzV40pO5u" },
  ],

  feed: [
    { img: "assets/img/perdon.webp", url: "https://instagram.com/p/Df7-mLJh_9s", alt: "Perdón por lo que dije cuando tenía hambre" },
    { img: "assets/img/combos.webp", url: "https://instagram.com/p/Df0PAsYFHL9", alt: "Combos Zapi + Soda" },
    { img: "assets/img/zapiday.webp", url: "https://instagram.com/p/DfnVbfuPUz3", alt: "Zapi Day: todas las Zapis a Bs 36" },
    { img: "assets/img/pale.webp", url: "https://instagram.com/p/DfaH8e-xNDM", alt: "Viernes de Palé: paletas a Bs 6" },
    { img: "assets/img/clasico.webp", url: "https://instagram.com/p/DfVkli_lMxL", alt: "Zapi te lleva al clásico cruceño" },
    { img: "assets/img/noviembre.webp", url: "https://instagram.com/p/DfQIkVglFxH", alt: "Promos de noviembre" },
    { img: "assets/img/yapa.webp", url: "https://instagram.com/p/DfNjDxMxHma", alt: "Yapa del mes: Jamón y Pimentón Bs 46" },
    { img: "assets/img/amor.webp", url: "https://instagram.com/p/DfAzgKBlL3S", alt: "¿Qué es el amor?" },
  ],
};
