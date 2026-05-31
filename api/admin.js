const fs = require("fs");
const path = require("path");

const adminHtml = fs.readFileSync(path.join(process.cwd(), "admin.html"), "utf8");

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return require("crypto").timingSafeEqual(leftBuffer, rightBuffer);
}

function unauthorized(response) {
  response.statusCode = 401;
  response.setHeader("WWW-Authenticate", 'Basic realm="InfiMagine Admin", charset="UTF-8"');
  response.setHeader("Cache-Control", "no-store");
  response.end("Authentication required.");
}

module.exports = function handler(request, response) {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end("Admin login is not configured.");
    return;
  }

  const authorization = request.headers.authorization || "";
  const [scheme, encoded] = authorization.split(" ");

  if (scheme !== "Basic" || !encoded) {
    unauthorized(response);
    return;
  }

  let decoded = "";

  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    unauthorized(response);
    return;
  }

  const separatorIndex = decoded.indexOf(":");
  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const valid =
    separatorIndex > -1 &&
    timingSafeEqualString(username, expectedUsername) &&
    timingSafeEqualString(password, expectedPassword);

  if (!valid) {
    unauthorized(response);
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(adminHtml);
};
