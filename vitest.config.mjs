import { defineConfig } from "vitest/config";

// Auth.js imports Next.js extensionless modules; transform it through Vite as Next does.
export default defineConfig({
  test: { server: { deps: { inline: ["next-auth"] } } },
});
