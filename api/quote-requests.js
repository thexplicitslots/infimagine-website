const { hasValidSession } = require("../lib/admin-auth");
const { isValidEmail, sendQuoteConfirmation, sendQuoteNotification } = require("../lib/email-confirmation");
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

function customerEmail(payload) {
  return String(payload?.customer?.email || "").trim().toLowerCase();
}

module.exports = async function handler(request, response) {
  try {
    if (request.method === "POST") {
      const payload = await readPayload(request);
      const email = customerEmail(payload);

      if (!isValidEmail(email)) {
        return sendJson(response, 400, {
          error: "A valid email address is required.",
        });
      }

      const result = await createQuoteRequest(payload);

      if (!result.configured) {
        return sendJson(response, 202, {
          configured: false,
          saved: false,
          message: "Lead capture database is not configured yet.",
        });
      }

      let confirmationEmail = { configured: false, sent: false };
      let notificationEmail = { configured: false, sent: false };
      try {
        confirmationEmail = await sendQuoteConfirmation(payload, result.record);
      } catch (error) {
        console.error("Quote confirmation email failed:", error);
        confirmationEmail = {
          configured: true,
          error: "Confirmation email could not be sent.",
          sent: false,
        };
      }
      try {
        notificationEmail = await sendQuoteNotification(payload, result.record);
      } catch (error) {
        console.error("Quote notification email failed:", error);
        notificationEmail = {
          configured: true,
          error: "Quote notification email could not be sent.",
          sent: false,
        };
      }

      return sendJson(response, 201, {
        confirmationEmail,
        configured: true,
        notificationEmail,
        provider: result.provider,
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
        message: result.configured ? "Quote requests loaded." : "Database environment variables are not configured.",
        provider: result.provider,
        requests: result.records,
      });
    }

    if (request.method === "PATCH") {
      const payload = await readPayload(request);
      const result = await updateQuoteRequest(payload.id, payload.updates || {});
      return sendJson(response, 200, {
        configured: result.configured,
        provider: result.provider,
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
