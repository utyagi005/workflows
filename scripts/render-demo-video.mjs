import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}/demo/`;
const FRAME_DIR = "demo/frames";
const VIDEO_PATH = "docs/assets/autoapplyops-demo.mp4";

mkdirSync(FRAME_DIR, { recursive: true });
mkdirSync("docs/assets", { recursive: true });

const server = spawn("npx", ["http-server", ".", "-p", String(PORT), "-c-1", "--silent"], {
  stdio: "ignore"
});

try {
  await waitForServer(BASE_URL);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });

  const shots = [
    {
      file: `${FRAME_DIR}/01-hot-lead.png`,
      payload: "high-priority-application.json",
      caption: "Webhook intake produces a hot-lead triage report."
    },
    {
      file: `${FRAME_DIR}/02-review-queue.png`,
      payload: "review-application.json",
      caption: "Medium-fit records go to a review queue."
    },
    {
      file: `${FRAME_DIR}/03-invalid.png`,
      payload: "invalid-application.json",
      caption: "Invalid payloads return clear repair instructions."
    },
    {
      file: `${FRAME_DIR}/04-workflow-json.png`,
      payload: "high-priority-application.json",
      caption: "The exported n8n JSON is credential-free and importable."
    }
  ];

  for (const shot of shots) {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.selectOption("#payloadSelect", shot.payload);
    await page.waitForTimeout(400);
    await page.evaluate((caption) => {
      let banner = document.querySelector(".recording-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "recording-banner";
        banner.style.cssText =
          "position:fixed;left:30px;right:30px;bottom:24px;z-index:20;padding:16px 20px;border-radius:8px;background:#005f58;color:white;font:800 22px Inter,system-ui,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.18)";
        document.body.append(banner);
      }
      banner.textContent = caption;
    }, shot.caption);
    await page.screenshot({ path: shot.file, fullPage: false });
  }

  await browser.close();

  const concatPath = `${FRAME_DIR}/concat.txt`;
  writeFileSync(
    concatPath,
    shots.map((shot) => `file '${process.cwd()}/${shot.file}'\nduration 3`).join("\n") +
      `\nfile '${process.cwd()}/${shots.at(-1).file}'\nduration 1\n`
  );

  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-vf",
      "scale=1440:940:force_original_aspect_ratio=decrease,pad=1440:940:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-r",
      "30",
      "-movflags",
      "+faststart",
      VIDEO_PATH
    ],
    { stdio: "inherit" }
  );

  if (ffmpeg.status !== 0) {
    throw new Error(`ffmpeg failed with status ${ffmpeg.status}`);
  }

  console.log(`Rendered ${VIDEO_PATH}`);
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
