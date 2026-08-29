import { Router } from 'express';
import Stripe from 'stripe';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const PRICE_CENTS = 999; // $9.99 one-time — unlocks the app for good after the free trial

// A single shared promo code, deliberately not tied to any one account — a thank-you for beta
// founders that's built to spread. Anyone who has it can redeem it, not just founders; Stripe
// alone enforces when it stops working (30 days after BETA_ENDS_AT).
const FOUNDER_PROMO_CODE = 'FOUNDER50';
const FOUNDER_PROMO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function founderPromoExpiry() {
  const betaEndsAt = process.env.BETA_ENDS_AT;
  if (!betaEndsAt) return null;
  return new Date(betaEndsAt).getTime() + FOUNDER_PROMO_WINDOW_MS;
}

// Idempotent, safe to call on every boot: creates the coupon + promo code once, the first time
// it can (i.e. once BETA_ENDS_AT is set and its 30-day expiry window is still in the future).
export async function ensureFounderPromo() {
  if (!stripe) return;
  const expiresAtMs = founderPromoExpiry();
  if (!expiresAtMs || expiresAtMs <= Date.now()) return;

  const existing = await stripe.promotionCodes.list({ code: FOUNDER_PROMO_CODE, limit: 1 });
  if (existing.data.length) return;

  const coupon = await stripe.coupons.create({ percent_off: 50, duration: 'once', name: 'Founder 50% off' });
  await stripe.promotionCodes.create({
    coupon: coupon.id,
    code: FOUNDER_PROMO_CODE,
    expires_at: Math.floor(expiresAtMs / 1000),
  });
}

const router = Router();

// Kicks off a Stripe-hosted checkout page for the one-time unlock. client_reference_id carries
// our user id through Stripe so the webhook knows whose account to mark as paid.
router.post('/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured yet — try again later.' });

  const origin = process.env.CLIENT_ORIGIN || `${req.protocol}://${req.get('host')}`;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: String(req.userId),
    allow_promotion_codes: true,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: PRICE_CENTS,
          product_data: { name: 'Street League — full access' },
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/billing/success`,
    cancel_url: `${origin}/billing/cancel`,
  });

  res.json({ url: session.url });
});

// Only tells a founder their own promo code, and only while it's still live — not exposed to
// everyone, though nothing stops a founder from passing it along once they have it.
router.get('/founder-promo', requireAuth, async (req, res) => {
  if (!stripe) return res.json({ available: false });
  const expiresAtMs = founderPromoExpiry();
  if (!expiresAtMs || expiresAtMs <= Date.now()) return res.json({ available: false });

  const { rows } = await pool.query('SELECT founder FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]?.founder) return res.json({ available: false });

  res.json({ available: true, code: FOUNDER_PROMO_CODE, expiresAt: new Date(expiresAtMs).toISOString() });
});

// Stripe calls this directly (not the browser) once a checkout session completes. Mounted with
// a raw body parser in index.js — signature verification needs the exact bytes Stripe sent.
export async function stripeWebhook(req, res) {
  if (!stripe) return res.status(503).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = Number(session.client_reference_id);
    if (userId) {
      await pool.query('UPDATE users SET paid_at = now(), stripe_customer_id = $1 WHERE id = $2', [
        session.customer || null,
        userId,
      ]);
    }
  }

  res.json({ received: true });
}

export default router;
