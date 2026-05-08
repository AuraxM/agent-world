import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    globals: false,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    env: { TZ: "UTC" },
  },
});
