const header = document.querySelector("[data-header]");
const form = document.querySelector("#quote-form");
const estimate = document.querySelector("[data-estimate]");
const whatsapp = document.querySelector("[data-whatsapp]");
const year = document.querySelector("[data-year]");

const priceRanges = {
  gift: { small: [799, 1499], medium: [1499, 2999], large: [2999, 5999] },
  prototype: { small: [999, 2499], medium: [2499, 5499], large: [5499, 11999] },
  model: { small: [1199, 2499], medium: [2499, 6999], large: [6999, 14999] },
  utility: { small: [499, 1299], medium: [1299, 3499], large: [3499, 7999] },
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

  estimate.textContent = `${formatCurrency(low)} - ${formatCurrency(high)}`;

  const fieldValue = (name) => data.get(name)?.trim() || "Not specified";
  const selectedLabel = (name) => {
    const value = data.get(name);
    const option = form.querySelector(`[name="${name}"] option[value="${CSS.escape(value)}"]`);
    return option?.textContent.trim() || value || "Not specified";
  };
  const brief = [
    "Hi InfiMagine, I want a quote for a custom 3D print.",
    "",
    "Contact",
    `Name: ${fieldValue("customerName")}`,
    `Phone/email: ${fieldValue("contactDetail")}`,
    "",
    "Project details",
    `Type: ${selectedLabel("projectType")}`,
    `Quantity: ${selectedLabel("quantity")}`,
    `Approx size: ${selectedLabel("size")}`,
    `Dimensions: ${fieldValue("dimensions")}`,
    `Design readiness: ${selectedLabel("readiness")}`,
    `Reference/file link: ${fieldValue("referenceLink")}`,
    "",
    "Material and finish",
    `Material: ${selectedLabel("material")}`,
    `Color: ${fieldValue("color")}`,
    `Finish: ${selectedLabel("finish")}`,
    `Strength priority: ${selectedLabel("strength")}`,
    "",
    "Timeline and delivery",
    `Timeline: ${selectedLabel("timeline")}`,
    `Budget: ${selectedLabel("budget")}`,
    `Delivery: ${selectedLabel("delivery")}`,
    `Location: ${fieldValue("location")}`,
    "",
    "Idea description",
    fieldValue("description"),
    "",
    `Website estimate: ${formatCurrency(low)} - ${formatCurrency(high)}`,
  ].join("\n");
  whatsapp.href = `https://wa.me/?text=${encodeURIComponent(brief)}`;
}

window.addEventListener("scroll", updateHeader, { passive: true });
form.addEventListener("input", updateEstimate);
form.addEventListener("change", updateEstimate);

year.textContent = new Date().getFullYear();
updateHeader();
updateEstimate();
