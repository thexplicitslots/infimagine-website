const crypto = require("crypto");
const { del, issueSignedToken, presignUrl } = require("@vercel/blob");
const { neon } = require("@neondatabase/serverless");

const GALLERY_TABLE = cleanIdentifier(process.env.GALLERY_TABLE || "gallery_items");
const BLOB_ACCESS = process.env.BLOB_ACCESS || "public";
const MAX_GALLERY_IMAGE_BYTES = 15 * 1024 * 1024;

let neonClient = null;
let schemaReady = null;

function cleanIdentifier(value) {
  const identifier = String(value || "gallery_items").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]\w*$/.test(identifier) ? identifier : "gallery_items";
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || "";
}

function hasDatabaseConfig() {
  return Boolean(databaseUrl());
}

function hasBlobConfig() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function sql() {
  if (!neonClient) neonClient = neon(databaseUrl());
  return neonClient;
}

function cleanText(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanFileName(name) {
  const safe = String(name || "gallery-image")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 90);
  return safe || "gallery-image";
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function validateImage(file = {}) {
  const type = cleanText(file.type, 120).toLowerCase();
  const name = cleanFileName(file.name);
  const size = cleanNumber(file.size);
  const extension = name.split(".").pop().toLowerCase();
  const allowedExtension = ["jpg", "jpeg", "png", "webp", "gif"].includes(extension);
  const allowedType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type);

  if (!allowedType && !allowedExtension) {
    throw new Error("Gallery uploads must be JPG, PNG, WebP, or GIF images.");
  }

  if (!size || size > MAX_GALLERY_IMAGE_BYTES) {
    throw new Error("Gallery images can be up to 15 MB each.");
  }

  return {
    name,
    size,
    type: allowedType ? type : `image/${extension === "jpg" ? "jpeg" : extension}`,
  };
}

function mapRecord(record) {
  return {
    id: String(record.id),
    title: record.title || "Studio project",
    category: record.category || "Project",
    altText: record.alt_text || record.title || "InfiMagine 3D printed project",
    imageUrl: record.image_url || "",
    pathname: record.pathname || "",
    contentType: record.content_type || "",
    size: cleanNumber(record.size_bytes),
    sortOrder: cleanNumber(record.sort_order),
    isPublished: record.is_published !== false,
    createdAt: record.created_at || "",
  };
}

async function ensureSchema() {
  if (!hasDatabaseConfig()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql().query("create extension if not exists pgcrypto");
      await sql().query(`
        create table if not exists ${GALLERY_TABLE} (
          id uuid primary key default gen_random_uuid(),
          created_at timestamptz default now(),
          updated_at timestamptz default now(),
          title text,
          category text,
          alt_text text,
          image_url text not null,
          pathname text,
          content_type text,
          size_bytes integer default 0,
          sort_order integer default 0,
          is_published boolean default true
        )
      `);
      await sql().query(`create index if not exists ${GALLERY_TABLE}_published_idx on ${GALLERY_TABLE} (is_published, sort_order desc, created_at desc)`);
    })();
  }
  return schemaReady;
}

async function createGalleryUpload(file) {
  if (!hasBlobConfig()) {
    return {
      configured: false,
      provider: "none",
      file: null,
      message: "Vercel Blob is not configured for gallery uploads.",
    };
  }

  const meta = validateImage(file);
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const pathname = `gallery/${id}/${meta.name}`;
  const validUntil = Date.now() + 60 * 60 * 1000;
  const token = await issueSignedToken({
    maximumSizeInBytes: MAX_GALLERY_IMAGE_BYTES,
    operations: ["put"],
    pathname,
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    access: BLOB_ACCESS,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    maximumSizeInBytes: MAX_GALLERY_IMAGE_BYTES,
    operation: "put",
    pathname,
    validUntil,
  });

  return {
    configured: true,
    provider: "vercel_blob",
    file: {
      ...meta,
      access: BLOB_ACCESS,
      path: pathname,
      provider: "vercel_blob_presigned",
      uploadUrl: presignedUrl,
      url: "",
    },
  };
}

async function listGalleryItems() {
  if (!hasDatabaseConfig()) {
    return { configured: false, provider: "none", items: [] };
  }

  await ensureSchema();
  const rows = await sql().query(
    `select * from ${GALLERY_TABLE} where is_published = true order by sort_order desc, created_at desc limit 24`,
  );
  return { configured: true, provider: "neon", items: rows.map(mapRecord) };
}

async function createGalleryItem(payload = {}) {
  if (!hasDatabaseConfig()) {
    return { configured: false, provider: "none", item: null };
  }

  const title = cleanText(payload.title, 160) || "Studio project";
  const category = cleanText(payload.category, 80) || "Project";
  const altText = cleanText(payload.altText, 220) || title;
  const imageUrl = cleanText(payload.imageUrl || payload.url, 1000);
  const pathname = cleanText(payload.pathname || payload.path, 700);
  const contentType = cleanText(payload.contentType || payload.type, 120);
  const size = cleanNumber(payload.size);

  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error("Gallery image upload did not return a public image URL.");
  }

  await ensureSchema();
  const rows = await sql().query(
    `insert into ${GALLERY_TABLE} (title, category, alt_text, image_url, pathname, content_type, size_bytes, is_published)
     values ($1, $2, $3, $4, $5, $6, $7, true)
     returning *`,
    [title, category, altText, imageUrl, pathname, contentType, size],
  );

  return { configured: true, provider: "neon", item: mapRecord(rows[0]) };
}

async function deleteGalleryItem(id) {
  if (!hasDatabaseConfig()) {
    return { configured: false, provider: "none", item: null };
  }

  await ensureSchema();
  const rows = await sql().query(`delete from ${GALLERY_TABLE} where id = $1 returning *`, [id]);
  const record = rows[0];

  if (record?.image_url && hasBlobConfig()) {
    try {
      await del(record.image_url);
    } catch {
      // The database delete should still succeed even if Blob cleanup fails.
    }
  }

  return { configured: true, provider: "neon", item: record ? mapRecord(record) : null };
}

module.exports = {
  createGalleryItem,
  createGalleryUpload,
  deleteGalleryItem,
  hasBlobConfig,
  hasDatabaseConfig,
  listGalleryItems,
};
