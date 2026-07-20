const fs = require("fs");
const path = require("path");
const { hasCredentials, hasValidSession } = require("../lib/admin-auth");

const adminHtml = fs.readFileSync(path.join(__dirname, "admin-template.html"), "utf8");

function sendHtml(response, html) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(html);
}

function loginHtml(request) {
  const url = new URL(request.url, "https://infimagine.com");
  const failed = url.searchParams.get("error") === "1";
  const notConfigured = !hasCredentials();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <meta name="theme-color" content="#081014" />
    <title>InfiMagine Admin Login</title>
    <link rel="icon" href="/favicon.ico?v=20260720" sizes="any" />
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png?v=20260720" />
    <link rel="stylesheet" href="/admin.css" />
  </head>
  <body class="login-body">
    <main class="login-shell">
      <section class="login-panel" aria-labelledby="login-title">
        <a class="admin-brand login-brand" href="/" aria-label="InfiMagine home">
          <span class="admin-mark" aria-hidden="true">
            <img src="/assets/infimagine-logo-cropped.png" alt="" />
          </span>
          <span>
            <strong>InfiMagine</strong>
            <small>Admin studio</small>
          </span>
        </a>

        <div>
          <p class="eyebrow">Secure access</p>
          <h1 id="login-title">Sign in to command center.</h1>
          <p class="login-copy">Manage quote requests, customer notes, and project follow-ups from a private owner workspace.</p>
        </div>

        ${
          notConfigured
            ? '<div class="login-alert">Admin credentials are not configured in Vercel.</div>'
            : failed
              ? '<div class="login-alert">Login ID or password is incorrect.</div>'
              : ""
        }

        <form class="login-form" action="/api/admin-login" method="post">
          <label>
            <span>Login ID</span>
            <input name="username" autocomplete="username" required ${notConfigured ? "disabled" : ""} />
          </label>
          <label>
            <span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required ${notConfigured ? "disabled" : ""} />
          </label>
          <button class="button primary" type="submit" ${notConfigured ? "disabled" : ""}>Enter admin</button>
        </form>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = function handler(request, response) {
  if (!hasValidSession(request)) {
    sendHtml(response, loginHtml(request));
    return;
  }

  sendHtml(response, adminHtml);
};
