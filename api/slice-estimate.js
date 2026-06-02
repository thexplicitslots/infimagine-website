const { hasValidSession } = require("../lib/admin-auth");
const { getQuoteRequest, updateSliceResult } = require("../lib/quote-store");
const { callSlicerWorker, createSignedStorageUrl, isWorkerConfigured } = require("../lib/slicer-estimator");

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
      if (body.length > 40_000) request.destroy();
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

function findAttachment(quote, attachmentPath) {
  const attachments = quote.attachments || [];
  return attachments.find((file) => file.path === attachmentPath && String(file.name || "").toLowerCase().endsWith(".stl"));
}

function workerPayload(quote, attachment, signedUrl) {
  return {
    attachmentPath: attachment.path,
    filename: attachment.name,
    finish: quote.finish,
    material: quote.material,
    profile: quote.slice?.profile || "",
    profileInfo: {
      color: quote.color,
      dimensions: quote.dimensions,
      finish: quote.finish,
      quantity: quote.quantity,
      strength: quote.strength,
    },
    quoteRequestId: quote.id,
    signedUrl,
  };
}

module.exports = async function handler(request, response) {
  let payload = {};
  try {
    if (!hasValidSession(request)) {
      return sendJson(response, 401, { error: "Admin session required." });
    }

    if (request.method !== "POST") {
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    payload = await readPayload(request);
    const quoteRequestId = String(payload.quoteRequestId || "");
    const attachmentPath = String(payload.attachmentPath || "");

    if (!quoteRequestId || !attachmentPath) {
      return sendJson(response, 400, { error: "quoteRequestId and attachmentPath are required." });
    }

    const quoteResult = await getQuoteRequest(quoteRequestId);
    if (!quoteResult.configured || !quoteResult.record) {
      return sendJson(response, 404, { error: "Quote request not found." });
    }

    const quote = quoteResult.record;
    const attachment = findAttachment(quote, attachmentPath);
    if (!attachment) {
      return sendJson(response, 404, { error: "Selected STL attachment was not found on this request." });
    }

    if (!isWorkerConfigured()) {
      const updated = await updateSliceResult(quote.id, {
        slice_status: "not_configured",
        slicer_error: "Slicer worker not configured",
        sliced_at: new Date().toISOString(),
      });
      return sendJson(response, 202, {
        configured: false,
        message: "Slicer worker not configured",
        request: updated.record,
        slice: updated.record?.slice,
        status: "not_configured",
      });
    }

    const queued = await updateSliceResult(quote.id, {
      slice_status: "queued",
      slicer_error: "",
      sliced_at: new Date().toISOString(),
    });
    const signedUrl = await createSignedStorageUrl(attachment.path);
    const worker = await callSlicerWorker(workerPayload(quote, attachment, signedUrl));
    const workerStatus = worker.result.slice_status;
    const finalStatus = ["failed", "queued"].includes(workerStatus) ? workerStatus : "complete";
    const sliceUpdates = {
      ...worker.result,
      slice_status: finalStatus,
      sliced_at: new Date().toISOString(),
    };
    const complete = await updateSliceResult(quote.id, sliceUpdates);
    const message = finalStatus === "failed"
      ? `Slicing failed: ${sliceUpdates.slicer_error}`
      : finalStatus === "queued"
        ? "Slicing queued"
        : "Slicing complete";

    return sendJson(response, 200, {
      configured: true,
      message,
      queued: queued.record?.slice,
      request: complete.record,
      slice: complete.record?.slice,
      status: sliceUpdates.slice_status,
    });
  } catch (error) {
    try {
      if (payload.quoteRequestId) {
        await updateSliceResult(payload.quoteRequestId, {
          slice_status: "failed",
          slicer_error: error.message || "Slicing failed.",
          sliced_at: new Date().toISOString(),
        });
      }
    } catch {}

    return sendJson(response, 500, {
      error: `Slicing failed: ${error.message || "Unknown error"}`,
      status: "failed",
    });
  }
};
