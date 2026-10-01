import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

// Kept apart from `vite.config.ts`: the tests need neither Tailwind nor the node polyfills, and
// both slow a run down for nothing.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "netlify/**/*.test.ts"],
    restoreMocks: true,
  },
});
