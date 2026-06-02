const { hasValidSession } = require("../lib/admin-auth");
const { createQuoteRequest, listQuoteRequests, updateQuoteRequest } = require("../lib/quote-store");

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
      if (body.length > 50_000) request.destroy();
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
    if (request.method === "POST") {
      const payload = await readPayload(request);
      const result = await createQuoteRequest(payload);

      if (!result.configured) {
        return sendJson(response, 202, {
          configured: false,
          saved: false,
          message: "Lead capture database is not configured yet.",
        });
      }

      return sendJson(response, 201, {
        configured: true,
        saved: true,
        request: result.record,
      });
    }

    if (!hasValidSession(request)) {
      return sendJson(response, 401, { error: "Admin session required." });
    }

    if (request.method === "GET") {
      const result = await listQuoteRequests();
      return sendJson(response, 200, {
        configured: result.configured,
        requests: result.records,
      });
    }

    if (request.method === "PATCH") {
      const payload = await readPayload(request);
      const result = await updateQuoteRequest(payload.id, payload.updates || {});
      return sendJson(response, 200, {
        configured: result.configured,
        request: result.record,
      });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, {
      error: error.message || "Quote request service failed.",
    });
  }
};
