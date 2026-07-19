const crypto = require("crypto");
const { del, issueSignedToken, presignUrl } = require("@vercel/blob");
const { neon } = require("@neondatabase/serverless");

const GALLERY_TABLE = cleanIdentifier(process.env.GALLERY_TABLE || "gallery_items");
const GALLERY_BLOB_ACCESS = cleanBlobAccess(process.env.GALLERY_BLOB_ACCESS || "public");
const MAX_GALLERY_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_GALLERY_IMAGES_PER_PRODUCT = 8;
const GALLERY_DISPLAY_URL_TTL_MS = 15 * 60 * 1000;

let neonClient = null;
let schemaReady = null;

function cleanIdentifier(value) {
  const identifier = String(value || "gallery_items").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]\w*$/.test(identifier) ? identifier : "gallery_items";
}

function cleanBlobAccess(value) {
  return String(value || "").toLowerCase() === "private" ? "private" : "public";
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

function shouldSignImageUrl(record) {
  return /\.private\.blob\.vercel-storage\.com/i.test(record.image_url || "");
}

function imagePathname(record) {
  if (record.pathname) return record.pathname;

  try {
    return new URL(record.image_url).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

async function galleryDisplayUrl(record) {
  if (!shouldSignImageUrl(record)) return record.image_url || "";
  if (!hasBlobConfig()) return record.image_url || "";

  const pathname = imagePathname(record);
  if (!pathname) return record.image_url || "";

  const validUntil = Date.now() + GALLERY_DISPLAY_URL_TTL_MS;
  const token = await issueSignedToken({
    operations: ["get"],
    pathname,
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    operation: "get",
    pathname,
    validUntil,
  });

  return presignedUrl;
}

async function mapImageRecord(record) {
  return {
    id: String(record.id),
    productId: record.product_id || String(record.id),
    title: record.title || "Studio project",
    category: record.category || "Project",
    altText: record.alt_text || record.title || "InfiMagine 3D printed project",
    imageUrl: await galleryDisplayUrl(record),
    pathname: record.pathname || "",
    contentType: record.content_type || "",
    size: cleanNumber(record.size_bytes),
    sortOrder: cleanNumber(record.sort_order),
    imageOrder: cleanNumber(record.image_order),
    isCover: record.is_cover === true,
    isPublished: record.is_published !== false,
    createdAt: record.created_at || "",
  };
}

async function mapProductRecords(records) {
  const sorted = [...records].sort((left, right) => {
    if (left.is_cover !== right.is_cover) return left.is_cover ? -1 : 1;
    return cleanNumber(left.image_order) - cleanNumber(right.image_order);
  });
  const images = await Promise.all(sorted.map(mapImageRecord));
  const cover = images.find((image) => image.isCover) || images[0];

  return {
    ...cover,
    id: cover.productId,
    imageUrl: cover.imageUrl,
    imageCount: images.length,
    images,
    size: images.reduce((sum, image) => sum + cleanNumber(image.size), 0),
  };
}

function groupByProduct(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const productId = row.product_id || String(row.id);
    if (!groups.has(productId)) groups.set(productId, []);
    groups.get(productId).push(row);
  });

  return [...groups.values()].sort((leftRows, rightRows) => {
    const leftCover = leftRows.find((row) => row.is_cover) || leftRows[0];
    const rightCover = rightRows.find((row) => row.is_cover) || rightRows[0];
    const sortDelta = cleanNumber(rightCover.sort_order) - cleanNumber(leftCover.sort_order);
    if (sortDelta) return sortDelta;
    return new Date(rightCover.created_at || 0) - new Date(leftCover.created_at || 0);
  });
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
          product_id text,
          title text,
          category text,
          alt_text text,
          image_url text not null,
          pathname text,
          content_type text,
          size_bytes integer default 0,
          sort_order integer default 0,
          image_order integer default 0,
          is_cover boolean default false,
          is_published boolean default true
        )
      `);
      await sql().query(`alter table ${GALLERY_TABLE} add column if not exists product_id text`);
      await sql().query(`alter table ${GALLERY_TABLE} add column if not exists image_order integer default 0`);
      await sql().query(`alter table ${GALLERY_TABLE} add column if not exists is_cover boolean default false`);
      await sql().query(`update ${GALLERY_TABLE} set product_id = id::text where product_id is null or product_id = ''`);
      await sql().query(`
        with ranked as (
          select id, row_number() over (partition by product_id order by created_at asc, id asc) as row_index
          from ${GALLERY_TABLE}
          where is_published = true
        )
        update ${GALLERY_TABLE} gallery
        set is_cover = true
        from ranked
        where gallery.id = ranked.id
          and ranked.row_index = 1
          and not exists (
            select 1
            from ${GALLERY_TABLE} cover
            where cover.product_id = gallery.product_id
              and cover.is_cover = true
          )
      `);
      await sql().query(`create index if not exists ${GALLERY_TABLE}_published_idx on ${GALLERY_TABLE} (is_published, sort_order desc, created_at desc)`);
      await sql().query(`create index if not exists ${GALLERY_TABLE}_product_idx on ${GALLERY_TABLE} (product_id, image_order asc)`);
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
    access: GALLERY_BLOB_ACCESS,
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
      access: GALLERY_BLOB_ACCESS,
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
    `select * from ${GALLERY_TABLE} where is_published = true order by sort_order desc, created_at desc limit 200`,
  );
  const products = await Promise.all(groupByProduct(rows).slice(0, 24).map(mapProductRecords));
  return { configured: true, provider: "neon", items: products };
}

async function createGalleryItem(payload = {}) {
  if (!hasDatabaseConfig()) {
    return { configured: false, provider: "none", item: null };
  }

  const title = cleanText(payload.title, 160) || "Studio project";
  const category = cleanText(payload.category, 80) || "Project";
  const productId = cleanText(payload.productId, 120) || crypto.randomUUID();
  const images = (Array.isArray(payload.images) && payload.images.length ? payload.images : [payload])
    .slice(0, MAX_GALLERY_IMAGES_PER_PRODUCT)
    .map((image, index) => ({
      altText: cleanText(image.altText, 220) || cleanText(payload.altText, 220) || title,
      imageUrl: cleanText(image.imageUrl || image.url, 1000),
      pathname: cleanText(image.pathname || image.path, 700),
      contentType: cleanText(image.contentType || image.type, 120),
      size: cleanNumber(image.size),
      imageOrder: cleanNumber(image.imageOrder ?? index),
      isCover: image.isCover === true || index === 0,
    }));

  if (!images.length) {
    throw new Error("Add at least one image to publish a gallery product.");
  }

  images.forEach((image) => {
    if (!/^https?:\/\//i.test(image.imageUrl)) {
      throw new Error("Gallery image upload did not return a public image URL.");
    }
  });

  await ensureSchema();
  await sql().query(`update ${GALLERY_TABLE} set is_cover = false where product_id = $1`, [productId]);
  const values = [];
  const placeholders = images
    .map((image, index) => {
      const offset = index * 11;
      values.push(
        productId,
        title,
        category,
        image.altText,
        image.imageUrl,
        image.pathname,
        image.contentType,
        image.size,
        index,
        index === 0,
        true,
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`;
    })
    .join(", ");

  const rows = await sql().query(
    `insert into ${GALLERY_TABLE} (product_id, title, category, alt_text, image_url, pathname, content_type, size_bytes, image_order, is_cover, is_published)
     values ${placeholders}
     returning *`,
    values,
  );

  return { configured: true, provider: "neon", item: await mapProductRecords(rows) };
}

async function deleteGalleryItem(id) {
  if (!hasDatabaseConfig()) {
    return { configured: false, provider: "none", item: null };
  }

  await ensureSchema();
  const rows = await sql().query(`delete from ${GALLERY_TABLE} where product_id = $1 or id::text = $1 returning *`, [id]);

  if (hasBlobConfig()) {
    for (const record of rows) {
      if (record?.image_url) {
        try {
          await del(record.image_url);
        } catch {
          // The database delete should still succeed even if Blob cleanup fails.
        }
      }
    }
  }

  return { configured: true, provider: "neon", item: rows.length ? await mapProductRecords(rows) : null };
}

module.exports = {
  createGalleryItem,
  createGalleryUpload,
  deleteGalleryItem,
  hasBlobConfig,
  hasDatabaseConfig,
  listGalleryItems,
};
