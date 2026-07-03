const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API_URL = process.env.RESEND_API_URL || "https://api.resend.com/emails";
const DEFAULT_NOTIFICATION_RECIPIENTS = [
  "admin@infimagine.com",
  "Chinmayarya05@gmail.com",
  "Ananyamittal6616@gmail.com",
];

function clean(value, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const unquoted = text.match(/^(['"])(.*)\1$/)?.[2]?.trim() || text;
  return unquoted || fallback;
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
}

function uniqueEmails(values) {
  const seen = new Set();
  return values
    .map((value) => clean(value).toLowerCase())
    .filter((value) => {
      if (!isValidEmail(value) || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function notificationRecipients() {
  const configured = clean(process.env.QUOTE_NOTIFICATION_TO);
  const values = configured ? configured.split(/[,;\n]/) : DEFAULT_NOTIFICATION_RECIPIENTS;
  return uniqueEmails(values);
}

function emailConfig() {
  const from = clean(process.env.EMAIL_FROM, "InfiMagine <admin@infimagine.com>");

  return {
    apiKey: clean(process.env.RESEND_API_KEY),
    from,
    replyTo: clean(process.env.EMAIL_REPLY_TO, "admin@infimagine.com"),
  };
}

function isEmailConfigured(config = emailConfig()) {
  return Boolean(config.apiKey && config.from);
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

function notificationRows(payload, record) {
  const project = payload.project || {};
  const material = payload.material || {};
  const delivery = payload.delivery || {};
  return [
    ["Customer", record?.name || payload.customer?.name],
    ["Contact", record?.contact || payload.customer?.contact],
    ["Project", project.type || record?.type],
    ["Quantity", project.quantity || record?.quantity],
    ["Size", project.size || record?.size],
    ["Dimensions", project.dimensions || record?.dimensions],
    ["Readiness", project.readiness || record?.readiness],
    ["Reference link", project.referenceLink || record?.referenceLink],
    ["Material", material.preference || record?.material],
    ["Color", material.color || record?.color],
    ["Finish", material.finish || record?.finish],
    ["Strength", material.strength || record?.strength],
    ["Timeline", delivery.timeline || record?.timeline],
    ["Delivery", delivery.preference || record?.delivery],
    ["Location", delivery.location || record?.location],
    ["Estimate", payload.estimate || record?.estimate],
    ["Request ID", record?.id],
  ].filter(([, value]) => value && value !== "Not specified" && value !== "Not set");
}

function attachmentSummary(record) {
  const attachments = Array.isArray(record?.attachments) ? record.attachments : [];
  if (!attachments.length) return { html: "", text: "Attachments: None" };

  const lines = attachments.map((file) => {
    const size = file.size ? ` (${Math.round(Number(file.size) / 1024 / 1024 * 10) / 10} MB)` : "";
    const url = file.url ? ` - ${file.url}` : "";
    return `${file.name || "Attachment"}${size}${url}`;
  });

  const html = `
    <div style="margin-top:18px;">
      <p style="margin:0 0 8px;color:#6ee7ff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Attachments</p>
      <ul style="margin:0;padding:0;list-style:none;">
        ${attachments.map((file) => `
          <li style="margin:0 0 8px;padding:10px 12px;border:1px solid rgba(110,231,255,0.12);border-radius:12px;background:rgba(2,8,12,0.72);color:#c3d1d7;">
            <strong style="color:#ffffff;">${escapeHtml(file.name || "Attachment")}</strong>
            ${file.size ? `<span style="color:#8fa0a8;"> · ${escapeHtml(`${Math.round(Number(file.size) / 1024 / 1024 * 10) / 10} MB`)}</span>` : ""}
            ${file.url ? `<br><a href="${escapeHtml(file.url)}" style="color:#6ee7ff;">Open file</a>` : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `;

  return {
    html,
    text: ["Attachments", ...lines].join("\n"),
  };
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

function buildNotificationEmail(payload, record) {
  const rows = notificationRows(payload, record);
  const requestId = record?.id ? String(record.id).slice(0, 8).toUpperCase() : "";
  const attachments = attachmentSummary(record);
  const description = record?.description || payload.project?.description || "";
  const possibilities = record?.possibilities || payload.project?.aiPossibilities || "";
  const adminUrl = clean(process.env.ADMIN_URL || process.env.SITE_URL, "https://infimagine.com/admin");

  const textRows = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = [
    "New InfiMagine quote request received.",
    requestId ? `Request ID: ${requestId}` : "",
    "",
    textRows,
    description ? `\nCustomer brief:\n${description}` : "",
    possibilities ? `\nAI design possibilities:\n${possibilities}` : "",
    `\n${attachments.text}`,
    "",
    `Admin panel: ${adminUrl}`,
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
    <div style="max-width:720px;margin:0 auto;padding:32px 18px;">
      <div style="border:1px solid rgba(110,231,255,0.18);border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.025));padding:26px;">
        <p style="margin:0 0 10px;color:#6ee7ff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">New quote request</p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.08;color:#ffffff;">A customer submitted a project.</h1>
        ${requestId ? `<p style="margin:0 0 18px;color:#8fa0a8;">Request ID: <strong style="color:#ffffff;">${escapeHtml(requestId)}</strong></p>` : ""}
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border:1px solid rgba(110,231,255,0.12);border-radius:14px;overflow:hidden;background:rgba(2,8,12,0.72);">
          ${htmlRows}
        </table>
        ${description ? `<div style="margin-top:18px;"><p style="margin:0 0 8px;color:#6ee7ff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">Customer brief</p><p style="margin:0;color:#c3d1d7;line-height:1.65;">${escapeHtml(description)}</p></div>` : ""}
        ${possibilities ? `<div style="margin-top:18px;"><p style="margin:0 0 8px;color:#6ee7ff;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">AI design possibilities</p><p style="margin:0;color:#c3d1d7;line-height:1.65;">${escapeHtml(possibilities)}</p></div>` : ""}
        ${attachments.html}
        <p style="margin:22px 0 0;"><a href="${escapeHtml(adminUrl)}" style="display:inline-block;border:1px solid rgba(110,231,255,0.34);border-radius:12px;padding:12px 16px;color:#ffffff;text-decoration:none;background:rgba(110,231,255,0.08);font-weight:800;">Open admin panel</a></p>
      </div>
    </div>
  </body>
</html>`;

  return {
    html,
    subject: `New InfiMagine quote request${requestId ? ` #${requestId}` : ""}`,
    text,
  };
}

async function sendResendMail({ config, html, replyTo, subject, text, to }) {
  const recipients = Array.isArray(to) ? uniqueEmails(to) : uniqueEmails([to]);
  if (!recipients.length) {
    throw new Error("No valid email recipients configured.");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      html,
      reply_to: replyTo || config.replyTo,
      subject,
      text,
      to: recipients,
    }),
  });
  const body = await response.text();
  let data = null;

  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || data?.error?.message || body.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(message || `Resend email failed with status ${response.status}.`);
  }

  return data || {};
}

async function sendQuoteConfirmation(payload, record) {
  const config = emailConfig();
  const to = clean(payload?.customer?.email).toLowerCase();

  if (!isEmailConfigured(config)) {
    return { configured: false, sent: false };
  }

  if (!isValidEmail(to)) {
    return { configured: true, sent: false, error: "A valid email address is required." };
  }

  const email = buildConfirmationEmail(payload, record);
  const result = await sendResendMail({ ...email, config, to });
  return { configured: true, id: result.id || "", sent: true };
}

async function sendQuoteNotification(payload, record) {
  const config = emailConfig();
  const to = notificationRecipients();
  const customerReplyTo = clean(payload?.customer?.email).toLowerCase();

  if (!isEmailConfigured(config)) {
    return { configured: false, sent: false };
  }

  if (!to.length) {
    return { configured: true, sent: false, error: "No quote notification recipients configured." };
  }

  const email = buildNotificationEmail(payload, record);
  const result = await sendResendMail({
    ...email,
    config,
    replyTo: isValidEmail(customerReplyTo) ? customerReplyTo : config.replyTo,
    to,
  });
  return { configured: true, id: result.id || "", recipients: to, sent: true };
}

module.exports = {
  isEmailConfigured,
  isValidEmail,
  sendQuoteConfirmation,
  sendQuoteNotification,
};
