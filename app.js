const CONFIG = {
  highlight: "#E82C9A",
  dataVersion: new Date().toISOString().slice(0, 10),
};

const state = {
  productos: [],
  muebles: {},
  selectedProduct: null,
  selectedMuebleId: null,
  selectedZone: null,
  query: "",
  showAllZones: false,
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

async function fetchJson(path) {
  const res = await fetch(`${path}?v=${encodeURIComponent(CONFIG.dataVersion)}`);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function productKey(product) {
  return `${product.producto}|${product.id_mueble}|${product.ubicacion}`;
}

function initTheme() {
  $("themeButton")?.addEventListener("click", () => {
    document.body.classList.toggle("high-contrast");
  });
}

async function boot() {
  document.documentElement.style.setProperty("--highlight", CONFIG.highlight);
  document.documentElement.style.setProperty("--highlight-soft", "rgba(232, 44, 154, 0.14)");
  initTheme();

  try {
    const [productos, muebles] = await Promise.all([
      fetchJson("data/productos.json"),
      fetchJson("data/muebles.json"),
    ]);

    state.productos = productos;
    state.muebles = muebles;
    $("statusBadge").textContent = "Datos cargados";
    $("statusBadge").classList.add("ok");

    bindEvents();
    renderStats();
    renderMuebleList();
    renderResults();
    readUrlParams();
  } catch (error) {
    console.error(error);
    $("statusBadge").textContent = "Error al cargar datos";
    $("results").innerHTML = `<div class="fallback-panel"><strong>No se pudieron cargar los JSON.</strong><p>Abra el sitio desde GitHub Pages o un servidor local tipo Live Server. Detalle: ${escapeHtml(error.message)}</p></div>`;
  }
}

function bindEvents() {
  $("searchInput").addEventListener("input", (event) => {
    state.query = event.target.value;
    updateUrlQuery(state.query);
    renderResults();
  });

  $("clearButton").addEventListener("click", () => {
    state.query = "";
    $("searchInput").value = "";
    updateUrlQuery("");
    renderResults();
  });

  $("showAllZones").addEventListener("change", (event) => {
    state.showAllZones = event.target.checked;
    renderViewer();
  });

  document.querySelectorAll("[data-query]").forEach((button) => {
    button.addEventListener("click", () => {
      const query = button.dataset.query || "";
      $("searchInput").value = query;
      state.query = query;
      updateUrlQuery(query);
      renderResults();
    });
  });
}

function updateUrlQuery(query) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
}

function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  if (q) {
    state.query = q;
    $("searchInput").value = q;
    renderResults();
  }
}

function getFilteredProducts() {
  const q = normalizeText(state.query);
  if (!q) return state.productos.slice(0, 50);

  return state.productos.filter((p) => {
    const haystack = normalizeText(`${p.producto} ${p.mueble} ${p.id_mueble} ${p.ubicacion}`);
    return haystack.includes(q);
  });
}

function renderStats() {
  const total = state.productos.length;
  const muebles = uniqueCount(state.productos.map(p => p.id_mueble));
  const zonas = uniqueCount(state.productos.map(p => `${p.id_mueble}::${p.ubicacion}`));
  const conImagen = Object.values(state.muebles).filter(m => m.image).length;
  $("stats").innerHTML = `
    <div class="stat"><strong>${total}</strong><span>productos</span></div>
    <div class="stat"><strong>${muebles}</strong><span>muebles / caras</span></div>
    <div class="stat"><strong>${zonas}</strong><span>ubicaciones usadas</span></div>
    <div class="stat"><strong>${conImagen}</strong><span>muebles con imagen</span></div>
  `;
}

function renderResults() {
  const results = getFilteredProducts();
  $("resultCount").textContent = state.query
    ? `${results.length} coincidencia${results.length === 1 ? "" : "s"}`
    : "primeros 50";

  if (!results.length) {
    $("results").innerHTML = `<div class="empty-state"><div><h3>Sin resultados</h3><p>Pruebe con otro texto o revise el Excel.</p></div></div>`;
    return;
  }

  const selectedKey = state.selectedProduct ? productKey(state.selectedProduct) : "";
  $("results").innerHTML = results.map((p, idx) => {
    const active = productKey(p) === selectedKey ? "active" : "";
    return `
      <button class="result-item ${active}" type="button" data-index="${idx}">
        <h3>${escapeHtml(p.producto)}</h3>
        <div class="result-meta">
          <span class="pill">${escapeHtml(p.mueble)}</span>
          <span class="pill">${escapeHtml(p.id_mueble)}</span>
          <span class="pill">Ubicación ${escapeHtml(p.ubicacion)}</span>
        </div>
      </button>
    `;
  }).join("");

  $("results").querySelectorAll(".result-item").forEach((button, index) => {
    button.addEventListener("click", () => selectProduct(results[index]));
  });
}

function selectProduct(product) {
  state.selectedProduct = product;
  state.selectedMuebleId = product.id_mueble;
  state.selectedZone = product.ubicacion;
  renderResults();
  renderViewer();
  document.querySelector(".viewer-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getSameLocationProducts(product) {
  if (!product) return [];
  return state.productos.filter(p =>
    p.id_mueble === product.id_mueble && p.ubicacion === product.ubicacion
  );
}

function renderViewer() {
  const product = state.selectedProduct;
  if (!product) return;

  $("viewerEmpty").classList.add("hidden");
  $("viewer").classList.remove("hidden");

  const mueble = state.muebles[product.id_mueble] || {};
  const zone = mueble.zones?.[product.ubicacion];

  $("viewerKicker").textContent = `${product.id_mueble} · ${mueble.display_name || product.mueble}`;
  $("viewerTitle").textContent = product.producto;
  $("viewerSubtitle").textContent = `Mueble: ${product.mueble}`;
  $("viewerTag").textContent = `Ubicación ${product.ubicacion}`;

  renderImageOrFallback(product, mueble, zone);
  renderSameLocation(product);
}

function renderImageOrFallback(product, mueble, zone) {
  const hasImage = Boolean(mueble.image);
  const hasPoly = Boolean(zone?.poly_norm?.length);

  $("imagePanel").classList.toggle("hidden", !hasImage);
  $("fallbackPanel").classList.toggle("hidden", hasImage && hasPoly);

  if (hasImage) {
    $("muebleImage").src = mueble.image;
    $("muebleImage").alt = `Mueble ${mueble.display_name || product.mueble}`;
    $("imageNote").textContent = hasPoly
      ? "Polígono resaltado según la ubicación seleccionada."
      : "Ubicación sin zona definida: se muestra imagen del mueble y texto de respaldo.";
    renderOverlay(mueble, product.ubicacion);
  } else {
    $("zoneOverlay").innerHTML = "";
  }

  if (!hasImage || !hasPoly) {
    $("fallbackPanel").innerHTML = `
      <strong>${hasPoly ? "Imagen no disponible" : "Ubicación sin zona definida"}</strong>
      <p>Mueble: ${escapeHtml(product.mueble)} / Ubicación: ${escapeHtml(product.ubicacion)}</p>
      <p class="muted">El resultado es válido: falta subir una foto o dibujar el polígono correspondiente en <code>admin.html</code>.</p>
    `;
  }
}

function polygonPoints(points) {
  return points.map(([x, y]) => `${Number(x).toFixed(4)},${Number(y).toFixed(4)}`).join(" ");
}

function centroid(points) {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return [
    xs.reduce((a, b) => a + b, 0) / xs.length,
    ys.reduce((a, b) => a + b, 0) / ys.length,
  ];
}

function renderOverlay(mueble, selectedZone) {
  const overlay = $("zoneOverlay");
  const zones = mueble.zones || {};
  const fragments = [];

  Object.entries(zones).forEach(([zoneName, zoneData]) => {
    if (!zoneData.poly_norm?.length) return;
    const selected = zoneName === selectedZone;
    if (!selected && !state.showAllZones) return;

    const cls = selected ? "zone-poly selected" : "zone-poly";
    fragments.push(`<polygon class="${cls}" points="${polygonPoints(zoneData.poly_norm)}"></polygon>`);

    if (state.showAllZones || selected) {
      const [cx, cy] = centroid(zoneData.poly_norm);
      fragments.push(`<text class="zone-label" x="${cx}" y="${cy}">${escapeHtml(zoneName)}</text>`);
    }
  });

  overlay.innerHTML = fragments.join("");
}

function renderSameLocation(product) {
  const items = getSameLocationProducts(product);
  $("sameLocationCount").textContent = `${items.length} producto${items.length === 1 ? "" : "s"}`;
  $("sameLocationList").innerHTML = items.map(p => `
    <div class="same-product">${escapeHtml(p.producto)}</div>
  `).join("");
}

function renderMuebleList() {
  const byMueble = new Map();
  state.productos.forEach((p) => {
    const current = byMueble.get(p.id_mueble) || {
      id: p.id_mueble,
      name: state.muebles[p.id_mueble]?.display_name || p.mueble,
      products: 0,
      zones: new Set(),
      hasImage: Boolean(state.muebles[p.id_mueble]?.image),
    };
    current.products += 1;
    current.zones.add(p.ubicacion);
    byMueble.set(p.id_mueble, current);
  });

  const html = [...byMueble.values()]
    .sort((a, b) => a.id.localeCompare(b.id, "es"))
    .map((m) => `
      <div class="mueble-mini">
        <strong>${escapeHtml(m.id)} · ${escapeHtml(m.name)}</strong>
        <div class="result-meta">
          <span class="pill">${m.products} productos</span>
          <span class="pill">${m.zones.size} zonas</span>
          <span class="pill">${m.hasImage ? "con imagen" : "texto"}</span>
        </div>
      </div>
    `).join("");

  $("muebleList").innerHTML = html;
}

boot();
