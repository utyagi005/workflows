import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}/demo/`;

mkdirSync("docs/assets", { recursive: true });

const server = spawn("npx", ["http-server", ".", "-p", String(PORT), "-c-1", "--silent"], {
  stdio: "ignore"
});

try {
  await waitForServer(BASE_URL);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: "docs/assets/demo-dashboard.png", fullPage: true });

  await page.selectOption("#payloadSelect", "review-application.json");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/assets/demo-review-queue.png", fullPage: true });

  await page.selectOption("#payloadSelect", "invalid-application.json");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/assets/demo-invalid-payload.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: "docs/assets/demo-mobile.png", fullPage: true });

  await browser.close();
  console.log("Captured demo screenshots in docs/assets/.");
} finally {
  server.kill("SIGTERM");
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Server did not start at ${url}`);
}
