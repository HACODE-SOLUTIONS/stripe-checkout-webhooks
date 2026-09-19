export default function Home() {
  return (
    <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Stripe Checkout + Webhooks DevSpec</h1>
      <p>Production-grade Stripe Checkout and webhook patterns for AI coding agents.</p>
      
      <section style={{ marginTop: '2rem', padding: '1.5rem', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2>🚀 Quick Start</h2>
        <ol>
          <li>Read <code>DEVSPEC.md</code> for complete implementation patterns</li>
          <li>Check <code>app/api/checkout/route.ts</code> for checkout session creation</li>
          <li>Review <code>app/api/webhooks/stripe/route.ts</code> for webhook handling</li>
          <li>Use <code>SKILL.md</code> with your AI coding assistant</li>
        </ol>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>📚 API Endpoints</h2>
        <ul>
          <li><strong>POST /api/checkout</strong> - Create Stripe Checkout Session</li>
          <li><strong>POST /api/webhooks/stripe</strong> - Handle Stripe webhook events</li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>🔐 Environment Variables</h2>
        <p>Copy <code>.env.example</code> to <code>.env.local</code> and add your Stripe keys:</p>
        <ul>
          <li><code>STRIPE_SECRET_KEY</code></li>
          <li><code>STRIPE_PUBLISHABLE_KEY</code></li>
          <li><code>STRIPE_WEBHOOK_SECRET</code></li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>🧪 Testing Locally</h2>
        <pre style={{ background: '#000', color: '#0f0', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`# Install Stripe CLI
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed`}
        </pre>
      </section>

      <footer style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid #ddd', textAlign: 'center' }}>
        <p>
          Built with ❤️ by{' '}
          <a href="https://hacode.solutions" target="_blank" rel="noopener noreferrer" style={{ color: '#0070f3' }}>
            HACODE SOLUTIONS
          </a>
        </p>
        <p>
          <a href="https://hacode-solutions-site.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: '#0070f3' }}>
            Live Demo
          </a>
          {' | '}
          <a href="https://github.com/hacode-solutions/stripe-checkout-webhooks" target="_blank" rel="noopener noreferrer" style={{ color: '#0070f3' }}>
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}
