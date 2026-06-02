const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const DEFAULT_TIMEOUT_MS = 120_000;

function slicerConfig() {
  return {
    cliPath: process.env.PRUSASLICER_CLI_PATH || process.env.PRUSASLICER_PATH || "",
    configPath: process.env.PRUSASLICER_CONFIG_PATH || "",
    costPerKg: Number(process.env.PRUSASLICER_MATERIAL_COST_PER_KG || 0),
    timeoutMs: Number(process.env.PRUSASLICER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function isConfigured() {
  return Boolean(slicerConfig().cliPath);
}

function cleanFileName(value) {
  return String(value || "model.stl").replace(/[^\w.\-]+/g, "-").slice(0, 90) || "model.stl";
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PrusaSlicer timed out before finishing."));
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);

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

function parseGcode(gcode, costPerKg) {
  const grams = Number(gcode.match(/filament used \[g\]\s*=\s*([0-9.]+)/i)?.[1] || 0);
  const cm3 = Number(gcode.match(/filament used \[cm3\]\s*=\s*([0-9.]+)/i)?.[1] || 0);
  const meters = Number(gcode.match(/filament used \[m\]\s*=\s*([0-9.]+)/i)?.[1] || 0);
  const costMatch = gcode.match(/filament cost\s*=\s*([0-9.]+)/i);
  const timeMatch = gcode.match(/estimated printing time(?: \([^)]+\))?\s*=\s*(.+)/i);
  const cost = costMatch ? Number(costMatch[1]) : grams && costPerKg ? (grams / 1000) * costPerKg : 0;

  return {
    cost: cost ? Math.round(cost) : null,
    filamentCm3: cm3 || null,
    filamentMeters: meters || null,
    grams: grams || null,
    printTime: timeMatch?.[1]?.trim() || "",
  };
}

async function estimateWithPrusaSlicer(file) {
  const config = slicerConfig();
  if (!isConfigured()) {
    return {
      configured: false,
      message: "PrusaSlicer CLI is not configured on this server.",
    };
  }

  if (!file?.url || !String(file.name || "").toLowerCase().endsWith(".stl")) {
    throw new Error("A stored STL file is required for slicer estimates.");
  }

  const response = await fetch(file.url);
  if (!response.ok) throw new Error("Could not download the STL file for slicing.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "infimagine-slice-"));
  const inputPath = path.join(tempDir, cleanFileName(file.name));
  const outputPath = path.join(tempDir, `${randomUUID()}.gcode`);

  try {
    await fs.writeFile(inputPath, Buffer.from(await response.arrayBuffer()));

    const args = [];
    if (config.configPath) args.push("--load", config.configPath);
    args.push("--export-gcode", "--output", outputPath, inputPath);

    const result = await runCommand(config.cliPath, args, {
      timeoutMs: Number.isFinite(config.timeoutMs) ? config.timeoutMs : DEFAULT_TIMEOUT_MS,
    });
    const gcode = await fs.readFile(outputPath, "utf8");
    const parsed = parseGcode(gcode, config.costPerKg);

    return {
      configured: true,
      command: path.basename(config.cliPath),
      fileName: file.name,
      ...parsed,
      raw: result.stderr || result.stdout,
    };
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

module.exports = {
  estimateWithPrusaSlicer,
  isConfigured,
};
