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
