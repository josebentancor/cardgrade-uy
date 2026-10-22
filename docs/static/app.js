// Mejoras progresivas: el sitio funciona igual sin JavaScript.
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  // Menú móvil
  document.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.toggle)?.classList.toggle('open'));
  });

  // Filtros del catálogo: aplicar al cambiar
  document.querySelectorAll('form[data-autosubmit]').forEach((form) => {
    form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => form.submit()));
  });

  // Galería de la carta
  const main = document.querySelector('#main-image img');
  document.querySelectorAll('.thumb').forEach((t) => {
    t.addEventListener('click', () => {
      if (main) main.src = t.dataset.src;
      document.querySelectorAll('.thumb').forEach((x) => x.classList.toggle('active', x === t));
    });
  });

  // Vista previa de fotos antes de subir
  document.querySelectorAll('input[type=file][data-preview]').forEach((input) => {
    const target = input.closest('form').querySelector('[data-preview-target]');
    input.addEventListener('change', () => {
      target.replaceChildren();
      [...input.files].slice(0, 6).forEach((file) => {
        if (!file.type.startsWith('image/')) return;
        const img = document.createElement('img');
        img.alt = '';
        img.src = URL.createObjectURL(file);
        target.append(img);
      });
    });
  });
});

// Versión estática (GitHub Pages): los filtros del catálogo se aplican en el navegador.
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector('.catalog .grid');
  if (!document.body.hasAttribute('data-static') || !grid) return;
  const p = new URLSearchParams(location.search);
  const f = { q: (p.get('q') || '').toLowerCase().trim(), estado: p.get('estado') || '', equipo: p.get('equipo') || '', orden: p.get('orden') || '', rookie: p.get('rookie') === '1', numerada: p.get('numerada') === '1' };
  const form = document.querySelector('.toolbar');
  for (const name of ['q', 'estado', 'equipo', 'orden']) { const el = form.elements[name]; if (el) el.value = p.get(name) || ''; }
  if (f.rookie) form.insertAdjacentHTML('beforeend', '<input type="hidden" name="rookie" value="1">');
  if (f.numerada) form.insertAdjacentHTML('beforeend', '<input type="hidden" name="numerada" value="1">');
  const tiles = [...grid.children];
  const shown = tiles.filter((t) => (!f.q || t.dataset.search.includes(f.q)) && (!f.estado || t.dataset.status === f.estado) &&
    (!f.equipo || t.dataset.team === f.equipo) && (!f.rookie || t.dataset.rookie === '1') && (!f.numerada || t.dataset.serial === '1'));
  if (f.orden) shown.sort((a, b) => (f.orden === 'precio-asc' ? 1 : -1) * (a.dataset.price - b.dataset.price));
  tiles.forEach((t) => { t.hidden = true; });
  shown.forEach((t) => { t.hidden = false; grid.append(t); });
  if (!shown.length) grid.insertAdjacentHTML('afterend', '<div class="empty"><p>No encontramos cartas con esos filtros.</p></div>');
  const current = location.search.replace(/^\?/, '');
  document.querySelectorAll('.chip').forEach((c) => {
    const s = new URL(c.href).search.replace(/^\?/, '');
    c.classList.toggle('on', s === current || (!s && !current));
  });
});
