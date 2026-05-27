const state = {
  productos: [],
  muebles: {},
  currentId: "",
  currentZone: "",
  drawing: false,
  draft: [],
  dragging: null,
  localImageUrl: "",
};

const $ = (id) => document.getElementById(id);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.add("hidden"), 2600);
}

async function fetchJson(path) {
  const res = await fetch(`${path}?v=${Date.now()}`);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

async function boot() {
  bindEvents();

  try {
    const [productos, muebles] = await Promise.all([
      fetchJson("data/productos.json"),
      fetchJson("data/muebles.json"),
    ]);
    state.productos = productos;
    state.muebles = muebles;
    $("adminStatus").textContent = "Datos cargados";
  } catch (error) {
    console.warn(error);
    $("adminStatus").textContent = "Modo manual";
    toast("No se pudo cargar por fetch. Use los botones para cargar JSON manualmente o abra con Live Server.");
  }

  ensureMueblesFromProducts();
  renderSelectors();
  validate();
}

function bindEvents() {
  $("muebleSelect").addEventListener("change", () => {
    state.currentId = $("muebleSelect").value;
    state.currentZone = "";
    clearDraft();
    renderZoneOptions();
    loadCurrentImage();
    renderEditor();
  });

  $("zoneSelect").addEventListener("change", () => {
    state.currentZone = $("zoneSelect").value;
    clearDraft();
    renderEditor();
  });

  $("imagePathInput").addEventListener("input", () => {
    ensureCurrentMueble();
    state.muebles[state.currentId].image = $("imagePathInput").value.trim();
  });

  $("imageFile").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (state.localImageUrl) URL.revokeObjectURL(state.localImageUrl);
    state.localImageUrl = URL.createObjectURL(file);
    $("adminImage").src = state.localImageUrl;
    toast("Imagen local cargada. No se subió al repositorio.");
  });

  $("productosFile").addEventListener("change", async (event) => {
    const data = await readJsonFile(event.target.files?.[0]);
    if (!data) return;
    state.productos = data;
    ensureMueblesFromProducts();
    renderSelectors();
    validate();
    toast("productos.json cargado.");
  });

  $("mueblesFile").addEventListener("change", async (event) => {
    const data = await readJsonFile(event.target.files?.[0]);
    if (!data) return;
    state.muebles = data;
    ensureMueblesFromProducts();
    renderSelectors();
    validate();
    toast("muebles.json cargado.");
  });

  $("newPolygonButton").addEventListener("click", startDrawing);
  $("closePolygonButton").addEventListener("click", closePolygon);
  $("deletePolygonButton").addEventListener("click", deletePolygon);
  $("deletePointButton").addEventListener("click", deleteLastPoint);
  $("clearDraftButton").addEventListener("click", () => {
    clearDraft();
    renderEditor();
  });
  $("validateButton").addEventListener("click", validate);
  $("exportButton").addEventListener("click", exportMuebles);
  $("exportButtonTop").addEventListener("click", exportMuebles);

  const overlay = $("adminOverlay");
  overlay.addEventListener("click", onOverlayClick);
  overlay.addEventListener("mousedown", onOverlayMouseDown);
  window.addEventListener("mousemove", onWindowMouseMove);
  window.addEventListener("mouseup", () => { state.dragging = null; });
}

function ensureMueblesFromProducts() {
  const grouped = groupProductLocations();
  for (const [id, info] of grouped.entries()) {
    if (!state.muebles[id]) {
      state.muebles[id] = {
        display_name: info.name || id,
        image: "",
        zones: {},
      };
    }
    state.muebles[id].display_name ||= info.name || id;
    state.muebles[id].zones ||= {};
    info.zones.forEach((zone) => {
      state.muebles[id].zones[zone] ||= { notes: "Ubicación detectada desde productos.json; falta dibujar polígono." };
    });
  }
}

function groupProductLocations() {
  const map = new Map();
  state.productos.forEach((p) => {
    const id = p.id_mueble || "SIN_ID";
    const current = map.get(id) || { name: p.mueble || id, zones: new Set() };
    if (p.ubicacion) current.zones.add(String(p.ubicacion));
    map.set(id, current);
  });

  Object.entries(state.muebles).forEach(([id, m]) => {
    const current = map.get(id) || { name: m.display_name || id, zones: new Set() };
    Object.keys(m.zones || {}).forEach(z => current.zones.add(z));
    map.set(id, current);
  });

  return map;
}

function renderSelectors() {
  const ids = [...groupProductLocations().keys()].sort((a, b) => a.localeCompare(b, "es"));
  $("muebleSelect").innerHTML = ids.map((id) => {
    const m = state.muebles[id] || {};
    return `<option value="${escapeHtml(id)}">${escapeHtml(id)} · ${escapeHtml(m.display_name || id)}</option>`;
  }).join("");

  if (!state.currentId && ids.length) state.currentId = ids[0];
  $("muebleSelect").value = state.currentId;
  renderZoneOptions();
  loadCurrentImage();
  renderEditor();
}

function sortZones(zones) {
  return zones.sort((a, b) => {
    const ra = String(a).match(/^([A-Za-z ]+)?(\d+)?/);
    const rb = String(b).match(/^([A-Za-z ]+)?(\d+)?/);
    const la = (ra?.[1] || "").localeCompare(rb?.[1] || "", "es");
    if (la !== 0) return la;
    return Number(ra?.[2] || 0) - Number(rb?.[2] || 0) || String(a).localeCompare(String(b), "es");
  });
}

function renderZoneOptions() {
  ensureCurrentMueble();
  const zones = sortZones(Object.keys(state.muebles[state.currentId].zones || {}));
  $("zoneSelect").innerHTML = zones.map((zone) => `<option value="${escapeHtml(zone)}">${escapeHtml(zone)}</option>`).join("");
  if (!state.currentZone || !zones.includes(state.currentZone)) {
    state.currentZone = zones[0] || "";
  }
  $("zoneSelect").value = state.currentZone;
}

function ensureCurrentMueble() {
  if (!state.currentId) return;
  if (!state.muebles[state.currentId]) {
    state.muebles[state.currentId] = { display_name: state.currentId, image: "", zones: {} };
  }
  state.muebles[state.currentId].zones ||= {};
}

function loadCurrentImage() {
  ensureCurrentMueble();
  const m = state.muebles[state.currentId] || {};
  $("imagePathInput").value = m.image || "";
  $("adminImage").src = state.localImageUrl || m.image || "";
}

async function readJsonFile(file) {
  if (!file) return null;
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    toast("Archivo JSON inválido.");
    console.error(error);
    return null;
  }
}

function currentZoneData() {
  ensureCurrentMueble();
  if (!state.currentZone) return null;
  state.muebles[state.currentId].zones[state.currentZone] ||= {};
  return state.muebles[state.currentId].zones[state.currentZone];
}

function svgPointFromEvent(event) {
  const rect = $("adminOverlay").getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  return [Number(x.toFixed(5)), Number(y.toFixed(5))];
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function startDrawing() {
  if (!state.currentId || !state.currentZone) {
    toast("Seleccione mueble y ubicación.");
    return;
  }
  state.drawing = true;
  state.draft = [];
  toast("Modo dibujo activo: haga clic en los vértices de la zona.");
  renderEditor();
}

function onOverlayClick(event) {
  if (!state.drawing || event.target.classList.contains("vertex")) return;
  const point = svgPointFromEvent(event);

  if (state.draft.length >= 3 && distance(point, state.draft[0]) < 0.035) {
    closePolygon();
    return;
  }

  state.draft.push(point);
  renderEditor();
}

function closePolygon() {
  if (!state.drawing || state.draft.length < 3) {
    toast("Se necesitan al menos 3 puntos para cerrar.");
    return;
  }

  const z = currentZoneData();
  z.poly_norm = state.draft.map(p => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]);
  z.bbox_norm = bbox(z.poly_norm);
  z.notes = z.notes || "";

  state.drawing = false;
  state.draft = [];
  renderEditor();
  validate();
  toast("Polígono guardado en la zona seleccionada.");
}

function deletePolygon() {
  const z = currentZoneData();
  if (!z) return;
  delete z.poly_norm;
  delete z.bbox_norm;
  z.notes = z.notes || "Zona sin polígono.";
  clearDraft();
  renderEditor();
  validate();
  toast("Polígono eliminado. La zona queda como fallback textual.");
}

function deleteLastPoint() {
  if (state.drawing && state.draft.length) {
    state.draft.pop();
    renderEditor();
    return;
  }

  const z = currentZoneData();
  if (z?.poly_norm?.length) {
    z.poly_norm.pop();
    if (z.poly_norm.length >= 3) z.bbox_norm = bbox(z.poly_norm);
    else {
      delete z.poly_norm;
      delete z.bbox_norm;
    }
    renderEditor();
  }
}

function clearDraft() {
  state.drawing = false;
  state.draft = [];
}

function bbox(points) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return [
    Number(Math.min(...xs).toFixed(5)),
    Number(Math.min(...ys).toFixed(5)),
    Number(Math.max(...xs).toFixed(5)),
    Number(Math.max(...ys).toFixed(5)),
  ];
}

function polygonPoints(points) {
  return points.map(([x, y]) => `${Number(x).toFixed(5)},${Number(y).toFixed(5)}`).join(" ");
}

function centroid(points) {
  return [
    points.reduce((sum, p) => sum + p[0], 0) / points.length,
    points.reduce((sum, p) => sum + p[1], 0) / points.length,
  ];
}

function renderEditor() {
  ensureCurrentMueble();
  const mueble = state.muebles[state.currentId] || { zones: {} };
  const zoneData = mueble.zones?.[state.currentZone] || {};
  const fragments = [];

  Object.entries(mueble.zones || {}).forEach(([zoneName, data]) => {
    if (!data.poly_norm?.length) return;
    const selected = zoneName === state.currentZone;
    fragments.push(`<polygon class="zone-poly ${selected ? "selected" : ""}" points="${polygonPoints(data.poly_norm)}"></polygon>`);
    const [cx, cy] = centroid(data.poly_norm);
    fragments.push(`<text class="zone-label" x="${cx}" y="${cy}">${escapeHtml(zoneName)}</text>`);
  });

  const pointsToEdit = state.drawing ? state.draft : (zoneData.poly_norm || []);
  if (state.drawing && state.draft.length) {
    fragments.push(`<polyline class="draft-line" points="${polygonPoints(state.draft)}"></polyline>`);
  }

  pointsToEdit.forEach(([x, y], index) => {
    fragments.push(`<circle class="vertex" data-index="${index}" cx="${x}" cy="${y}" r="0.014"></circle>`);
  });

  $("adminOverlay").innerHTML = fragments.join("");
  $("editorKicker").textContent = state.currentId ? `${state.currentId} · ${mueble.display_name || ""}` : "Sin selección";
  $("editorTitle").textContent = state.currentZone ? `Ubicación ${state.currentZone}` : "Seleccione ubicación";
  $("pointCounter").textContent = `${pointsToEdit.length} punto${pointsToEdit.length === 1 ? "" : "s"}`;
}

function onOverlayMouseDown(event) {
  if (!event.target.classList.contains("vertex")) return;
  event.preventDefault();
  state.dragging = {
    index: Number(event.target.dataset.index),
    isDraft: state.drawing,
  };
}

function onWindowMouseMove(event) {
  if (!state.dragging) return;
  const point = svgPointFromEvent(event);
  if (state.dragging.isDraft) {
    state.draft[state.dragging.index] = point;
  } else {
    const z = currentZoneData();
    if (z?.poly_norm?.[state.dragging.index]) {
      z.poly_norm[state.dragging.index] = point;
      z.bbox_norm = bbox(z.poly_norm);
    }
  }
  renderEditor();
}

function validate() {
  const grouped = groupProductLocations();
  const missingZone = [];
  const missingPoly = [];

  for (const [id, info] of grouped.entries()) {
    const mueble = state.muebles[id];
    info.zones.forEach((zoneName) => {
      const z = mueble?.zones?.[zoneName];
      if (!z) missingZone.push({ id, zoneName });
      else if (!z.poly_norm?.length) missingPoly.push({ id, zoneName });
    });
  }

  $("validationSummary").textContent = `${missingPoly.length} sin polígono`;
  const html = [
    ...missingZone.map(item => `<div class="validation-item"><strong>${escapeHtml(item.id)}</strong> · falta entrada de zona <code>${escapeHtml(item.zoneName)}</code></div>`),
    ...missingPoly.map(item => `<div class="validation-item"><strong>${escapeHtml(item.id)}</strong> · ubicación <code>${escapeHtml(item.zoneName)}</code> sin polígono</div>`),
  ].join("");

  $("validationList").innerHTML = html || `<div class="validation-item"><strong>Todo listo.</strong> Las ubicaciones presentes en productos.json tienen polígono.</div>`;
  return { missingZone, missingPoly };
}

function exportMuebles() {
  validate();
  const payload = JSON.stringify(state.muebles, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "muebles.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Archivo muebles.json exportado. Súbalo a /data/muebles.json.");
}

boot();
