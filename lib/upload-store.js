const { put } = require("@vercel/blob");
const { handleUpload } = require("@vercel/blob/client");

const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "quote-attachments";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 160 * 1024 * 1024;
const MAX_FILES = 4;
const BLOB_ACCESS = process.env.BLOB_ACCESS || "public";

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "")
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/, "")
    .replace(/\/storage\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { key, url };
}

function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function isSupabaseUploadConfigured() {
  const { key, url } = supabaseConfig();
  return Boolean(key && url && SUPABASE_STORAGE_BUCKET);
}

function isUploadConfigured() {
  return isBlobConfigured() || isSupabaseUploadConfigured();
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

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function uploadFiles(files) {
  const selected = validateFiles(files);

  if (!isUploadConfigured()) {
    return {
      configured: false,
      files: selected.map((file) => fileMeta(file, false)),
      provider: "none",
    };
  }

  if (isBlobConfigured()) {
    const uploaded = [];
    const id = requestId();

    for (const file of selected) {
      const meta = fileMeta(file, true);
      const buffer = decodeDataUrl(file.data);
      const pathname = `quote-attachments/${id}/${meta.name}`;
      const blob = await put(pathname, buffer, {
        access: BLOB_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: meta.type,
      });
      uploaded.push({
        ...meta,
        path: blob.pathname || pathname,
        provider: "vercel_blob",
        url: blob.url,
      });
    }

    return { configured: true, files: uploaded, provider: "vercel_blob" };
  }

  const { key, url } = supabaseConfig();
  const uploaded = [];
  const id = requestId();

  for (const file of selected) {
    const meta = fileMeta(file, true);
    const buffer = decodeDataUrl(file.data);
    const path = `${id}/${meta.name}`;
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
      provider: "supabase",
      url: publicObjectUrl(url, path),
    });
  }

  return { configured: true, files: uploaded, provider: "supabase" };
}

async function createBlobUploadFiles(files, request) {
  const selected = validateFiles(files);
  const signed = [];
  const id = requestId();

  for (const file of selected) {
    const meta = fileMeta(file, true);
    const pathname = `quote-attachments/${id}/${meta.name}`;
    const result = await handleUpload({
      body: {
        type: "blob.generate-client-token",
        payload: {
          clientPayload: JSON.stringify(meta),
          multipart: false,
          pathname,
        },
      },
      request,
      onBeforeGenerateToken: async () => ({
        access: BLOB_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        maximumSizeInBytes: MAX_FILE_BYTES,
        tokenPayload: JSON.stringify(meta),
      }),
    });

    signed.push({
      ...meta,
      access: BLOB_ACCESS,
      clientToken: result.clientToken,
      path: pathname,
      provider: "vercel_blob",
      url: "",
    });
  }

  return { configured: true, files: signed, provider: "vercel_blob" };
}

async function createSupabaseSignedUploadFiles(files) {
  const selected = validateFiles(files);

  if (!isSupabaseUploadConfigured()) {
    return {
      configured: false,
      files: selected.map((file) => fileMeta(file, false)),
      provider: "none",
    };
  }

  const { key, url } = supabaseConfig();
  const signed = [];
  const id = requestId();

  for (const file of selected) {
    const meta = fileMeta(file, true);
    const path = `${id}/${meta.name}`;
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
      data?.signedURL || data?.signedUrl || data?.url || (token ? `${signedUploadUrl(url, path)}?token=${encodeURIComponent(token)}` : ""),
    );
    if (!uploadUrl) {
      throw new Error("Upload service did not return a signed upload URL.");
    }

    signed.push({
      ...meta,
      path,
      provider: "supabase",
      token,
      uploadUrl,
      url: publicObjectUrl(url, path),
    });
  }

  return { configured: true, files: signed, provider: "supabase" };
}

async function createSignedUploadFiles(files, request) {
  if (isBlobConfigured()) {
    return createBlobUploadFiles(files, request);
  }
  return createSupabaseSignedUploadFiles(files);
}

module.exports = {
  createSignedUploadFiles,
  uploadFiles,
};
