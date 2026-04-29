import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["test/setup/global-artifacts.ts"],
    include: ["test/**/*.test.ts"],
  },
});
