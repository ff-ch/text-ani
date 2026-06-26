import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdtemp, rm } from "fs/promises";
import { createReadStream } from "fs";
import { tmpdir } from "os";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4444;

// Active export jobs: a single long-lived ffmpeg process per export, fed raw
// RGBA frames over stdin. No PNG encoding, no per-frame temp files — ffmpeg
// encodes frames as they stream in (render/encode run concurrently).
const jobs = new Map();

app.use(express.static(join(__dirname, "public")));
app.use("/api/export/frame", express.raw({ type: "*/*", limit: "256mb" }));
app.use(express.json({ limit: "1mb" }));

app.post("/api/export/start", async (req, res) => {
  const { width, height, fps = 25 } = req.body || {};
  const intInRange = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!intInRange(width, 1, 8192) || !intInRange(height, 1, 8192) || !intInRange(fps, 1, 120))
    return res.status(400).json({ error: "invalid width/height/fps" });

  const dir = await mkdtemp(join(tmpdir(), "text-ani-"));
  const out = join(dir, "output.mov");
  const args = [
    "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba",
    "-s", `${width}x${height}`, "-r", String(fps),
    "-i", "-",                   // raw frames from stdin
    "-c:v", "prores_ks",
    "-profile:v", "4444",
    "-pix_fmt", "yuva444p10le",  // alpha channel
    "-alpha_bits", "16",
    "-vendor", "apl0",
    out,
  ];
  const proc = spawn("ffmpeg", args, { env: process.env });
  let log = "";
  proc.stderr.on("data", (d) => { log += d.toString(); });

  const id = Math.random().toString(36).slice(2);
  const job = { dir, out, proc, log: () => log, exit: null };
  job.done = new Promise((resolve) => {
    proc.on("error", (err) => { job.error = err.message; resolve(-1); });
    proc.on("close", (code) => { job.exit = code; resolve(code); });
  });
  jobs.set(id, job);
  res.json({ id });
});

// Stream one raw RGBA frame into ffmpeg's stdin, respecting backpressure.
app.post("/api/export/frame", (req, res) => {
  const job = jobs.get(req.query.job);
  if (!job) return res.status(404).json({ error: "unknown job" });
  if (job.exit !== null) return res.status(500).json({ error: "encoder exited early", log: job.log().slice(-2000) });

  const ok = job.proc.stdin.write(req.body, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: "write failed: " + err.message });
  });
  if (ok) res.json({ ok: true });
  else job.proc.stdin.once("drain", () => { if (!res.headersSent) res.json({ ok: true }); });
});

// Close stdin, wait for ffmpeg to finish, stream the .mov back.
app.post("/api/export/finish", async (req, res) => {
  const job = jobs.get(req.query.job);
  if (!job) return res.status(404).json({ error: "unknown job" });

  job.proc.stdin.end();
  const code = await job.done;
  if (code !== 0) {
    console.error(job.log());
    jobs.delete(req.query.job);
    await rm(job.dir, { recursive: true, force: true }).catch(() => {});
    return res.status(500).json({ error: "ffmpeg exited " + code, log: job.log().slice(-2000) });
  }

  res.setHeader("Content-Type", "video/quicktime");
  res.setHeader("Content-Disposition", 'attachment; filename="text-animation.mov"');
  const stream = createReadStream(job.out);
  stream.pipe(res);
  stream.on("close", async () => {
    jobs.delete(req.query.job);
    await rm(job.dir, { recursive: true, force: true }).catch(() => {});
  });
});

// Cancel an in-progress export: kill ffmpeg and clean up.
app.post("/api/export/cancel", async (req, res) => {
  const job = jobs.get(req.query.job);
  if (!job) return res.json({ ok: true });   // already finished/gone
  jobs.delete(req.query.job);
  try { job.proc.stdin.destroy(); } catch {}
  try { job.proc.kill("SIGKILL"); } catch {}
  await rm(job.dir, { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

// Bind to loopback only — this tool's only client is the local browser, so there
// is no reason to expose the ffmpeg/export API to other machines on the network.
app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  text-ani running →  http://localhost:${PORT}\n`);
});
