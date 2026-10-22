# Card Grade Uy — tienda web

Catálogo de cartas coleccionables con pago por Mercado Pago (Checkout Pro), carrito, reserva automática,
sección "Vendeme tus cartas" y panel de administración. Node.js 22.13+ con SQLite nativo; sin frameworks de frontend.

## Probar en local

```bash
npm install
npm run import-yala                            # importa el catálogo actual de Yala con fotos
npm run create-admin -- tu@email.com           # pide la contraseña (mín. 12 caracteres)
npm start                                      # http://localhost:3000
```

**Panel de administración:** `http://localhost:3000/admin` (también hay un enlace "Acceso administrador"
al pie de cada página). Una vez dentro, aparece "Panel" en el menú superior.

`npm run seed` carga un catálogo de ejemplo sin fotos (alternativa a `import-yala`).

Con `DEMO_PAYMENTS=1` y sin credenciales de MP (sólo fuera de producción), el checkout muestra un botón
"Simular pago aprobado" para probar el flujo completo.

## Vista previa pública (GitHub Pages)

`docs/` contiene una versión estática del sitio (catálogo, fichas, guía) publicada con GitHub Pages.
Ahí la compra es por WhatsApp: los pagos con Mercado Pago y el panel necesitan el servidor Node.
Para regenerarla: `npm run build-static -- /nombre-del-repo` (en Git Bash anteponer `MSYS_NO_PATHCONV=1`).

## Producción

1. Copiar `.env.example` a `.env` y completar `BASE_URL` (https), `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET`.
2. En Mercado Pago > Tus integraciones > Webhooks: URL `https://TU-DOMINIO/webhooks/mercadopago`, evento **Pagos**.
3. Correr detrás de HTTPS (Nginx/Caddy, Railway, Render, VPS…) con `NODE_ENV=production`. El servidor no arranca
   en producción si falta alguna credencial o si `BASE_URL` no es https.
4. Hacer backup diario de la carpeta `DATA_DIR` (base de datos + fotos).

## Seguridad implementada

- Cobro 100 % en Mercado Pago; el precio siempre sale de la base, nunca del navegador.
- Webhook con verificación de firma `x-signature` (HMAC, ventana de 10 min) y consulta del pago a la API de MP;
  se valida monto y moneda. Si algo no coincide, el pedido queda en "revisar".
- Reserva atómica de cartas (transacción) con vencimiento a los 30 min: no se vende dos veces la misma carta.
- Sesiones en servidor (id aleatorio, sólo se guarda su hash), cookies HttpOnly/SameSite/Secure, rotación al iniciar sesión.
- Contraseñas con bcrypt (coste 12), bloqueo tras 5 intentos, límite de intentos por IP, registro de auditoría.
- CSRF en todos los formularios, escape automático de HTML, consultas SQL parametrizadas.
- Helmet con CSP estricta (sin scripts inline), HSTS, `frame-ancestors 'none'`, `nosniff`.
- Fotos: máx. 6 MB, verificación por contenido (JPG/PNG/WEBP), nombre aleatorio, servidas con CSP propia.
- Límites anti-spam en checkout y ofertas, campo trampa para bots.
