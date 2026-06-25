import Stripe from 'stripe';

// Server-side Stripe client. STRIPE_SECRET_KEY is a server-only env var (never
// NEXT_PUBLIC_). Used by the billing route handlers for Checkout, the customer
// portal, and webhook signature verification.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  // Pin nothing — use the SDK's bundled API version.
  typescript: true,
});
