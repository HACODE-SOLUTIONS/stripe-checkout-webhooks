/**
 * Stripe Webhook Handler
 * 
 * This endpoint receives webhook events from Stripe and processes them securely.
 * 
 * CRITICAL SECURITY NOTES:
 * 1. Always verify webhook signatures before processing events
 * 2. Use the raw request body for signature verification
 * 3. Implement idempotency to handle duplicate events
 * 4. Return 200 even for business logic errors to prevent retries
 * 
 * @route POST /api/webhooks/stripe
 * @see DEVSPEC.md - Webhook Implementation section
 * @see https://stripe.com/docs/webhooks
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, getWebhookSecret } from '@/lib/stripe';

/**
 * In-memory set to track processed events (for demonstration)
 * In production, use a database to persist processed event IDs
 */
const processedEvents = new Set<string>();

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
    // Verify webhook signature (CRITICAL SECURITY STEP)
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      getWebhookSecret()
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  console.log(`Received webhook event: ${event.id} (${event.type})`);

  try {
    // Process the event idempotently
    await handleStripeEvent(event);
    
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    
    // Return 200 to prevent Stripe from retrying
    // Log the error for manual investigation
    return NextResponse.json(
      { received: true, error: error.message },
      { status: 200 }
    );
  }
}

/**
 * Main event handler with idempotency check
 */
async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  // Check for duplicate events (idempotency)
  if (processedEvents.has(event.id)) {
    console.log(`Event ${event.id} already processed, skipping`);
    return;
  }

  // Route to specific event handlers
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
  processedEvents.add(event.id);
}

/**
 * Handle successful checkout session completion
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  console.log('Checkout completed:', {
    sessionId: session.id,
    orderId: session.metadata?.orderId,
    amount: session.amount_total,
    currency: session.currency,
    paymentStatus: session.payment_status,
  });

  const { metadata } = session;
  const orderId = metadata?.orderId;
  const userId = metadata?.userId;

  if (!orderId) {
    console.error('Missing orderId in session metadata');
    return;
  }

  // TODO: Update order status in your database
  // await updateOrderStatus(orderId, {
  //   status: 'paid',
  //   stripeSessionId: session.id,
  //   stripeCustomerId: session.customer as string,
  //   amount: session.amount_total,
  //   currency: session.currency,
  // });

  // TODO: Fulfill the order
  // await fulfillOrder(orderId);

  // TODO: Send confirmation email
  // await sendOrderConfirmationEmail(userId, orderId);

  console.log(`Order ${orderId} marked as paid and queued for fulfillment`);
}

/**
 * Handle async payment success (e.g., bank transfers)
 */
async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session): Promise<void> {
  console.log('Async payment succeeded:', session.id);
  await handleCheckoutCompleted(session);
}

/**
 * Handle async payment failure
 */
async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
  console.log('Async payment failed:', session.id);
  
  const orderId = session.metadata?.orderId;
  const userId = session.metadata?.userId;

  if (!orderId) {
    console.error('Missing orderId in session metadata');
    return;
  }

  // TODO: Update order status to failed
  // await updateOrderStatus(orderId, { status: 'payment_failed' });

  // TODO: Send payment failed notification
  // await sendPaymentFailedEmail(userId, orderId);

  console.log(`Order ${orderId} marked as payment failed`);
}

/**
 * Handle successful charge
 */
async function handleChargeSucceeded(charge: Stripe.Charge): Promise<void> {
  console.log('Charge succeeded:', {
    chargeId: charge.id,
    amount: charge.amount,
    currency: charge.currency,
  });
  
  // Additional charge-level logic if needed
}

/**
 * Handle failed charge
 */
async function handleChargeFailed(charge: Stripe.Charge): Promise<void> {
  console.error('Charge failed:', {
    chargeId: charge.id,
    failureMessage: charge.failure_message,
    failureCode: charge.failure_code,
  });
  
  // TODO: Notify user about failed payment
}

/**
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  console.log('Payment intent succeeded:', {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
  });
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  console.error('Payment intent failed:', {
    paymentIntentId: paymentIntent.id,
    lastPaymentError: paymentIntent.last_payment_error?.message,
  });
}

/**
 * Handle subscription lifecycle events
 */
async function handleSubscriptionChange(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  
  console.log(`Subscription ${event.type}:`, {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  // TODO: Update subscription in your database
  // await updateSubscription(subscription.id, {
  //   status: subscription.status,
  //   currentPeriodEnd: new Date(subscription.current_period_end * 1000),
  //   cancelAtPeriodEnd: subscription.cancel_at_period_end,
  // });
}

/**
 * Handle successful invoice payment
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  console.log('Invoice paid:', {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
    amount: invoice.amount_paid,
  });

  // TODO: Record invoice payment in your system
}

/**
 * Handle failed invoice payment
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.error('Invoice payment failed:', {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
    attemptCount: invoice.attempt_count,
  });

  // TODO: Implement retry logic or notify customer
}
