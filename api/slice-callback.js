const { updateSliceResult } = require("../lib/quote-store");
const { normalizeWorkerResult } = require("../lib/slicer-estimator");

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readPayload(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000) request.destroy();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function hasWorkerSecret(request) {
  const configured = process.env.SLICER_WORKER_SECRET || "";
  const headerSecret = request.headers["x-slicer-worker-secret"];
  const bearerSecret = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return Boolean(configured && (headerSecret === configured || bearerSecret === configured));
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    if (!hasWorkerSecret(request)) {
      return sendJson(response, 401, { error: "Unauthorized slicer callback." });
    }

    const payload = await readPayload(request);
    const quoteRequestId = String(payload.quoteRequestId || "");
    if (!quoteRequestId) {
      return sendJson(response, 400, { error: "quoteRequestId is required." });
    }

    const normalized = normalizeWorkerResult(payload);
    const finalStatus = normalized.slice_status === "failed" ? "failed" : "complete";
    const updated = await updateSliceResult(quoteRequestId, {
      ...normalized,
      slice_status: finalStatus,
      sliced_at: new Date().toISOString(),
    });

    return sendJson(response, 200, {
      request: updated.record,
      slice: updated.record?.slice,
      status: finalStatus,
    });
  } catch (error) {
    return sendJson(response, 500, {
      error: error.message || "Slice callback failed.",
      status: "failed",
    });
  }
};
