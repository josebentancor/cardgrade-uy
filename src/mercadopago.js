// Integración con Mercado Pago Checkout Pro (API REST oficial).
// - El precio SIEMPRE sale de la base de datos, nunca del navegador.
// - El webhook verifica la firma x-signature y luego consulta el pago directamente a Mercado Pago
//   (no se confía en el contenido de la notificación).
import crypto from 'node:crypto';

const API = 'https://api.mercadopago.com';
const token = () => process.env.MP_ACCESS_TOKEN || '';

export const mpEnabled = () => Boolean(token());

async function mpFetch(pathname, { method = 'GET', body, idempotencyKey } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Mercado Pago respondió ${res.status}`);
    err.details = data;
    throw err;
  }
  return data;
}

export async function createPreference(order, items, baseUrl) {
  const mpItems = items.map((it) => ({
    id: String(it.card_id),
    title: it.title.slice(0, 250),
    quantity: 1,
    unit_price: it.price,
    currency_id: 'UYU',
  }));
  if (order.shipping > 0) {
    mpItems.push({ id: 'envio', title: 'Envío', quantity: 1, unit_price: order.shipping, currency_id: 'UYU' });
  }
  const pref = await mpFetch('/checkout/preferences', {
    method: 'POST',
    idempotencyKey: order.id,
    body: {
      items: mpItems,
      payer: { name: order.buyer_name, email: order.buyer_email },
      external_reference: order.id,
      back_urls: {
        success: `${baseUrl}/pago/resultado?pedido=${order.id}`,
        pending: `${baseUrl}/pago/resultado?pedido=${order.id}`,
        failure: `${baseUrl}/pago/resultado?pedido=${order.id}`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/webhooks/mercadopago`,
      statement_descriptor: 'CARDGRADEUY',
      expires: true,
      expiration_date_to: new Date(order.expires_at).toISOString(),
    },
  });
  return { id: pref.id, url: pref.init_point };
}

export const getPayment = (id) => mpFetch(`/v1/payments/${encodeURIComponent(id)}`);

// https://www.mercadopago.com.uy/developers/es/docs/your-integrations/notifications/webhooks
export function verifyWebhookSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.get('x-signature') || '';
  const requestId = req.get('x-request-id') || '';
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=').map((s) => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  // Rechazar notificaciones viejas (posible repetición).
  const ts = Number(parts.ts);
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  if (!Number.isFinite(ts) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) return false;

  let dataId = String(req.query['data.id'] || req.body?.data?.id || '');
  if (/^[a-z0-9]+$/i.test(dataId)) dataId = dataId.toLowerCase();
  let manifest = '';
  if (dataId) manifest += `id:${dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return expected.length === parts.v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
