const { createSignedUploadFiles, uploadFiles } = require("../lib/upload-store");

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
      if (body.length > 11_000_000) request.destroy();
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

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    const payload = await readPayload(request);
    const result = payload.mode === "sign"
      ? await createSignedUploadFiles(payload.files || [], request)
      : await uploadFiles(payload.files || []);

    return sendJson(response, result.configured ? 201 : 202, {
      configured: result.configured,
      uploaded: result.configured,
      provider: result.provider,
      files: result.files,
    });
  } catch (error) {
    return sendJson(response, 400, {
      error: error.message || "Upload service failed.",
    });
  }
};
