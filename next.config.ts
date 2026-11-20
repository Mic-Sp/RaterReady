import type { NextConfig } from "next";

// Keep the synthetic stakeholder preview free of framework branding and developer controls.
const nextConfig: NextConfig = { devIndicators: false };

export default nextConfig;
