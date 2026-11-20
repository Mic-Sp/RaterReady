import type { NextConfig } from "next";

// Keep the synthetic stakeholder preview free of framework branding and developer controls.
const nextConfig: NextConfig = {
  devIndicators: false,
  // Browser QA must not take over a learner's running dev server or its build lock.
  distDir: process.env.RATERREADY_BROWSER_TEST === "true" ? ".next-browser-tests" : ".next",
};

export default nextConfig;
