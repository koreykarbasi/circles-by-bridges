import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5000",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "echo 'server already running'",
      url: "http://localhost:5000/api/auth/me",
      reuseExistingServer: true,
      timeout: 15000,
    },
    {
      command: "echo 'expo already running'",
      url: "http://localhost:8081",
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
});
