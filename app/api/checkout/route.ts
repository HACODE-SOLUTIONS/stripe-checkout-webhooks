/**
 * Stripe Checkout Session Creation API
 * 
 * This endpoint creates a Stripe Checkout Session and returns the session URL
 * for redirecting the user to Stripe's hosted checkout page.
 * 
 * @route POST /api/checkout
 * @see DEVSPEC.md - Checkout Session Creation section
 * @see https://stripe.com/docs/payments/checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

interface CheckoutRequestBody {
  priceId: string;
  quantity?: number;
  userId?: string;
  customerId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CheckoutRequestBody = await req.json();
    const { priceId, quantity = 1, userId, customerId } = body;

    // Validate required inputs
    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing priceId' },
        { status: 400 }
      );
    }

    if (typeof quantity !== 'number' || quantity < 1) {
      return NextResponse.json(
        { error: 'Invalid quantity' },
        { status: 400 }
      );
    }

    // Generate unique order ID (replace with your order creation logic)
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create Checkout Session
    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      mode: 'payment', // Use 'subscription' for recurring payments
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      customer: customerId, // Optional: attach to existing Stripe customer
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/cancel`,
      metadata: {
        // Store your application data here for webhook processing
        orderId,
        userId: userId || 'guest',
        // Add any other data you need in the webhook handler
      },
      // Optional configurations
      billing_address_collection: 'required',
      allow_promotion_codes: true,
    });

    console.log('Checkout session created:', {
      sessionId: session.id,
      orderId,
      amount: session.amount_total,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      orderId, // Return orderId so your frontend can track it
    });

  } catch (error: any) {
    console.error('Checkout session creation failed:', error);

    // Handle specific Stripe errors
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return NextResponse.json(
        { error: 'Invalid request parameters', details: error.message },
        { status: 400 }
      );
    }

    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      console.error('Stripe authentication error - check your API key');
      return NextResponse.json(
        { error: 'Payment configuration error' },
        { status: 500 }
      );
    }

    // Generic error response
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
