const crypto = require("crypto");

const SESSION_COOKIE = "infimagine_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || "",
    password: process.env.ADMIN_PASSWORD || "",
  };
}

function hasCredentials() {
  const credentials = getCredentials();
  return Boolean(credentials.username && credentials.password);
}

function validateCredentials(username, password) {
  const credentials = getCredentials();
  return (
    hasCredentials() &&
    timingSafeEqualString(username, credentials.username) &&
    timingSafeEqualString(password, credentials.password)
  );
}

function sessionSecret() {
  const credentials = getCredentials();
  return `${credentials.username}:${credentials.password}`;
}

function signSession(timestamp) {
  return crypto.createHmac("sha256", sessionSecret()).update(String(timestamp)).digest("base64url");
}

function createSessionValue() {
  const timestamp = Date.now();
  return `${timestamp}.${signSession(timestamp)}`;
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
      }),
  );
}

function hasValidSession(request) {
  if (!hasCredentials()) return false;

  const value = parseCookies(request)[SESSION_COOKIE];
  if (!value) return false;

  const [timestamp, signature] = value.split(".");
  const age = Date.now() - Number(timestamp);

  if (!timestamp || !signature || !Number.isFinite(age) || age < 0 || age > SESSION_TTL_SECONDS * 1000) {
    return false;
  }

  return timingSafeEqualString(signature, signSession(timestamp));
}

function setSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(createSessionValue())}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
  );
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function redirect(response, location) {
  response.statusCode = 303;
  response.setHeader("Location", location);
  response.setHeader("Cache-Control", "no-store");
  response.end();
}

module.exports = {
  clearSessionCookie,
  hasCredentials,
  hasValidSession,
  redirect,
  setSessionCookie,
  validateCredentials,
};
