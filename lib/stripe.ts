/**
 * Stripe SDK Configuration
 * 
 * This module initializes the Stripe SDK with the appropriate API key
 * and provides utility functions for Stripe operations.
 * 
 * @see https://stripe.com/docs/api
 * @see DEVSPEC.md for implementation patterns
 */

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
}

/**
 * Stripe SDK instance configured with your secret key
 * Use this instance for all Stripe API calls
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
  appInfo: {
    name: 'Stripe Checkout Webhooks DevSpec',
    version: '1.0.0',
    url: 'https://hacode.solutions',
  },
});

/**
 * Get the webhook secret for the current environment
 * In production, use a different webhook secret than test mode
 */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set in environment variables');
  }
  
  return secret;
}

/**
 * Test card numbers for development
 * @see https://stripe.com/docs/testing
 */
export const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINED: '4000000000000002',
  REQUIRES_AUTH: '4000002500003155',
  INSUFFICIENT_FUNDS: '4000000000009995',
} as const;

/**
 * Format amount from cents to dollars
 */
export function formatAmount(amountInCents: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}
