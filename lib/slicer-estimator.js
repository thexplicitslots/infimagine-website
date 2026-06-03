const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "quote-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "")
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/, "")
    .replace(/\/storage\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { key, url };
}

function workerConfig() {
  const rawUrl = process.env.SLICER_WORKER_URL || "";
  let url = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/slice";
      url = parsed.toString();
    }
  } catch {
    url = rawUrl;
  }

  return {
    secret: process.env.SLICER_WORKER_SECRET || "",
    url,
  };
}

function isWorkerConfigured() {
  const config = workerConfig();
  return Boolean(config.url && config.secret);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, limit = 400) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

async function createSignedStorageUrl(path) {
  const { key, url } = supabaseConfig();
  if (!key || !url) throw new Error("Supabase is not configured.");
  if (!path) throw new Error("Attachment path is missing.");

  const encodedPath = String(path)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const response = await fetch(`${url}/storage/v1/object/sign/${SUPABASE_STORAGE_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Could not create signed STL URL.");
  }

  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath) throw new Error("Supabase did not return a signed URL.");
  return signedPath.startsWith("http") ? signedPath : `${url}/storage/v1${signedPath}`;
}

function normalizeWorkerResult(result) {
  const status = cleanText(result.status, 80) || "complete";
  const error = cleanText(result.error || result.slicer_error, 800);
  const printTimeMinutes = cleanNumber(
    result.estimated_print_time_minutes ?? result.printTimeMinutes ?? result.print_time_minutes,
  );
  const filamentGrams = cleanNumber(
    result.estimated_filament_grams ?? result.filamentGrams ?? result.filament_grams,
  );
  const filamentCost = cleanNumber(
    result.estimated_filament_cost ?? result.filamentCost ?? result.filament_cost,
  );
  const profile = cleanText(result.slicer_profile || result.profile || result.profileName, 240);

  return {
    estimated_filament_cost: filamentCost,
    estimated_filament_grams: filamentGrams,
    estimated_print_time_minutes: printTimeMinutes,
    slice_status: error ? "failed" : status,
    slicer_error: error,
    slicer_profile: profile,
  };
}

async function callSlicerWorker(payload) {
  const config = workerConfig();
  if (!isWorkerConfigured()) {
    return {
      configured: false,
      message: "Slicer worker not configured",
    };
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      "Content-Type": "application/json",
      "X-Slicer-Worker-Secret": config.secret,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const detail = data.error || data.message || text.slice(0, 220).replace(/\s+/g, " ").trim();
    throw new Error(detail ? `Slicer worker request failed (${response.status}): ${detail}` : `Slicer worker request failed (${response.status}).`);
  }

  if (response.status === 202 || data.status === "queued") {
    return {
      configured: true,
      result: normalizeWorkerResult({ status: "queued", slicer_profile: data.slicer_profile || data.profile }),
      worker: data,
    };
  }

  return {
    configured: true,
    result: normalizeWorkerResult(data),
    worker: data,
  };
}

module.exports = {
  callSlicerWorker,
  createSignedStorageUrl,
  isWorkerConfigured,
  normalizeWorkerResult,
};
