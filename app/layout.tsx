import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stripe Checkout + Webhooks DevSpec',
  description: 'Production-grade Stripe Checkout and webhook patterns for AI coding agents by HACODE SOLUTIONS',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
