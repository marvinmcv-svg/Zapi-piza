/*
 * Zapi Piza: content source of truth.
 * Facts come from the official printed menu and from @zapi.piza Instagram posts (Nov 2026).
 * This file is shared by the browser (window.ZAPI) and by the Zap-IA API (require),
 * so the website and the AI receptionist can never disagree.
 */
(function (root) {
  const ZAPI = {
    config: {
      // Each branch has its own WhatsApp (see branches). This is the Call Center for general questions.
      // Source: linktr.ee/zapi.piza ("Call Center - Consultas").
      callCenter: "59176044549",
      instagram: "https://www.instagram.com/zapi.piza/",
      timezone: "America/La_Paz",
      currency: "Bs",
    },

    /* ---------------- MENU (printed menu) ---------------- */
    base: "Salsa de tomate de la casa y queso muzzarella",
    sizes: { familiar: "Familiar · 35 cm", jr: "Jr. · 20 cm" },
    menu: [
      {
        id: "clasica", name: "Zapi Clásica", size: "familiar",
        items: [
          { id: "jamon", name: "Jamón", price: 52, desc: "jamón" },
          { id: "chori", name: "Chori", price: 52, desc: "chorizo" },
          { id: "chori-criollo", name: "Chori Criollo", price: 54, desc: "tomate, cebolla y chorizo criollo" },
          { id: "carne-cebolla", name: "Carne Cebolla", price: 54, desc: "carne y cebolla" },
          { id: "panceti", name: "Panceti", price: 54, desc: "tocino" },
          { id: "pepperoni", name: "Pepperoni", price: 54, desc: "pepperoni" },
          { id: "vegetariana", name: "Vegetariana", price: 58, desc: "tomate, champiñón, pimentón, cebolla y espinaca", veg: true },
          { id: "americana", name: "Americana", price: 58, desc: "jamón y choclo" },
          { id: "hawaiana", name: "Hawaiana", price: 58, desc: "jamón y piña" },
          { id: "canadiense", name: "Canadiense", price: 58, desc: "tocino y cebolla" },
          { id: "champi", name: "Champi", price: 58, desc: "jamón y champiñón" },
          { id: "napojamon", name: "Napojamón", price: 58, desc: "jamón, tomate y ajo" },
          { id: "jamon-tocino", name: "Jamón y Tocino", price: 58, desc: "jamón y tocino" },
          { id: "jamon-pimenton", name: "Jamón y Pimentón", price: 58, desc: "jamón y pimentón" },
          { id: "toci-choclo", name: "Toci Choclo", price: 58, desc: "tocino y choclo" },
          { id: "toci-hawai", name: "Toci Hawai", price: 58, desc: "tocino y piña" },
          { id: "carbonara", name: "Carbonara", price: 58, desc: "tocino y champiñón" },
          { id: "trica", name: "Trica", price: 58, desc: "jamón, tocino y pepperoni" },
        ],
      },
      {
        id: "eco", name: "Zapi Eco", size: "familiar",
        items: [
          { id: "muzza", name: "Muzza", price: 44, desc: "orégano", veg: true },
          { id: "margarita", name: "Margarita", price: 44, desc: "tomate y orégano", veg: true },
          { id: "napolitana", name: "Napolitana", price: 46, desc: "tomate en rodajas, ajo y orégano", veg: true },
          { id: "fugazzeta", name: "Fugazzeta", price: 46, desc: "cebolla", veg: true },
          { id: "choclo", name: "Choclo", price: 46, desc: "choclo", veg: true },
        ],
      },
      {
        id: "especial", name: "Zapi Especial", size: "familiar",
        items: [
          { id: "4-estaciones", name: "4 Estaciones", price: 64, desc: "jamón, pepperoni, champiñón y pimentón" },
          { id: "barbacoa", name: "Barbacoa", price: 64, desc: "carne molida, cebolla y salsa barbacoa" },
          { id: "cheeseburger", name: "Cheeseburger", price: 64, desc: "tocino, carne molida y cheddar" },
        ],
      },
      {
        id: "premium", name: "Zapi Premium", size: "familiar",
        items: [
          { id: "carnivora", name: "Carnívora", price: 68, desc: "jamón, tocino, carne, pepperoni y chorizo ahumado" },
          { id: "4-quesos", name: "4 Quesos", price: 68, desc: "cheddar, queso azul y catupiry", veg: true },
          { id: "doriloco", name: "Doriloco", price: 68, desc: "carne molida, cheddar, crema agria, doritos y pico de gallo", hot: true },
          { id: "zuper-peppe", name: "Zuper Peppe", price: 68, desc: "extra pepperoni" },
        ],
      },
      {
        id: "jr", name: "Menú Jr.", size: "jr",
        items: [
          { id: "jr-muzza", name: "Muzza Jr.", price: 22, desc: "orégano", veg: true },
          { id: "jr-chori", name: "Chori Jr.", price: 25, desc: "chorizo" },
          { id: "jr-jamon", name: "Jamón Jr.", price: 25, desc: "jamón" },
          { id: "jr-panceti", name: "Panceti Jr.", price: 25, desc: "tocino" },
          { id: "jr-pepperoni", name: "Pepperoni Jr.", price: 25, desc: "pepperoni" },
          { id: "jr-carne-cebolla", name: "Carne Cebolla Jr.", price: 25, desc: "carne y cebolla" },
        ],
      },
    ],

    addons: {
      extras: { price: 10, items: ["Jamón", "Cheddar", "Queso Azul", "Pepperoni", "Tocino", "Chorizo", "Carne", "Champiñones", "Choclo", "Piña", "Cebolla", "Tomate", "Pimentón", "Mozzarella"] },
      salsas: { price: 3, items: ["Tomate", "Picante", "Barbacoa"] },
      bordes: { price: 17, items: ["Borde Catupiry", "Decorado Catupiry"] },
      sodas: [
        { id: "soda-300", name: "Soda 300 ml", price: 6 },
        { id: "soda-500", name: "Soda 500 ml", price: 9 },
        { id: "soda-1l", name: "Soda 1 litro", price: 12 },
        { id: "soda-15", name: "Coca-Cola 1,5 litros", price: 15 },
        { id: "soda-2l", name: "Soda 2 litros", price: 18 },
        { id: "soda-25", name: "Coca-Cola 2,5 litros", price: 20 },
      ],
    },

    /* ---------------- PROMOS (Instagram, November 2026) ---------------- */
    // "¡LA SEMANA ZAPI EN TIEMPOS DE ANIVERSARIO SE VE ASÍ!" (DfSZzrUBk9s) + the "Promos Noviembre" carousel
    // (DfQIkVglFxH): one slide per day with the artwork (img) and the struck-through regular price (was).
    weekly: [
      { day: 1, name: "Lunes", title: "de Premium", desc: "Todas las Zapi Premium familiares", price: "56", was: "68", save: "Ahorrás Bs 12", cats: ["premium"], img: "assets/img/promo-lunes.webp" },
      { day: 2, name: "Martes", title: "de Eco", desc: "Todas las Zapi Eco familiares", price: "36", was: "46", save: "Ahorrás hasta Bs 10", cats: ["eco"], img: "assets/img/promo-martes.webp" },
      { day: 3, name: "Miércoles", title: "de Clásicas y Especiales", desc: "Todas las Clásicas y Especiales familiares", price: "46", was: "64", save: "Ahorrás hasta Bs 18", cats: ["clasica", "especial"], img: "assets/img/promo-miercoles.webp" },
      { day: 5, name: "Viernes", title: "de Palé", desc: "Todas las paletas Palé", price: "6", save: "Refrescá tu día", pale: true, img: "assets/img/pale.webp" },
    ],

    // "¡6 años se celebran con MUCHO más sabor!" (Df0PAsYFHL9)
    combos: [
      // Contents and photos from the post's carousel slides.
      // `parts`: the closest menu items, used to show what the combo saves vs. buying them separately.
      { id: "combo-chori", name: "Combo Chori", price: 56, img: "assets/img/combo-chori.webp",
        note: "Zapi Familiar Chori + Guaraná 1 litro", parts: ["chori", "soda-1l"] },
      { id: "combo-cheese", name: "Combo Cheese", price: 66, img: "assets/img/combo-cheese.webp",
        note: "Zapi Familiar Cheeseburger + Coca-Cola 1,5 litros", parts: ["cheeseburger", "soda-15"] },
      { id: "combo-peppe", name: "Combo Zuper Peppe", price: 76, img: "assets/img/combo-peppe.webp", hot: true,
        note: "Zapi Familiar Zuper Peppe + Coca-Cola 2 litros", parts: ["zuper-peppe", "soda-2l"] },
      { id: "combo-aniv", name: "Combo Aniversario", price: 96, img: "assets/img/combo-aniv.webp", star: true,
        note: "Zapi Familiar Carne Cebolla + Zapi Familiar Americana + Pepsi 2,5 litros", parts: ["carne-cebolla", "americana", "soda-25"] },
    ],

    // Yapa del mes: Jamón y Pimentón familiar at Bs 46 (regular Bs 58), all of November.
    yapa: { id: "yapa-jyp", name: "Jamón y Pimentón · Yapa del mes", price: 46, regular: 58 },

    // "Descubrí nuestras promos" row: current promo posts (expired ones, like Zapi Day, stay out).
    offers: [
      { img: "assets/img/combos.webp", href: "#combos", alt: "Combos Zapi + Soda, todo noviembre" },
      { img: "assets/img/yapa.webp", href: "#yapa", alt: "Yapa del mes: Jamón y Pimentón a Bs 46" },
      { img: "assets/img/pale.webp", href: "#pale", alt: "Viernes de Palé: paletas a Bs 6" },
      { img: "assets/img/noviembre.webp", href: "#promos", alt: "Promos de noviembre: la semana Zapi" },
      { img: "assets/img/amor.webp", href: "#menu", alt: "¿Qué es el amor? La 4 Quesos" },
    ],

    featured: [
      { ref: "yapa-jyp", name: "Jamón y Pimentón", tag: "Yapa del mes", img: "assets/img/yapa.webp",
        desc: "Pizza familiar de jamón y pimentón a precio de yapa durante todo noviembre." },
      { ref: "doriloco", name: "La Doriloco", tag: "Premium", img: "assets/video/doriloco.webp", video: "assets/video/doriloco.mp4",
        desc: "Carne molida, cheddar, crema agria, doritos y pico de gallo. Esa pinta no necesita presentación." },
      { ref: "4-quesos", name: "4 Quesos", tag: "¿Qué es el amor?", img: "assets/img/amor.webp",
        desc: "Muzzarella, cheddar, queso azul y catupiry derritiéndose. Si esto no es amor…" },
    ],

    /* ---------------- BRANCHES ---------------- */
    // Hours: "¡ZAPI está más cerca de vos!" (De-Ld4kPZ6o). WhatsApp numbers + plus codes: linktr.ee/zapi.piza
    // (wa.me/message links resolved to each branch's WhatsApp Business number).
    branches: [
      { name: "Melchor Pinto", open: "11:30", close: "23:30", whatsapp: "59178008444", plus: "6R8J+W69" },
      { name: "Santos Dumont", open: "11:30", close: "23:30", whatsapp: "59178594000" },
      { name: "Zoológico", open: "11:30", close: "23:30", whatsapp: "59177622513" },
      { name: "Piraí", open: "11:30", close: "23:30", whatsapp: "59178459620" },
      { name: "Alemana", open: "16:30", close: "23:30", whatsapp: "59177005855", address: "Alemana, 5to anillo" },
      { name: "Remanso", open: "16:30", close: "23:30", whatsapp: "59162217622" },
      { name: "Plan 3000", open: "16:30", close: "23:30", whatsapp: "59178224700", plus: "5V7C+FRM", address: "Av. Paurito, cerca de la Plaza El Mechero" },
      { name: "Villa 1ro de Mayo", open: "16:30", close: "23:30", whatsapp: "59178466767", plus: "6V48+M4" },
      { name: "Pampa de la Isla", open: "16:30", close: "23:30", whatsapp: "59177727495", plus: "6VMP+39" },
    ],

    /* ---------------- OTHER FACTS (for Zap-IA) ---------------- */
    facts: [
      "Zapi Piza es una pizzería cruceña con 6 años (aniversario: 12 de noviembre, el 'Zapi Day').",
      "Tiene 9 sucursales y un centro de producción en Santa Cruz de la Sierra, Bolivia. Atiende de lunes a domingo.",
      "Se puede pedir por el WhatsApp de cada sucursal, en el local, o por la app Yango (buscar 'Piza Zapi'). Consultas generales: Call Center por WhatsApp al 76044549.",
      "Promo con Yango: si el pedido por Yango tarda más de 30 minutos, el siguiente pedido habilita la opción de recibir una Zapi Personal.",
      "En todas las sucursales hay paletas Palé Picoles (Oreo, grosella, gomitas y más); los viernes todas a Bs 6.",
      "Búsqueda laboral: Zapi busca Jefe/a de Operaciones; enviar CV o escribir al 76044549.",
      "Instagram: @zapi.piza.",
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

  /* Everything that can go in a cart, by id. Shared by the site and Zap-IA's tools, so both price alike. */
  ZAPI.catalog = function catalog() {
    const Z = ZAPI, out = {};
    const sizeShort = { familiar: "Familiar", jr: "Jr." };
    Z.menu.forEach((cat) => cat.items.forEach((it) => {
      out[it.id] = { id: it.id, name: cat.size === "jr" ? it.name : `${it.name} (${sizeShort[cat.size]})`, price: it.price,
        kind: "pizza", cat: cat.id, size: cat.size, desc: it.desc, veg: !!it.veg, hot: !!it.hot };
    }));
    Z.combos.forEach((c) => (out[c.id] = { id: c.id, name: c.name, price: c.price, kind: "combo", desc: c.note }));
    out[Z.yapa.id] = { id: Z.yapa.id, name: Z.yapa.name, price: Z.yapa.price, kind: "promo", desc: "pizza familiar de jamón y pimentón", regular: Z.yapa.regular };
    Z.addons.sodas.forEach((s) => (out[s.id] = { id: s.id, name: s.name, price: s.price, kind: "drink" }));
    const groups = { extra: ["Extra", Z.addons.extras], salsa: ["Salsa", Z.addons.salsas], borde: ["", Z.addons.bordes] };
    Object.entries(groups).forEach(([key, [label, g]]) => g.items.forEach((name) => {
      const id = `${key}:${name}`;
      out[id] = { id, name: label ? `${label} ${name.toLowerCase()}` : name, price: g.price, kind: key };
    }));
    return out;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = ZAPI;
  else root.ZAPI = ZAPI;
})(typeof window !== "undefined" ? window : globalThis);
