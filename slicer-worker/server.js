const express = require("express");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_STL_BYTES = Number(process.env.MAX_STL_BYTES || 80 * 1024 * 1024);

app.use(express.json({ limit: "1mb" }));

function authorize(request) {
  const headerSecret = request.headers["x-slicer-worker-secret"];
  const bearerSecret = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return Boolean(process.env.SLICER_WORKER_SECRET && (headerSecret === process.env.SLICER_WORKER_SECRET || bearerSecret === process.env.SLICER_WORKER_SECRET));
}

function cleanFilename(filename) {
  return path.basename(String(filename || "model.stl")).replace(/[^\w.\-]+/g, "-").slice(0, 90) || "model.stl";
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    const timeout = windowlessTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PrusaSlicer timed out."));
    }, Number(process.env.SLICER_TIMEOUT_MS || 180000));

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `PrusaSlicer exited with code ${code}.`));
        return;
      }
      resolve({ stderr, stdout });
    });
  });
}

function windowlessTimeout(callback, ms) {
  return setTimeout(callback, ms);
}

function parseDurationMinutes(text) {
  const value = String(text || "").toLowerCase();
  const days = Number(value.match(/(\d+(?:\.\d+)?)\s*d/)?.[1] || 0);
  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*h/)?.[1] || 0);
  const minutes = Number(value.match(/(\d+(?:\.\d+)?)\s*m/)?.[1] || 0);
  const seconds = Number(value.match(/(\d+(?:\.\d+)?)\s*s/)?.[1] || 0);
  const total = days * 1440 + hours * 60 + minutes + seconds / 60;
  return total ? Math.round(total) : null;
}

function parseGcode(gcode) {
  const grams = Number(gcode.match(/filament used \[g\]\s*=\s*([0-9.]+)/i)?.[1] || 0);
  const costMatch = gcode.match(/filament cost\s*=\s*([0-9.]+)/i);
  const timeText = gcode.match(/estimated printing time(?: \([^)]+\))?\s*=\s*(.+)/i)?.[1]?.trim() || "";
  const costPerKg = Number(process.env.MATERIAL_COST_PER_KG || 1200);
  const fallbackCost = grams ? Math.round((grams / 1000) * costPerKg) : null;

  return {
    estimated_filament_cost: costMatch ? Math.round(Number(costMatch[1])) : fallbackCost,
    estimated_filament_grams: grams || null,
    estimated_print_time_minutes: parseDurationMinutes(timeText),
    slicer_profile: process.env.SLICER_PROFILE_NAME || "PrusaSlicer worker profile",
    status: "complete"
  };
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download STL: ${response.status}`);
  }

  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_STL_BYTES) {
    throw new Error("STL is too large for this worker.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_STL_BYTES) {
    throw new Error("STL is too large for this worker.");
  }

  await fs.writeFile(outputPath, buffer);
}

app.get("/", (_, response) => {
  response.json({ service: "InfiMagine slicer worker", status: "live" });
});

app.post("/slice", async (request, response) => {
  if (!authorize(request)) {
    return response.status(401).json({ error: "Unauthorized worker request", status: "failed" });
  }

  const { attachmentPath, filename, material, quoteRequestId, signedUrl } = request.body || {};
  if (!quoteRequestId || !attachmentPath || !signedUrl || !filename) {
    return response.status(400).json({ error: "Missing quoteRequestId, attachmentPath, signedUrl, or filename.", status: "failed" });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "infimagine-slice-"));
  const stlPath = path.join(tempDir, cleanFilename(filename));
  const gcodePath = path.join(tempDir, "output.gcode");

  try {
    await downloadFile(signedUrl, stlPath);

    const args = [];
    if (process.env.PRUSASLICER_CONFIG_PATH) {
      args.push("--load", process.env.PRUSASLICER_CONFIG_PATH);
    }
    args.push("--export-gcode", "--output", gcodePath, stlPath);

    await run(process.env.PRUSASLICER_CLI || "prusa-slicer", args);

    const gcode = await fs.readFile(gcodePath, "utf8");
    response.json({
      ...parseGcode(gcode),
      attachmentPath,
      material,
      quoteRequestId
    });
  } catch (error) {
    response.status(500).json({
      error: error.message || "Slicing failed.",
      status: "failed"
    });
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

app.listen(PORT, () => {
  console.log(`InfiMagine slicer worker listening on ${PORT}`);
});
