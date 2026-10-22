// Vistas renderizadas en el servidor. Todo valor interpolado se escapa automáticamente;
// sólo lo envuelto en raw() se inserta tal cual (y nunca proviene del usuario).
import { parseImages, slugify } from './db.js';

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const render = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : v === false || v == null ? '' : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export const money = (n) => `UY$ ${Number(n).toLocaleString('es-UY')}`;
const date = (ms) => new Date(ms).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Montevideo' });
const initials = (s) => String(s).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const csrfField = (ctx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

const STATUS = { disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida', oculta: 'Oculta' };
const KIND = { raw: 'Sin graduar', graded: 'Graduada', sealed: 'Sellado' };
const TEAMS = ['river-plate', 'boca-juniors', 'argentina', 'uruguay', 'liverpool', 'nacional', 'penarol', 'real-madrid', 'barcelona'];
const teamKey = (team) => { const k = slugify(team || ''); return TEAMS.includes(k) ? k : 'default'; };

export function waLink(phone, text) {
  return `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/* ---------- Layout ---------- */

const pad = (n) => String(n).padStart(3, '0');
const arrow = raw('<svg class="ico" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>');

// "Prizm /125 Rookie Boca" a partir del título sin el nombre del jugador.
export function setLine(card) {
  const t = card.player && card.title.startsWith(card.player) ? card.title.slice(card.player.length).trim() : '';
  return t || card.brand || KIND[card.kind];
}

export function layout(ctx, { title, body, description = '', bodyClass = '' }) {
  const s = ctx.settings;
  const nav = [['/', 'Catálogo'], ['/vender', 'Te compramos'], ['/guia', 'Guía']];
  if (ctx.isAdmin) nav.push(['/admin', 'Panel']);
  const ticker = (ctx.ticker || []).map((t) => html`<span><b>Nuevo</b> ${t.title} <i>${money(t.price)}</i></span>`);
  return html`<!doctype html>
<html lang="es-UY">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} — ${s.store_name}` : `${s.store_name} — Cartas de fútbol, Montevideo`}</title>
<meta name="description" content="${description || 'Cartas coleccionables de fútbol en Uruguay: Prizm, Optic, Topps Chrome, rookies y numeradas. Comprá con Mercado Pago.'}">
<link rel="icon" href="/static/logo.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800;900&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/static/style.css">
<script src="/static/app.js" defer></script>
</head>
<body class="${bodyClass}">
${ticker.length ? html`<div class="ticker" aria-hidden="true"><div class="ticker-track">${ticker}${ticker}</div></div>` : ''}
<header class="hd">
  <a class="wordmark" href="/"><img src="/static/logo.jpg" alt="" width="34" height="34"><span>Card Grade</span><sup>UY</sup></a>
  <nav class="hd-nav" id="nav">
    ${nav.map(([href, label]) => html`<a href="${href}" class="${ctx.path === href ? 'on' : ''}">${label}</a>`)}
  </nav>
  ${ctx.static
    ? html`<a class="hd-cart" href="${waLink(s.whatsapp, 'Hola! Tengo una consulta')}" target="_blank" rel="noopener">WhatsApp ${arrow}</a>`
    : html`<a class="hd-cart" href="/carrito">Carrito <b>${String(ctx.cartCount).padStart(2, '0')}</b></a>`}
  <button class="hd-menu" type="button" data-toggle="nav" aria-label="Menú">Menú</button>
</header>
${ctx.flash ? html`<p class="flash flash-${ctx.flash.type}" role="status">${ctx.flash.msg}</p>` : ''}
<main>${body}</main>
<footer class="ft">
  <div class="ft-mark" aria-hidden="true">Card Grade</div>
  <div class="ft-grid">
    <div><p class="lbl">Card Grade Uy</p><p>${s.tagline}<br>Cartas coleccionables de fútbol.<br>Montevideo, Uruguay.</p></div>
    <div><p class="lbl">Tienda</p><a href="/">Catálogo</a><a href="/vender">Te compramos</a><a href="/guia">Guía de condiciones</a></div>
    <div><p class="lbl">Contacto</p><a href="https://instagram.com/${s.instagram}" target="_blank" rel="noopener">Instagram @${s.instagram}</a><a href="${waLink(s.whatsapp, 'Hola! Tengo una consulta')}" target="_blank" rel="noopener">WhatsApp</a></div>
    <div><p class="lbl">Pagos</p><p>Procesados por Mercado Pago.<br>Tarjetas, débito, Abitab y Redpagos.</p></div>
  </div>
  <div class="ft-base"><span>© ${new Date().getFullYear()} ${s.store_name}</span><span>Hecho en Uruguay</span>${ctx.static ? html`<span>Vista previa</span>` : html`<a href="/admin">Acceso administrador</a>`}</div>
</footer>
</body>
</html>`;
}

/* ---------- Componentes ---------- */

function cardArt(card) {
  const imgs = parseImages(card);
  if (imgs.length) return html`<img src="/uploads/${imgs[0]}" alt="${card.title}" loading="lazy">`;
  return html`<div class="noimg"><span>${card.player || card.title}</span></div>`;
}

function tile(card, i) {
  return html`<a class="cell" href="/carta/${card.slug}" data-status="${card.status}" data-team="${card.team}" data-rookie="${card.rookie ? 1 : 0}" data-serial="${card.serial ? 1 : 0}" data-price="${card.price}" data-search="${[card.title, card.player, card.team, card.brand].join(' ').toLowerCase()}">
    <div class="cell-top"><span>#${pad(i + 1)}</span><span>${[card.serial, card.rookie ? 'RC' : '', card.grade].filter(Boolean).join(' · ')}</span></div>
    <div class="cell-img">${cardArt(card)}</div>
    <div class="cell-info">
      <h3>${card.player || card.title}</h3>
      <p class="cell-set">${setLine(card)}</p>
      <div class="cell-foot"><span class="price">${money(card.price)}</span><span class="st st-${card.status}">${STATUS[card.status]}</span></div>
    </div>
  </a>`;
}

/* ---------- Páginas públicas ---------- */

export function catalogPage(ctx, { cards, stats, q, teams, page, pages, counts = {}, offset = 0 }) {
  const opt = (name, value, label) => html`<option value="${value}" ${q[name] === value ? raw('selected') : ''}>${label}</option>`;
  const qs = (p) => '?' + new URLSearchParams({ ...q, page: p }).toString();
  const tabs = [
    ['Todas', '/#catalogo', counts.todas, !q.equipo && !q.rookie && !q.numerada && !q.estado],
    ['Disponibles', '/?estado=disponible#catalogo', counts.disponibles, q.estado === 'disponible'],
    ['Uruguay', '/?equipo=Uruguay#catalogo', counts.uruguay, q.equipo === 'Uruguay'],
    ['River', '/?equipo=River%20Plate#catalogo', counts.river, q.equipo === 'River Plate'],
    ['Boca', '/?equipo=Boca%20Juniors#catalogo', counts.boca, q.equipo === 'Boca Juniors'],
    ['Rookies', '/?rookie=1#catalogo', counts.rookies, q.rookie === '1'],
    ['Numeradas', '/?numerada=1#catalogo', counts.numeradas, q.numerada === '1'],
  ];
  const month = new Date().toLocaleDateString('es-UY', { month: 'long', year: 'numeric' });
  const body = html`
  <section class="intro">
    <div class="intro-meta"><span>Catálogo — ${month}</span><span>Montevideo, UY</span><span>${pad(stats.disponibles)} disponibles</span></div>
    <h1 class="mega">A card.<span class="mega-serif">a life.</span></h1>
    <div class="intro-grid">
      <div class="intro-copy">
        <p>Cartas de fútbol elegidas una por una: Prizm, Optic, Topps Chrome, rookies y numeradas. Fotos reales de cada carta, pago con Mercado Pago y envío protegido a todo Uruguay.</p>
        <div class="intro-cta">
          <a class="btn" href="#catalogo">Ver el catálogo ${arrow}</a>
          <a class="btn btn-line" href="/vender">Vender mis cartas</a>
        </div>
      </div>
      <div class="intro-figs">
        ${stats.featured.map((c, i) => html`<a class="fig fig-${i}" href="/carta/${c.slug}"><div class="fig-img">${cardArt(c)}</div><span class="fig-cap">Fig. ${pad(i + 1)} — ${c.player || c.title}, ${setLine(c)}</span></a>`)}
      </div>
    </div>
  </section>

  <section class="numbers">
    <div><b>${pad(stats.disponibles)}</b><span>Disponibles</span></div>
    <div><b>${pad(stats.total)}</b><span>Publicadas</span></div>
    <div><b>${pad(stats.vendidas)}</b><span>Vendidas</span></div>
    <div><b>48h</b><span>Respuesta a ofertas</span></div>
  </section>

  <section class="cat" id="catalogo">
    <div class="sec-head"><h2 class="sec-title">Catálogo</h2><p class="lbl">Fotos reales · precios en pesos uruguayos</p></div>
    <nav class="tabs" aria-label="Filtros rápidos">
      ${tabs.map(([label, href, n, on]) => html`<a class="${on ? 'on' : ''}" href="${href}">${label}${n != null ? html`<sup>${n}</sup>` : ''}</a>`)}
    </nav>
    <form class="filters" method="get" action="/#catalogo" data-autosubmit>
      <label class="f-search"><span>Buscar</span><input type="search" name="q" value="${q.q}" placeholder="Jugador, equipo o set" maxlength="80"></label>
      <label><span>Estado</span><select name="estado">${opt('estado', '', 'Todos')}${opt('estado', 'disponible', 'Disponibles')}${opt('estado', 'reservada', 'Reservadas')}${opt('estado', 'vendida', 'Vendidas')}</select></label>
      <label><span>Equipo</span><select name="equipo">${opt('equipo', '', 'Todos')}${teams.map((t) => opt('equipo', t, t))}</select></label>
      <label><span>Orden</span><select name="orden">${opt('orden', '', 'Recientes')}${opt('orden', 'precio-asc', 'Menor precio')}${opt('orden', 'precio-desc', 'Mayor precio')}</select></label>
      ${q.rookie ? html`<input type="hidden" name="rookie" value="1">` : ''}${q.numerada ? html`<input type="hidden" name="numerada" value="1">` : ''}
      <button class="btn btn-sm js-hide" type="submit">Filtrar</button>
    </form>

    ${cards.length
      ? html`<div class="cells">${cards.map((c, i) => tile(c, offset + i))}</div>`
      : html`<div class="empty"><p>No hay cartas con esos filtros.</p><a class="btn btn-line" href="/">Ver todo</a></div>`}

    ${pages > 1 ? html`<nav class="pager" aria-label="Páginas">
      ${page > 1 ? html`<a href="${qs(page - 1)}#catalogo">← Anterior</a>` : html`<span></span>`}
      <span>Página ${page} de ${pages}</span>
      ${page < pages ? html`<a href="${qs(page + 1)}#catalogo">Siguiente →</a>` : html`<span></span>`}
    </nav>` : ''}
  </section>

  <section class="buyband">
    <div class="buyband-l">
      <p class="lbl">Te compramos</p>
      <h2>¿Tenés cartas<br>guardadas?</h2>
    </div>
    <ol class="buyband-r">
      <li><b>01</b>Mandanos fotos y el precio que pedís.</li>
      <li><b>02</b>Te respondemos con una oferta en menos de 48 h.</li>
      <li><b>03</b>Cobrás por transferencia o en efectivo.</li>
      <li class="buyband-cta"><a class="btn btn-dark" href="/vender">Ofrecer mis cartas ${arrow}</a></li>
    </ol>
  </section>`;
  return layout(ctx, { title: '', body, bodyClass: 'home' });
}

export function cardPage(ctx, { card, related }) {
  const imgs = parseImages(card);
  const s = ctx.settings;
  const available = card.status === 'disponible';
  const spec = [
    ['Jugador', card.player], ['Equipo', card.team || '—'], ['Set', card.brand || '—'], ['Numeración', card.serial || 'Sin numerar'],
    ['Rookie', card.rookie ? 'Sí (RC)' : 'No'], ['Tipo', card.grade ? `${KIND[card.kind]} · ${card.grade}` : KIND[card.kind]], ['Estado', STATUS[card.status]],
  ].filter(([, v]) => v);
  const buy = !available
    ? html`<p class="sold-note">Esta carta ya no está disponible. Escribinos y te avisamos si entra una similar.</p>`
    : ctx.static
      ? html`<div class="buy"><a class="btn btn-buy" href="/carta/${card.slug}/comprar/">Comprar <span>${money(card.price)}</span></a></div>`
      : html`<form method="post" action="/carrito/agregar" class="buy">
          ${csrfField(ctx)}<input type="hidden" name="card_id" value="${card.id}">
          <button class="btn btn-buy" name="comprar" value="1">Comprar <span>${money(card.price)}</span></button>
          <button class="btn btn-line" name="comprar" value="0">Agregar al carrito</button>
        </form>`;
  const body = html`
  <nav class="crumb"><a href="/#catalogo">Catálogo</a><span>/</span>${card.team ? html`<span>${card.team}</span><span>/</span>` : ''}<span>${card.player || card.title}</span></nav>
  <article class="pdp">
    <figure class="pdp-fig">
      <div class="crop" id="main-image" data-status="${card.status}">${imgs.length ? html`<img src="/uploads/${imgs[0]}" alt="${card.title}">` : cardArt(card)}</div>
      ${imgs.length > 1 ? html`<div class="thumbs">${imgs.map((img, i) => html`<button type="button" class="thumb ${i === 0 ? 'active' : ''}" data-src="/uploads/${img}" aria-label="Ver foto ${i + 1}"><img src="/uploads/${img}" alt=""></button>`)}</div>` : ''}
      <figcaption>Foto real de la carta. Lo que ves es lo que recibís.</figcaption>
    </figure>
    <div class="pdp-info">
      <p class="lbl">${[card.brand, card.serial, card.rookie ? 'Rookie' : ''].filter(Boolean).join(' · ')}<span class="st st-${card.status}">${STATUS[card.status]}</span></p>
      <h1 class="pdp-title">${card.player || card.title}</h1>
      <p class="pdp-set">${setLine(card)}</p>
      <p class="pdp-price">${money(card.price)}</p>
      ${buy}
      <a class="wa" target="_blank" rel="noopener" href="${waLink(s.whatsapp, `Hola! Consulto por la carta: ${card.title} (${money(card.price)})`)}">Consultar por WhatsApp ${arrow}</a>
      <table class="spec"><tbody>${spec.map(([k, v]) => html`<tr><th>${k}</th><td>${v}</td></tr>`)}</tbody></table>
      ${card.description ? html`<p class="description">${card.description}</p>` : ''}
      <ol class="notes">
        <li><b>01</b><span><strong>Pago con Mercado Pago.</strong> Tarjeta, débito, dinero en cuenta, Abitab o Redpagos.</span></li>
        <li><b>02</b><span><strong>Reserva automática.</strong> Mientras pagás, la carta queda apartada para vos.</span></li>
        <li><b>03</b><span><strong>Envío protegido.</strong> Top loader y sobre rígido a todo Uruguay, o retiro.</span></li>
      </ol>
    </div>
  </article>
  ${related.length ? html`<section class="cat related"><div class="sec-head"><h2 class="sec-title">Seguí mirando</h2></div><div class="cells">${related.map((c, i) => tile(c, i))}</div></section>` : ''}`;
  return layout(ctx, { title: card.title, body, description: `${card.title} — ${money(card.price)}. ${STATUS[card.status]}.` });
}

export function cartPage(ctx, { items, subtotal }) {
  const body = html`<section class="page">
    <div class="page-head"><p class="lbl">Paso 1 de 3</p><h1 class="page-title">Carrito</h1></div>
    ${items.length ? html`
      <ul class="lines">
        ${items.map((c) => html`<li class="line">
          <a href="/carta/${c.slug}" class="line-img">${cardArt(c)}</a>
          <div class="line-info"><a href="/carta/${c.slug}">${c.player || c.title}</a><span>${setLine(c)}</span></div>
          <span class="price">${money(c.price)}</span>
          <form method="post" action="/carrito/quitar">${csrfField(ctx)}<input type="hidden" name="card_id" value="${c.id}"><button class="x" aria-label="Quitar">Quitar</button></form>
        </li>`)}
      </ul>
      <div class="total"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      <p class="fine">El envío se calcula en el siguiente paso. Cada carta es única: queda reservada 30 minutos al iniciar el pago.</p>
      <a class="btn btn-buy" href="/checkout">Continuar <span>${arrow}</span></a>`
    : html`<div class="empty"><p>Tu carrito está vacío.</p><a class="btn btn-line" href="/">Ver catálogo</a></div>`}
  </section>`;
  return layout(ctx, { title: 'Carrito', body });
}

export function checkoutPage(ctx, { items, subtotal, form = {}, errors = [], action = '/checkout' }) {
  const s = ctx.settings;
  const shipping = Number(s.shipping_cost) || 0;
  const delivery = form.delivery || 'envio';
  const body = html`<section class="page checkout">
    <div class="page-head"><p class="lbl">Paso 2 de 3</p><h1 class="page-title">Tus datos</h1></div>
    <div class="co-grid">
      ${ctx.static ? raw(`<form class="sheet" novalidate data-checkout data-next="${action}">`) : raw(`<form method="post" action="${action}" class="sheet" novalidate data-checkout>`)}
        ${ctx.static ? '' : csrfField(ctx)}
        ${errors.length ? html`<ul class="errors">${errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
        <label>Nombre y apellido<input name="name" required maxlength="80" autocomplete="name" value="${form.name || ''}"></label>
        <div class="two">
          <label>Email<input name="email" type="email" required maxlength="120" autocomplete="email" value="${form.email || ''}"></label>
          <label>Celular<input name="phone" type="tel" required maxlength="20" autocomplete="tel" value="${form.phone || ''}" placeholder="099 123 456"></label>
        </div>
        <fieldset class="choice">
          <legend>Entrega</legend>
          <label class="radio"><input type="radio" name="delivery" value="envio" ${delivery === 'envio' ? raw('checked') : ''}><span>Envío a domicilio</span><em>${money(shipping)}</em></label>
          <label class="radio"><input type="radio" name="delivery" value="retiro" ${delivery === 'retiro' ? raw('checked') : ''}><span>Retiro en Montevideo</span><em>Gratis</em></label>
        </fieldset>
        <label>Dirección (si elegiste envío)<textarea name="address" maxlength="300" rows="2" autocomplete="street-address">${form.address || ''}</textarea></label>
        <button class="btn btn-buy">Ir a pagar con Mercado Pago <span>${arrow}</span></button>
        <p class="fine">El pago se hace en Mercado Pago. Card Grade nunca ve ni guarda los datos de tu tarjeta.</p>
      </form>
      <aside class="sheet summary">
        <p class="lbl">Resumen</p>
        <ul class="mini">${items.map((c) => html`<li><span>${c.title}</span><b>${money(c.price)}</b></li>`)}</ul>
        <div class="total"><span>Subtotal</span><strong data-subtotal="${subtotal}">${money(subtotal)}</strong></div>
        <p class="fine">+ envío ${money(shipping)} si corresponde.</p>
      </aside>
    </div>
  </section>`;
  return layout(ctx, { title: 'Checkout', body });
}

// Simulación del paso de Mercado Pago (sólo modo demo; en producción se redirige al sitio real de Mercado Pago).
export function mpDemoPage(ctx, { order, items, action, links }) {
  const methods = [
    ['credito', 'Tarjeta de crédito', 'Visa, Mastercard, OCA, Creditel · hasta 12 cuotas'],
    ['debito', 'Tarjeta de débito', 'Visa Débito, Maestro'],
    ['cuenta', 'Dinero en cuenta de Mercado Pago', 'Pago al instante'],
    ['efectivo', 'Efectivo en Abitab o Redpagos', 'Se acredita al pagar en el local'],
  ];
  const btns = links
    ? html`<a class="btn btn-buy" href="${links.approved}">Pagar <span data-total-text>${money(order.total)}</span></a>
           <div class="mp-alt"><a href="${links.pending}">Simular pago pendiente (Abitab)</a><a href="${links.rejected}">Simular tarjeta rechazada</a></div>`
    : html`<form method="post" action="${action}">${csrfField(ctx)}
           <button class="btn btn-buy" name="result" value="approved">Pagar <span>${money(order.total)}</span></button>
           <div class="mp-alt"><button class="link" name="result" value="pending">Simular pago pendiente (Abitab)</button><button class="link" name="result" value="rejected">Simular tarjeta rechazada</button></div></form>`;
  const body = html`<section class="page mp">
    <div class="mp-banner"><b>Simulación</b> En la tienda real, este paso ocurre en el sitio oficial de Mercado Pago. Acá podés probar qué pasa con un pago aprobado, pendiente o rechazado.</div>
    <div class="page-head"><p class="lbl">Paso 3 de 3 · Mercado Pago</p><h1 class="page-title">Pagá tu compra</h1></div>
    <div class="co-grid">
      <div class="sheet">
        <p class="lbl">Elegí cómo pagar</p>
        <div class="methods">${methods.map(([v, t, d], i) => html`<label class="method"><input type="radio" name="metodo" value="${v}" ${i === 0 ? raw('checked') : ''}><span><strong>${t}</strong><em>${d}</em></span></label>`)}</div>
        ${btns}
      </div>
      <aside class="sheet summary">
        <p class="lbl">Pagás a Card Grade Uy</p>
        <ul class="mini">${items.map((i) => html`<li><span>${i.title}</span><b>${money(i.price)}</b></li>`)}
          <li data-ship-row ${order.shipping ? '' : raw('hidden')}><span>Envío</span><b>${money(order.shipping || Number(ctx.settings.shipping_cost) || 0)}</b></li></ul>
        <div class="total"><span>Total</span><strong data-total data-base="${order.total}" data-ship="${Number(ctx.settings.shipping_cost) || 0}">${money(order.total)}</strong></div>
        <p class="fine">Pedido ${order.id ? order.id.slice(0, 8).toUpperCase() : 'DEMO'} · la carta queda reservada 30 minutos.</p>
      </aside>
    </div>
  </section>`;
  return layout(ctx, { title: 'Pago', body });
}

export function resultPage(ctx, { order, items, demo, retryHref }) {
  const msgs = {
    pagada: ['Pago aprobado', '¡Gracias por tu compra! Te escribimos por WhatsApp para coordinar la entrega.'],
    enviada: ['Pedido enviado', 'Tu pedido ya está en camino.'],
    entregada: ['Pedido entregado', '¡Que la disfrutes!'],
    pendiente: ['Pago pendiente', 'Si pagás en Abitab o Redpagos, se acredita al pagar. La carta sigue reservada para vos.'],
    expirada: ['La reserva venció', 'No recibimos el pago a tiempo y la carta volvió al catálogo.'],
    cancelada: ['Pago rechazado', 'Mercado Pago no aprobó el pago y la carta volvió al catálogo. Podés intentar de nuevo con otro medio.'],
    revisar: ['Pago en revisión', 'Recibimos tu pago y lo estamos revisando. Te contactamos a la brevedad.'],
  };
  const [title, text] = msgs[order.status];
  const ok = ['pagada', 'enviada', 'entregada'].includes(order.status);
  const body = html`<section class="page result">
    ${ctx.static ? html`<div class="mp-banner"><b>Simulación</b> Así termina la compra en la tienda real. En esta demostración no se cobró nada.</div>` : ''}
    ${order.status === 'pendiente' && !demo ? raw('<meta http-equiv="refresh" content="10">') : ''}
    <div class="page-head"><p class="lbl">Pedido ${order.id.slice(0, 8).toUpperCase()}</p><h1 class="page-title ${ok ? 'ok' : ''}">${title}</h1></div>
    <p class="lead">${text}</p>
    <div class="sheet">
      <ul class="mini">${items.map((i) => html`<li><span>${i.title}</span><b>${money(i.price)}</b></li>`)}
        ${order.shipping ? html`<li><span>Envío</span><b>${money(order.shipping)}</b></li>` : ''}
        ${ctx.static ? html`<li data-ship-row hidden><span>Envío</span><b>${money(Number(ctx.settings.shipping_cost) || 0)}</b></li>` : ''}</ul>
      <div class="total"><span>Total</span><strong data-total data-base="${order.total}" data-ship="${Number(ctx.settings.shipping_cost) || 0}">${money(order.total)}</strong></div>
    </div>
    ${demo && (order.status === 'pendiente' || (order.status === 'cancelada' && retryHref)) ? html`<a class="btn btn-line" href="${retryHref || `/pago/demo/${order.id}`}">${order.status === 'cancelada' ? 'Intentar de nuevo' : 'Volver al pago simulado'}</a>` : ''}
    <a class="btn" href="/">Volver al catálogo</a>
  </section>`;
  return layout(ctx, { title, body });
}

export function sellPage(ctx, { form = {}, errors = [], sent = false }) {
  const body = html`<section class="page sell">
    <div class="sell-l">
      <p class="lbl">Te compramos</p>
      <h1 class="mega mega-sm">Tu colección<span class="mega-serif">tiene valor.</span></h1>
      <p class="lead">Compramos cartas de fútbol: numeradas, rookies, autógrafos, graduadas, lotes y colecciones enteras.</p>
      <ol class="notes">
        <li><b>01</b><span><strong>Mandá fotos.</strong> Frente y dorso, con buena luz.</span></li>
        <li><b>02</b><span><strong>Recibí una oferta.</strong> Te respondemos en menos de 48 h.</span></li>
        <li><b>03</b><span><strong>Cobrá.</strong> Transferencia o efectivo al entregar.</span></li>
      </ol>
    </div>
    ${ctx.static
      ? html`<div class="sheet"><p class="lbl">Ofrecé tus cartas</p><h2 class="sheet-title">Escribinos por WhatsApp</h2><p>Mandanos fotos (frente y dorso) y el precio que pedís. En la tienda completa esto es un formulario con subida de fotos que llega directo al panel.</p><a class="btn btn-buy" target="_blank" rel="noopener" href="${waLink(ctx.settings.whatsapp, 'Hola! Quiero ofrecerles unas cartas')}">Ofrecer por WhatsApp <span>${arrow}</span></a></div>`
      : sent ? html`<div class="sheet"><h2 class="sheet-title">Recibimos tu oferta</h2><p>Te contactamos por WhatsApp o email en menos de 48 h.</p><a class="btn btn-line" href="/">Volver al catálogo</a></div>`
      : html`<form class="sheet" method="post" action="/vender" enctype="multipart/form-data" novalidate>
      <input type="hidden" name="_csrf" value="${ctx.csrf}">
      ${errors.length ? html`<ul class="errors">${errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
      <label>Nombre<input name="name" required maxlength="80" value="${form.name || ''}" autocomplete="name"></label>
      <div class="two">
        <label>Email<input name="email" type="email" required maxlength="120" value="${form.email || ''}" autocomplete="email"></label>
        <label>Celular<input name="phone" type="tel" required maxlength="20" value="${form.phone || ''}" autocomplete="tel"></label>
      </div>
      <label>¿Qué cartas querés vender?<textarea name="cards_desc" required maxlength="2000" rows="5" placeholder="Ej.: Valverde Optic /99 RC, lote de 20 Prizm base…">${form.cards_desc || ''}</textarea></label>
      <label>Precio pretendido (opcional)<input name="asking_price" maxlength="60" value="${form.asking_price || ''}" placeholder="UY$ o abierto a ofertas"></label>
      <label class="file">Fotos — hasta 6 (JPG, PNG o WEBP, máx. 6 MB)<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple data-preview></label>
      <div class="preview" data-preview-target></div>
      <label class="hp" aria-hidden="true">No completar<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn btn-buy">Enviar oferta <span>${arrow}</span></button>
      <p class="fine">Usamos tus datos sólo para responderte sobre esta oferta.</p>
    </form>`}
  </section>`;
  return layout(ctx, { title: 'Te compramos tus cartas', body });
}

export function guidePage(ctx) {
  const conditions = [
    ['Gem Mint', '10', 'Perfecta: esquinas, bordes y superficie impecables, centrado ideal.'],
    ['Mint', '9', 'Casi perfecta, un detalle mínimo visible sólo de cerca.'],
    ['Near Mint', '7–8', 'Muy buena, leve desgaste en una esquina o borde.'],
    ['Excellent', '5–6', 'Desgaste visible en esquinas o bordes, sin pliegues.'],
    ['Good / Played', '1–4', 'Marcas, pliegues o rayones evidentes.'],
  ];
  const glossary = [
    ['RC — Rookie', 'Primera carta oficial del jugador en una colección de primera división.'],
    ['Numerada (/99)', 'Tirada limitada: sólo existen 99 copias, numeradas.'],
    ['Parallel', 'Versión alternativa de una carta base, con otro color o acabado.'],
    ['Prizm · Optic · Chrome', 'Líneas de Panini y Topps con acabado metálico tipo refractor.'],
    ['Graduada', 'Carta evaluada y encapsulada por PSA, Beckett o similar, con nota oficial.'],
  ];
  const body = html`<section class="page guide">
    <div class="page-head"><p class="lbl">Guía</p><h1 class="page-title">Condiciones y glosario</h1></div>
    <p class="lead">Así describimos el estado de cada carta. Ante cualquier duda, pedinos más fotos.</p>
    <table class="spec spec-wide"><thead><tr><th>Condición</th><th>Escala</th><th>Descripción</th></tr></thead>
      <tbody>${conditions.map(([a, b, c]) => html`<tr><td><strong>${a}</strong></td><td class="mono">${b}</td><td>${c}</td></tr>`)}</tbody></table>
    <h2 class="sec-title sec-sm">Glosario</h2>
    <dl class="gloss">${glossary.map(([t, d]) => html`<div><dt>${t}</dt><dd>${d}</dd></div>`)}</dl>
  </section>`;
  return layout(ctx, { title: 'Guía de condiciones', body });
}

export function errorPage(ctx, { status, message }) {
  return layout(ctx, { title: String(status), body: html`<section class="page empty"><p class="lbl">Error ${status}</p><h1 class="page-title">${message}</h1><a class="btn" href="/">Volver al catálogo</a></section>` });
}

/* ---------- Panel de administración ---------- */

function adminLayout(ctx, { title, body }) {
  const links = [['/admin', 'Resumen'], ['/admin/cartas', 'Cartas'], ['/admin/pedidos', 'Pedidos'], ['/admin/ofertas', 'Ofertas recibidas'], ['/admin/ajustes', 'Ajustes']];
  return layout(ctx, {
    title: `Admin · ${title}`,
    body: html`<div class="wrap admin">
      <aside class="admin-nav">
        <p class="mono small">PANEL</p>
        ${links.map(([href, label]) => html`<a href="${href}" class="${ctx.path === href ? 'active' : ''}">${label}</a>`)}
        <form method="post" action="/admin/logout">${csrfField(ctx)}<button class="btn-link">Cerrar sesión</button></form>
      </aside>
      <section class="admin-main"><h1 class="page-title">${title}</h1>${body}</section>
    </div>`,
  });
}

export function loginPage(ctx, { error } = {}) {
  return layout(ctx, {
    title: 'Ingresar',
    body: html`<div class="wrap narrow"><form class="panel login" method="post" action="/admin/login">
      ${csrfField(ctx)}
      <h1 class="page-title">Panel</h1>
      ${error ? html`<p class="errors">${error}</p>` : ''}
      <label>Email<input name="email" type="email" required autocomplete="username"></label>
      <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn btn-primary btn-block">Ingresar</button>
    </form></div>`,
  });
}

export function adminDashboard(ctx, { stats, recentOrders, newOffers }) {
  return adminLayout(ctx, {
    title: 'Resumen',
    body: html`
      <div class="kpis">
        <div class="kpi"><span class="mono small">DISPONIBLES</span><strong>${stats.disponibles}</strong></div>
        <div class="kpi"><span class="mono small">VENDIDAS (30 D)</span><strong>${stats.vendidas30}</strong></div>
        <div class="kpi"><span class="mono small">INGRESOS (30 D)</span><strong>${money(stats.ingresos30)}</strong></div>
        <div class="kpi"><span class="mono small">OFERTAS NUEVAS</span><strong>${stats.ofertasNuevas}</strong></div>
      </div>
      <div class="actions"><a class="btn btn-primary" href="/admin/cartas/nueva">+ Publicar carta</a></div>
      <h2 class="section-title">Últimos pedidos</h2>
      ${ordersTable(recentOrders)}
      <h2 class="section-title">Ofertas sin responder</h2>
      ${offersTable(newOffers)}`,
  });
}

function ordersTable(orders) {
  if (!orders.length) return html`<p class="muted">Todavía no hay pedidos.</p>`;
  return html`<table class="table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
    ${orders.map((o) => html`<tr><td class="mono"><a href="/admin/pedidos/${o.id}">${o.id.slice(0, 8).toUpperCase()}</a></td><td>${o.buyer_name}</td><td class="mono">${money(o.total)}</td><td><span class="pill pill-${o.status}">${o.status}</span></td><td class="muted">${date(o.created_at)}</td></tr>`)}
  </tbody></table>`;
}

function offersTable(offers) {
  if (!offers.length) return html`<p class="muted">No hay ofertas.</p>`;
  return html`<table class="table"><thead><tr><th>Persona</th><th>Cartas</th><th>Pide</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>
    ${offers.map((o) => html`<tr><td><a href="/admin/ofertas/${o.id}">${o.name}</a></td><td>${o.cards_desc.slice(0, 70)}${o.cards_desc.length > 70 ? '…' : ''}</td><td>${o.asking_price}</td><td><span class="pill pill-${o.status}">${o.status}</span></td><td class="muted">${date(o.created_at)}</td></tr>`)}
  </tbody></table>`;
}

export function adminCards(ctx, { cards }) {
  return adminLayout(ctx, {
    title: 'Cartas',
    body: html`<div class="actions"><a class="btn btn-primary" href="/admin/cartas/nueva">+ Publicar carta</a></div>
      <table class="table"><thead><tr><th></th><th>Carta</th><th>Precio</th><th>Estado</th><th></th></tr></thead><tbody>
      ${cards.map((c) => html`<tr><td class="td-thumb">${parseImages(c).length ? html`<img class="admin-thumb" src="/uploads/${parseImages(c)[0]}" alt="" loading="lazy">` : html`<span class="admin-thumb blank"></span>`}</td><td><a href="/carta/${c.slug}" target="_blank">${c.title}</a></td><td class="mono">${money(c.price)}</td><td><span class="pill pill-${c.status}">${STATUS[c.status]}</span></td><td><a href="/admin/cartas/${c.id}">Editar</a></td></tr>`)}
      </tbody></table>`,
  });
}

export function adminCardForm(ctx, { card = {}, errors = [] }) {
  const isNew = !card.id;
  const imgs = card.id ? parseImages(card) : [];
  const sel = (name, value, label) => html`<option value="${value}" ${(card[name] ?? '') === value ? raw('selected') : ''}>${label}</option>`;
  return adminLayout(ctx, {
    title: isNew ? 'Publicar carta' : 'Editar carta',
    body: html`<form class="panel form-grid" method="post" action="${isNew ? '/admin/cartas/nueva' : `/admin/cartas/${card.id}`}" enctype="multipart/form-data">
      <input type="hidden" name="_csrf" value="${ctx.csrf}">
      ${errors.length ? html`<ul class="errors span2">${errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
      <label class="span2">Título de la publicación<input name="title" required maxlength="120" value="${card.title || ''}" placeholder="Ej: Kevin Zenón Prizm /125 Rookie Boca"></label>
      <label>Jugador<input name="player" maxlength="80" value="${card.player || ''}"></label>
      <label>Equipo<input name="team" maxlength="60" value="${card.team || ''}" placeholder="Boca Juniors"></label>
      <label>Marca / set<input name="brand" maxlength="60" value="${card.brand || ''}" placeholder="Prizm, Optic, Topps Chrome…"></label>
      <label>Numeración<input name="serial" maxlength="20" value="${card.serial || ''}" placeholder="/99"></label>
      <label>Tipo<select name="kind">${sel('kind', 'raw', 'Sin graduar')}${sel('kind', 'graded', 'Graduada')}${sel('kind', 'sealed', 'Sellado')}</select></label>
      <label>Grado (si está graduada)<input name="grade" maxlength="20" value="${card.grade || ''}" placeholder="PSA 10"></label>
      <label>Precio (UY$)<input name="price" type="number" min="1" max="10000000" step="1" required value="${card.price || ''}"></label>
      <label>Estado<select name="status">${sel('status', 'disponible', 'Disponible')}${sel('status', 'reservada', 'Reservada')}${sel('status', 'vendida', 'Vendida')}${sel('status', 'oculta', 'Oculta (no se muestra)')}</select></label>
      <label class="check"><input type="checkbox" name="rookie" value="1" ${card.rookie ? raw('checked') : ''}> Es rookie (RC)</label>
      <label class="span2">Descripción<textarea name="description" maxlength="2000" rows="4">${card.description || ''}</textarea></label>
      ${imgs.length ? html`<div class="span2"><p class="small mono">FOTOS ACTUALES — marcá para borrar</p><div class="preview">${imgs.map((img) => html`<label class="thumb-del"><img src="/uploads/${img}" alt=""><input type="checkbox" name="remove_images" value="${img}"> borrar</label>`)}</div></div>` : ''}
      <label class="span2 file">Agregar fotos (hasta 6)<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple data-preview></label>
      <div class="preview span2" data-preview-target></div>
      <button class="btn btn-primary span2">${isNew ? 'Publicar' : 'Guardar cambios'}</button>
    </form>`,
  });
}

export function adminOrders(ctx, { orders }) {
  return adminLayout(ctx, { title: 'Pedidos', body: ordersTable(orders) });
}

export function adminOrder(ctx, { order, items }) {
  const next = { pagada: 'enviada', enviada: 'entregada' }[order.status];
  return adminLayout(ctx, {
    title: `Pedido ${order.id.slice(0, 8).toUpperCase()}`,
    body: html`<div class="panel">
      <p><span class="pill pill-${order.status}">${order.status}</span> ${order.status === 'revisar' ? html`<strong>El pago llegó pero alguna carta ya no estaba disponible o el monto no coincide. Revisá y, si corresponde, devolvé el dinero desde Mercado Pago.</strong>` : ''}</p>
      <dl class="specs">
        <div><dt class="mono">Cliente</dt><dd>${order.buyer_name}</dd></div>
        <div><dt class="mono">Email</dt><dd>${order.buyer_email}</dd></div>
        <div><dt class="mono">Celular</dt><dd><a href="${waLink(order.buyer_phone.replace(/^0/, '598'), `Hola ${order.buyer_name}! Te escribo por tu pedido en Card Grade Uy`)}" target="_blank" rel="noopener">${order.buyer_phone}</a></dd></div>
        <div><dt class="mono">Entrega</dt><dd>${order.delivery === 'envio' ? `Envío: ${order.address}` : 'Retiro'}</dd></div>
        <div><dt class="mono">Pago MP</dt><dd>${order.mp_payment_id || '—'}</dd></div>
        <div><dt class="mono">Creado</dt><dd>${date(order.created_at)}</dd></div>
      </dl>
      <ul class="mini-lines">${items.map((i) => html`<li><span>${i.title}</span><span class="mono">${money(i.price)}</span></li>`)}
        ${order.shipping ? html`<li><span>Envío</span><span class="mono">${money(order.shipping)}</span></li>` : ''}</ul>
      <div class="summary"><span>Total</span><strong>${money(order.total)}</strong></div>
      ${next ? html`<form method="post" action="/admin/pedidos/${order.id}">${csrfField(ctx)}<input type="hidden" name="status" value="${next}"><button class="btn btn-primary">Marcar como ${next}</button></form>` : ''}
    </div>`,
  });
}

export function adminOffers(ctx, { offers }) {
  return adminLayout(ctx, { title: 'Ofertas recibidas', body: offersTable(offers) });
}

export function adminOffer(ctx, { offer }) {
  const imgs = parseImages(offer);
  const sel = (v) => html`<option value="${v}" ${offer.status === v ? raw('selected') : ''}>${v}</option>`;
  return adminLayout(ctx, {
    title: `Oferta de ${offer.name}`,
    body: html`<div class="panel">
      <dl class="specs">
        <div><dt class="mono">Email</dt><dd>${offer.email}</dd></div>
        <div><dt class="mono">Celular</dt><dd><a href="${waLink(offer.phone.replace(/^0/, '598'), `Hola ${offer.name}! Te escribo por las cartas que nos ofreciste en Card Grade Uy`)}" target="_blank" rel="noopener">${offer.phone} (WhatsApp)</a></dd></div>
        <div><dt class="mono">Pide</dt><dd>${offer.asking_price || '—'}</dd></div>
        <div><dt class="mono">Recibida</dt><dd>${date(offer.created_at)}</dd></div>
      </dl>
      <p class="description">${offer.cards_desc}</p>
      ${imgs.length ? html`<div class="preview">${imgs.map((img) => html`<a href="/uploads/${img}" target="_blank"><img src="/uploads/${img}" alt=""></a>`)}</div>` : ''}
      <form method="post" action="/admin/ofertas/${offer.id}" class="form-grid">
        ${csrfField(ctx)}
        <label>Estado<select name="status">${sel('nueva')}${sel('contactado')}${sel('aceptada')}${sel('rechazada')}</select></label>
        <label class="span2">Nota interna<textarea name="admin_note" maxlength="1000" rows="3">${offer.admin_note}</textarea></label>
        <button class="btn btn-primary">Guardar</button>
      </form>
    </div>`,
  });
}

export function adminSettings(ctx) {
  const s = ctx.settings;
  const field = (k, label, type = 'text') => html`<label>${label}<input name="${k}" type="${type}" value="${s[k]}" maxlength="200"></label>`;
  return adminLayout(ctx, {
    title: 'Ajustes',
    body: html`<form class="panel form-grid" method="post" action="/admin/ajustes">
      ${csrfField(ctx)}
      ${field('store_name', 'Nombre de la tienda')}${field('tagline', 'Frase')}
      ${field('whatsapp', 'WhatsApp (con código de país, ej. 59899123456)')}${field('instagram', 'Usuario de Instagram')}
      ${field('shipping_cost', 'Costo de envío (UY$)', 'number')}${field('pickup_info', 'Info de retiro')}
      <button class="btn btn-primary">Guardar</button>
    </form>`,
  });
}
