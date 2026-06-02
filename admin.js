const STORAGE_KEY = "infimagine_admin_leads_v1";

const leadList = document.querySelector("[data-lead-list]");
const pipelineBoard = document.querySelector("[data-pipeline-board]");
const searchInput = document.querySelector("[data-search]");
const statusFilter = document.querySelector("[data-status-filter]");
const exportButton = document.querySelector("[data-export]");
const addLeadButton = document.querySelector("[data-add-lead]");
const createLeadButton = document.querySelector("[data-create-lead]");
const deleteButton = document.querySelector("[data-delete]");
const emptyState = document.querySelector("[data-empty]");
const detail = document.querySelector("[data-detail]");
const connectionTitle = document.querySelector("[data-connection-title]");
const connectionCopy = document.querySelector("[data-connection-copy]");
const fileViewer = document.querySelector("[data-file-viewer]");
const viewerStage = document.querySelector("[data-viewer-stage]");
const viewerTitle = document.querySelector("[data-viewer-title]");
const viewerMeta = document.querySelector("[data-viewer-meta]");
const viewerDownload = document.querySelector("[data-viewer-download]");
const viewerReset = document.querySelector("[data-viewer-reset]");
const viewerRotate = document.querySelector("[data-viewer-rotate]");
const viewerWireframe = document.querySelector("[data-viewer-wireframe]");
const viewerCloseButtons = [...document.querySelectorAll("[data-viewer-close]")];

const detailFields = {
  type: document.querySelector("[data-detail-type]"),
  title: document.querySelector("[data-detail-title]"),
  contact: document.querySelector("[data-detail-contact]"),
  status: document.querySelector("[data-detail-status]"),
  statusSelect: document.querySelector("[data-detail-status-select]"),
  priority: document.querySelector("[data-detail-priority]"),
  estimate: document.querySelector("[data-detail-estimate]"),
  material: document.querySelector("[data-detail-material]"),
  finish: document.querySelector("[data-detail-finish]"),
  timeline: document.querySelector("[data-detail-timeline]"),
  followUp: document.querySelector("[data-detail-follow-up]"),
  followUpLabel: document.querySelector("[data-detail-follow-up-label]"),
  created: document.querySelector("[data-detail-created]"),
  description: document.querySelector("[data-detail-description]"),
  possibilities: document.querySelector("[data-detail-possibilities]"),
  attachments: document.querySelector("[data-detail-attachments]"),
  notes: document.querySelector("[data-detail-notes]"),
  whatsapp: document.querySelector("[data-detail-whatsapp]"),
};

const newFields = {
  name: document.querySelector("[data-new-name]"),
  contact: document.querySelector("[data-new-contact]"),
  type: document.querySelector("[data-new-type]"),
  estimate: document.querySelector("[data-new-estimate]"),
  material: document.querySelector("[data-new-material]"),
  finish: document.querySelector("[data-new-finish]"),
  followUp: document.querySelector("[data-new-follow-up]"),
  description: document.querySelector("[data-new-description]"),
};

const sampleLeads = [
  {
    id: "lead-1001",
    name: "Aarav Mehta",
    contact: "+91 98765 43210",
    type: "Prototype or product part",
    status: "New",
    priority: "High",
    estimate: "₹2,499 - ₹5,499",
    material: "PETG or Nylon",
    finish: "Functional matte black",
    timeline: "Within 1 week",
    followUpDate: "2026-06-03",
    created: "2026-05-31T09:15:00.000Z",
    description: "Compact phone stand with cable routing for a desk setup.",
    possibilities:
      "Rotating cradle, hidden cable channel, weighted base, matte black finish, initials on the rear face, and optional wireless charging puck recess.",
    attachments: [
      { name: "desk-stand-sketch.jpg", size: 840000, type: "image/jpeg", stored: false },
    ],
    notes: "Ask for phone model and preferred viewing angle.",
  },
  {
    id: "lead-1002",
    name: "Nisha Rao",
    contact: "nisha@example.com",
    type: "Personalized gift",
    status: "Contacted",
    priority: "Normal",
    estimate: "₹1,499 - ₹2,999",
    material: "PLA",
    finish: "Smooth painted",
    timeline: "3-5 days",
    followUpDate: "2026-06-04",
    created: "2026-05-30T13:35:00.000Z",
    description: "Custom nameplate and miniature desk object for a birthday gift.",
    possibilities:
      "Layered name typography, metallic paint finish, tiny hidden message on base, modular color insert, and soft rounded premium display stand.",
    attachments: [],
    notes: "Waiting for reference image and preferred color.",
  },
  {
    id: "lead-1003",
    name: "Kabir Studio",
    contact: "+91 90000 11111",
    type: "Model or miniature",
    status: "Designing",
    priority: "Normal",
    estimate: "₹6,999 - ₹14,999",
    material: "PLA or ABS/ASA",
    finish: "Architectural display finish",
    timeline: "Flexible",
    followUpDate: "",
    created: "2026-05-28T11:10:00.000Z",
    description: "Architectural scale model for a boutique retail kiosk.",
    possibilities:
      "Removable roof, transparent insert zones, magnetic wall sections, engraved floor plan, and a clean display plinth with project branding.",
    attachments: [
      { name: "kiosk-reference.pdf", size: 1240000, type: "application/pdf", stored: false },
    ],
    notes: "Prepare dimensions checklist before quote.",
  },
];

let leads = loadLeads();
let selectedId = leads[0]?.id || null;
const pipelineStatuses = ["New", "Contacted", "Designing", "Quoted", "Won"];
let remoteConfigured = false;
let notesSaveTimer;
let activeViewer = null;

function loadLeads() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleLeads));
    return sampleLeads;
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : sampleLeads;
  } catch {
    return sampleLeads;
  }
}

function saveLeads() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}

function updateConnectionNote(mode) {
  if (!connectionTitle || !connectionCopy) return;

  if (mode === "live") {
    connectionTitle.textContent = "Supabase live";
    connectionCopy.textContent = "Incoming website requests are loading from the connected database.";
    return;
  }

  if (mode === "error") {
    connectionTitle.textContent = "Local fallback";
    connectionCopy.textContent = "Could not load the database from this session, so local saved requests are shown.";
    return;
  }

  connectionTitle.textContent = "Connecting";
  connectionCopy.textContent = "Checking the live request database.";
}

async function loadRemoteLeads() {
  try {
    const response = await fetch("/api/quote-requests");
    const result = await response.json();

    if (!response.ok || !result.configured) {
      updateConnectionNote("error");
      return;
    }

    remoteConfigured = true;
    updateConnectionNote("live");
    leads = result.requests.length ? result.requests : leads;
    selectedId = leads[0]?.id || null;
    render();
  } catch {
    remoteConfigured = false;
    updateConnectionNote("error");
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function numericEstimate(value) {
  const numbers = String(value).match(/\d[\d,]*/g) || [];
  return numbers.reduce((sum, item) => sum + Number(item.replace(/,/g, "")), 0) / Math.max(numbers.length, 1);
}

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes) || 0;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fileExtension(file) {
  return String(file.name || file.url || "")
    .split("?")[0]
    .split("#")[0]
    .split(".")
    .pop()
    .toLowerCase();
}

function fileKind(file) {
  const type = String(file.type || "").toLowerCase();
  const extension = fileExtension(file);

  if (extension === "stl" || type.includes("stl")) return "stl";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) return "image";
  if (type.includes("pdf") || extension === "pdf") return "pdf";
  if (["obj", "step", "stp", "3mf"].includes(extension)) return "cad";
  return "file";
}

function statusClass(status) {
  return `status-${String(status).replace(/\s+/g, "-")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function filteredLeads() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  return leads.filter((lead) => {
    const matchesStatus = status === "all" || lead.status === status;
    const attachmentText = (lead.attachments || []).map((file) => `${file.name} ${file.type}`).join(" ");
    const text = [lead.name, lead.contact, lead.type, lead.status, lead.material, lead.finish, lead.description, lead.possibilities, attachmentText]
      .join(" ")
      .toLowerCase();
    return matchesStatus && text.includes(query);
  });
}

function renderMetrics() {
  const open = leads.filter((lead) => !["Won", "Archived"].includes(lead.status));
  const value = open.reduce((sum, lead) => sum + numericEstimate(lead.estimate), 0);

  document.querySelector('[data-metric="open"]').textContent = open.length;
  document.querySelector('[data-metric="new"]').textContent = leads.filter((lead) => lead.status === "New").length;
  document.querySelector('[data-metric="progress"]').textContent = leads.filter((lead) =>
    ["Contacted", "Designing", "Quoted"].includes(lead.status),
  ).length;
  document.querySelector('[data-metric="value"]').textContent = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function renderLeads() {
  const visibleLeads = filteredLeads();
  leadList.innerHTML = "";

  if (!visibleLeads.length) {
    leadList.innerHTML = '<div class="detail-empty"><p>No matching requests.</p></div>';
    return;
  }

  visibleLeads.forEach((lead) => {
    const button = document.createElement("button");
    button.className = `lead-card ${lead.id === selectedId ? "is-active" : ""}`;
    button.type = "button";
    button.dataset.id = lead.id;
    button.innerHTML = `
      <div class="lead-top">
        <strong>${escapeHtml(lead.name)}</strong>
        <span class="status-pill ${statusClass(lead.status)}">${escapeHtml(lead.status)}</span>
      </div>
      <p>${escapeHtml(lead.description)}</p>
      <div class="lead-meta">
        <span class="meta-pill">${escapeHtml(lead.contact)}</span>
        <span class="meta-pill">${escapeHtml(lead.type)}</span>
        <span class="meta-pill">${escapeHtml(lead.estimate)}</span>
        <span class="meta-pill">${(lead.attachments || []).length} files</span>
        <span class="meta-pill">Follow-up: ${escapeHtml(formatDateOnly(lead.followUpDate))}</span>
        <span class="meta-pill">${escapeHtml(formatDate(lead.created))}</span>
      </div>
    `;
    leadList.append(button);
  });
}

function renderPipeline() {
  pipelineBoard.innerHTML = "";

  pipelineStatuses.forEach((status) => {
    const statusLeads = leads.filter((lead) => lead.status === status);
    const column = document.createElement("article");
    column.className = "pipeline-column";
    column.innerHTML = `
      <div class="pipeline-heading">
        <span>${escapeHtml(status)}</span>
        <strong>${statusLeads.length}</strong>
      </div>
      <div class="pipeline-items"></div>
    `;

    const items = column.querySelector(".pipeline-items");

    if (!statusLeads.length) {
      items.innerHTML = '<p class="pipeline-empty">No requests</p>';
    } else {
      statusLeads.forEach((lead) => {
        const item = document.createElement("button");
        item.className = "pipeline-card";
        item.type = "button";
        item.dataset.id = lead.id;
        item.innerHTML = `
          <strong>${escapeHtml(lead.name)}</strong>
          <span>${escapeHtml(lead.type)}</span>
          <small>${escapeHtml(lead.estimate)}</small>
          <small>Follow-up: ${escapeHtml(formatDateOnly(lead.followUpDate))}</small>
        `;
        items.append(item);
      });
    }

    pipelineBoard.append(column);
  });
}

function selectedLead() {
  return leads.find((lead) => lead.id === selectedId) || leads[0];
}

function renderDetail() {
  const lead = selectedLead();
  if (!lead) {
    emptyState.hidden = false;
    detail.hidden = true;
    return;
  }

  selectedId = lead.id;
  emptyState.hidden = true;
  detail.hidden = false;
  detailFields.type.textContent = lead.type;
  detailFields.title.textContent = lead.name;
  detailFields.contact.textContent = lead.contact;
  detailFields.status.textContent = lead.status;
  detailFields.status.className = `status-pill ${statusClass(lead.status)}`;
  detailFields.statusSelect.value = lead.status;
  detailFields.priority.value = lead.priority;
  detailFields.estimate.textContent = lead.estimate;
  detailFields.material.textContent = lead.material || "Not set";
  detailFields.finish.textContent = lead.finish || "Not set";
  detailFields.timeline.textContent = lead.timeline || "Not set";
  detailFields.followUp.value = lead.followUpDate || "";
  detailFields.followUpLabel.textContent = formatDateOnly(lead.followUpDate);
  detailFields.created.textContent = formatDate(lead.created);
  detailFields.description.textContent = lead.description;
  detailFields.possibilities.textContent = lead.possibilities || "No AI design possibilities saved yet.";
  renderAttachments(lead.attachments || []);
  detailFields.notes.value = lead.notes || "";
  detailFields.whatsapp.href = `https://wa.me/?text=${encodeURIComponent(
    `Hi ${lead.name}, this is InfiMagine about your ${lead.type.toLowerCase()} request.`,
  )}`;
}

function renderAttachments(attachments) {
  if (!attachments.length) {
    detailFields.attachments.innerHTML = '<p class="attachment-empty">No uploaded files for this request.</p>';
    return;
  }

  detailFields.attachments.innerHTML = attachments
    .map((file) => {
      const name = escapeHtml(file.name || "Attachment");
      const meta = escapeHtml([file.type, file.size ? formatBytes(file.size) : ""].filter(Boolean).join(" · "));
      const href = file.url ? escapeHtml(file.url) : "";
      const label = file.stored ? "Uploaded" : "Captured";
      const encodedFile = encodeURIComponent(JSON.stringify(file));

      if (href) {
        return `
          <div class="attachment-link">
            <strong>${name}</strong>
            <span>${meta}</span>
            <em>${label}</em>
            <div class="attachment-actions">
              <button type="button" data-view-file="${encodedFile}">View</button>
              <a href="${href}" target="_blank" rel="noreferrer">Open file</a>
              <button type="button" data-copy-file-url="${href}">Copy link</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="attachment-link is-static">
          <strong>${name}</strong>
          <span>${meta}</span>
          <em>${label}</em>
        </div>
      `;
    })
    .join("");
}

async function handleAttachmentAction(event) {
  const viewButton = event.target.closest("[data-view-file]");
  const openButton = event.target.closest("[data-file-url]");
  const copyButton = event.target.closest("[data-copy-file-url]");

  if (viewButton) {
    try {
      openFileViewer(JSON.parse(decodeURIComponent(viewButton.dataset.viewFile)));
    } catch {
      window.alert("Could not open this file preview.");
    }
    return;
  }

  if (openButton) {
    const url = openButton.dataset.fileUrl;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) window.location.href = url;
    return;
  }

  if (copyButton) {
    const url = copyButton.dataset.copyFileUrl;
    try {
      await navigator.clipboard.writeText(url);
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy link";
      }, 1400);
    } catch {
      window.prompt("Copy file link", url);
    }
  }
}

function clearViewer() {
  if (activeViewer?.resizeObserver) activeViewer.resizeObserver.disconnect();
  if (activeViewer?.animationFrame) cancelAnimationFrame(activeViewer.animationFrame);
  if (activeViewer?.renderer) activeViewer.renderer.dispose();
  if (activeViewer?.geometry) activeViewer.geometry.dispose();
  if (activeViewer?.material) activeViewer.material.dispose();
  if (activeViewer?.controls) activeViewer.controls.dispose();
  activeViewer = null;
  viewerStage.innerHTML = '<div class="viewer-loader">Loading file preview...</div>';
}

function closeFileViewer() {
  fileViewer.hidden = true;
  document.body.classList.remove("is-viewing-file");
  clearViewer();
}

function setViewerFallback(file, message) {
  viewerStage.innerHTML = `
    <div class="viewer-fallback">
      <strong>${escapeHtml(message)}</strong>
      <p>${escapeHtml(file.name || "Attachment")}</p>
      <a href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer">Open original file</a>
    </div>
  `;
}

function openFileViewer(file) {
  if (!file?.url) return;

  clearViewer();
  const kind = fileKind(file);
  viewerTitle.textContent = file.name || "Attachment";
  viewerMeta.textContent = [kind.toUpperCase(), file.size ? formatBytes(file.size) : "", file.type || ""].filter(Boolean).join(" · ");
  viewerDownload.href = file.url;
  viewerRotate.classList.remove("is-active");
  viewerWireframe.classList.remove("is-active");
  viewerRotate.disabled = kind !== "stl";
  viewerWireframe.disabled = kind !== "stl";
  viewerReset.disabled = kind !== "stl";
  fileViewer.hidden = false;
  document.body.classList.add("is-viewing-file");

  if (kind === "stl") {
    renderStlViewer(file);
    return;
  }

  if (kind === "image") {
    viewerStage.innerHTML = `<img class="viewer-image" src="${escapeHtml(file.url)}" alt="${escapeHtml(file.name || "Uploaded image")}" />`;
    return;
  }

  if (kind === "pdf") {
    viewerStage.innerHTML = `<iframe class="viewer-frame" src="${escapeHtml(file.url)}" title="${escapeHtml(file.name || "Uploaded PDF")}"></iframe>`;
    return;
  }

  setViewerFallback(file, kind === "cad" ? "Inline preview is currently available for STL files." : "This file type is ready to open externally.");
}

async function renderStlViewer(file) {
  viewerStage.innerHTML = '<div class="viewer-loader">Preparing 3D viewbox...</div>';

  try {
    const [THREE, { OrbitControls }, { STLLoader }] = await Promise.all([
      import("https://esm.sh/three@0.160.0"),
      import("https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js"),
      import("https://esm.sh/three@0.160.0/examples/jsm/loaders/STLLoader.js"),
    ]);

    viewerStage.innerHTML = '<div class="viewer-canvas" data-viewer-canvas></div>';
    const canvasHost = viewerStage.querySelector("[data-viewer-canvas]");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03090d);

    const camera = new THREE.PerspectiveCamera(45, canvasHost.clientWidth / canvasHost.clientHeight, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvasHost.append(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 1.3;

    scene.add(new THREE.HemisphereLight(0xcff8ff, 0x081014, 2.7));
    const keyLight = new THREE.DirectionalLight(0x9fefff, 3.1);
    keyLight.position.set(2.5, 3.8, 4.5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.35);
    rimLight.position.set(-3, 1.8, -2);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(160, 40, 0x2edaff, 0x12313a);
    grid.material.transparent = true;
    grid.material.opacity = 0.18;
    scene.add(grid);

    const loader = new STLLoader();
    loader.load(
      file.url,
      (geometry) => {
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometry.center();

        const radius = Math.max(geometry.boundingSphere?.radius || 1, 1);
        const material = new THREE.MeshStandardMaterial({
          color: 0xdafcff,
          metalness: 0.22,
          roughness: 0.38,
          emissive: 0x06242b,
          emissiveIntensity: 0.22,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        scene.add(mesh);

        grid.scale.setScalar(Math.max(radius / 80, 0.5));
        camera.position.set(radius * 1.45, radius * 1.1, radius * 2.15);
        camera.near = Math.max(radius / 1000, 0.01);
        camera.far = radius * 30;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        activeViewer = {
          ...activeViewer,
          camera,
          controls,
          geometry,
          material,
          mesh,
          renderer,
          reset() {
            controls.autoRotate = false;
            material.wireframe = false;
            camera.position.set(radius * 1.45, radius * 1.1, radius * 2.15);
            controls.target.set(0, 0, 0);
            controls.update();
            viewerRotate.classList.remove("is-active");
            viewerWireframe.classList.remove("is-active");
          },
        };
      },
      undefined,
      () => {
        setViewerFallback(file, "This STL could not be loaded in the viewbox.");
      },
    );

    const resizeObserver = new ResizeObserver(() => {
      if (!canvasHost.clientWidth || !canvasHost.clientHeight) return;
      camera.aspect = canvasHost.clientWidth / canvasHost.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
    });
    resizeObserver.observe(canvasHost);

    function animate() {
      activeViewer.animationFrame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    activeViewer = { controls, renderer, resizeObserver };
    animate();
  } catch (error) {
    setViewerFallback(file, "3D viewer could not load. Open the original STL instead.");
  }
}

function render() {
  renderMetrics();
  renderLeads();
  renderPipeline();
  renderDetail();
}

function updateSelected(updates) {
  leads = leads.map((lead) => (lead.id === selectedId ? { ...lead, ...updates } : lead));
  saveLeads();
  render();

  if (remoteConfigured) {
    fetch("/api/quote-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedId, updates }),
    }).catch(() => {});
  }
}

function createLead() {
  const name = newFields.name.value.trim() || "New customer";
  const description = newFields.description.value.trim() || "Customer wants a custom 3D printed object.";
  const lead = {
    id: `lead-${Date.now()}`,
    name,
    contact: newFields.contact.value.trim() || "Not specified",
    type: newFields.type.value,
    status: "New",
    priority: "Normal",
    estimate: newFields.estimate.value.trim() || "Not estimated",
    material: newFields.material.value.trim() || "Recommend after review",
    finish: newFields.finish.value.trim() || "Not set",
    timeline: "Not set",
    followUpDate: newFields.followUp.value,
    created: new Date().toISOString(),
    description,
    possibilities: "Use the AI Design Explorer from the quote flow, then paste the strongest ideas here.",
    attachments: [],
    notes: "",
  };

  leads = [lead, ...leads];
  selectedId = lead.id;
  saveLeads();
  Object.values(newFields).forEach((field) => {
    if (field.tagName !== "SELECT") field.value = "";
  });
  render();
}

function exportCsv() {
  const headers = ["Name", "Contact", "Type", "Status", "Priority", "Estimate", "Material", "Finish", "Timeline", "Follow-up", "Created", "Description", "AI Possibilities", "Attachments", "Notes"];
  const rows = leads.map((lead) =>
    [
      lead.name,
      lead.contact,
      lead.type,
      lead.status,
      lead.priority,
      lead.estimate,
      lead.material,
      lead.finish,
      lead.timeline,
      lead.followUpDate,
      lead.created,
      lead.description,
      lead.possibilities,
      (lead.attachments || []).map((file) => file.url || file.path || file.name).join(" | "),
      lead.notes,
    ]
      .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
      .join(","),
  );
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `infimagine-requests-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

leadList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  selectedId = card.dataset.id;
  render();
});

pipelineBoard.addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  selectedId = card.dataset.id;
  document.querySelector("#requests").scrollIntoView({ behavior: "smooth", block: "start" });
  render();
});

searchInput.addEventListener("input", renderLeads);
statusFilter.addEventListener("change", renderLeads);
exportButton.addEventListener("click", exportCsv);
addLeadButton.addEventListener("click", () => document.querySelector("#import").scrollIntoView({ behavior: "smooth" }));
createLeadButton.addEventListener("click", createLead);
detailFields.attachments.addEventListener("click", handleAttachmentAction);
viewerCloseButtons.forEach((button) => button.addEventListener("click", closeFileViewer));
viewerReset.addEventListener("click", () => activeViewer?.reset?.());
viewerRotate.addEventListener("click", () => {
  if (!activeViewer?.controls) return;
  activeViewer.controls.autoRotate = !activeViewer.controls.autoRotate;
  viewerRotate.classList.toggle("is-active", activeViewer.controls.autoRotate);
});
viewerWireframe.addEventListener("click", () => {
  if (!activeViewer?.material) return;
  activeViewer.material.wireframe = !activeViewer.material.wireframe;
  viewerWireframe.classList.toggle("is-active", activeViewer.material.wireframe);
});
detailFields.statusSelect.addEventListener("change", () => updateSelected({ status: detailFields.statusSelect.value }));
detailFields.priority.addEventListener("change", () => updateSelected({ priority: detailFields.priority.value }));
detailFields.followUp.addEventListener("change", () => updateSelected({ followUpDate: detailFields.followUp.value }));
detailFields.notes.addEventListener("input", () => {
  leads = leads.map((lead) => (lead.id === selectedId ? { ...lead, notes: detailFields.notes.value } : lead));
  saveLeads();

  if (remoteConfigured) {
    window.clearTimeout(notesSaveTimer);
    notesSaveTimer = window.setTimeout(() => {
      fetch("/api/quote-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, updates: { notes: detailFields.notes.value } }),
      }).catch(() => {});
    }, 600);
  }
});
deleteButton.addEventListener("click", () => updateSelected({ status: "Archived" }));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !fileViewer.hidden) closeFileViewer();
});

render();
loadRemoteLeads();
