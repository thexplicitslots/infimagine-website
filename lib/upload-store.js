const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "quote-attachments";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 4;

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
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

function validateFiles(files) {
  const selected = Array.isArray(files) ? files.slice(0, MAX_FILES) : [];
  const totalBytes = selected.reduce((sum, file) => sum + Number(file.size || 0), 0);

  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error("Uploads can be up to 8 MB total. Large CAD files can still be sent on WhatsApp.");
  }

  selected.forEach((file) => {
    if (Number(file.size || 0) > MAX_FILE_BYTES) {
      throw new Error("Each uploaded file can be up to 4 MB. Large CAD files can still be sent on WhatsApp.");
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
      url: `${url}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${path}`,
    });
  }

  return { configured: true, files: uploaded };
}

module.exports = {
  uploadFiles,
};
