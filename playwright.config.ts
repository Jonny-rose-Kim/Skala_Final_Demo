import { defineConfig } from "@playwright/test";

/**
 * E2E/visual QA runs in the system Chrome (channel "chrome") so the real GPU is used.
 * WebGL2 is the default path on this Linux Chrome; the WebGPU project adds the flags required here.
 * Headed mode is used because headless Chrome falls back to software WebGPU (SwiftShader).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "qa/playwright-report" }]],
  outputDir: "qa/test-results",
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1600, height: 900 },
    headless: false,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chrome-webgl2",
      use: { channel: "chrome", launchOptions: { args: ["--ignore-gpu-blocklist", "--force-device-scale-factor=1"] } },
    },
    {
      name: "chrome-webgpu",
      use: { channel: "chrome", launchOptions: { args: ["--ignore-gpu-blocklist", "--force-device-scale-factor=1", "--enable-unsafe-webgpu", "--enable-features=Vulkan"] } },
    },
  ],
});
