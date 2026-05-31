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

  const base = priceRanges[projectType][size];
  const readinessCost = readinessAdders[readiness];
  const finishCost = finishAdders[finish];
  const low = base[0] + readinessCost[0] + finishCost[0];
  const high = base[1] + readinessCost[1] + finishCost[1];

  estimate.textContent = `${formatCurrency(low)} - ${formatCurrency(high)}`;

  const label = form.querySelector(`[name="projectType"] option[value="${projectType}"]`).textContent;
  const brief = `Hi InfiMagine, I want to make a ${label.toLowerCase()}. Size: ${size}. Readiness: ${readiness}. Finish: ${finish}. Estimated range shown: ${formatCurrency(low)} - ${formatCurrency(high)}.`;
  whatsapp.href = `https://wa.me/?text=${encodeURIComponent(brief)}`;
}

window.addEventListener("scroll", updateHeader, { passive: true });
form.addEventListener("change", updateEstimate);

year.textContent = new Date().getFullYear();
updateHeader();
updateEstimate();
