const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "quote-attachments";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 160 * 1024 * 1024;
const MAX_FILES = 4;

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "")
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/, "")
    .replace(/\/storage\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { key, url };
}

function isUploadConfigured() {
  const { key, url } = supabaseConfig();
  return Boolean(key && url && SUPABASE_STORAGE_BUCKET);
}

function cleanFileName(name) {
  const safe = String(name || "attachment")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 90);
  return safe || "attachment";
}

function fileMeta(file, stored = false) {
  return {
    name: cleanFileName(file.name),
    type: String(file.type || "application/octet-stream").slice(0, 120),
    size: Number(file.size || 0),
    stored,
  };
}

function decodeDataUrl(data) {
  const value = String(data || "");
  const base64 = value.includes(",") ? value.split(",").pop() : value;
  return Buffer.from(base64, "base64");
}

function objectUrl(url, path) {
  return `${url}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function publicObjectUrl(url, path) {
  return `${url}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function signedUploadUrl(url, path) {
  return `${url}/storage/v1/object/upload/sign/${SUPABASE_STORAGE_BUCKET}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function normalizeSignedUrl(baseUrl, value) {
  const signedUrl = String(value || "");
  if (!signedUrl) return "";
  if (/^https?:\/\//i.test(signedUrl)) {
    try {
      const parsedBase = new URL(baseUrl);
      const parsedUrl = new URL(signedUrl);
      if (parsedUrl.origin === parsedBase.origin && parsedUrl.pathname.startsWith("/object/")) {
        return `${parsedUrl.origin}/storage/v1${parsedUrl.pathname}${parsedUrl.search}`;
      }
    } catch {
      return signedUrl;
    }
    return signedUrl;
  }
  if (signedUrl.startsWith("/object/")) return `${baseUrl}/storage/v1${signedUrl}`;
  return `${baseUrl}${signedUrl.startsWith("/") ? "" : "/"}${signedUrl}`;
}

function validateFiles(files, options = {}) {
  const selected = Array.isArray(files) ? files.slice(0, MAX_FILES) : [];
  const totalBytes = selected.reduce((sum, file) => sum + Number(file.size || 0), 0);
  const fileLimit = Number(options.maxFileBytes || MAX_FILE_BYTES);
  const totalLimit = Number(options.maxTotalBytes || MAX_TOTAL_BYTES);

  if (totalBytes > totalLimit) {
    throw new Error("Uploads can be up to 160 MB total. Larger CAD files can still be sent on WhatsApp.");
  }

  selected.forEach((file) => {
    if (Number(file.size || 0) > fileLimit) {
      throw new Error("Each uploaded file can be up to 100 MB. Larger CAD files can still be sent on WhatsApp.");
    }
  });

  return selected;
}

async function uploadFiles(files) {
  const selected = validateFiles(files);

  if (!isUploadConfigured()) {
    return {
      configured: false,
      files: selected.map((file) => fileMeta(file, false)),
    };
  }

  const { key, url } = supabaseConfig();
  const uploaded = [];
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (const file of selected) {
    const meta = fileMeta(file, true);
    const buffer = decodeDataUrl(file.data);
    const path = `${requestId}/${meta.name}`;
    const response = await fetch(objectUrl(url, path), {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": meta.type,
        "x-upsert": "false",
      },
      body: buffer,
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.message || "Supabase upload failed.");
    }

    uploaded.push({
      ...meta,
      path,
      url: publicObjectUrl(url, path),
    });
  }

  return { configured: true, files: uploaded };
}

async function createSignedUploadFiles(files) {
  const selected = validateFiles(files);

  if (!isUploadConfigured()) {
    return {
      configured: false,
      files: selected.map((file) => fileMeta(file, false)),
    };
  }

  const { key, url } = supabaseConfig();
  const signed = [];
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  for (const file of selected) {
    const meta = fileMeta(file, true);
    const path = `${requestId}/${meta.name}`;
    const response = await fetch(signedUploadUrl(url, path), {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "x-upsert": "false",
      },
      body: JSON.stringify({ expiresIn: 7200 }),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.message || "Could not prepare file upload.");
    }

    const token = String(data?.token || "");
    const uploadUrl = normalizeSignedUrl(
      url,
      data?.signedURL || data?.signedUrl || data?.url || (token ? `${signedUploadUrl(url, path)}?token=${encodeURIComponent(token)}` : "")
    );
    if (!uploadUrl) {
      throw new Error("Upload service did not return a signed upload URL.");
    }

    signed.push({
      ...meta,
      path,
      uploadUrl,
      token,
      url: publicObjectUrl(url, path),
    });
  }

  return { configured: true, files: signed };
}

module.exports = {
  createSignedUploadFiles,
  uploadFiles,
};
