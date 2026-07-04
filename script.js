const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const form = document.querySelector("#quote-form");
const estimate = document.querySelector("[data-estimate]");
const quoteSubmitButton = document.querySelector("[data-submit-quote]");
const submitStatus = document.querySelector("[data-submit-status]");
const quoteStepLabel = document.querySelector("[data-step-label]");
const quoteGroups = [...document.querySelectorAll("[data-step]")];
const quoteSteps = [...document.querySelectorAll("[data-step-target]")];
const prevStepButton = document.querySelector("[data-prev-step]");
const nextStepButton = document.querySelector("[data-next-step]");
const aiHelperButton = document.querySelector("[data-ai-helper]");
const aiOutput = document.querySelector("[data-ai-output]");
const aiStatus = document.querySelector("[data-ai-status]");
const fileInput = document.querySelector("[data-file-input]");
const fileSummary = document.querySelector("[data-file-summary]");
const year = document.querySelector("[data-year]");
const totalQuoteSteps = quoteGroups.length;
let currentQuoteStep = 1;
let currentEstimateRange = "₹2,399 - ₹5,199";
let currentAttachments = [];
const maxUploadFiles = 4;
const maxUploadBytes = 100 * 1024 * 1024;
const maxUploadTotalBytes = 160 * 1024 * 1024;

const revealTargets = [...new Set([
  ".statement-grid",
  ".proof-strip > div",
  ".section-heading",
  ".service-card",
  ".project-card",
  ".showcase-item",
  ".preview-copy",
  ".product-preview",
  ".steps li",
  ".trust-card",
  ".assurance-grid article",
  ".faq-panel",
  ".estimate-copy",
  ".quote-form",
  ".contact-grid",
].flatMap((selector) => [...document.querySelectorAll(selector)]))];

const priceRanges = {
  gift: { small: [1499, 2999], medium: [2999, 6499], large: [6499, 14999] },
  prototype: { small: [3499, 7999], medium: [7999, 17999], large: [17999, 39999] },
  model: { small: [4999, 9999], medium: [9999, 24999], large: [24999, 69999] },
  utility: { small: [1499, 3499], medium: [3499, 8999], large: [8999, 19999] },
};

const readinessAdders = {
  idea: [900, 2200],
  reference: [450, 1200],
  file: [0, 0],
};

const finishAdders = {
  standard: [0, 0],
  smooth: [900, 2500],
  functional: [350, 1400],
};

const quantityMultipliers = {
  "1": 1,
  "2-5": 2.8,
  "6-20": 8,
  "20+": 18,
};

const materialAdders = {
  recommend: [0, 0],
  pla: [0, 0],
  petg: [250, 1200],
  abs: [450, 1800],
  nylon: [1200, 4200],
  peek: [4500, 16000],
  flexible: [800, 2800],
};

const timelineAdders = {
  flexible: [0, 0],
  "3-5 days": [250, 900],
  "1 week": [0, 400],
  urgent: [700, 2500],
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function updateHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 16);
}

function setMobileMenu(open) {
  mobileMenu.hidden = !open;
  header.classList.toggle("is-menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
}

function initReveals() {
  if (!("IntersectionObserver" in window)) {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  revealTargets.forEach((element, index) => {
    element.classList.add("reveal");
    element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 },
  );

  revealTargets.forEach((element) => observer.observe(element));
}

function fieldValue(data, name) {
  return data.get(name)?.trim() || "Not specified";
}

function rawField(data, name) {
  return data.get(name)?.trim() || "";
}

function contactSummary(data) {
  const phone = rawField(data, "customerPhone");
  const email = rawField(data, "customerEmail");
  const parts = [
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
  ].filter(Boolean);

  return parts.join(" | ") || "Not specified";
}

function selectedLabel(name, data = new FormData(form)) {
  const value = data.get(name);
  const option = form.querySelector(`[name="${name}"] option[value="${CSS.escape(value)}"]`);
  return option?.textContent.trim() || value || "Not specified";
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function selectedFiles() {
  return fileInput ? [...fileInput.files].slice(0, maxUploadFiles) : [];
}

function updateFileSummary() {
  if (!fileInput || !fileSummary) return;
  const files = selectedFiles();
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  if (!files.length) {
    fileSummary.textContent = "Sketches, screenshots, reference images, STL, OBJ, STEP, STP, 3MF, or PDF.";
    currentAttachments = [];
    updateEstimate();
    return;
  }

  const names = files.map((file) => `${file.name} (${formatBytes(file.size)})`).join(", ");
  const clipped = fileInput.files.length > maxUploadFiles ? ` Only the first ${maxUploadFiles} files will be attached.` : "";
  const sizeWarning = totalBytes > maxUploadTotalBytes
    ? " Very large files will be listed in the request; we will ask for a transfer link if needed."
    : "";
  fileSummary.textContent = `${names}.${clipped}${sizeWarning}`;
  currentAttachments = files.map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    stored: false,
  }));
  updateEstimate();
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        data: reader.result,
      });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function blobStoreId(clientToken) {
  return String(clientToken || "").split("_")[3] || "";
}

async function uploadToVercelBlob(file, signed) {
  const storeId = blobStoreId(signed.clientToken);
  if (!storeId) throw new Error(`Could not prepare ${file.name}.`);

  const pathname = signed.path || signed.name || file.name;
  const response = await fetch(`https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${signed.clientToken}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-api-blob-request-attempt": "0",
      "x-api-blob-request-id": `${storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      "x-api-version": "12",
      "x-content-length": String(file.size),
      "x-content-type": file.type || "application/octet-stream",
      "x-vercel-blob-access": signed.access || "public",
      "x-vercel-blob-store-id": storeId,
    },
    body: file,
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || text.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(message || `Could not upload ${file.name}.`);
  }

  return {
    name: signed.name || file.name,
    path: data.pathname || pathname,
    provider: "vercel_blob",
    size: file.size,
    stored: true,
    type: data.contentType || file.type || "application/octet-stream",
    url: data.url,
  };
}

async function uploadToVercelBlobPresigned(file, signed) {
  if (!signed?.uploadUrl) throw new Error(`Could not prepare ${file.name}.`);

  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || text.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(message || `Could not upload ${file.name}.`);
  }

  return {
    name: signed.name || file.name,
    path: data.pathname || signed.path || signed.name || file.name,
    provider: "vercel_blob",
    size: file.size,
    stored: true,
    type: data.contentType || file.type || "application/octet-stream",
    url: data.url || signed.url || "",
  };
}

async function uploadToSignedUrl(file, signed) {
  if (signed.provider === "vercel_blob_presigned") {
    return uploadToVercelBlobPresigned(file, signed);
  }

  if (signed.provider === "vercel_blob" || signed.clientToken) {
    return uploadToVercelBlob(file, signed);
  }

  if (!signed?.uploadUrl) throw new Error(`Could not prepare ${file.name}.`);

  const response = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "cache-control": "3600",
    },
    body: file,
  });

  if (!response.ok) {
    let uploadError = "";
    try {
      const data = await response.json();
      uploadError = data?.message || data?.error || "";
    } catch {
      uploadError = await response.text();
    }
    throw new Error(uploadError || `Could not upload ${file.name}.`);
  }

  const { uploadUrl, token, ...storedFile } = signed;
  return storedFile;
}

async function uploadAttachments() {
  const files = selectedFiles();
  if (!files.length) return [];

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const fallback = files.map((file) => ({
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    stored: false,
  }));

  if (files.some((file) => file.size > maxUploadBytes) || totalBytes > maxUploadTotalBytes) {
    currentAttachments = fallback;
    updateEstimate();
    return fallback;
  }

  submitStatus.textContent = "Uploading your reference files...";

  try {
    const response = await fetch("/api/upload-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "sign",
        files: files.map((file) => ({
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
        })),
      }),
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.error || "Upload failed.");
    if (!result.configured) {
      currentAttachments = result.files?.length ? result.files : fallback;
      updateEstimate();
      return currentAttachments;
    }

    const signedFiles = result.files || [];
    const uploaded = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const signed = signedFiles[index];

      submitStatus.textContent = `Uploading ${file.name}...`;
      uploaded.push(await uploadToSignedUrl(file, signed));
    }

    currentAttachments = uploaded.length ? uploaded : fallback;
    updateEstimate();
    return currentAttachments;
  } catch (error) {
    submitStatus.textContent = error.message || "Could not upload files. The file names will still be saved with your request.";
    currentAttachments = fallback;
    updateEstimate();
    return fallback;
  }
}

function updateEstimate() {
  const data = new FormData(form);
  const projectType = data.get("projectType");
  const size = data.get("size");
  const readiness = data.get("readiness");
  const finish = data.get("finish");
  const quantity = data.get("quantity");
  const material = data.get("material");
  const timeline = data.get("timeline");

  const base = priceRanges[projectType][size];
  const readinessCost = readinessAdders[readiness];
  const finishCost = finishAdders[finish];
  const materialCost = materialAdders[material];
  const timelineCost = timelineAdders[timeline];
  const quantityMultiplier = quantityMultipliers[quantity];
  const low = Math.round((base[0] + readinessCost[0] + finishCost[0] + materialCost[0]) * quantityMultiplier + timelineCost[0]);
  const high = Math.round((base[1] + readinessCost[1] + finishCost[1] + materialCost[1]) * quantityMultiplier + timelineCost[1]);

  currentEstimateRange = `${formatCurrency(low)} - ${formatCurrency(high)}`;
  estimate.textContent = currentEstimateRange;
  quoteStepLabel.textContent = `Step ${currentQuoteStep} of ${totalQuoteSteps} · Starting estimate`;
}

function collectQuotePayload(attachments = currentAttachments) {
  const data = new FormData(form);
  return {
    createdAt: new Date().toISOString(),
    estimate: currentEstimateRange,
    source: "Website quote form",
    customer: {
      name: fieldValue(data, "customerName"),
      phone: rawField(data, "customerPhone"),
      email: rawField(data, "customerEmail"),
      contact: contactSummary(data),
    },
    project: {
      type: selectedLabel("projectType", data),
      quantity: selectedLabel("quantity", data),
      size: selectedLabel("size", data),
      dimensions: fieldValue(data, "dimensions"),
      readiness: selectedLabel("readiness", data),
      referenceLink: fieldValue(data, "referenceLink"),
      attachments,
      description: fieldValue(data, "description"),
      aiPossibilities: fieldValue(data, "aiBrief"),
    },
    material: {
      preference: selectedLabel("material", data),
      color: fieldValue(data, "color"),
      finish: selectedLabel("finish", data),
      strength: selectedLabel("strength", data),
    },
    delivery: {
      timeline: selectedLabel("timeline", data),
      preference: selectedLabel("delivery", data),
      location: fieldValue(data, "location"),
    },
  };
}

function updateQuoteStep(step) {
  currentQuoteStep = Math.min(Math.max(step, 1), totalQuoteSteps);
  form.dataset.currentStep = String(currentQuoteStep);

  quoteGroups.forEach((group) => {
    const isActive = Number(group.dataset.step) === currentQuoteStep;
    group.classList.toggle("is-active", isActive);
    group.setAttribute("aria-hidden", String(!isActive));
    group.inert = !isActive;
  });

  quoteSteps.forEach((button) => {
    const stepNumber = Number(button.dataset.stepTarget);
    const isActive = stepNumber === currentQuoteStep;
    button.classList.toggle("is-active", isActive);
    button.classList.toggle("is-complete", stepNumber < currentQuoteStep);
    button.setAttribute("aria-current", isActive ? "step" : "false");

    if (isActive) {
      button.classList.remove("is-gliding");
      window.requestAnimationFrame(() => button.classList.add("is-gliding"));
    } else {
      button.classList.remove("is-gliding");
    }
  });

  nextStepButton.textContent = currentQuoteStep === totalQuoteSteps ? "Review brief" : "Continue";
  updateEstimate();
}

function collectAiPayload() {
  const data = new FormData(form);
  return {
    projectType: selectedLabel("projectType", data),
    quantity: selectedLabel("quantity", data),
    size: selectedLabel("size", data),
    dimensions: fieldValue(data, "dimensions"),
    readiness: selectedLabel("readiness", data),
    referenceLink: fieldValue(data, "referenceLink"),
    material: selectedLabel("material", data),
    color: fieldValue(data, "color"),
    finish: selectedLabel("finish", data),
    strength: selectedLabel("strength", data),
    timeline: selectedLabel("timeline", data),
    delivery: selectedLabel("delivery", data),
    location: fieldValue(data, "location"),
    description: fieldValue(data, "description"),
  };
}

async function refineWithAi() {
  aiStatus.textContent = "Exploring design possibilities for your idea...";
  aiHelperButton.disabled = true;
  form.classList.add("is-thinking");

  try {
    const response = await fetch("/api/design-helper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectAiPayload()),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "AI helper is unavailable right now.");
    }

    aiOutput.value = result.brief;
    aiStatus.textContent = "Design possibilities ready. You can edit them before sending.";
    updateEstimate();
  } catch (error) {
    aiStatus.textContent = error.message;
  } finally {
    aiHelperButton.disabled = false;
    form.classList.remove("is-thinking");
  }
}

async function saveQuoteRequest(event) {
  event.preventDefault();

  if (!form.checkValidity()) {
    const invalidField = form.querySelector(":invalid");
    const invalidStep = invalidField?.closest("[data-step]");
    if (invalidStep?.dataset.step) {
      updateQuoteStep(Number(invalidStep.dataset.step));
    }
    window.requestAnimationFrame(() => form.reportValidity());
    submitStatus.textContent = "Please enter a valid email address so we can send your confirmation.";
    return;
  }

  updateEstimate();
  submitStatus.textContent = "Preparing your project request...";
  quoteSubmitButton.disabled = true;
  quoteSubmitButton.setAttribute("aria-busy", "true");

  try {
    const attachments = await uploadAttachments();
    submitStatus.textContent = "Saving your request and preparing confirmation...";
    const response = await fetch("/api/quote-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectQuotePayload(attachments)),
    });
    const result = await response.json();

    if (!response.ok) {
      submitStatus.textContent = result.error || "Could not save the request. Please check the form details.";
      throw new Error(result.error || "Quote request failed.");
    }

    submitStatus.textContent = result.confirmationEmail?.sent
      ? "Request saved. Confirmation sent. We will review your project and reply soon."
      : result.saved
        ? "Request saved. We will review your project and reply soon."
        : "Request prepared, but it could not be saved. Please email admin@infimagine.com.";
    quoteSubmitButton.textContent = "Request submitted";
  } catch (error) {
    submitStatus.textContent = error.message || "Could not save the request. Please try again or email admin@infimagine.com.";
    quoteSubmitButton.disabled = false;
  } finally {
    quoteSubmitButton.removeAttribute("aria-busy");
  }
}

window.addEventListener("scroll", updateHeader, { passive: true });
menuToggle.addEventListener("click", () => {
  setMobileMenu(!header.classList.contains("is-menu-open"));
});
mobileMenu.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    setMobileMenu(false);
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMobileMenu(false);
  }
});
form.addEventListener("input", updateEstimate);
form.addEventListener("change", updateEstimate);
fileInput?.addEventListener("change", updateFileSummary);
prevStepButton.addEventListener("click", () => updateQuoteStep(currentQuoteStep - 1));
nextStepButton.addEventListener("click", () => updateQuoteStep(currentQuoteStep + 1));
quoteSteps.forEach((button) => {
  button.addEventListener("click", () => updateQuoteStep(Number(button.dataset.stepTarget)));
});
aiHelperButton.addEventListener("click", refineWithAi);
quoteSubmitButton.addEventListener("click", saveQuoteRequest);

year.textContent = new Date().getFullYear();
updateHeader();
initReveals();
updateQuoteStep(1);
