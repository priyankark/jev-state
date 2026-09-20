import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:5174",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
  reporter: "list",
  webServer: {
    command: "npm run dev",
    env: {
      PORT: "5174",
      STUDIO_PUBLIC_DEMO: "1",
      STUDIO_ACCESS_TOKEN: "",
      TYPESAFE_API_KEY: "",
      OPENAI_API_KEY: "",
    },
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
  },
  outputDir: ".local/test-results",
});
