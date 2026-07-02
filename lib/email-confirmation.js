const net = require("node:net");
const tls = require("node:tls");

const DEFAULT_TIMEOUT_MS = 15_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function clean(value, fallback = "") {
  return String(value || "").replace(/\s+/g, " ").trim() || fallback;
}

function cleanHeader(value) {
  return clean(value).replace(/[\r\n]+/g, " ");
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function extractEmailAddress(value) {
  const text = clean(value);
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim();
}

function smtpConfig() {
  const configuredPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const secure = boolEnv("SMTP_SECURE", configuredPort ? configuredPort === 465 : true);
  const port = configuredPort || (secure ? 465 : 587);
  const user = clean(process.env.SMTP_USER);

  return {
    host: clean(process.env.SMTP_HOST),
    port,
    secure,
    user,
    pass: String(process.env.SMTP_PASS || ""),
    from: clean(process.env.EMAIL_FROM, user ? `InfiMagine <${user}>` : ""),
    replyTo: clean(process.env.EMAIL_REPLY_TO, user),
    heloDomain: clean(process.env.EMAIL_HELO_DOMAIN, "infimagine.com"),
    timeoutMs: Number(process.env.SMTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  };
}

function isEmailConfigured(config = smtpConfig()) {
  return Boolean(config.host && config.port && config.user && config.pass && config.from);
}

function responseCode(response) {
  return Number(String(response || "").slice(0, 3));
}

function assertResponse(response, expectedCodes, label) {
  const code = responseCode(response);
  if (!expectedCodes.includes(code)) {
    const summary = String(response || "").split("\n").pop() || "No SMTP response.";
    throw new Error(`${label} failed: ${summary}`);
  }
}

function smtpClient(socket) {
  let buffer = "";
  let currentLines = [];
  const responses = [];
  const waiters = [];

  function resolveResponse(response) {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(response);
    } else {
      responses.push(response);
    }
  }

  function rejectPending(error) {
    while (waiters.length) {
      waiters.shift().reject(error);
    }
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      currentLines.push(line);

      if (/^\d{3} /.test(line)) {
        resolveResponse(currentLines.join("\n"));
        currentLines = [];
      }

      newlineIndex = buffer.indexOf("\n");
    }
  });
  socket.on("error", rejectPending);
  socket.on("timeout", () => {
    const error = new Error("SMTP request timed out.");
    rejectPending(error);
    socket.destroy(error);
  });

  return {
    readResponse() {
      if (responses.length) return Promise.resolve(responses.shift());
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    write(line) {
      socket.write(line);
    },
    end() {
      socket.end();
    },
  };
}

function connectSmtp(config) {
  return new Promise((resolve, reject) => {
    const options = {
      host: config.host,
      port: config.port,
      servername: config.host,
      timeout: config.timeoutMs,
    };
    const socket = config.secure ? tls.connect(options) : net.connect(options);

    socket.once(config.secure ? "secureConnect" : "connect", () => {
      socket.setTimeout(config.timeoutMs);
      resolve(smtpClient(socket));
    });
    socket.once("error", reject);
  });
}

async function command(client, line, expectedCodes, label) {
  client.write(`${line}\r\n`);
  const response = await client.readResponse();
  assertResponse(response, expectedCodes, label);
  return response;
}

function normalizeBody(value) {
  return String(value || "")
    .replace(/\r?\n/g, "\r\n")
    .replace(/^\./gm, "..");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detailRows(payload, record) {
  const project = payload.project || {};
  const material = payload.material || {};
  const delivery = payload.delivery || {};
  return [
    ["Project", project.type || record?.type],
    ["Quantity", project.quantity || record?.quantity],
    ["Size", project.size || record?.size],
    ["Material", material.preference || record?.material],
    ["Finish", material.finish || record?.finish],
    ["Timeline", delivery.timeline || record?.timeline],
    ["Estimate", payload.estimate || record?.estimate],
  ].filter(([, value]) => value && value !== "Not specified" && value !== "Not set");
}

function buildConfirmationEmail(payload, record) {
  const customer = payload.customer || {};
  const name = clean(customer.name);
  const greeting = name && name !== "Not specified" ? name.split(" ")[0] : "there";
  const rows = detailRows(payload, record);
  const requestId = record?.id ? String(record.id).slice(0, 8).toUpperCase() : "";

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = [
    `Hi ${greeting},`,
    "",
    "We received your InfiMagine 3D printing request.",
    "Your idea is now in our studio queue for review. We will check the design details, material direction, files, and print feasibility before getting back to you.",
    "",
    requestId ? `Request ID: ${requestId}` : "",
    textRows,
    "",
    "You can reply to this email with extra references, dimensions, or corrections.",
    "",
    "InfiMagine",
    "Ideas, engineered into reality.",
  ].filter(Boolean).join("\n");

  const htmlRows = rows
    .map(([label, value]) => `
      <tr>
        <td style="padding:10px 12px;color:#8fa0a8;border-bottom:1px solid rgba(110,231,255,0.12);">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;color:#f4fbff;border-bottom:1px solid rgba(110,231,255,0.12);font-weight:700;">${escapeHtml(value)}</td>
      </tr>
    `)
    .join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#05090c;color:#f4fbff;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid rgba(110,231,255,0.18);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025));padding:26px;">
        <p style="margin:0 0 10px;color:#6ee7ff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">InfiMagine</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.08;color:#ffffff;">Your request is in.</h1>
        <p style="margin:0 0 18px;color:#c3d1d7;line-height:1.65;">Hi ${escapeHtml(greeting)}, we received your 3D printing request. Your idea is now in our studio queue for feasibility, material, and print planning.</p>
        ${requestId ? `<p style="margin:0 0 18px;color:#8fa0a8;">Request ID: <strong style="color:#ffffff;">${escapeHtml(requestId)}</strong></p>` : ""}
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid rgba(110,231,255,0.12);border-radius:14px;overflow:hidden;background:rgba(2,8,12,0.72);">
          ${htmlRows}
        </table>
        <p style="margin:20px 0 0;color:#c3d1d7;line-height:1.65;">Reply to this email with extra references, dimensions, or corrections. We will review everything and get back to you shortly.</p>
        <p style="margin:22px 0 0;color:#ffffff;font-weight:800;">Ideas, engineered into reality.</p>
      </div>
    </div>
  </body>
</html>`;

  return {
    html,
    subject: "We received your InfiMagine request",
    text,
  };
}

function mimeMessage({ config, html, subject, text, to }) {
  const boundary = `infimagine-${Date.now().toString(36)}`;
  return [
    `From: ${cleanHeader(config.from)}`,
    `To: ${cleanHeader(to)}`,
    `Reply-To: ${cleanHeader(config.replyTo)}`,
    `Subject: ${cleanHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <quote-${Date.now()}@infimagine.com>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

async function sendSmtpMail({ config, html, subject, text, to }) {
  const fromAddress = extractEmailAddress(config.from);
  const client = await connectSmtp(config);

  try {
    const greeting = await client.readResponse();
    assertResponse(greeting, [220], "SMTP greeting");
    await command(client, `EHLO ${config.heloDomain}`, [250], "SMTP EHLO");
    await command(client, "AUTH LOGIN", [334], "SMTP auth");
    await command(client, Buffer.from(config.user).toString("base64"), [334], "SMTP username");
    await command(client, Buffer.from(config.pass).toString("base64"), [235], "SMTP password");
    await command(client, `MAIL FROM:<${fromAddress}>`, [250], "SMTP sender");
    await command(client, `RCPT TO:<${to}>`, [250, 251], "SMTP recipient");
    await command(client, "DATA", [354], "SMTP data");
    client.write(`${normalizeBody(mimeMessage({ config, html, subject, text, to }))}\r\n.\r\n`);
    const sent = await client.readResponse();
    assertResponse(sent, [250], "SMTP send");
    await command(client, "QUIT", [221, 250], "SMTP quit").catch(() => {});
  } finally {
    client.end();
  }
}

async function sendQuoteConfirmation(payload, record) {
  const config = smtpConfig();
  const to = clean(payload?.customer?.email).toLowerCase();

  if (!isEmailConfigured(config)) {
    return { configured: false, sent: false };
  }

  if (!isValidEmail(to)) {
    return { configured: true, sent: false, error: "A valid email address is required." };
  }

  const email = buildConfirmationEmail(payload, record);
  await sendSmtpMail({ ...email, config, to });
  return { configured: true, sent: true };
}

module.exports = {
  isEmailConfigured,
  isValidEmail,
  sendQuoteConfirmation,
};
