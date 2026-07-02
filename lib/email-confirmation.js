const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API_URL = process.env.RESEND_API_URL || "https://api.resend.com/emails";

function clean(value, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const unquoted = text.match(/^(['"])(.*)\1$/)?.[2]?.trim() || text;
  return unquoted || fallback;
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || "").trim());
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

async function sendResendMail({ config, html, subject, text, to }) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      html,
      reply_to: config.replyTo,
      subject,
      text,
      to: [to],
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

module.exports = {
  isEmailConfigured,
  isValidEmail,
  sendQuoteConfirmation,
};
