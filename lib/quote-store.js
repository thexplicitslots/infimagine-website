const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "quote_requests";

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || "")
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/, "")
    .replace(/\/storage\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { key, url };
}

function isConfigured() {
  const { key, url } = supabaseConfig();
  return Boolean(key && url);
}

function cleanText(value, limit = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanAttachments(value) {
  const attachments = Array.isArray(value) ? value : [];
  return attachments.slice(0, 8).map((file) => ({
    name: cleanText(file.name, 140) || "Attachment",
    type: cleanText(file.type, 120),
    size: Number(file.size || 0),
    path: cleanText(file.path, 700),
    url: cleanText(file.url, 900),
    stored: Boolean(file.stored),
  }));
}

function parseAttachments(value) {
  if (Array.isArray(value)) return cleanAttachments(value);
  if (!value) return [];
  try {
    return cleanAttachments(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizePayload(payload, options = {}) {
  const now = new Date().toISOString();
  const customer = payload.customer || {};
  const project = payload.project || {};
  const material = payload.material || {};
  const delivery = payload.delivery || {};
  const record = {
    created_at: payload.createdAt || now,
    updated_at: now,
    customer_name: cleanText(customer.name, 180) || "New customer",
    contact: cleanText(customer.contact, 220),
    project_type: cleanText(project.type, 180),
    quantity: cleanText(project.quantity, 80),
    size: cleanText(project.size, 140),
    dimensions: cleanText(project.dimensions, 180),
    readiness: cleanText(project.readiness, 180),
    reference_link: cleanText(project.referenceLink, 700),
    description: cleanText(project.description, 2400),
    ai_possibilities: cleanText(project.aiPossibilities, 2400),
    material: cleanText(material.preference, 180),
    color: cleanText(material.color, 180),
    finish: cleanText(material.finish, 180),
    strength: cleanText(material.strength, 180),
    timeline: cleanText(delivery.timeline, 120),
    budget: cleanText(delivery.budget, 120),
    delivery: cleanText(delivery.preference, 120),
    location: cleanText(delivery.location, 220),
    estimate: cleanText(payload.estimate, 120),
    status: cleanText(payload.status, 80) || "New",
    priority: cleanText(payload.priority, 80) || "Normal",
    follow_up_date: cleanText(payload.followUpDate, 80),
    notes: cleanText(payload.notes, 2400),
    source: cleanText(payload.source, 120) || "Website quote form",
  };

  if (options.includeAttachments !== false) {
    record.attachments = cleanAttachments(project.attachments || payload.attachments);
  }

  return record;
}

function mapRecord(record) {
  return {
    id: String(record.id),
    name: record.customer_name || "New customer",
    contact: record.contact || "Not specified",
    type: record.project_type || "Custom 3D print",
    status: record.status || "New",
    priority: record.priority || "Normal",
    estimate: record.estimate || "Not estimated",
    quantity: record.quantity || "1 piece",
    size: record.size || "Not set",
    dimensions: record.dimensions || "",
    material: record.material || "Recommend after review",
    color: record.color || "",
    finish: record.finish || "Not set",
    strength: record.strength || "Not set",
    timeline: record.timeline || "Not set",
    budget: record.budget || "Not set",
    delivery: record.delivery || "Not set",
    location: record.location || "",
    followUpDate: record.follow_up_date || "",
    created: record.created_at || new Date().toISOString(),
    description: record.description || "Customer wants a custom 3D printed object.",
    possibilities: record.ai_possibilities || "",
    attachments: parseAttachments(record.attachments),
    slice: {
      status: record.slice_status || "",
      printTimeMinutes: cleanNumber(record.estimated_print_time_minutes),
      filamentGrams: cleanNumber(record.estimated_filament_grams),
      filamentCost: cleanNumber(record.estimated_filament_cost),
      profile: record.slicer_profile || "",
      error: record.slicer_error || "",
      slicedAt: record.sliced_at || "",
    },
    notes: record.notes || "",
  };
}

async function supabaseFetch(path, options = {}) {
  const { key, url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.message || data?.hint || text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(detail || `Supabase request failed with HTTP ${response.status}.`);
  }

  return data;
}

async function createQuoteRequest(payload) {
  if (!isConfigured()) {
    return { configured: false, record: null };
  }

  let record;
  try {
    [record] = await supabaseFetch(SUPABASE_TABLE, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(normalizePayload(payload)),
    });
  } catch (error) {
    if (!String(error.message || "").toLowerCase().includes("attachments")) {
      throw error;
    }

    [record] = await supabaseFetch(SUPABASE_TABLE, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(normalizePayload(payload, { includeAttachments: false })),
    });
  }

  return { configured: true, record: mapRecord(record) };
}

async function listQuoteRequests() {
  if (!isConfigured()) {
    return { configured: false, records: [] };
  }

  const records = await supabaseFetch(`${SUPABASE_TABLE}?select=*&order=created_at.desc&limit=100`);
  return { configured: true, records: records.map(mapRecord) };
}

async function getQuoteRequest(id) {
  if (!isConfigured()) {
    return { configured: false, record: null };
  }

  const [record] = await supabaseFetch(`${SUPABASE_TABLE}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return { configured: true, record: record ? mapRecord(record) : null };
}

async function updateQuoteRequest(id, updates) {
  if (!isConfigured()) {
    return { configured: false, record: null };
  }

  const allowed = {};
  if (updates.status) allowed.status = cleanText(updates.status, 80);
  if (updates.priority) allowed.priority = cleanText(updates.priority, 80);
  if (typeof updates.followUpDate === "string") allowed.follow_up_date = cleanText(updates.followUpDate, 80);
  if (typeof updates.notes === "string") allowed.notes = cleanText(updates.notes, 2400);
  allowed.updated_at = new Date().toISOString();

  const [record] = await supabaseFetch(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(allowed),
  });

  return { configured: true, record: record ? mapRecord(record) : null };
}

async function updateSliceResult(id, updates) {
  if (!isConfigured()) {
    return { configured: false, record: null };
  }

  const allowed = {
    updated_at: new Date().toISOString(),
  };

  if (updates.slice_status) allowed.slice_status = cleanText(updates.slice_status, 80);
  if ("estimated_print_time_minutes" in updates) {
    allowed.estimated_print_time_minutes = cleanNumber(updates.estimated_print_time_minutes);
  }
  if ("estimated_filament_grams" in updates) {
    allowed.estimated_filament_grams = cleanNumber(updates.estimated_filament_grams);
  }
  if ("estimated_filament_cost" in updates) {
    allowed.estimated_filament_cost = cleanNumber(updates.estimated_filament_cost);
  }
  if ("slicer_profile" in updates) allowed.slicer_profile = cleanText(updates.slicer_profile, 240);
  if ("slicer_error" in updates) allowed.slicer_error = cleanText(updates.slicer_error, 1200);
  if ("sliced_at" in updates) allowed.sliced_at = updates.sliced_at;

  const [record] = await supabaseFetch(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(allowed),
  });

  return { configured: true, record: record ? mapRecord(record) : null };
}

module.exports = {
  createQuoteRequest,
  getQuoteRequest,
  isConfigured,
  listQuoteRequests,
  updateSliceResult,
  updateQuoteRequest,
};
