# Stripe Checkout + Webhooks DevSpec

**Version**: 1.0.0  
**By**: [HACODE SOLUTIONS](https://hacode.solutions)  
**License**: MIT

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Checkout Session Creation](#checkout-session-creation)
4. [Webhook Implementation](#webhook-implementation)
5. [Webhook Verification](#webhook-verification)
6. [Idempotency Patterns](#idempotency-patterns)
7. [Test vs Live Mode](#test-vs-live-mode)
8. [Error Handling](#error-handling)
9. [Acceptance Tests](#acceptance-tests)
10. [AI Agent Prompts](#ai-agent-prompts)
11. [Security Best Practices](#security-best-practices)
12. [Common Patterns](#common-patterns)

---

## Overview

This DevSpec defines production-grade patterns for implementing Stripe Checkout and webhook handling in modern web applications, optimized for AI-assisted development.

### Key Principles

1. **Security First**: Always verify webhook signatures before processing
2. **Idempotent Operations**: Handle duplicate webhook events gracefully
3. **Fail-Safe Design**: Log errors, retry failed operations, maintain audit trails
4. **Type Safety**: Use TypeScript and Stripe's type definitions
5. **Test Coverage**: Test both happy paths and edge cases

### Prerequisites

- Stripe account with API keys
- Node.js 18+ environment
- Understanding of async operations and webhooks

---

## Architecture

### Payment Flow

```
User Journey:
1. User clicks "Buy Now" → Your frontend calls /api/checkout
2. Backend creates Checkout Session → Returns session URL
3. User redirected to Stripe Checkout → Completes payment
4. Stripe sends webhook event → /api/webhooks/stripe receives event
5. Webhook handler verifies signature → Processes event idempotently
6. Your business logic executes → Order fulfilled, email sent, etc.
```

### Components

#### Frontend (Browser)
- Initiates checkout session creation
- Redirects user to Stripe-hosted page
- Handles success/cancel redirects

#### Backend API - Checkout Endpoint
- Creates Stripe Checkout Session
- Configures payment parameters
- Returns session URL to frontend

#### Backend API - Webhook Endpoint
- Receives events from Stripe
- Verifies webhook signature (CRITICAL)
- Processes events idempotently
- Executes business logic

#### Database
- Stores order/payment state
- Tracks processed events
- Maintains audit logs

---

## Checkout Session Creation

### Basic Implementation

```typescript
// api/checkout/route.ts or pages/api/checkout.ts

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { priceId, quantity = 1, customerId } = body;

    // Validate inputs
    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid priceId' },
        { status: 400 }
      );
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // or 'subscription' for recurring
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      customer: customerId, // optional: attach to existing customer
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel`,
      metadata: {
        // Add custom metadata for webhook processing
        orderId: generateOrderId(),
        userId: body.userId,
        // Any data you need in the webhook
      },
      // Optional: collect customer info
      billing_address_collection: 'required',
      // Optional: allow promo codes
      allow_promotion_codes: true,
    });

    return NextResponse.json({ 
      sessionId: session.id,
      url: session.url 
    });

  } catch (error: any) {
    console.error('Checkout session creation failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Configuration Options

#### Payment Mode
```typescript
mode: 'payment'      // One-time payment
mode: 'subscription' // Recurring subscription
mode: 'setup'        // Save payment method for future use
```

#### Line Items
```typescript
// Using Price ID (recommended for production)
line_items: [
  {
    price: 'price_1ABC...', // Created in Stripe Dashboard or API
    quantity: 1,
  }
]

// Using ad-hoc pricing (for dynamic amounts)
line_items: [
  {
    price_data: {
      currency: 'usd',
      product_data: {
        name: 'Custom Product',
        description: 'Product description',
        images: ['https://example.com/image.png'],
      },
      unit_amount: 2000, // $20.00 in cents
    },
    quantity: 1,
  }
]
```

#### Customer Management
```typescript
// Create new customer
customer_email: 'user@example.com',

// Use existing customer
customer: 'cus_ABC123',

// Create customer and save card
mode: 'setup',
customer_creation: 'always',
```

#### Metadata (Critical for Webhooks)
```typescript
metadata: {
  orderId: 'order_12345',          // Your internal order ID
  userId: 'user_67890',            // Your user identifier
  plan: 'pro',                     // Plan type for subscriptions
  campaignId: 'summer_sale_2024',  // Marketing attribution
  // Any data you need to process the webhook
}
```

### Frontend Integration

```typescript
// React/Next.js component example
async function handleCheckout() {
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_1ABC...',
        quantity: 1,
        userId: currentUser.id,
      }),
    });

    const { url, error } = await response.json();
    
    if (error) {
      console.error('Checkout error:', error);
      return;
    }

    // Redirect to Stripe Checkout
    window.location.href = url;
    
  } catch (error) {
    console.error('Failed to create checkout session:', error);
  }
}
```

---

## Webhook Implementation

### Core Webhook Handler

```typescript
// api/webhooks/stripe/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { buffer } from 'node:stream/consumers';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// CRITICAL: Disable body parsing for webhook routes
export const config = {
  api: {
    bodyParser: false, // Required for signature verification
  },
};

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    console.error('Missing stripe-signature header');
    return NextResponse.json(
      { error: 'Missing signature' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature (CRITICAL)
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  // Process the event
  try {
    await handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    // Still return 200 to avoid Stripe retrying immediately
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 200 }
    );
  }
}

async function handleStripeEvent(event: Stripe.Event) {
  console.log(`Processing event: ${event.id} (${event.type})`);

  // Check for duplicate events (idempotency)
  const alreadyProcessed = await isEventProcessed(event.id);
  if (alreadyProcessed) {
    console.log(`Event ${event.id} already processed, skipping`);
    return;
  }

  // Route to specific handlers
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    
    case 'checkout.session.async_payment_succeeded':
      await handleAsyncPaymentSucceeded(event.data.object as Stripe.Checkout.Session);
      break;
    
    case 'checkout.session.async_payment_failed':
      await handleAsyncPaymentFailed(event.data.object as Stripe.Checkout.Session);
      break;
    
    case 'charge.succeeded':
      await handleChargeSucceeded(event.data.object as Stripe.Charge);
      break;
    
    case 'charge.failed':
      await handleChargeFailed(event.data.object as Stripe.Charge);
      break;
    
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(event);
      break;
    
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Mark event as processed
  await markEventProcessed(event.id, event.type);
}
```

### Event Handlers

```typescript
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log('Checkout completed:', session.id);
  
  const { metadata } = session;
  const orderId = metadata?.orderId;
  const userId = metadata?.userId;

  if (!orderId) {
    console.error('Missing orderId in metadata');
    return;
  }

  // Retrieve session with line items
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items', 'customer'],
  });

  // Update order status in database
  await updateOrderStatus(orderId, {
    status: 'paid',
    stripeSessionId: session.id,
    stripeCustomerId: session.customer as string,
    amount: session.amount_total,
    currency: session.currency,
    paymentStatus: session.payment_status,
  });

  // Fulfill the order
  await fulfillOrder(orderId, fullSession);

  // Send confirmation email
  await sendOrderConfirmationEmail(userId, orderId);
}

async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  // Handle async payments (bank transfers, etc.)
  console.log('Async payment succeeded:', session.id);
  await handleCheckoutCompleted(session);
}

async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  console.log('Async payment failed:', session.id);
  const orderId = session.metadata?.orderId;
  
  if (orderId) {
    await updateOrderStatus(orderId, {
      status: 'payment_failed',
      stripeSessionId: session.id,
    });
    
    await sendPaymentFailedEmail(session.metadata?.userId, orderId);
  }
}

async function handleChargeSucceeded(charge: Stripe.Charge) {
  console.log('Charge succeeded:', charge.id);
  // Additional charge-level logic if needed
}

async function handleChargeFailed(charge: Stripe.Charge) {
  console.log('Charge failed:', charge.id, charge.failure_message);
  // Handle failed charges, notify user
}

async function handleSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  console.log(`Subscription ${event.type}:`, subscription.id);
  
  // Update subscription status in database
  await updateSubscription(subscription.id, {
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}
```

---

## Webhook Verification

### Why Verification is Critical

**Without verification, attackers could:**
- Forge webhook events to mark orders as paid
- Trigger unauthorized order fulfillment
- Manipulate subscription statuses
- Steal products/services

### Verification Process

```typescript
// Stripe uses HMAC SHA-256 to sign webhooks
// The signature is in the 'stripe-signature' header

// DO THIS (secure):
event = stripe.webhooks.constructEvent(
  rawBody,        // Raw request body (string or Buffer)
  signature,      // stripe-signature header value
  webhookSecret   // Your webhook signing secret
);

// NEVER DO THIS (insecure):
const event = JSON.parse(req.body); // ❌ Accepts any payload!
await processEvent(event);          // ❌ No verification!
```

### Getting Your Webhook Secret

#### Production (Live Mode)
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events to listen for
4. Copy the signing secret (`whsec_...`)

#### Development (Test Mode)
```bash
# Install Stripe CLI
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# CLI will display webhook signing secret
# Ready! Your webhook signing secret is whsec_xxx
```

### Common Verification Errors

```typescript
// Error: No signatures found matching the expected signature
// Cause: Wrong webhook secret or body modification
// Fix: Ensure rawBody is unchanged and secret matches

// Error: Timestamp outside tolerance
// Cause: Server clock skew or replay attack
// Fix: Sync server time with NTP, check for replayed events

// Error: Unable to parse body
// Cause: Body was parsed as JSON before verification
// Fix: Use raw body (disable bodyParser)
```

### Next.js Specific Configuration

```typescript
// Next.js App Router (app/api/webhooks/stripe/route.ts)
export async function POST(req: NextRequest) {
  const body = await req.text(); // ✅ Get raw text
  const signature = req.headers.get('stripe-signature')!;
  
  const event = stripe.webhooks.constructEvent(
    body,
    signature,
    webhookSecret
  );
  // ... process event
}

// Next.js Pages Router (pages/api/webhooks/stripe.ts)
import { buffer } from 'micro';

export const config = {
  api: {
    bodyParser: false, // ✅ Critical: disable parsing
  },
};

export default async function handler(req, res) {
  const buf = await buffer(req); // ✅ Get raw buffer
  const signature = req.headers['stripe-signature'];
  
  const event = stripe.webhooks.constructEvent(
    buf,
    signature,
    webhookSecret
  );
  // ... process event
}
```

---

## Idempotency Patterns

### Why Idempotency Matters

Stripe may send the same webhook event multiple times due to:
- Network retries
- Timeouts on your server
- Manual replays from Stripe Dashboard

**Without idempotency**: Duplicate events cause duplicate order fulfillment, double emails, double charges to users.

### Event ID Tracking

```typescript
// Database schema for tracking processed events
interface ProcessedEvent {
  eventId: string;      // Stripe event ID (event.id)
  eventType: string;    // Event type (checkout.session.completed)
  processedAt: Date;    // When we processed it
  status: 'success' | 'failed' | 'retrying';
}

// Check if event was already processed
async function isEventProcessed(eventId: string): Promise<boolean> {
  const event = await db.processedEvents.findUnique({
    where: { eventId },
  });
  return event !== null;
}

// Mark event as processed
async function markEventProcessed(
  eventId: string,
  eventType: string
): Promise<void> {
  await db.processedEvents.create({
    data: {
      eventId,
      eventType,
      processedAt: new Date(),
      status: 'success',
    },
  });
}
```

### Transaction-Based Idempotency

```typescript
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const eventId = session.id; // Use session ID as idempotency key
  
  // Use database transaction for atomic operations
  await db.$transaction(async (tx) => {
    // Check if already processed within transaction
    const existing = await tx.processedEvents.findUnique({
      where: { eventId },
    });
    
    if (existing) {
      console.log(`Event ${eventId} already processed`);
      return;
    }
    
    // Process the event
    await tx.orders.update({
      where: { id: session.metadata.orderId },
      data: { status: 'paid' },
    });
    
    // Mark as processed
    await tx.processedEvents.create({
      data: { eventId, eventType: 'checkout.session.completed' },
    });
  });
}
```

### Idempotency Keys for API Calls

```typescript
// When making Stripe API calls from webhook handlers, use idempotency keys
// to prevent duplicate operations if webhook is retried

async function refundOrder(orderId: string, amount: number, chargeId: string) {
  const idempotencyKey = `refund_${orderId}_${chargeId}`;
  
  const refund = await stripe.refunds.create(
    {
      charge: chargeId,
      amount,
    },
    {
      idempotencyKey, // Stripe will deduplicate requests with same key
    }
  );
  
  return refund;
}
```

### State Machine Pattern

```typescript
// Define valid state transitions
type OrderStatus = 
  | 'pending'
  | 'processing'
  | 'paid'
  | 'fulfilled'
  | 'refunded'
  | 'failed';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'failed'],
  processing: ['paid', 'failed'],
  paid: ['fulfilled', 'refunded'],
  fulfilled: ['refunded'],
  refunded: [],
  failed: ['pending'], // Allow retry
};

async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus
): Promise<void> {
  const order = await db.orders.findUnique({ where: { id: orderId } });
  
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  const currentStatus = order.status as OrderStatus;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus];
  
  if (!allowedTransitions.includes(newStatus)) {
    console.warn(
      `Invalid transition: ${currentStatus} → ${newStatus} for order ${orderId}`
    );
    return; // Gracefully ignore invalid transitions
  }
  
  await db.orders.update({
    where: { id: orderId },
    data: { 
      status: newStatus,
      updatedAt: new Date(),
    },
  });
}
```

---

## Test vs Live Mode

### API Keys

```bash
# Test Mode (for development)
STRIPE_SECRET_KEY=sk_test_51ABC...
STRIPE_PUBLISHABLE_KEY=pk_test_51ABC...
STRIPE_WEBHOOK_SECRET=whsec_test_...

# Live Mode (for production)
STRIPE_SECRET_KEY=sk_live_51XYZ...
STRIPE_PUBLISHABLE_KEY=pk_live_51XYZ...
STRIPE_WEBHOOK_SECRET=whsec_live_...
```

### Environment-Based Configuration

```typescript
// lib/stripe.ts
import Stripe from 'stripe';

const isProduction = process.env.NODE_ENV === 'production';

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY!, 
  {
    apiVersion: '2024-11-20.acacia',
    typescript: true,
    // Optional: Add app info for Stripe support
    appInfo: {
      name: 'Your App Name',
      version: '1.0.0',
      url: 'https://yourapp.com',
    },
  }
);

// Get appropriate webhook secret based on environment
export const getWebhookSecret = () => {
  return isProduction
    ? process.env.STRIPE_WEBHOOK_SECRET_LIVE!
    : process.env.STRIPE_WEBHOOK_SECRET_TEST!;
};

// Test card numbers for development
export const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINED: '4000000000000002',
  REQUIRES_AUTH: '4000002500003155',
  INSUFFICIENT_FUNDS: '4000000000009995',
};
```

### Testing Checklist

#### Development (Test Mode)
- [ ] Use test API keys (sk_test_*, pk_test_*)
- [ ] Use Stripe CLI for local webhook testing
- [ ] Test with various test card numbers
- [ ] Verify webhook signature verification works
- [ ] Test idempotency (replay same webhook)
- [ ] Test error scenarios (declined cards, etc.)
- [ ] Validate metadata passes through correctly

#### Staging
- [ ] Use test mode keys on staging environment
- [ ] Configure webhook endpoint on Stripe Dashboard
- [ ] Test end-to-end user flows
- [ ] Verify email notifications work
- [ ] Test order fulfillment logic
- [ ] Load test webhook handler

#### Production (Live Mode)
- [ ] Switch to live API keys (sk_live_*, pk_live_*)
- [ ] Configure production webhook endpoint
- [ ] Enable webhook event logging
- [ ] Set up monitoring and alerts
- [ ] Test with real payment (small amount)
- [ ] Monitor first few transactions closely
- [ ] Have rollback plan ready

### Test Mode Features

```typescript
// Stripe provides test mode only features for development

// Test clock for simulating time (subscriptions, trials)
const testClock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
  name: 'Test subscription lifecycle',
});

// Advance time to trigger subscription events
await stripe.testHelpers.testClocks.advance(testClock.id, {
  frozen_time: Math.floor(Date.now() / 1000) + 86400 * 30, // +30 days
});

// Test mode charge success
await stripe.testHelpers.testClocks.advance(testClock.id);
```

---

## Error Handling

### Webhook Response Codes

```typescript
// ✅ 200 - Event processed successfully
return NextResponse.json({ received: true }, { status: 200 });

// ✅ 200 - Event processing failed, but don't retry
// (use for invalid data, business logic errors)
console.error('Order not found, cannot process webhook');
return NextResponse.json({ received: true }, { status: 200 });

// ❌ 400 - Signature verification failed (Stripe won't retry)
return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });

// ⚠️ 500 - Server error (Stripe will retry)
// Use sparingly - only for transient errors
return NextResponse.json({ error: 'Database timeout' }, { status: 500 });
```

### Stripe Error Types

```typescript
try {
  const session = await stripe.checkout.sessions.create({...});
} catch (error) {
  if (error instanceof Stripe.errors.StripeCardError) {
    // Card was declined
    console.error('Card error:', error.message);
    return { error: 'Your card was declined.' };
  }
  
  if (error instanceof Stripe.errors.StripeRateLimitError) {
    // Too many requests
    console.error('Rate limit exceeded');
    return { error: 'Too many requests, please try again.' };
  }
  
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    // Invalid parameters
    console.error('Invalid request:', error.message);
    return { error: 'Invalid request parameters.' };
  }
  
  if (error instanceof Stripe.errors.StripeAPIError) {
    // Stripe API error
    console.error('Stripe API error:', error.message);
    return { error: 'Payment service error, please try again.' };
  }
  
  if (error instanceof Stripe.errors.StripeConnectionError) {
    // Network error
    console.error('Connection error:', error.message);
    return { error: 'Connection error, please try again.' };
  }
  
  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    // Authentication error (bad API key)
    console.error('Authentication error:', error.message);
    return { error: 'Payment configuration error.' };
  }
  
  // Unknown error
  console.error('Unknown error:', error);
  return { error: 'An unexpected error occurred.' };
}
```

### Graceful Degradation

```typescript
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  try {
    // Critical: Update order status
    await updateOrderStatus(session.metadata.orderId, 'paid');
  } catch (error) {
    console.error('Failed to update order:', error);
    // Re-throw to trigger Stripe retry
    throw error;
  }
  
  try {
    // Non-critical: Send email
    await sendConfirmationEmail(session.metadata.userId);
  } catch (error) {
    // Log but don't fail the webhook
    console.error('Failed to send email:', error);
    // Queue for retry separately
    await queueEmailRetry(session.metadata.userId);
  }
  
  try {
    // Non-critical: Analytics
    await trackConversion(session.id);
  } catch (error) {
    console.error('Analytics tracking failed:', error);
    // Continue - analytics failure shouldn't affect order
  }
}
```

### Logging and Monitoring

```typescript
// Structured logging for webhook events
function logWebhookEvent(
  event: Stripe.Event,
  status: 'processing' | 'success' | 'error',
  error?: any
) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    eventId: event.id,
    eventType: event.type,
    status,
    error: error?.message,
    metadata: event.data.object.metadata,
  }));
}

// Example usage
try {
  await handleCheckoutCompleted(session);
  logWebhookEvent(event, 'success');
} catch (error) {
  logWebhookEvent(event, 'error', error);
  throw error;
}
```

---

## Acceptance Tests

### Unit Tests - Webhook Verification

```typescript
// __tests__/webhooks.test.ts
import Stripe from 'stripe';

describe('Webhook Signature Verification', () => {
  const stripe = new Stripe('sk_test_123');
  const webhookSecret = 'whsec_test_123';
  
  it('should verify valid webhook signature', () => {
    const payload = JSON.stringify({ id: 'evt_test' });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    
    expect(() => {
      stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }).not.toThrow();
  });
  
  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ id: 'evt_test' });
    const invalidSignature = 't=123,v1=invalid';
    
    expect(() => {
      stripe.webhooks.constructEvent(payload, invalidSignature, webhookSecret);
    }).toThrow(/No signatures found/);
  });
  
  it('should reject modified payload', () => {
    const payload = JSON.stringify({ id: 'evt_test' });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    
    const modifiedPayload = JSON.stringify({ id: 'evt_modified' });
    
    expect(() => {
      stripe.webhooks.constructEvent(modifiedPayload, signature, webhookSecret);
    }).toThrow();
  });
});
```

### Integration Tests - Checkout Flow

```typescript
// __tests__/checkout.test.ts
import { POST as checkoutHandler } from '@/app/api/checkout/route';
import { POST as webhookHandler } from '@/app/api/webhooks/stripe/route';

describe('Checkout Integration', () => {
  it('should create checkout session with valid inputs', async () => {
    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({
        priceId: 'price_test_123',
        quantity: 1,
        userId: 'user_123',
      }),
    });
    
    const response = await checkoutHandler(req);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.sessionId).toBeDefined();
    expect(data.url).toContain('checkout.stripe.com');
  });
  
  it('should reject invalid priceId', async () => {
    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: JSON.stringify({
        priceId: '',
        quantity: 1,
      }),
    });
    
    const response = await checkoutHandler(req);
    expect(response.status).toBe(400);
  });
});
```

### Idempotency Tests

```typescript
describe('Webhook Idempotency', () => {
  it('should process event only once', async () => {
    const eventId = 'evt_test_123';
    const mockEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_123' } },
    };
    
    // First processing
    await handleStripeEvent(mockEvent);
    const firstProcessing = await db.processedEvents.findUnique({
      where: { eventId },
    });
    expect(firstProcessing).toBeDefined();
    
    // Second processing (duplicate)
    await handleStripeEvent(mockEvent);
    const count = await db.orders.count({
      where: { stripeSessionId: mockEvent.data.object.id },
    });
    
    // Should still have only 1 order, not 2
    expect(count).toBe(1);
  });
});
```

### End-to-End Tests

```typescript
// __tests__/e2e/checkout-flow.test.ts
import { test, expect } from '@playwright/test';

test('complete checkout flow', async ({ page }) => {
  // 1. Navigate to product page
  await page.goto('/products/pro-plan');
  
  // 2. Click checkout button
  await page.click('[data-testid="checkout-button"]');
  
  // 3. Should redirect to Stripe Checkout
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  
  // 4. Fill in test card details
  await page.fill('[name="cardnumber"]', '4242424242424242');
  await page.fill('[name="exp-date"]', '12/34');
  await page.fill('[name="cvc"]', '123');
  await page.fill('[name="postal"]', '12345');
  
  // 5. Submit payment
  await page.click('[type="submit"]');
  
  // 6. Should redirect to success page
  await page.waitForURL(/\/success/);
  await expect(page.locator('h1')).toContainText('Payment Successful');
  
  // 7. Verify order in database
  const orders = await db.orders.findMany({
    where: { userId: testUser.id },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });
  
  expect(orders[0].status).toBe('paid');
});
```

### Load Testing Webhooks

```typescript
// scripts/load-test-webhook.ts
import Stripe from 'stripe';

async function loadTestWebhook() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const webhookUrl = 'http://localhost:3000/api/webhooks/stripe';
  
  const events = [];
  
  // Create 100 concurrent webhook events
  for (let i = 0; i < 100; i++) {
    events.push(
      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': generateTestSignature(testPayload),
        },
        body: testPayload,
      })
    );
  }
  
  const results = await Promise.allSettled(events);
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  console.log(`Load test: ${succeeded} succeeded, ${failed} failed`);
}
```

---

## AI Agent Prompts

### Prompt: Implement Stripe Checkout

```
Create a Stripe Checkout integration with the following requirements:

1. API endpoint: POST /api/checkout
   - Accept: { priceId, quantity, userId }
   - Validate inputs
   - Create Stripe Checkout Session
   - Return: { sessionId, url }

2. Configuration:
   - Mode: payment (one-time)
   - Include orderId in metadata
   - Success URL: /success?session_id={CHECKOUT_SESSION_ID}
   - Cancel URL: /cancel

3. Frontend:
   - Button to initiate checkout
   - Call /api/checkout endpoint
   - Redirect to returned URL

4. Requirements:
   - TypeScript with Stripe SDK v16+
   - Next.js 14+ App Router
   - Proper error handling
   - Input validation

Environment variables needed:
- STRIPE_SECRET_KEY
- NEXT_PUBLIC_BASE_URL
```

### Prompt: Implement Webhook Handler

```
Implement a secure Stripe webhook handler:

1. API endpoint: POST /api/webhooks/stripe
   - Disable body parsing
   - Get raw request body
   - Verify webhook signature using STRIPE_WEBHOOK_SECRET
   - Process events idempotently

2. Handle these events:
   - checkout.session.completed → Mark order as paid
   - checkout.session.async_payment_succeeded → Handle async payments
   - checkout.session.async_payment_failed → Handle failures
   - payment_intent.succeeded → Additional payment confirmation

3. Idempotency:
   - Track processed events in database
   - Check event ID before processing
   - Use database transactions

4. Error handling:
   - Return 400 for invalid signatures
   - Return 200 for business logic errors
   - Log all events and errors

5. Database schema:
   - ProcessedEvents table (eventId, eventType, processedAt)
   - Orders table (orderId, status, stripeSessionId)

Use TypeScript, Stripe SDK v16+, and include all necessary error handling.
```

### Prompt: Add Subscription Support

```
Extend the Stripe Checkout implementation to support subscriptions:

1. Modify checkout endpoint:
   - Add mode parameter: 'payment' | 'subscription'
   - For subscriptions, use subscription line items
   - Set up subscription metadata

2. Add webhook handlers:
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - invoice.paid
   - invoice.payment_failed

3. Database schema:
   - Subscriptions table
   - Track status, currentPeriodEnd, cancelAtPeriodEnd

4. Implement:
   - Subscription status sync
   - Invoice handling
   - Cancellation flow
   - Upgrade/downgrade logic

Include idempotency and proper error handling.
```

### Prompt: Test Webhook Locally

```
Set up local webhook testing with Stripe CLI:

1. Install Stripe CLI:
   - Instructions for macOS, Linux, Windows

2. Login and configure:
   - stripe login
   - stripe listen --forward-to localhost:3000/api/webhooks/stripe

3. Get webhook secret:
   - Copy whsec_* value from CLI output
   - Add to .env.local as STRIPE_WEBHOOK_SECRET

4. Test events:
   - stripe trigger checkout.session.completed
   - stripe trigger payment_intent.succeeded
   - stripe trigger customer.subscription.created

5. Verify:
   - Check server logs
   - Verify database updates
   - Test idempotency by triggering same event twice

Document all commands and expected outputs.
```

### Prompt: Add Refund Support

```
Implement refund functionality with Stripe:

1. API endpoint: POST /api/refunds
   - Accept: { orderId, amount, reason }
   - Validate order exists and is paid
   - Create Stripe refund with idempotency key
   - Return refund status

2. Webhook handler:
   - charge.refunded → Update order status
   - charge.refund.updated → Track refund status

3. Database:
   - Add refunds table
   - Track refundId, orderId, amount, status

4. Business logic:
   - Partial vs full refunds
   - Prevent duplicate refunds
   - Update inventory if needed

5. Include:
   - Error handling
   - Idempotency
   - Audit logging

Use TypeScript and Stripe SDK v16+.
```

---

## Security Best Practices

### 1. Always Verify Webhook Signatures

```typescript
// ✅ SECURE
event = stripe.webhooks.constructEvent(rawBody, signature, secret);

// ❌ INSECURE - Never do this
const event = JSON.parse(req.body);
```

### 2. Use Raw Request Body

```typescript
// ✅ SECURE - Next.js App Router
const body = await req.text();

// ✅ SECURE - Next.js Pages Router
export const config = { api: { bodyParser: false } };
const buf = await buffer(req);

// ❌ INSECURE - Parsed body breaks signature
const body = req.body; // Already parsed JSON
```

### 3. Protect API Keys

```typescript
// ✅ SECURE
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// ❌ INSECURE - Never commit keys
const stripe = new Stripe('sk_live_abc123...');

// ✅ Use environment variables
// .env.local (never commit)
STRIPE_SECRET_KEY=sk_test_...

// ✅ Validate keys exist
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}
```

### 4. Validate Metadata

```typescript
// ✅ SECURE - Validate before use
const orderId = session.metadata?.orderId;
if (!orderId || typeof orderId !== 'string') {
  throw new Error('Invalid orderId in metadata');
}

// Verify order belongs to customer
const order = await db.orders.findFirst({
  where: {
    id: orderId,
    userId: session.customer, // Verify ownership
  },
});

// ❌ INSECURE - Blind trust of metadata
await fulfillOrder(session.metadata.orderId);
```

### 5. Use HTTPS in Production

```typescript
// ✅ SECURE
success_url: 'https://yourdomain.com/success',
cancel_url: 'https://yourdomain.com/cancel',

// ❌ INSECURE - HTTP in production
success_url: 'http://yourdomain.com/success',
```

### 6. Rate Limiting

```typescript
// Implement rate limiting on checkout endpoint
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
});

export async function POST(req: NextRequest) {
  const ip = req.ip ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  
  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }
  
  // ... create checkout session
}
```

### 7. Audit Logging

```typescript
// Log all payment operations for audit
async function auditLog(
  userId: string,
  action: string,
  details: Record<string, any>
) {
  await db.auditLogs.create({
    data: {
      userId,
      action,
      details,
      timestamp: new Date(),
      ipAddress: req.ip,
    },
  });
}

// Usage
await auditLog(userId, 'checkout_session_created', {
  sessionId: session.id,
  amount: session.amount_total,
});
```

### 8. Least Privilege Access

```typescript
// Create restricted API keys for different purposes

// Checkout API key (write-only)
// - Permissions: checkout_sessions:write

// Webhook API key (read-only)
// - Permissions: events:read

// Admin API key (full access)
// - Permissions: all
// - Use only in secure server environments
```

---

## Common Patterns

### Pattern 1: Order Lifecycle

```typescript
// State machine for order processing
enum OrderStatus {
  DRAFT = 'draft',
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  PROCESSING = 'processing',
  FULFILLED = 'fulfilled',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

// Checkout creation → PENDING_PAYMENT
const order = await createOrder({ status: OrderStatus.PENDING_PAYMENT });

// Webhook: checkout.session.completed → PAID
await updateOrder(orderId, { status: OrderStatus.PAID });

// Background job → PROCESSING
await processOrder(orderId);
await updateOrder(orderId, { status: OrderStatus.PROCESSING });

// Fulfillment complete → FULFILLED
await fulfillOrder(orderId);
await updateOrder(orderId, { status: OrderStatus.FULFILLED });
```

### Pattern 2: Customer Management

```typescript
// Create or retrieve customer
async function getOrCreateCustomer(
  email: string,
  userId: string
): Promise<string> {
  // Check if customer exists in database
  const existingCustomer = await db.customers.findUnique({
    where: { userId },
  });
  
  if (existingCustomer?.stripeCustomerId) {
    return existingCustomer.stripeCustomerId;
  }
  
  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  
  // Save to database
  await db.customers.upsert({
    where: { userId },
    create: { userId, stripeCustomerId: customer.id, email },
    update: { stripeCustomerId: customer.id, email },
  });
  
  return customer.id;
}

// Use in checkout
const customerId = await getOrCreateCustomer(user.email, user.id);
const session = await stripe.checkout.sessions.create({
  customer: customerId,
  // ...
});
```

### Pattern 3: Proration for Upgrades

```typescript
// Upgrade subscription with proration
async function upgradeSubscription(
  subscriptionId: string,
  newPriceId: string
) {
  const subscription = await stripe.subscriptions.update(
    subscriptionId,
    {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations', // Charge difference
    }
  );
  
  return subscription;
}
```

### Pattern 4: Failed Payment Retry

```typescript
// Handle failed payment with retry logic
async function handleFailedPayment(invoice: Stripe.Invoice) {
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  );
  
  // Update subscription status
  await db.subscriptions.update({
    where: { stripeSubscriptionId: subscription.id },
    data: { 
      status: 'past_due',
      retryCount: { increment: 1 },
    },
  });
  
  // Send email notification
  await sendPaymentFailedEmail(subscription.customer as string, {
    invoiceUrl: invoice.hosted_invoice_url,
    amount: invoice.amount_due,
  });
  
  // After 3 failed attempts, cancel subscription
  const sub = await db.subscriptions.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  
  if (sub && sub.retryCount >= 3) {
    await stripe.subscriptions.cancel(subscription.id);
    await sendSubscriptionCancelledEmail(subscription.customer as string);
  }
}
```

### Pattern 5: Checkout with Discount Codes

```typescript
// Create checkout with promotion code support
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: priceId, quantity: 1 }],
  allow_promotion_codes: true, // Enable promo code input
  discounts: [
    {
      coupon: 'SUMMER2024', // Optional: pre-apply coupon
    },
  ],
  success_url: '...',
  cancel_url: '...',
});

// Track coupon usage in webhook
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const couponId = session.total_details?.amount_discount 
    ? session.discount?.coupon?.id 
    : null;
  
  if (couponId) {
    await db.orders.update({
      where: { id: session.metadata.orderId },
      data: { 
        couponUsed: couponId,
        discountAmount: session.total_details.amount_discount,
      },
    });
  }
}
```

---

## Resources

### Official Documentation
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Webhook Documentation](https://stripe.com/docs/webhooks)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

### HACODE SOLUTIONS
- Website: [https://hacode.solutions](https://hacode.solutions)
- Live Demo: [https://hacode-solutions-site.vercel.app](https://hacode-solutions-site.vercel.app)

### Testing Tools
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)
- [Stripe CLI Commands](https://stripe.com/docs/cli)

### Best Practices
- [Stripe Security Best Practices](https://stripe.com/docs/security)
- [PCI Compliance](https://stripe.com/docs/security/guide)
- [Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)

---

**DevSpec Version**: 1.0.0  
**Last Updated**: 2026-09-19  
**Maintained By**: [HACODE SOLUTIONS](https://hacode.solutions)  
**License**: MIT
