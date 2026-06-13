import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";

const PORT = 4174;
const BASE_URL = `http://127.0.0.1:${PORT}/demo/`;
const FRAME_DIR = "demo/frames";
const VIDEO_PATH = "docs/assets/autoapplyops-demo.mp4";
const GIF_PATH = "docs/assets/autoapplyops-demo.gif";

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
      action: async () => {
        await page.locator('[data-action="hot"]').click();
      },
      label: "1. Hot Lead",
      caption: "A strong application updates KPIs, the funnel, queue, and AI Copilot at once."
    },
    {
      file: `${FRAME_DIR}/02-ai-fallback.png`,
      action: async () => {
        await page.locator('[data-action="fallback"]').click();
      },
      label: "2. AI Fallback",
      caption: "When the model is unavailable, the dashboard switches to deterministic rules."
    },
    {
      file: `${FRAME_DIR}/03-duplicate-review.png`,
      action: async () => {
        await page.locator('[data-action="duplicate"]').click();
      },
      label: "3. Duplicate guard",
      caption: "Duplicate routing protects recruiters from repeated webhook replays."
    },
    {
      file: `${FRAME_DIR}/04-human-review.png`,
      action: async () => {
        await page.locator('[data-action="review"]').click();
      },
      label: "4. Human Review",
      caption: "Amber review mode locks advance controls and shows the 24h decision SLA."
    },
    {
      file: `${FRAME_DIR}/05-learning-signal.png`,
      action: async () => {
        await page.locator("#openReport").click();
      },
      label: "5. Calibration",
      caption: "Learning Signal turns feedback into calibration evidence and training exports."
    },
    {
      file: `${FRAME_DIR}/06-invalid.png`,
      action: async () => {
        await page.locator('[data-action="invalid"]').click();
      },
      label: "6. Repair path",
      caption: "Invalid payloads are stopped before evaluation and marked for repair."
    }
  ];

  for (const shot of shots) {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await shot.action();
    await page.waitForTimeout(350);
    await page.evaluate(({ label, caption }) => {
      let banner = document.querySelector(".recording-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "recording-banner";
        banner.style.cssText =
          "position:fixed;left:30px;right:30px;bottom:24px;z-index:20;display:flex;gap:18px;align-items:center;padding:18px 22px;border-radius:8px;background:#005f58;color:white;box-shadow:0 18px 60px rgba(0,0,0,.18);font-family:Inter,system-ui,sans-serif";
        document.body.append(banner);
      }
      banner.innerHTML = `<strong style="font-size:24px;white-space:nowrap">${label}</strong><span style="font-size:20px;font-weight:800;line-height:1.25">${caption}</span>`;
    }, { label: shot.label, caption: shot.caption });
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

  const gif = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      VIDEO_PATH,
      "-vf",
      "fps=6,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      GIF_PATH
    ],
    { stdio: "inherit" }
  );

  if (gif.status !== 0) {
    throw new Error(`ffmpeg gif render failed with status ${gif.status}`);
  }

  console.log(`Rendered ${VIDEO_PATH} and ${GIF_PATH}`);
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
