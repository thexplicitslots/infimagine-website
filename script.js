const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const form = document.querySelector("#quote-form");
const estimate = document.querySelector("[data-estimate]");
const whatsapp = document.querySelector("[data-whatsapp]");
const quoteStepLabel = document.querySelector("[data-step-label]");
const quoteGroups = [...document.querySelectorAll("[data-step]")];
const quoteSteps = [...document.querySelectorAll("[data-step-target]")];
const prevStepButton = document.querySelector("[data-prev-step]");
const nextStepButton = document.querySelector("[data-next-step]");
const aiHelperButton = document.querySelector("[data-ai-helper]");
const aiOutput = document.querySelector("[data-ai-output]");
const aiStatus = document.querySelector("[data-ai-status]");
const year = document.querySelector("[data-year]");
const totalQuoteSteps = quoteGroups.length;
let currentQuoteStep = 1;

const revealTargets = [...new Set([
  ".statement-grid",
  ".section-heading",
  ".service-card",
  ".showcase-item",
  ".preview-copy",
  ".product-preview",
  ".steps li",
  ".estimate-copy",
  ".quote-form",
  ".contact-grid",
].flatMap((selector) => [...document.querySelectorAll(selector)]))];

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

function selectedLabel(name, data = new FormData(form)) {
  const value = data.get(name);
  const option = form.querySelector(`[name="${name}"] option[value="${CSS.escape(value)}"]`);
  return option?.textContent.trim() || value || "Not specified";
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
  quoteStepLabel.textContent = `Step ${currentQuoteStep} of ${totalQuoteSteps} · Starting estimate`;

  const brief = [
    "Hi InfiMagine, I want a quote for a custom 3D print.",
    "",
    "Contact",
    `Name: ${fieldValue(data, "customerName")}`,
    `Phone/email: ${fieldValue(data, "contactDetail")}`,
    "",
    "Project details",
    `Type: ${selectedLabel("projectType", data)}`,
    `Quantity: ${selectedLabel("quantity", data)}`,
    `Approx size: ${selectedLabel("size", data)}`,
    `Dimensions: ${fieldValue(data, "dimensions")}`,
    `Design readiness: ${selectedLabel("readiness", data)}`,
    `Reference/file link: ${fieldValue(data, "referenceLink")}`,
    "",
    "Material and finish",
    `Material: ${selectedLabel("material", data)}`,
    `Color: ${fieldValue(data, "color")}`,
    `Finish: ${selectedLabel("finish", data)}`,
    `Strength priority: ${selectedLabel("strength", data)}`,
    "",
    "Timeline and delivery",
    `Timeline: ${selectedLabel("timeline", data)}`,
    `Budget: ${selectedLabel("budget", data)}`,
    `Delivery: ${selectedLabel("delivery", data)}`,
    `Location: ${fieldValue(data, "location")}`,
    "",
    "Idea description",
    fieldValue(data, "description"),
    "",
    "AI refined brief",
    fieldValue(data, "aiBrief"),
    "",
    `Website estimate: ${formatCurrency(low)} - ${formatCurrency(high)}`,
  ].join("\n");
  whatsapp.href = `https://wa.me/?text=${encodeURIComponent(brief)}`;
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
    budget: selectedLabel("budget", data),
    delivery: selectedLabel("delivery", data),
    location: fieldValue(data, "location"),
    description: fieldValue(data, "description"),
  };
}

async function refineWithAi() {
  aiStatus.textContent = "Refining your idea into a print-ready brief...";
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
    aiStatus.textContent = "AI brief ready. You can edit it before sending.";
    updateEstimate();
  } catch (error) {
    aiStatus.textContent = error.message;
  } finally {
    aiHelperButton.disabled = false;
    form.classList.remove("is-thinking");
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
prevStepButton.addEventListener("click", () => updateQuoteStep(currentQuoteStep - 1));
nextStepButton.addEventListener("click", () => updateQuoteStep(currentQuoteStep + 1));
quoteSteps.forEach((button) => {
  button.addEventListener("click", () => updateQuoteStep(Number(button.dataset.stepTarget)));
});
aiHelperButton.addEventListener("click", refineWithAi);

year.textContent = new Date().getFullYear();
updateHeader();
initReveals();
updateQuoteStep(1);
