const { hasValidSession } = require("../lib/admin-auth");
const {
  createGalleryItem,
  createGalleryUpload,
  deleteGalleryItem,
  listGalleryItems,
} = require("../lib/gallery-store");

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", statusCode === 200 ? "s-maxage=60, stale-while-revalidate=300" : "no-store");
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

module.exports = async function handler(request, response) {
  try {
    if (request.method === "GET") {
      const result = await listGalleryItems();
      return sendJson(response, 200, {
        configured: result.configured,
        provider: result.provider,
        items: result.items,
      });
    }

    if (!hasValidSession(request)) {
      return sendJson(response, 401, { error: "Admin session required." });
    }

    const payload = await readPayload(request);

    if (request.method === "POST") {
      if (payload.mode === "sign") {
        const result = await createGalleryUpload(payload.file || {});
        return sendJson(response, result.configured ? 201 : 202, result);
      }

      const result = await createGalleryItem(payload.item || payload);
      return sendJson(response, result.configured ? 201 : 202, result);
    }

    if (request.method === "DELETE") {
      const result = await deleteGalleryItem(payload.id);
      return sendJson(response, result.item ? 200 : 404, result.item ? result : { ...result, error: "Gallery item not found." });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 400, {
      error: error.message || "Gallery service failed.",
    });
  }
};
