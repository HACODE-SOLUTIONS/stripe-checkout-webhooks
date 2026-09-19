/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure raw body is available for webhook signature verification
  experimental: {},
};

module.exports = nextConfig;
