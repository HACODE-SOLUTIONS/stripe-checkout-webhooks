# Stripe Checkout + Webhooks AI Agent Skill

**Skill Type**: Technical Implementation  
**Domain**: Payments, Stripe Integration  
**By**: [HACODE SOLUTIONS](https://hacode.solutions)

---

## Overview

This skill enables AI coding agents to implement production-grade Stripe Checkout and webhook handling following security best practices and idempotency patterns.

## When to Use This Skill

Use this skill when:
- Implementing Stripe Checkout for one-time payments or subscriptions
- Setting up webhook handlers for Stripe events
- Debugging payment integration issues
- Adding payment functionality to an existing application
- Implementing refunds, customer management, or invoice handling

## Prerequisites

Before implementation, ensure:
- Stripe account exists with API keys (test and/or live)
- Node.js 18+ environment
- Next.js, Express, or similar framework installed
- Basic understanding of async/await patterns

## Core Implementation Steps

### Step 1: Install Dependencies

```bash
npm install stripe
# or
yarn add stripe
```

### Step 2: Configure Stripe SDK

Create `lib/stripe.ts`:

```typescript
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

export function getWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET!;
}
```

### Step 3: Create Checkout Endpoint

**Key Requirements:**
- Validate all inputs before creating session
- Store metadata (orderId, userId) for webhook processing
- Return session URL to frontend
- Handle Stripe errors gracefully

```typescript
// POST /api/checkout
import { stripe } from '@/lib/stripe';

const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: priceId, quantity }],
  success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${baseUrl}/cancel`,
  metadata: {
    orderId: 'order_123',
    userId: 'user_456',
  },
});

return { sessionId: session.id, url: session.url };
```

### Step 4: Implement Webhook Handler

**CRITICAL SECURITY REQUIREMENTS:**
1. ✅ Verify webhook signature before processing
2. ✅ Use raw request body (not parsed JSON)
3. ✅ Implement idempotency (track processed events)
4. ✅ Return 200 even for business logic errors

```typescript
// POST /api/webhooks/stripe
import { stripe, getWebhookSecret } from '@/lib/stripe';

// Get raw body and signature
const body = await req.text();
const signature = req.headers.get('stripe-signature')!;

// Verify signature (CRITICAL)
const event = stripe.webhooks.constructEvent(
  body,
  signature,
  getWebhookSecret()
);

// Check idempotency
if (isEventProcessed(event.id)) return;

// Route to handler
switch (event.type) {
  case 'checkout.session.completed':
    await handleCheckoutCompleted(event.data.object);
    break;
  // ... other events
}

// Mark as processed
markEventProcessed(event.id);
```

### Step 5: Local Testing Setup

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the webhook signing secret (whsec_...)
# Add to .env.local as STRIPE_WEBHOOK_SECRET

# Trigger test events
stripe trigger checkout.session.completed
```

## Event Handling Patterns

### Primary Events to Handle

1. **checkout.session.completed**
   - Mark order as paid
   - Fulfill order
   - Send confirmation email

2. **checkout.session.async_payment_succeeded**
   - Handle delayed payment success (bank transfers)

3. **checkout.session.async_payment_failed**
   - Handle payment failures
   - Notify customer

4. **customer.subscription.* (for subscriptions)**
   - created, updated, deleted
   - Sync subscription status

5. **invoice.paid / invoice.payment_failed**
   - Handle recurring payments

## Security Checklist

When implementing Stripe, verify:

- [ ] Webhook signature verification implemented
- [ ] Raw request body used for verification (not parsed)
- [ ] API keys stored in environment variables (never hardcoded)
- [ ] Idempotency implemented (event deduplication)
- [ ] Metadata validated before use
- [ ] HTTPS used in production
- [ ] Error logging implemented
- [ ] Test mode vs live mode properly configured

## Common Pitfalls to Avoid

### ❌ DON'T: Trust webhook data without verification
```typescript
// INSECURE - Accepts any payload
const event = JSON.parse(req.body);
await processEvent(event);
```

### ✅ DO: Always verify signatures
```typescript
// SECURE - Verifies event is from Stripe
const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
```

### ❌ DON'T: Parse body before verification
```typescript
// BREAKS signature verification
app.use(express.json());
app.post('/webhook', (req) => {
  const event = stripe.webhooks.constructEvent(req.body, ...); // ❌
});
```

### ✅ DO: Use raw body
```typescript
// Next.js App Router
const body = await req.text(); // ✅ Raw text
const event = stripe.webhooks.constructEvent(body, signature, secret);
```

### ❌ DON'T: Process events multiple times
```typescript
// Can cause duplicate orders
await handleCheckoutCompleted(session);
```

### ✅ DO: Implement idempotency
```typescript
// Safe to run multiple times
if (processedEvents.has(event.id)) return;
await handleCheckoutCompleted(session);
processedEvents.add(event.id);
```

## Testing Checklist

Before going live, test:

- [ ] Successful payment flow (test card 4242 4242 4242 4242)
- [ ] Declined card (test card 4000 0000 0000 0002)
- [ ] Webhook signature verification works
- [ ] Duplicate webhook events handled correctly
- [ ] Order fulfillment triggers correctly
- [ ] Email notifications sent
- [ ] Error handling and logging work
- [ ] Metadata passes through correctly

## Environment Configuration

```bash
# .env.example
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Error Handling Guidance

### Stripe Error Types

```typescript
try {
  await stripe.checkout.sessions.create({...});
} catch (error) {
  if (error instanceof Stripe.errors.StripeCardError) {
    // Card declined
    return 'Your card was declined';
  }
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    // Invalid parameters
    return 'Invalid request';
  }
  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    // Bad API key
    console.error('Check STRIPE_SECRET_KEY');
  }
  // Handle other errors
}
```

### Webhook Response Codes

- **200**: Event processed successfully OR business logic error (don't retry)
- **400**: Signature verification failed (Stripe won't retry)
- **500**: Server error (Stripe will retry - use sparingly)

## Subscription-Specific Patterns

### Creating Subscription Checkout

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'subscription', // Changed from 'payment'
  line_items: [{ price: 'price_monthly_plan', quantity: 1 }],
  // ... rest of config
});
```

### Handling Subscription Events

```typescript
case 'customer.subscription.created':
case 'customer.subscription.updated':
  await updateSubscription({
    id: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
  break;

case 'customer.subscription.deleted':
  await cancelSubscription(subscription.id);
  break;

case 'invoice.paid':
  await recordPayment(invoice);
  break;

case 'invoice.payment_failed':
  await handleFailedPayment(invoice);
  break;
```

## Quick Reference Commands

```bash
# Test locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger events
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created

# View recent events
stripe events list

# Get event details
stripe events retrieve evt_xxx

# Test API
stripe checkout_sessions create \
  --mode=payment \
  --line-items[0][price]=price_xxx \
  --line-items[0][quantity]=1 \
  --success-url=https://example.com/success \
  --cancel-url=https://example.com/cancel
```

## Resources

### Documentation
- **DEVSPEC.md** - Complete implementation patterns in this repo
- [Stripe Checkout Docs](https://stripe.com/docs/payments/checkout)
- [Webhook Docs](https://stripe.com/docs/webhooks)
- [Testing Docs](https://stripe.com/docs/testing)

### HACODE SOLUTIONS
- Website: [https://hacode.solutions](https://hacode.solutions)
- Live Demo: [https://hacode-solutions-site.vercel.app](https://hacode-solutions-site.vercel.app)

## Troubleshooting

### Webhook Signature Fails
- Verify webhook secret is correct (starts with `whsec_`)
- Ensure raw body is used (not parsed JSON)
- Check body wasn't modified before verification

### Events Not Received Locally
- Ensure Stripe CLI is running: `stripe listen`
- Check endpoint URL matches CLI forward-to
- Verify webhook endpoint is accessible

### Duplicate Orders Created
- Implement idempotency check
- Track processed event IDs
- Use database transactions for order creation

### Metadata Missing in Webhook
- Verify metadata was set during session creation
- Check for typos in metadata keys
- Ensure metadata is accessed from correct object

## Skill Invocation

When a user requests Stripe Checkout or webhook implementation:

1. Read DEVSPEC.md for detailed patterns
2. Follow Step 1-5 above for basic implementation
3. Apply security checklist
4. Implement idempotency
5. Set up local testing
6. Verify all events handle correctly
7. Add error handling and logging

Always prioritize security (signature verification) and idempotency over speed of implementation.

---

**Skill Version**: 1.0.0  
**Last Updated**: 2026-09-19  
**Maintained By**: [HACODE SOLUTIONS](https://hacode.solutions)  
**License**: MIT
