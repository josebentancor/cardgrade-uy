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

const logo = html`<img class="logo" src="/static/logo.jpg" alt="" width="36" height="36">`;
const icon = {
  bag: raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5.5 8h13l-1 12.5h-11L5.5 8Zm3.5 0V6.5a3 3 0 0 1 6 0V8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'),
  arrow: raw('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  search: raw('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'),
  shield: raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9.5 4.1-1.6 7-5.3 7-9.5V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2.2 2.2L15.5 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
  truck: raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 6.5h11v9H3zM14 10h4l3 3v2.5h-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17.5" cy="17.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>'),
  check: raw('<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
};

export function layout(ctx, { title, body, description = '' }) {
  const s = ctx.settings;
  const nav = [['/', 'Catálogo'], ['/vender', 'Vendé tus cartas'], ['/guia', 'Guía']];
  if (ctx.isAdmin) nav.push(['/admin', 'Panel']);
  return html`<!doctype html>
<html lang="es-UY">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ${s.store_name}` : `${s.store_name} — Cartas coleccionables de fútbol`}</title>
<meta name="description" content="${description || 'Cartas coleccionables de fútbol en Uruguay: Prizm, Optic, Topps Chrome, rookies y numeradas. Comprá seguro con Mercado Pago.'}">
<link rel="icon" href="/static/logo.jpg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600&display=swap">
<link rel="stylesheet" href="/static/style.css">
<script src="/static/app.js" defer></script>
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="/">${logo}<span class="brand-name">${s.store_name}</span></a>
    <nav class="nav" id="nav">
      ${nav.map(([href, label]) => html`<a href="${href}" class="${ctx.path === href ? 'active' : ''}">${label}</a>`)}
    </nav>
    <a class="cart-btn" href="/carrito" aria-label="Carrito">${icon.bag}${ctx.cartCount ? html`<span class="cart-count">${ctx.cartCount}</span>` : ''}</a>
    <button class="menu-btn" type="button" data-toggle="nav" aria-label="Menú"><span></span><span></span></button>
  </div>
</header>
${ctx.flash ? html`<div class="wrap"><p class="flash flash-${ctx.flash.type}" role="status">${ctx.flash.msg}</p></div>` : ''}
<main>${body}</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <div class="footer-brand">
      <a class="brand" href="/">${logo}<span class="brand-name">${s.store_name}</span></a>
      <p>${s.tagline} Cartas coleccionables de fútbol en Uruguay.</p>
    </div>
    <div class="footer-col">
      <p class="footer-title">Tienda</p>
      <a href="/">Catálogo</a><a href="/carrito">Carrito</a><a href="/guia">Guía de condiciones</a>
    </div>
    <div class="footer-col">
      <p class="footer-title">Contacto</p>
      <a href="https://instagram.com/${s.instagram}" rel="noopener" target="_blank">Instagram</a>
      <a href="${waLink(s.whatsapp, 'Hola! Tengo una consulta')}" rel="noopener" target="_blank">WhatsApp</a>
      <a href="/vender">Vendé tus cartas</a>
    </div>
    <div class="footer-col">
      <p class="footer-title">Pagos seguros</p>
      <p>Cobramos con Mercado Pago. Tus datos de tarjeta nunca pasan por este sitio.</p>
    </div>
  </div>
  <div class="wrap footer-bottom">
    <span>© ${new Date().getFullYear()} ${s.store_name}</span>
    <a href="/admin">Acceso administrador</a>
  </div>
</footer>
</body>
</html>`;
}

/* ---------- Componentes ---------- */

function cardArt(card, size = '') {
  const imgs = parseImages(card);
  if (imgs.length) return html`<img src="/uploads/${imgs[0]}" alt="${card.title}" loading="lazy">`;
  return html`<div class="art ${size}" data-team="${teamKey(card.team)}">
    <span class="art-brand">${(card.brand || 'Card').toUpperCase()}</span>
    <span class="art-initials">${initials(card.player || card.title)}</span>
    <span class="art-name">${card.player || card.title}</span>
    <span class="art-serial">${card.serial || (card.rookie ? 'RC' : '')}</span>
  </div>`;
}

function tags(card) {
  return [card.serial && html`<span class="tag">${card.serial}</span>`, card.rookie ? html`<span class="tag tag-rc">RC</span>` : '', card.grade && html`<span class="tag">${card.grade}</span>`];
}

function tile(card) {
  return html`<a class="tile" href="/carta/${card.slug}" data-status="${card.status}">
    <div class="tile-media">
      ${cardArt(card)}
      <div class="tile-tags">${tags(card)}</div>
      ${card.status !== 'disponible' ? html`<span class="tile-badge badge-${card.status}">${STATUS[card.status]}</span>` : ''}
    </div>
    <div class="tile-body">
      <p class="tile-meta">${[card.brand, card.team].filter(Boolean).join(' · ') || KIND[card.kind]}</p>
      <h3>${card.title}</h3>
      <div class="tile-row">
        <span class="price">${money(card.price)}</span>
        <span class="tile-go" aria-hidden="true">${icon.arrow}</span>
      </div>
    </div>
  </a>`;
}

/* ---------- Páginas públicas ---------- */

export function catalogPage(ctx, { cards, stats, q, teams, page, pages }) {
  const opt = (name, value, label) => html`<option value="${value}" ${q[name] === value ? raw('selected') : ''}>${label}</option>`;
  const qs = (p) => '?' + new URLSearchParams({ ...q, page: p }).toString();
  const chips = [
    ['Todas', '/#catalogo', !q.equipo && !q.rookie && !q.numerada && !q.estado],
    ['Disponibles', '/?estado=disponible#catalogo', q.estado === 'disponible'],
    ['Uruguay', '/?equipo=Uruguay#catalogo', q.equipo === 'Uruguay'],
    ['River Plate', '/?equipo=River%20Plate#catalogo', q.equipo === 'River Plate'],
    ['Boca Juniors', '/?equipo=Boca%20Juniors#catalogo', q.equipo === 'Boca Juniors'],
    ['Rookies', '/?rookie=1#catalogo', q.rookie === '1'],
    ['Numeradas', '/?numerada=1#catalogo', q.numerada === '1'],
  ];
  const body = html`
  <section class="hero">
    <div class="wrap hero-inner">
      <div class="hero-text">
        <p class="pill-live"><span class="dot"></span>${stats.disponibles} cartas disponibles</p>
        <h1>A card.<br><span class="grad">A life.</span></h1>
        <p class="lead">Cartas de fútbol seleccionadas: Prizm, Optic, Topps Chrome, rookies y numeradas. Comprá en segundos y pagá con Mercado Pago.</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#catalogo">Ver catálogo ${icon.arrow}</a>
          <a class="btn btn-ghost" href="/vender">Vendé tus cartas</a>
        </div>
        <ul class="perks">
          <li>${icon.shield}Pago protegido</li>
          <li>${icon.truck}Envíos a todo Uruguay</li>
          <li>${icon.check}${stats.vendidas}+ vendidas</li>
        </ul>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="glow"></div>
        ${stats.featured.map((c, i) => html`<div class="hero-card hero-card-${i}">${cardArt(c, 'art-lg')}</div>`)}
      </div>
    </div>
  </section>

  <section class="wrap catalog" id="catalogo">
    <div class="catalog-head">
      <h2>Catálogo</h2>
      <p class="muted">${stats.total} publicaciones · ${stats.disponibles} disponibles · ${stats.vendidas} vendidas</p>
    </div>
    <nav class="chips" aria-label="Filtros rápidos">
      ${chips.map(([label, href, on]) => html`<a class="chip ${on ? 'on' : ''}" href="${href}">${label}</a>`)}
    </nav>
    <form class="toolbar" method="get" action="/#catalogo" data-autosubmit>
      <label class="search">${icon.search}<span class="sr-only">Buscar</span>
        <input type="search" name="q" value="${q.q}" placeholder="Buscar jugador, equipo o set" maxlength="80">
      </label>
      <select name="estado" aria-label="Estado">
        ${opt('estado', '', 'Estado: todas')}${opt('estado', 'disponible', 'Disponibles')}${opt('estado', 'reservada', 'Reservadas')}${opt('estado', 'vendida', 'Vendidas')}
      </select>
      <select name="equipo" aria-label="Equipo">
        ${opt('equipo', '', 'Equipo: todos')}${teams.map((t) => opt('equipo', t, t))}
      </select>
      <select name="orden" aria-label="Ordenar">
        ${opt('orden', '', 'Más recientes')}${opt('orden', 'precio-asc', 'Menor precio')}${opt('orden', 'precio-desc', 'Mayor precio')}
      </select>
      ${q.rookie ? html`<input type="hidden" name="rookie" value="1">` : ''}${q.numerada ? html`<input type="hidden" name="numerada" value="1">` : ''}
      <button class="btn btn-ghost js-hide" type="submit">Filtrar</button>
    </form>

    ${cards.length
      ? html`<div class="grid">${cards.map(tile)}</div>`
      : html`<div class="empty"><p>No encontramos cartas con esos filtros.</p><a class="btn btn-ghost" href="/">Ver todo el catálogo</a></div>`}

    ${pages > 1 ? html`<nav class="pager" aria-label="Páginas">
      ${page > 1 ? html`<a class="btn btn-ghost" href="${qs(page - 1)}#catalogo">Anterior</a>` : html`<span></span>`}
      <span class="mono muted">${page} / ${pages}</span>
      ${page < pages ? html`<a class="btn btn-ghost" href="${qs(page + 1)}#catalogo">Siguiente</a>` : html`<span></span>`}
    </nav>` : ''}
  </section>

  <section class="wrap">
    <div class="sell-band">
      <div>
        <p class="eyebrow">Vendé tus cartas</p>
        <h2>¿Tenés cartas guardadas? Te las compramos.</h2>
        <p>Mandanos fotos y precio. Te respondemos con una oferta en menos de 48 h.</p>
      </div>
      <a class="btn btn-light" href="/vender">Ofrecer mis cartas ${icon.arrow}</a>
    </div>
  </section>`;
  return layout(ctx, { title: '', body });
}

export function cardPage(ctx, { card, related }) {
  const imgs = parseImages(card);
  const s = ctx.settings;
  const available = card.status === 'disponible';
  const specs = [
    ['Jugador', card.player], ['Equipo', card.team], ['Marca / set', card.brand],
    ['Numeración', card.serial], ['Tipo', KIND[card.kind]], ['Grado', card.grade], ['Rookie', card.rookie ? 'Sí (RC)' : ''],
  ].filter(([, v]) => v);
  const body = html`
  <div class="wrap">
    <nav class="crumbs"><a href="/#catalogo">Catálogo</a><span>/</span><span>${card.title}</span></nav>
    <article class="detail">
      <div class="gallery">
        <div class="media-xl" id="main-image" data-status="${card.status}">
          ${imgs.length ? html`<img src="/uploads/${imgs[0]}" alt="${card.title}">` : cardArt(card, 'art-lg')}
        </div>
        ${imgs.length > 1 ? html`<div class="thumbs">${imgs.map((img, i) => html`
          <button type="button" class="thumb ${i === 0 ? 'active' : ''}" data-src="/uploads/${img}" aria-label="Ver foto ${i + 1}"><img src="/uploads/${img}" alt=""></button>`)}</div>` : ''}
      </div>

      <div class="info">
        <div class="tile-tags static">${tags(card)}<span class="status status-${card.status}">${STATUS[card.status]}</span></div>
        <h1>${card.title}</h1>
        <p class="detail-price">${money(card.price)}</p>

        ${available ? html`
          <form method="post" action="/carrito/agregar" class="buy">
            ${csrfField(ctx)}<input type="hidden" name="card_id" value="${card.id}">
            <button class="btn btn-primary btn-block" name="comprar" value="1">Comprar ahora</button>
            <button class="btn btn-ghost btn-block" name="comprar" value="0">Agregar al carrito</button>
          </form>`
        : html`<p class="muted">Esta carta ya no está disponible. Escribinos y te avisamos si entra una similar.</p>`}
        <a class="wa-link" rel="noopener" target="_blank" href="${waLink(s.whatsapp, `Hola! Consulto por la carta: ${card.title} (${money(card.price)})`)}">Consultar por WhatsApp ${icon.arrow}</a>

        <dl class="specs">
          ${specs.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}
        </dl>
        ${card.description ? html`<p class="description">${card.description}</p>` : ''}

        <ul class="assurances">
          <li>${icon.shield}<div><strong>Pago protegido</strong><span>Mercado Pago: tarjeta, débito, Abitab o Redpagos.</span></div></li>
          <li>${icon.truck}<div><strong>Envío cuidado</strong><span>Top loader + sobre rígido a todo Uruguay, o retiro.</span></div></li>
          <li>${icon.check}<div><strong>Carta revisada</strong><span>Lo que ves en las fotos es lo que recibís.</span></div></li>
        </ul>
      </div>
    </article>

    ${related.length ? html`<section class="related"><h2 class="section-title">También te puede gustar</h2><div class="grid">${related.map(tile)}</div></section>` : ''}
  </div>`;
  return layout(ctx, { title: card.title, body, description: `${card.title} — ${money(card.price)}. ${STATUS[card.status]}.` });
}

export function cartPage(ctx, { items, subtotal }) {
  const body = html`<div class="wrap narrow">
    <h1 class="page-title">Carrito</h1>
    ${items.length ? html`
      <ul class="lines">
        ${items.map((c) => html`<li class="line">
          <a href="/carta/${c.slug}" class="line-art">${cardArt(c)}</a>
          <div class="line-info"><a href="/carta/${c.slug}">${c.title}</a><span class="mono muted">${c.brand} ${c.serial}</span></div>
          <span class="price">${money(c.price)}</span>
          <form method="post" action="/carrito/quitar">${csrfField(ctx)}<input type="hidden" name="card_id" value="${c.id}"><button class="btn-x" aria-label="Quitar">✕</button></form>
        </li>`)}
      </ul>
      <div class="summary"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      <p class="muted small">El envío se calcula en el siguiente paso. Cada carta es única: se reserva por 30 minutos al iniciar el pago.</p>
      <a class="btn btn-primary btn-block" href="/checkout">Continuar</a>`
    : html`<div class="empty"><p>Tu carrito está vacío.</p><a class="btn btn-ghost" href="/">Ver catálogo</a></div>`}
  </div>`;
  return layout(ctx, { title: 'Carrito', body });
}

export function checkoutPage(ctx, { items, subtotal, form = {}, errors = [] }) {
  const s = ctx.settings;
  const shipping = Number(s.shipping_cost) || 0;
  const delivery = form.delivery || 'envio';
  const body = html`<div class="wrap checkout">
    <form method="post" action="/checkout" class="panel" novalidate>
      ${csrfField(ctx)}
      <h1 class="page-title">Tus datos</h1>
      ${errors.length ? html`<ul class="errors">${errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
      <label>Nombre y apellido<input name="name" required maxlength="80" autocomplete="name" value="${form.name || ''}"></label>
      <label>Email<input name="email" type="email" required maxlength="120" autocomplete="email" value="${form.email || ''}"></label>
      <label>Celular<input name="phone" type="tel" required maxlength="20" autocomplete="tel" value="${form.phone || ''}" placeholder="099 123 456"></label>
      <fieldset class="choice">
        <legend>Entrega</legend>
        <label class="radio"><input type="radio" name="delivery" value="envio" ${delivery === 'envio' ? raw('checked') : ''}> Envío a domicilio <span class="mono">${money(shipping)}</span></label>
        <label class="radio"><input type="radio" name="delivery" value="retiro" ${delivery === 'retiro' ? raw('checked') : ''}> Retiro <span class="mono">Gratis</span></label>
        <p class="muted small">${s.pickup_info}</p>
      </fieldset>
      <label>Dirección (si elegiste envío)<textarea name="address" maxlength="300" rows="2" autocomplete="street-address">${form.address || ''}</textarea></label>
      <button class="btn btn-primary btn-block">Pagar con Mercado Pago</button>
      <p class="muted small center">Vas a pagar en el sitio seguro de Mercado Pago. Nunca te pedimos datos de tarjeta.</p>
    </form>
    <aside class="panel order-summary">
      <h2 class="mono small">RESUMEN</h2>
      <ul class="mini-lines">${items.map((c) => html`<li><span>${c.title}</span><span class="mono">${money(c.price)}</span></li>`)}</ul>
      <div class="summary"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
      <p class="muted small">+ envío ${money(shipping)} si corresponde.</p>
    </aside>
  </div>`;
  return layout(ctx, { title: 'Checkout', body });
}

export function resultPage(ctx, { order, items, demo }) {
  const msgs = {
    pagada: ['¡Pago aprobado!', 'Gracias por tu compra. Te escribimos en breve para coordinar la entrega.'],
    enviada: ['Pedido enviado', 'Tu pedido ya está en camino.'],
    entregada: ['Pedido entregado', '¡Que la disfrutes!'],
    pendiente: ['Esperando confirmación del pago', 'Si pagaste en Abitab o Redpagos puede demorar. Esta página se actualiza sola.'],
    expirada: ['La reserva expiró', 'No recibimos el pago a tiempo y las cartas volvieron al catálogo.'],
    cancelada: ['Pedido cancelado', 'Si fue un error, escribinos por WhatsApp.'],
    revisar: ['Pago recibido — en revisión', 'Recibimos tu pago y lo estamos revisando. Te contactamos a la brevedad.'],
  };
  const [title, text] = msgs[order.status];
  const body = html`<div class="wrap narrow result">
    ${order.status === 'pendiente' && !demo ? raw('<meta http-equiv="refresh" content="10">') : ''}
    <p class="eyebrow mono">Pedido ${order.id.slice(0, 8).toUpperCase()}</p>
    <h1 class="page-title">${title}</h1>
    <p class="lead">${text}</p>
    <ul class="mini-lines">${items.map((i) => html`<li><span>${i.title}</span><span class="mono">${money(i.price)}</span></li>`)}
      ${order.shipping ? html`<li><span>Envío</span><span class="mono">${money(order.shipping)}</span></li>` : ''}</ul>
    <div class="summary"><span>Total</span><strong>${money(order.total)}</strong></div>
    ${demo && order.status === 'pendiente' ? html`
      <form method="post" action="/pago/demo/${order.id}" class="demo-box">
        ${csrfField(ctx)}
        <p class="mono small">MODO DEMO — sin credenciales de Mercado Pago</p>
        <button class="btn btn-primary btn-block">Simular pago aprobado</button>
      </form>` : ''}
    <a class="btn btn-ghost" href="/">Volver al catálogo</a>
  </div>`;
  return layout(ctx, { title, body });
}

export function sellPage(ctx, { form = {}, errors = [], sent = false }) {
  const body = html`<div class="wrap sell">
    <div class="sell-intro">
      <p class="eyebrow mono">Vendeme tus cartas</p>
      <h1>Tu colección<br>tiene valor.</h1>
      <p class="lead">Compramos cartas de fútbol: numeradas, rookies, autógrafos, graduadas y lotes.</p>
      <ol class="steps">
        <li><span class="mono">01</span><div><strong>Mandá fotos</strong><p class="muted">Frente y dorso, con buena luz.</p></div></li>
        <li><span class="mono">02</span><div><strong>Recibí una oferta</strong><p class="muted">Te respondemos en menos de 48 h.</p></div></li>
        <li><span class="mono">03</span><div><strong>Cobrá</strong><p class="muted">Transferencia o efectivo al entregar.</p></div></li>
      </ol>
    </div>
    ${sent ? html`<div class="panel center"><h2>¡Recibimos tu oferta!</h2><p class="muted">Te contactamos por WhatsApp o email en menos de 48 h.</p><a class="btn btn-ghost" href="/">Volver al catálogo</a></div>` : html`
    <form class="panel" method="post" action="/vender" enctype="multipart/form-data" novalidate>
      <input type="hidden" name="_csrf" value="${ctx.csrf}">
      ${errors.length ? html`<ul class="errors">${errors.map((e) => html`<li>${e}</li>`)}</ul>` : ''}
      <label>Nombre<input name="name" required maxlength="80" value="${form.name || ''}" autocomplete="name"></label>
      <div class="two">
        <label>Email<input name="email" type="email" required maxlength="120" value="${form.email || ''}" autocomplete="email"></label>
        <label>Celular<input name="phone" type="tel" required maxlength="20" value="${form.phone || ''}" autocomplete="tel"></label>
      </div>
      <label>¿Qué cartas querés vender?<textarea name="cards_desc" required maxlength="2000" rows="5" placeholder="Ej: Messi Prizm 2022 Silver, Valverde Optic /99 RC…">${form.cards_desc || ''}</textarea></label>
      <label>Precio pretendido (opcional)<input name="asking_price" maxlength="60" value="${form.asking_price || ''}" placeholder="UY$ o abierto a ofertas"></label>
      <label class="file">Fotos (hasta 6, JPG/PNG/WEBP, máx. 6 MB c/u)<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple data-preview></label>
      <div class="preview" data-preview-target></div>
      <label class="hp" aria-hidden="true">No completar<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn btn-primary btn-block">Enviar oferta</button>
      <p class="muted small center">Usamos tus datos sólo para responderte sobre esta oferta.</p>
    </form>`}
  </div>`;
  return layout(ctx, { title: 'Vendeme tus cartas', body });
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
    ['RC (Rookie)', 'Primera carta oficial del jugador en una colección de primera división.'],
    ['Numerada (/99)', 'Tirada limitada: sólo existen 99 copias, numeradas a mano o estampadas.'],
    ['Parallel', 'Versión alternativa de una carta base, con otro color o acabado.'],
    ['Prizm / Optic / Chrome', 'Líneas de Panini y Topps con acabado metálico tipo refractor.'],
    ['Graduada (slab)', 'Carta evaluada y encapsulada por PSA, Beckett o similar, con nota oficial.'],
  ];
  const body = html`<div class="wrap narrow guide">
    <p class="eyebrow mono">Guía</p>
    <h1 class="page-title">Condiciones y glosario</h1>
    <p class="lead">Así describimos el estado de cada carta. Ante cualquier duda, pedinos más fotos.</p>
    <table class="table">
      <thead><tr><th>Condición</th><th class="mono">Escala</th><th>Descripción</th></tr></thead>
      <tbody>${conditions.map(([a, b, c]) => html`<tr><td><strong>${a}</strong></td><td class="mono">${b}</td><td>${c}</td></tr>`)}</tbody>
    </table>
    <h2 class="section-title">Glosario</h2>
    <dl class="glossary">${glossary.map(([t, d]) => html`<div><dt>${t}</dt><dd class="muted">${d}</dd></div>`)}</dl>
  </div>`;
  return layout(ctx, { title: 'Guía de condiciones', body });
}

export function errorPage(ctx, { status, message }) {
  return layout(ctx, { title: String(status), body: html`<div class="wrap narrow empty"><p class="mono">${status}</p><h1 class="page-title">${message}</h1><a class="btn btn-ghost" href="/">Volver al catálogo</a></div>` });
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
