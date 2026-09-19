# Stripe Checkout + Webhooks DevSpec

**Free DevSpec by [HACODE SOLUTIONS](https://hacode.solutions)**

Production-grade Stripe Checkout and webhook patterns for AI coding agents. This pack provides comprehensive guidance, implementation examples, and AI-agent skills for building secure, idempotent payment flows.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://hacode-solutions-site.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## What's Inside

This DevSpec pack contains:

- **[DEVSPEC.md](./DEVSPEC.md)** — Complete specification covering:
  - Stripe Checkout session creation and configuration
  - Webhook endpoint implementation and verification
  - Idempotency patterns for payment operations
  - Test mode vs live mode best practices
  - Acceptance tests and validation strategies
  - AI agent prompts and integration patterns

- **[SKILL.md](./SKILL.md)** — AI agent skill file for Cursor and other AI coding assistants

- **API Implementation Examples** — Production-ready Next.js API routes demonstrating:
  - Checkout session creation (`/api/checkout`)
  - Webhook event handling (`/api/webhooks/stripe`)
  - Proper error handling and logging
  - Type-safe implementations

## Quick Start

### For AI Agents

Point your AI coding assistant to this repo or use the SKILL.md file:

```typescript
// The AI agent will guide you through implementing Stripe Checkout + webhooks
// following production best practices and security patterns
```

### For Developers

1. **Review the DevSpec**: Start with [DEVSPEC.md](./DEVSPEC.md) for architecture and patterns
2. **Explore Examples**: Check the `/api` directory for implementation templates
3. **Install Dependencies**: `npm install` to get the required packages
4. **Configure Stripe**: Set up your environment variables (see DEVSPEC.md)
5. **Test Locally**: Use Stripe CLI for local webhook testing

## Key Features

### 🔐 Security First
- Webhook signature verification
- HMAC validation for Stripe events
- Secure secret management patterns
- CORS and rate limiting guidance

### 🔄 Idempotency
- Event deduplication strategies
- Idempotency key patterns
- State machine patterns for payment flows

### 🧪 Testing
- Test mode vs live mode configuration
- Local webhook testing with Stripe CLI
- Acceptance test patterns
- Mock strategies for CI/CD

### 🤖 AI-Optimized
- Clear prompts for common Stripe operations
- Error handling guidance for AI agents
- Type definitions and validation schemas
- Step-by-step implementation guides

## Use Cases

This DevSpec pack covers:

- **One-time payments** with Checkout Sessions
- **Subscription billing** setup and management
- **Webhook event processing** (payment success, failures, refunds)
- **Customer portal** integration patterns
- **Invoice generation** and handling
- **Payment status tracking** and reconciliation

## Environment Setup

```bash
# Stripe API keys (get from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Application URLs
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Testing Webhooks Locally

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
```

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. Create checkout
       ▼
┌─────────────────┐
│  /api/checkout  │ ← Create Checkout Session
└────────┬────────┘
         │ 2. Return session URL
         ▼
┌─────────────────┐
│  Stripe Hosted  │
│  Checkout Page  │
└────────┬────────┘
         │ 3. Customer completes payment
         ▼
┌──────────────────┐
│  Stripe Backend  │
└────────┬─────────┘
         │ 4. Send webhook event
         ▼
┌─────────────────────┐
│ /api/webhooks/stripe│ ← Verify & process event
└─────────────────────┘
         │ 5. Update database
         │ 6. Send confirmation email
         │ 7. Fulfill order
         ▼
┌─────────────────┐
│  Your Business  │
│      Logic      │
└─────────────────┘
```

## Learn More

- **HACODE SOLUTIONS**: [https://hacode.solutions](https://hacode.solutions)
- **Live Demo**: [https://hacode-solutions-site.vercel.app](https://hacode-solutions-site.vercel.app)
- **Stripe Documentation**: [https://stripe.com/docs](https://stripe.com/docs)
- **Stripe Checkout**: [https://stripe.com/docs/payments/checkout](https://stripe.com/docs/payments/checkout)
- **Webhook Guide**: [https://stripe.com/docs/webhooks](https://stripe.com/docs/webhooks)

## Contributing

Contributions are welcome! This is an open-source DevSpec pack designed to help developers and AI agents implement Stripe payments correctly.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## About HACODE SOLUTIONS

[HACODE SOLUTIONS](https://hacode.solutions) creates production-grade development specifications, patterns, and tools for AI-assisted software development.

---

**Built with ❤️ by [HACODE SOLUTIONS](https://hacode.solutions)**
