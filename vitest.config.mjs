import { defineConfig } from "vitest/config";

// Auth.js imports Next.js extensionless modules; transform it through Vite as Next does.
export default defineConfig({
  test: { exclude: ["**/node_modules/**", "**/tests/browser/**", "**/.next-browser-tests/**"], server: { deps: { inline: ["next-auth"] } } },
});
