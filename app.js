// ============================================================
//  QUANTUM — app.js
//  Lógica principal de la aplicación
//  Versión 1.0.0 | 2026-05-31
// ============================================================

// ┌─────────────────────────────────────────────────────────┐
// │  CONFIGURACIÓN GLOBAL                                   │
// └─────────────────────────────────────────────────────────┘

/**
 * URL del Web App de Google Apps Script.
 * Reemplazar con la URL obtenida tras publicar el script.
 */
const DEFAULT_GAS_URL = "https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnSnJNQgZGX8JBlsBC0kDMLau_ehq21iDmOVWjwHyWr8KT4OeNE2cfe6e6EB9bHqumM7YC34wfd8b5qGY62cLJC4uPd0Q0aGmpo9AAlTRRbD3xhC07_lJh4wLBQTK8Cl1JDCPuMNRSySiMQI9nGfuwX1S0TQNJHAmEIyRvVTlFhc75S03jDDYAm4l8LrM7fD5jdJgIt0A-PtC-YzY6yiuq6QIkrMskECgfswLPEqGMkh-CA6_8oKjLfmOkyI6XN4tZk67L2gckR4IbcAf-LLdv-WxWRA_g&lib=MMjKMn1ABID9XRRSLzCggjMzJonRLtP1P";

let GAS_URL = localStorage.getItem("quantum_gas_url") || DEFAULT_GAS_URL;
/** Niveles de calificación Quantum */
const LEVELS = [
  { label: "3%",  points: 300   },
  { label: "6%",  points: 600   },
  { label: "9%",  points: 1200  },
  { label: "12%", points: 2400  },
  { label: "15%", points: 4000  },
  { label: "18%", points: 7000  },
  { label: "21%", points: 10000 },
];

/** Estado global de la aplicación */
const State = {
  team:          [],
  history:       [],
  syncStatus:    "idle",   // idle | syncing | ok | error
  lastSync:      null,
  activeSection: "dashboard",
  networkView:   "tree",   // tree | constellation
  simulatorData: {},       // { id: puntos_extra }
  goalMode:      "3%",
  goalConfig: {
    ganaMas: { puntosRequeridos: 150 },
    miniBronce: {
      liderPuntos:    300,
      frontalesCant:  3,
      frontalesPuntos: 150,
    },
    personalizado: { puntos: 500 },
  },
};

// ┌─────────────────────────────────────────────────────────┐
// │  DATOS FALLBACK (LocalStorage / seed)                   │
// └─────────────────────────────────────────────────────────┘

const SEED_TEAM = [
  { id: "1", nombre: "Joy",  sponsorId: "",  puntos: 201, metaPersonal: 300, activo: true, fechaActualizacion: "2026-05-31" },
  { id: "2", nombre: "Jon",  sponsorId: "1", puntos:  85, metaPersonal: 150, activo: true, fechaActualizacion: "2026-05-31" },
  { id: "3", nombre: "Wall", sponsorId: "1", puntos:  25, metaPersonal: 150, activo: true, fechaActualizacion: "2026-05-31" },
  { id: "4", nombre: "Maria", sponsorId: "2", puntos:  25, metaPersonal: 150, activo: true, fechaActualizacion: "2026-05-31" },
];

// ┌─────────────────────────────────────────────────────────┐
// │  UTILIDADES GENERALES                                   │
// └─────────────────────────────────────────────────────────┘

/** Formatea número con separador de miles */
const fmt = n => Number(n).toLocaleString("es-AR");

/** Calcula el nivel Quantum dado un total de puntos */
function calcLevel(totalPts) {
  let current = null;
  let next    = LEVELS[0];
  for (let i = 0; i < LEVELS.length; i++) {
    if (totalPts >= LEVELS[i].points) {
      current = LEVELS[i];
      next    = LEVELS[i + 1] || null;
    }
  }
  return { current, next };
}

/** Total grupal de puntos reales */
function groupTotal(team) {
  return team.filter(m => m.activo).reduce((s, m) => s + Number(m.puntos), 0);
}

/** Total grupal con datos de simulador */
function simGroupTotal(team, simData) {
  return team.filter(m => m.activo).reduce((s, m) => {
    return s + Number(m.puntos) + (Number(simData[m.id]) || 0);
  }, 0);
}

/** Porcentaje de avance de un miembro */
function progress(member) {
  if (!member.metaPersonal) return 0;
  return Math.min(100, Math.round((member.puntos / member.metaPersonal) * 100));
}

/** Color de estado de un miembro según su avance */
function statusColor(member) {
  const pct = progress(member);
  if (pct >= 100) return "var(--green)";
  if (pct >= 70)  return "var(--blue)";
  if (pct >= 40)  return "var(--yellow)";
  return "var(--violet)";
}

/** Clase CSS de estado */
function statusClass(member) {
  const pct = progress(member);
  if (pct >= 100) return "status-complete";
  if (pct >= 70)  return "status-near";
  if (pct >= 40)  return "status-mid";
  return "status-far";
}

/** Iniciales de un nombre */
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

/** Guarda equipo en LocalStorage como respaldo */
function saveToLocal(team) {
  try { localStorage.setItem("quantum_team", JSON.stringify(team)); } catch (_) {}
}

/** Lee equipo desde LocalStorage */
function loadFromLocal() {
  try {
    const raw = localStorage.getItem("quantum_team");
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

/** Guarda historial en LocalStorage */
function saveHistoryToLocal(history) {
  try { localStorage.setItem("quantum_history", JSON.stringify(history)); } catch (_) {}
}

/** Lee historial desde LocalStorage */
function loadHistoryFromLocal() {
  try {
    const raw = localStorage.getItem("quantum_history");
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

// ┌─────────────────────────────────────────────────────────┐
// │  HELPERS: PUNTOS GRUPALES                               │
// └─────────────────────────────────────────────────────────┘

/** Devuelve todos los descendientes (hijos, nietos…) de un miembro */
function getAllDescendants(memberId, team) {
  const direct = team.filter(m => m.sponsorId === String(memberId));
  let all = [...direct];
  direct.forEach(c => { all = all.concat(getAllDescendants(c.id, team)); });
  return all;
}

/** Calcula los Puntos Grupales (PG) de un miembro: PP propio + PP de toda su red */
function computeGroupPoints(memberId, team) {
  const self = team.find(m => m.id === String(memberId));
  if (!self || !self.activo) return 0;
  const desc = getAllDescendants(memberId, team);
  return Number(self.puntos)
       + desc.filter(m => m.activo).reduce((s, m) => s + Number(m.puntos), 0);
}

/** Obtiene la cadena de upline: [self, padre, abuelo, …] */
function getUplineChain(memberId, team) {
  const chain = [];
  let cur = team.find(m => m.id === String(memberId));
  while (cur) {
    chain.push(cur);
    cur = cur.sponsorId ? team.find(m => m.id === cur.sponsorId) : null;
  }
  return chain;
}

// ┌─────────────────────────────────────────────────────────┐
// │  SINCRONIZACIÓN CON GOOGLE SHEETS                       │
// └─────────────────────────────────────────────────────────┘

/** Actualiza el indicador de estado de sincronización */
function setSyncStatus(status, msg) {
  State.syncStatus = status;
  const badge = document.getElementById("sync-badge");
  const dot   = document.getElementById("sync-dot");
  const text  = document.getElementById("sync-text");
  if (!badge) return;

  badge.className = "sync-badge sync-" + status;
  if (dot)  dot.className  = "sync-dot sync-dot-" + status;
  if (text) text.textContent = msg || { idle: "Sin sincronizar", syncing: "Sincronizando…", ok: "Sincronizado", error: "Error de conexión" }[status];
}

/** Carga el equipo desde Google Sheets (o LocalStorage si falla) */
async function fetchTeam() {
  if (!GAS_URL) {
    console.warn("URL de Apps Script no configurada. Usando datos locales.");
    const local = loadFromLocal();
    State.team = local || SEED_TEAM;
    saveToLocal(State.team);
    setSyncStatus("idle", "Sin URL configurada");
    return;
  }

  setSyncStatus("syncing");
  try {
    const res  = await fetch(`${GAS_URL}?action=getTeam`, { cache: "no-store" });
    const json = await res.json();
    if (json.team) {
      State.team = json.team;
      saveToLocal(State.team);
      State.lastSync = new Date().toLocaleTimeString("es-AR");
      setSyncStatus("ok");
    } else {
      throw new Error(json.error || "Respuesta inválida");
    }
  } catch (err) {
    console.error("fetchTeam:", err);
    const local = loadFromLocal();
    State.team = local || SEED_TEAM;
    setSyncStatus("error", "Error — datos locales");
  }
}

/** Carga el historial desde Google Sheets */
async function fetchHistory() {
  if (!GAS_URL) {
    State.history = loadHistoryFromLocal();
    return;
  }
  try {
    const res  = await fetch(`${GAS_URL}?action=getHistory`, { cache: "no-store" });
    const json = await res.json();
    if (json.history) {
      State.history = json.history;
      saveHistoryToLocal(State.history);
    }
  } catch (err) {
    console.error("fetchHistory:", err);
    State.history = loadHistoryFromLocal();
  }
}

/** Guarda o actualiza un miembro en Google Sheets */
async function saveMember(member) {
  setSyncStatus("syncing");
  // Actualizar localmente primero
  const idx = State.team.findIndex(m => m.id === member.id);
  if (idx >= 0) State.team[idx] = member; else State.team.push(member);
  saveToLocal(State.team);

  if (!GAS_URL) { setSyncStatus("idle", "Sin URL — guardado local"); return; }

  try {
    await fetch(GAS_URL, {
  method: "POST",
  body: JSON.stringify({ action: "saveMember", data: member }),
});
    State.lastSync = new Date().toLocaleTimeString("es-AR");
    setSyncStatus("ok");
  } catch (err) {
    console.error("saveMember:", err);
    setSyncStatus("error", "Guardado local — sin conexión");
  }
}

/** Elimina un miembro de Google Sheets */
async function deleteMember(id) {
  State.team = State.team.filter(m => m.id !== id);
  saveToLocal(State.team);

  if (!GAS_URL) return;
  try {
    await fetch(GAS_URL, {
  method: "POST",
  body: JSON.stringify({ action: "deleteMember", id }),
});
    setSyncStatus("ok");
  } catch (err) {
    console.error("deleteMember:", err);
    setSyncStatus("error");
  }
}

/** Guarda un snapshot del historial */
async function saveSnapshot(data) {
  if (!GAS_URL) return;
  try {
      await fetch(GAS_URL, {
  method: "POST",
  body: JSON.stringify({ action: "saveSnapshot", data }),
});
  } catch (err) { console.error("saveSnapshot:", err); }
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: DASHBOARD                                     │
// └─────────────────────────────────────────────────────────┘

function renderDashboard() {
  const team   = State.team;
  const total  = groupTotal(team);
  const { current, next } = calcLevel(total);
  const activos = team.filter(m => m.activo).length;
  const faltanNivel = next ? next.points - total : 0;

  const el = document.getElementById("section-dashboard");
  if (!el) return;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Dashboard</h2>
      <span class="section-sub">Resumen en tiempo real de tu red Quantum</span>
    </div>

    <div class="cards-grid">
      ${card("Puntos Grupales", fmt(total), "💎", "card-blue",
        `<div class="card-sub">de ${next ? fmt(next.points) : "∞"} para el siguiente nivel</div>
         <div class="progress-bar"><div class="progress-fill" style="width:${next ? Math.min(100,(total/next.points)*100) : 100}%;background:var(--blue)"></div></div>`)}

      ${card("Nivel Actual", current ? current.label : "Sin nivel", "📊", "card-violet",
        `<div class="card-sub">${current ? `${fmt(current.points)} puntos mínimos` : "Menos de 300 puntos grupales"}</div>`)}

      ${card("Próximo Objetivo", next ? next.label : "🏆 Máximo", "🎯", "card-green",
        `<div class="card-sub">${next ? `${fmt(next.points)} puntos grupales` : "¡Nivel máximo alcanzado!"}</div>`)}

      ${card("Puntos Faltantes", next ? fmt(faltanNivel) : "0", "⚡", faltanNivel > 500 ? "card-yellow" : "card-green",
        `<div class="card-sub">${next ? `para alcanzar ${next.label}` : "¡Objetivo cumplido!"}</div>`)}

      ${card("Integrantes Activos", activos, "👥", "card-blue",
        `<div class="card-sub">de ${team.length} en la red</div>`)}

      ${card("Última Sincronización", State.lastSync || "—", "🔄", "card-default",
        `<div class="card-sub">${GAS_URL ? "Con Google Sheets" : "Sin URL configurada"}</div>`)}
    </div>

    <div class="section-header" style="margin-top:2rem">
      <h3 class="section-title" style="font-size:1.1rem">Progreso Individual</h3>
    </div>
    <div class="members-list">
      ${team.map(m => memberCard(m)).join("")}
    </div>
  `;
}

/** Genera HTML de una tarjeta de dashboard */
function card(title, value, icon, cls, extra = "") {
  return `
    <div class="dash-card ${cls}">
      <div class="dash-card-icon">${icon}</div>
      <div class="dash-card-title">${title}</div>
      <div class="dash-card-value">${value}</div>
      ${extra}
    </div>`;
}

/** Genera HTML de tarjeta de miembro */
function memberCard(m) {
  const pct  = progress(m);
  const col  = statusColor(m);
  const cls  = statusClass(m);
  return `
    <div class="member-card ${cls}" data-id="${m.id}">
      <div class="member-avatar" style="background:${col}20;border-color:${col}">
        <span style="color:${col}">${initials(m.nombre)}</span>
      </div>
      <div class="member-info">
        <div class="member-name">${m.nombre}</div>
        <div class="member-meta">${fmt(m.puntos)} / ${fmt(m.metaPersonal)} pts · ${pct}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%;background:${col}"></div>
        </div>
      </div>
      <div class="member-badge" style="color:${col}">${pct >= 100 ? "✓" : pct + "%"}</div>
    </div>`;
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: MAPA DE RED — Canvas oval nodes               │
// └─────────────────────────────────────────────────────────┘

/** Construye el árbol recursivo a partir de SponsorID */
function buildTree(team) {
  const map   = {};
  const roots = [];
  team.forEach(m => { map[m.id] = { ...m, children: [] }; });
  team.forEach(m => {
    if (m.sponsorId && map[m.sponsorId]) {
      map[m.sponsorId].children.push(map[m.id]);
    } else {
      roots.push(map[m.id]);
    }
  });
  return roots;
}

function renderNetwork() {
  const el = document.getElementById("section-network");
  if (!el) return;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Arquitectura de tu Red</h2>
      <span class="section-sub">Visualización de la estructura de equipo</span>
    </div>
    <div class="view-toggle">
      <button class="view-btn ${State.networkView === "tree" ? "active" : ""}" onclick="setNetworkView('tree')">
        🌳 Vista Árbol
      </button>
      <button class="view-btn ${State.networkView === "constellation" ? "active" : ""}" onclick="setNetworkView('constellation')">
        ✨ Constelación
      </button>
    </div>
    <div id="network-container" class="network-container">
      <canvas id="network-canvas" class="network-canvas"></canvas>
      <div id="network-tooltip" class="network-tooltip" style="display:none"></div>
    </div>
  `;

  // Esperar un frame para que el DOM esté pintado
  requestAnimationFrame(() => {
    if (State.networkView === "tree") {
      initNetworkCanvas("tree");
    } else {
      initNetworkCanvas("constellation");
    }
  });
}

function setNetworkView(view) {
  State.networkView = view;
  renderNetwork();
  attachSectionListeners();
}

// ─── MOTOR DE CANVAS COMPARTIDO ──────────────────────────────

/**
 * Tamaño del nodo oval:
 * rx = semi-eje horizontal, ry = semi-eje vertical
 */
const NODE_RX = 68;
const NODE_RY = 36;

/** Devuelve el color hex puro según progreso */
function nodeColor(member) {
  const pct = progress(member);
  if (pct >= 100) return "#2ECC71";
  if (pct >= 70)  return "#4DA3FF";
  if (pct >= 40)  return "#F1C40F";
  return "#9B5CFF";
}

/** Dibuja un nodo oval sobre el canvas */
function drawOvalNode(ctx, x, y, node, scale = 1) {
  const col  = nodeColor(node);
  const pct  = progress(node);
  const rx   = NODE_RX * scale;
  const ry   = NODE_RY * scale;

  // ── Glow exterior ──
  const grd = ctx.createRadialGradient(x, y, 0, x, y, rx * 1.6);
  grd.addColorStop(0, col + "28");
  grd.addColorStop(1, "transparent");
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.55, ry * 1.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // ── Fondo oval ──
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1A1A1A";
  ctx.fill();

  // ── Borde coloreado ──
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.lineWidth   = 2.5 * scale;
  ctx.stroke();

  // ── Barra de progreso interna (arco inferior del oval) ──
  if (pct > 0 && pct < 100) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, y, rx - 3, ry - 3, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = col + "18";
    ctx.fillRect(x - rx, y + ry * 0.45, rx * 2 * (pct / 100), ry * 0.55);
    ctx.restore();
  }

  // ── Nombre ──
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle    = "#FFFFFF";
  ctx.font         = `bold ${Math.round(14 * scale)}px Inter, system-ui, sans-serif`;
  ctx.fillText(node.nombre, x, y - 6 * scale);

  // ── Puntos ──
  ctx.fillStyle = col;
  ctx.font      = `${Math.round(11 * scale)}px Inter, system-ui, sans-serif`;
  ctx.fillText(fmt(node.puntos) + " pts", x, y + 10 * scale);
}

/**
 * Dibuja una línea curva entre dos nodos ovales.
 * Usa una curva de Bezier cúbica para suavidad.
 */
function drawEdge(ctx, x1, y1, x2, y2, col) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Control points: desplazados perpendicular levemente
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  // Curvatura proporcional a la distancia
  const curve = len * 0.18;
  const cx1 = mx - dy / len * curve;
  const cy1 = my + dx / len * curve;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx1, cy1, x2, y2);
  ctx.strokeStyle = col || "rgba(77,163,255,0.25)";
  ctx.lineWidth   = 2;
  ctx.setLineDash([]);
  ctx.stroke();
}

// ─── LAYOUT: ÁRBOL JERÁRQUICO ────────────────────────────────

/**
 * Asigna posiciones X,Y en layout jerárquico top-down.
 * Calcula el ancho de subárbol de cada nodo para distribuir correctamente.
 */
function computeTreeLayout(roots, canvasW, canvasH) {
  const positions = {};
  const levelH    = Math.min(canvasH * 0.28, 160); // separación vertical entre niveles
  const marginX   = NODE_RX + 20;

  // Paso 1: calcular el "peso" (número de hojas) de cada subárbol
  function subtreeWidth(node) {
    if (!node.children || node.children.length === 0) return 1;
    return node.children.reduce((s, c) => s + subtreeWidth(c), 0);
  }

  // Paso 2: asignar posiciones recursivamente
  function assign(nodeList, startX, y, totalWidth) {
    let cursor = startX;
    nodeList.forEach(node => {
      const w     = subtreeWidth(node);
      const share = (totalWidth * w) / nodeList.reduce((s, n) => s + subtreeWidth(n), 0);
      const nx    = cursor + share / 2;
      positions[node.id] = { ...node, x: nx, y };
      if (node.children && node.children.length) {
        assign(node.children, cursor, y + levelH, share);
      }
      cursor += share;
    });
  }

  assign(roots, marginX, 70, canvasW - marginX * 2);
  return positions;
}

// ─── LAYOUT: CONSTELACIÓN RADIAL ────────────────────────────

function computeConstellationLayout(roots, canvasW, canvasH) {
  const positions = {};
  const cx = canvasW / 2;
  const cy = canvasH / 2;

  function assignRadial(nodeList, parentX, parentY, angleStart, angleEnd, radius) {
    const count = nodeList.length;
    nodeList.forEach((n, i) => {
      const angle = count === 1
        ? (angleStart + angleEnd) / 2
        : angleStart + (i / (count - 1)) * (angleEnd - angleStart);
      const x = parentX + Math.cos(angle) * radius;
      const y = parentY + Math.sin(angle) * radius;
      positions[n.id] = { ...n, x, y };
      if (n.children && n.children.length) {
        const spread = Math.max(0.7, Math.PI / (n.children.length + 1));
        assignRadial(n.children, x, y, angle - spread, angle + spread, radius * 0.72);
      }
    });
  }

  const baseR = Math.min(canvasW, canvasH) * 0.32;

  if (roots.length === 1) {
    const r = roots[0];
    positions[r.id] = { ...r, x: cx, y: cy };
    if (r.children && r.children.length) {
      const angleStep = (Math.PI * 2) / r.children.length;
      r.children.forEach((c, i) => {
        const a = -Math.PI / 2 + angleStep * i;
        const x = cx + Math.cos(a) * baseR;
        const y = cy + Math.sin(a) * baseR;
        positions[c.id] = { ...c, x, y };
        if (c.children && c.children.length) {
          const spread = Math.max(0.5, Math.PI / (c.children.length + 1));
          assignRadial(c.children, x, y, a - spread, a + spread, baseR * 0.6);
        }
      });
    }
  } else {
    assignRadial(roots, cx, cy, 0, Math.PI * 2, baseR);
  }

  return positions;
}

// ─── INICIALIZACIÓN DEL CANVAS ───────────────────────────────

function initNetworkCanvas(mode) {
  const canvas = document.getElementById("network-canvas");
  if (!canvas) return;

  const container = document.getElementById("network-container");
  const dpr       = window.devicePixelRatio || 1;
  const W         = container.clientWidth  || 800;
  const H         = container.clientHeight || 560;

  // HiDPI
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const team  = State.team;
  const roots = buildTree(team);

  // Calcular posiciones según modo
  const positions = mode === "tree"
    ? computeTreeLayout(roots, W, H)
    : computeConstellationLayout(roots, W, H);

  // Guardar para tooltips/hover
  canvas._positions = positions;
  canvas._mode      = mode;

  drawNetwork(ctx, W, H, positions, team);

  // ── Tooltip en hover ──
  canvas.onmousemove = e => {
    const rect  = canvas.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const tooltip = document.getElementById("network-tooltip");
    let hit = null;

    Object.values(positions).forEach(n => {
      const dx = mx - n.x;
      const dy = my - n.y;
      // Test punto dentro del oval
      if ((dx * dx) / (NODE_RX * NODE_RX) + (dy * dy) / (NODE_RY * NODE_RY) <= 1) {
        hit = n;
      }
    });

    if (hit && tooltip) {
      const pct = progress(hit);
      const col = nodeColor(hit);
      tooltip.style.display = "block";
      tooltip.style.left    = (n => n.x + NODE_RX + 8)(hit) + "px";
      tooltip.style.top     = (n => n.y - NODE_RY)(hit) + "px";
      tooltip.innerHTML = `
        <div class="tt-name" style="color:${col}">${hit.nombre}</div>
        <div class="tt-row">Puntos: <strong>${fmt(hit.puntos)}</strong></div>
        <div class="tt-row">Meta: <strong>${fmt(hit.metaPersonal)}</strong></div>
        <div class="tt-row">Avance: <strong style="color:${col}">${pct}%</strong></div>
        <div class="tt-bar"><div style="width:${pct}%;background:${col};height:100%;border-radius:4px"></div></div>
      `;
      canvas.style.cursor = "pointer";
    } else {
      if (tooltip) tooltip.style.display = "none";
      canvas.style.cursor = "default";
    }
  };

  canvas.onmouseleave = () => {
    const tooltip = document.getElementById("network-tooltip");
    if (tooltip) tooltip.style.display = "none";
  };
}

function drawNetwork(ctx, W, H, positions, team) {
  ctx.clearRect(0, 0, W, H);

  // ── 1. Dibujar bordes (líneas) PRIMERO ──
  team.forEach(m => {
    if (m.sponsorId && positions[m.id] && positions[m.sponsorId]) {
      const from = positions[m.sponsorId];
      const to   = positions[m.id];
      const col  = nodeColor(from) + "50";
      drawEdge(ctx, from.x, from.y, to.x, to.y, col);
    }
  });

  // ── 2. Dibujar nodos encima ──
  Object.values(positions).forEach(n => {
    drawOvalNode(ctx, n.x, n.y, n);
  });
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: OBJETIVOS                                     │
// └─────────────────────────────────────────────────────────┘

function renderGoals() {
  const el = document.getElementById("section-goals");
  if (!el) return;

  const goalOptions = [
    ...LEVELS.map(l => l.label),
    "Gana Más", "Mini Bronce", "Personalizado"
  ];

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Objetivos</h2>
      <span class="section-sub">Analiza el estado de cada meta</span>
    </div>
    <div class="goal-selector">
      ${goalOptions.map(g => `
        <button class="goal-btn ${State.goalMode === g ? "active" : ""}"
                onclick="setGoalMode('${g}')">${g}</button>
      `).join("")}
    </div>
    <div id="goal-result" class="goal-result">
      ${renderGoalResult()}
    </div>
  `;
}

function setGoalMode(mode) {
  State.goalMode = mode;
  const resultEl = document.getElementById("goal-result");
  if (resultEl) resultEl.innerHTML = renderGoalResult();

  document.querySelectorAll(".goal-btn").forEach(b => {
    b.classList.toggle("active", b.textContent.trim() === mode);
  });
}

function renderGoalResult() {
  const mode = State.goalMode;
  const team = State.team.filter(m => m.activo);
  const total = groupTotal(State.team);

  // ── Niveles porcentuales ──
  const levelObj = LEVELS.find(l => l.label === mode);
  if (levelObj) {
    const diff = levelObj.points - total;
    const done = diff <= 0;
    return `
      <div class="goal-card ${done ? "goal-done" : "goal-pending"}">
        <div class="goal-icon">${done ? "🏆" : "🎯"}</div>
        <div class="goal-main">
          <div class="goal-label">Nivel ${mode} — ${fmt(levelObj.points)} puntos grupales</div>
          <div class="goal-value">${done
            ? `✅ <strong>¡Objetivo cumplido!</strong> Tienes ${fmt(total)} puntos`
            : `Faltan <strong>${fmt(diff)}</strong> puntos (actual: ${fmt(total)})`}</div>
          <div class="progress-bar" style="margin-top:.75rem">
            <div class="progress-fill" style="width:${Math.min(100,(total/levelObj.points)*100)}%;
              background:${done?"var(--green)":"var(--blue)"}"></div>
          </div>
        </div>
      </div>`;
  }

  // ── Gana Más ──
  if (mode === "Gana Más") {
    const req = State.goalConfig.ganaMas.puntosRequeridos;
    return `
      <div class="goal-header-info">
        Cada miembro debe alcanzar <strong>${req} puntos</strong>.
        <button class="btn-config" onclick="configGanaMas()">⚙ Configurar</button>
      </div>
      <div class="members-list">
        ${team.map(m => {
          const done = m.puntos >= req;
          const diff = req - m.puntos;
          const col  = done ? "var(--green)" : "var(--violet)";
          return `
            <div class="member-card" style="border-color:${col}30">
              <div class="member-avatar" style="background:${col}20;border-color:${col}">
                <span style="color:${col}">${initials(m.nombre)}</span>
              </div>
              <div class="member-info">
                <div class="member-name">${m.nombre}</div>
                <div class="member-meta">${fmt(m.puntos)} / ${fmt(req)} pts</div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${Math.min(100,(m.puntos/req)*100)}%;background:${col}"></div>
                </div>
              </div>
              <div class="member-badge" style="color:${col}">
                ${done ? "✓" : "−" + fmt(diff)}
              </div>
            </div>`;
        }).join("")}
      </div>`;
  }

  // ── Mini Bronce ──
  if (mode === "Mini Bronce") {
    const cfg = State.goalConfig.miniBronce;
    const roots = buildTree(State.team);
    const lider = roots[0]; // primer nodo raíz = líder
    const frontales = lider ? lider.children : [];

    const liderOk = lider && lider.puntos >= cfg.liderPuntos;
    const frontalesOk = frontales.filter(f => f.puntos >= cfg.frontalesPuntos);
    const metCant = frontalesOk.length >= cfg.frontalesCant;
    const allDone = liderOk && metCant;

    return `
      <div class="goal-header-info">
        Líder ≥ <strong>${cfg.liderPuntos} pts</strong> · 
        ${cfg.frontalesCant} frontales ≥ <strong>${cfg.frontalesPuntos} pts</strong> c/u.
        <button class="btn-config" onclick="configMiniBronce()">⚙ Configurar</button>
      </div>
      <div class="goal-card ${allDone ? "goal-done" : "goal-pending"}" style="margin-bottom:1rem">
        <div class="goal-icon">${allDone ? "🥉" : "🎯"}</div>
        <div class="goal-main">
          <div class="goal-label">${allDone ? "¡Mini Bronce cumplido!" : "Mini Bronce en progreso"}</div>
          <div class="goal-value">
            ${lider ? `Líder (${lider.nombre}): ${fmt(lider.puntos)} pts ${liderOk ? "✅" : "❌"}` : "Sin líder definido"}<br>
            Frontales calificados: ${frontalesOk.length} / ${cfg.frontalesCant} ${metCant ? "✅" : "❌"}
          </div>
        </div>
      </div>
      <div class="members-list">
        ${frontales.map(f => {
          const done = f.puntos >= cfg.frontalesPuntos;
          const col  = done ? "var(--green)" : "var(--violet)";
          return `
            <div class="member-card" style="border-color:${col}30">
              <div class="member-avatar" style="background:${col}20;border-color:${col}">
                <span style="color:${col}">${initials(f.nombre)}</span>
              </div>
              <div class="member-info">
                <div class="member-name">${f.nombre}</div>
                <div class="member-meta">${fmt(f.puntos)} / ${fmt(cfg.frontalesPuntos)} pts</div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width:${Math.min(100,(f.puntos/cfg.frontalesPuntos)*100)}%;background:${col}"></div>
                </div>
              </div>
              <div class="member-badge" style="color:${col}">${done ? "✓" : "−" + fmt(cfg.frontalesPuntos - f.puntos)}</div>
            </div>`;
        }).join("")}
      </div>`;
  }

  // ── Personalizado ──
  if (mode === "Personalizado") {
    const req = State.goalConfig.personalizado.puntos;
    const diff = req - groupTotal(State.team);
    const done = diff <= 0;
    return `
      <div class="goal-card ${done ? "goal-done" : "goal-pending"}">
        <div class="goal-icon">${done ? "🏆" : "🎯"}</div>
        <div class="goal-main">
          <div class="goal-label">Meta personalizada: ${fmt(req)} puntos grupales</div>
          <div class="goal-value">${done ? "✅ ¡Meta cumplida!" : `Faltan <strong>${fmt(diff)}</strong> puntos`}</div>
          <div class="progress-bar" style="margin-top:.75rem">
            <div class="progress-fill" style="width:${Math.min(100,(groupTotal(State.team)/req)*100)}%;
              background:${done?"var(--green)":"var(--blue)"}"></div>
          </div>
          <div style="margin-top:1rem;display:flex;gap:.5rem;align-items:center">
            <label style="color:#888;font-size:.85rem">Meta:</label>
            <input type="number" id="custom-goal-input" value="${req}" min="1"
              style="background:#1C1C1C;border:1px solid #333;color:#fff;padding:.4rem .75rem;
                     border-radius:8px;width:120px;font-size:.9rem"
              oninput="setCustomGoal(this.value)">
            <span style="color:#888;font-size:.85rem">puntos</span>
          </div>
        </div>
      </div>`;
  }

  return "";
}

/** Configuraciones rápidas de objetivos */
function configGanaMas() {
  const val = prompt("Puntos requeridos por persona (Gana Más):", State.goalConfig.ganaMas.puntosRequeridos);
  if (val && !isNaN(val)) {
    State.goalConfig.ganaMas.puntosRequeridos = Number(val);
    renderGoals();
    attachSectionListeners();
  }
}

function configMiniBronce() {
  const lPts  = prompt("Puntos del líder:", State.goalConfig.miniBronce.liderPuntos);
  if (!lPts || isNaN(lPts)) return;
  const fCant = prompt("Número de frontales requeridos:", State.goalConfig.miniBronce.frontalesCant);
  if (!fCant || isNaN(fCant)) return;
  const fPts  = prompt("Puntos por frontal:", State.goalConfig.miniBronce.frontalesPuntos);
  if (!fPts || isNaN(fPts)) return;

  State.goalConfig.miniBronce = {
    liderPuntos:    Number(lPts),
    frontalesCant:  Number(fCant),
    frontalesPuntos:Number(fPts),
  };
  renderGoals();
  attachSectionListeners();
}

function setCustomGoal(val) {
  if (!isNaN(val) && Number(val) > 0) {
    State.goalConfig.personalizado.puntos = Number(val);
    const resultEl = document.getElementById("goal-result");
    if (resultEl) resultEl.innerHTML = renderGoalResult();
  }
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: SIMULADOR                                     │
// └─────────────────────────────────────────────────────────┘

function renderSimulator() {
  const el = document.getElementById("section-simulator");
  if (!el) return;

  const team = State.team;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Simulador Quantum</h2>
      <span class="section-sub">Carga puntos hipotéticos sin guardar y visualiza el impacto</span>
    </div>
    <div class="sim-grid">
      <div class="sim-inputs">
        <h3 class="sim-subtitle">Puntos adicionales hipotéticos</h3>
        ${team.filter(m => m.activo).map(m => `
          <div class="sim-row">
            <div class="sim-member">
              <div class="sim-avatar">${initials(m.nombre)}</div>
              <span>${m.nombre}</span>
              <span class="sim-current">(${fmt(m.puntos)} pts)</span>
            </div>
            <input type="number" class="sim-input" min="0"
              id="sim-${m.id}"
              value="${State.simulatorData[m.id] || 0}"
              placeholder="+ puntos"
              oninput="updateSimulator()">
          </div>
        `).join("")}
        <div class="sim-actions">
          <button class="btn-primary" onclick="updateSimulator()">🔄 Recalcular</button>
          <button class="btn-secondary" onclick="resetSimulator()">✕ Resetear</button>
        </div>
      </div>
      <div class="sim-result" id="sim-result">
        ${renderSimResult()}
      </div>
    </div>
  `;
}

function updateSimulator() {
  State.team.forEach(m => {
    const inp = document.getElementById("sim-" + m.id);
    if (inp) State.simulatorData[m.id] = Number(inp.value) || 0;
  });
  const el = document.getElementById("sim-result");
  if (el) el.innerHTML = renderSimResult();
}

function resetSimulator() {
  State.simulatorData = {};
  renderSimulator();
  attachSectionListeners();
}

function renderSimResult() {
  const team     = State.team;
  const simData  = State.simulatorData;
  const realTotal = groupTotal(team);
  const simTotal  = simGroupTotal(team, simData);
  const diff      = simTotal - realTotal;
  const { current: rCur, next: rNext } = calcLevel(realTotal);
  const { current: sCur, next: sNext } = calcLevel(simTotal);
  const levelUp   = (!rCur && sCur) || (rCur && sCur && rCur.label !== sCur.label);
  const faltaSim  = sNext ? sNext.points - simTotal : 0;

  return `
    <div class="sim-result-card">
      <div class="sim-res-row">
        <span>Total actual</span>
        <strong>${fmt(realTotal)} pts</strong>
      </div>
      <div class="sim-res-row sim-res-highlight">
        <span>Total simulado</span>
        <strong style="color:var(--blue)">${fmt(simTotal)} pts</strong>
      </div>
      <div class="sim-res-row">
        <span>Diferencia</span>
        <strong style="color:var(--green)">+${fmt(diff)} pts</strong>
      </div>
      <hr style="border-color:#333;margin:.75rem 0">
      <div class="sim-res-row">
        <span>Nivel actual</span>
        <strong>${rCur ? rCur.label : "Sin nivel"}</strong>
      </div>
      <div class="sim-res-row">
        <span>Nivel simulado</span>
        <strong style="color:${levelUp ? "var(--green)" : "var(--blue)"}">
          ${sCur ? sCur.label : "Sin nivel"} ${levelUp ? "⬆ SUBE" : ""}
        </strong>
      </div>
      <div class="sim-res-row">
        <span>Falta para siguiente</span>
        <strong style="color:${faltaSim === 0 ? "var(--green)" : "var(--yellow)"}">
          ${faltaSim > 0 ? fmt(faltaSim) + " pts" : "¡Siguiente nivel alcanzado!"}
        </strong>
      </div>
      ${levelUp ? `
        <div class="sim-celebrate">
          🎉 ¡Con estos puntos subes a <strong>${sCur.label}</strong>!
        </div>` : ""}
      <div class="progress-bar" style="margin-top:1rem;height:8px">
        <div class="progress-fill"
          style="width:${sNext ? Math.min(100,(simTotal/sNext.points)*100) : 100}%;background:var(--blue);transition:width .5s ease"></div>
      </div>
    </div>`;
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: CAMINO SUGERIDO                               │
// └─────────────────────────────────────────────────────────┘

function renderPath() {
  const el = document.getElementById("section-path");
  if (!el) return;

  const active = State.team.filter(m => m.activo);
  // Ordenar por puntos faltantes ascendente (más cerca primero)
  const sorted = [...active].sort((a, b) => {
    const diffA = Math.max(0, a.metaPersonal - a.puntos);
    const diffB = Math.max(0, b.metaPersonal - b.puntos);
    return diffA - diffB;
  });

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Camino Sugerido</h2>
      <span class="section-sub">Prioridad de atención para alcanzar objetivos más rápido</span>
    </div>
    <div class="path-list">
      ${sorted.map((m, idx) => {
        const diff = Math.max(0, m.metaPersonal - m.puntos);
        const pct  = progress(m);
        const col  = statusColor(m);
        const done = diff === 0;
        return `
          <div class="path-card">
            <div class="path-rank ${done ? "rank-done" : idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : "rank-n"}">
              ${done ? "✓" : "#" + (idx + 1)}
            </div>
            <div class="path-avatar" style="background:${col}20;border-color:${col}">
              <span style="color:${col}">${initials(m.nombre)}</span>
            </div>
            <div class="path-info">
              <div class="path-name">${m.nombre}</div>
              <div class="path-detail">
                ${done
                  ? `<span style="color:var(--green)">✅ Meta cumplida (${fmt(m.puntos)} pts)</span>`
                  : `Faltan <strong style="color:${col}">${fmt(diff)} puntos</strong> para su meta de ${fmt(m.metaPersonal)}`}
              </div>
              <div class="progress-bar" style="margin-top:6px">
                <div class="progress-fill" style="width:${pct}%;background:${col}"></div>
              </div>
            </div>
            <div class="path-priority">
              ${done
                ? `<span class="pill pill-green">Completo</span>`
                : idx === 0
                  ? `<span class="pill pill-blue">🔥 Prioritario</span>`
                  : idx === 1
                    ? `<span class="pill pill-yellow">⚡ Alto</span>`
                    : `<span class="pill pill-grey">Normal</span>`}
            </div>
          </div>`;
      }).join("")}
    </div>
    <div class="path-insight">
      <div class="insight-icon">💡</div>
      <div class="insight-text">
        Enfocarte en <strong>${sorted[0]?.nombre || "el equipo"}</strong> primero puede desencadenar 
        el avance grupal más eficiente. Ayuda a los que están más cerca de su meta.
      </div>
    </div>
  `;
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: EQUIPO (gestión)                              │
// └─────────────────────────────────────────────────────────┘

function renderTeam() {
  const el = document.getElementById("section-team");
  if (!el) return;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Gestión de Equipo</h2>
      <span class="section-sub">Agrega, edita o elimina miembros de la red</span>
    </div>
    <button class="btn-primary" style="margin-bottom:1.5rem" onclick="openMemberModal()">
      + Agregar Miembro
    </button>
    <div class="team-table-wrap">
      <table class="team-table">
        <thead>
          <tr>
            <th>Miembro</th><th>Sponsor</th><th>Puntos</th>
            <th>Meta</th><th>Avance</th><th>Activo</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${State.team.map(m => {
            const sponsor = State.team.find(t => t.id === m.sponsorId);
            const pct = progress(m);
            const col = statusColor(m);
            return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    <div class="table-avatar" style="background:${col}20;border-color:${col}">
                      <span style="color:${col}">${initials(m.nombre)}</span>
                    </div>
                    ${m.nombre}
                  </div>
                </td>
                <td>${sponsor ? sponsor.nombre : "—"}</td>
                <td>${fmt(m.puntos)}</td>
                <td>${fmt(m.metaPersonal)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:.5rem;min-width:100px">
                    <div class="progress-bar" style="flex:1;height:6px">
                      <div class="progress-fill" style="width:${pct}%;background:${col}"></div>
                    </div>
                    <span style="color:${col};font-size:.8rem">${pct}%</span>
                  </div>
                </td>
                <td><span class="pill ${m.activo ? "pill-green" : "pill-grey"}">${m.activo ? "Sí" : "No"}</span></td>
                <td>
                  <div style="display:flex;gap:.4rem">
                    <button class="btn-icon" onclick="openMemberModal('${m.id}')" title="Editar">✏️</button>
                    <button class="btn-icon btn-icon-danger" onclick="confirmDelete('${m.id}')" title="Eliminar">🗑</button>
                  </div>
                </td>
              </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ──────────────────────────────────────────────
//  MODAL: Agregar / Editar miembro
// ──────────────────────────────────────────────

function openMemberModal(editId) {
  const member = editId ? State.team.find(m => m.id === editId) : null;
  const isEdit = !!member;

  // Opciones de sponsor (excluir al propio miembro si editando)
  const sponsors = State.team.filter(m => !editId || m.id !== editId);

  const modal = document.getElementById("modal-overlay");
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${isEdit ? "Editar Miembro" : "Agregar Miembro"}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Nombre *</label>
          <input id="f-nombre" type="text" class="form-input" value="${member ? member.nombre : ""}" placeholder="Nombre completo">
        </div>
        <div class="form-group">
          <label>Sponsor (upline)</label>
          <select id="f-sponsor" class="form-input">
            <option value="">— Sin sponsor (raíz) —</option>
            ${sponsors.map(s => `
              <option value="${s.id}" ${member && member.sponsorId === s.id ? "selected" : ""}>${s.nombre}</option>
            `).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Puntos actuales</label>
          <input id="f-puntos" type="number" class="form-input" min="0" value="${member ? member.puntos : 0}">
        </div>
        <div class="form-group">
          <label>Meta personal</label>
          <input id="f-meta" type="number" class="form-input" min="0" value="${member ? member.metaPersonal : 150}">
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="f-activo" ${!member || member.activo ? "checked" : ""}
              style="accent-color:var(--blue);margin-right:.4rem">
            Miembro activo
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="submitMember('${editId || ""}')">
          ${isEdit ? "Guardar cambios" : "Agregar"}
        </button>
      </div>
    </div>`;
  modal.style.display = "flex";
  document.getElementById("f-nombre").focus();
}

function closeModal() {
  const modal = document.getElementById("modal-overlay");
  if (modal) modal.style.display = "none";
}

async function submitMember(editId) {
  const nombre = document.getElementById("f-nombre").value.trim();
  if (!nombre) { alert("El nombre es requerido."); return; }

  const id = editId || String(Date.now());
  const member = {
    id,
    nombre,
    sponsorId:   document.getElementById("f-sponsor").value || "",
    puntos:      Number(document.getElementById("f-puntos").value) || 0,
    metaPersonal:Number(document.getElementById("f-meta").value) || 150,
    activo:      document.getElementById("f-activo").checked,
    fechaActualizacion: new Date().toISOString().split("T")[0],
  };

  closeModal();
  await saveMember(member);
  renderAll();
  attachSectionListeners();
}

function confirmDelete(id) {
  const m = State.team.find(t => t.id === id);
  if (!m) return;
  if (!confirm(`¿Eliminar a ${m.nombre} de la red? Esta acción no se puede deshacer.`)) return;
  deleteMember(id).then(() => { renderAll(); attachSectionListeners(); });
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: HISTORIAL                                     │
// └─────────────────────────────────────────────────────────┘

function renderHistory() {
  const el = document.getElementById("section-history");
  if (!el) return;

  const hist = [...State.history].reverse();

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Historial</h2>
      <span class="section-sub">Registro de snapshots del grupo</span>
    </div>
    <button class="btn-primary" style="margin-bottom:1.5rem" onclick="takeSnapshot()">
      📸 Guardar Snapshot Ahora
    </button>
    ${hist.length === 0
      ? `<div class="empty-state">Sin historial guardado aún. ¡Guarda tu primer snapshot!</div>`
      : `<div class="history-list">
          ${hist.map(h => `
            <div class="history-card">
              <div class="history-date">${h.fecha}</div>
              <div class="history-body">
                <div class="history-stat">
                  <span class="history-label">Total grupal</span>
                  <span class="history-value">${fmt(h.totalGrupal)} pts</span>
                </div>
                <div class="history-stat">
                  <span class="history-label">Nivel</span>
                  <span class="history-value">${h.nivel || "—"}</span>
                </div>
                <div class="history-stat">
                  <span class="history-label">Objetivo</span>
                  <span class="history-value">${h.objetivo || "—"}</span>
                </div>
                ${h.observacion ? `<div class="history-obs">${h.observacion}</div>` : ""}
              </div>
            </div>`).join("")}
        </div>`}
  `;
}

async function takeSnapshot() {
  const total = groupTotal(State.team);
  const { current } = calcLevel(total);
  const { next } = calcLevel(total);

  const obs = prompt("Observación (opcional):", "");
  const snap = {
    fecha:       new Date().toISOString().split("T")[0],
    totalGrupal: total,
    nivel:       current ? current.label : "Sin nivel",
    objetivo:    next ? next.label : "Máximo",
    observacion: obs || "",
  };

  // Guardar localmente en historial
  State.history.push(snap);
  saveHistoryToLocal(State.history);
  await saveSnapshot(snap);
  renderHistory();
  attachSectionListeners();
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: CONFIGURACIÓN                                 │
// └─────────────────────────────────────────────────────────┘

function renderSettings() {
  const el = document.getElementById("section-settings");
  if (!el) return;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Configuración</h2>
      <span class="section-sub">Ajusta la conexión con Google Sheets y preferencias</span>
    </div>
    <div class="settings-card">
      <h3 class="settings-title">🔗 Conexión Google Sheets</h3>
      <div class="form-group">
        <label>URL del Web App (Apps Script)</label>
        <input id="gas-url-input" type="url" class="form-input"
          value="${GAS_URL}" placeholder="https://script.google.com/macros/s/...">
        <div class="form-hint">
          Obtén esta URL en Apps Script → Implementar → Aplicación web
        </div>
      </div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <button class="btn-primary" onclick="saveGasUrl()">💾 Guardar URL</button>
        <button class="btn-secondary" onclick="testConnection()">🔌 Probar Conexión</button>
        <button class="btn-secondary" onclick="forceSyncAll()">🔄 Sincronizar Todo</button>
      </div>
      <div id="connection-test-result" style="margin-top:1rem"></div>
    </div>
    <div class="settings-card">
      <h3 class="settings-title">💾 Datos Locales</h3>
      <p style="color:#888;font-size:.9rem;margin-bottom:1rem">
        Quantum guarda los datos en tu dispositivo como respaldo cuando no hay conexión.
      </p>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <button class="btn-secondary" onclick="exportData()">📥 Exportar JSON</button>
        <button class="btn-secondary" onclick="importData()">📤 Importar JSON</button>
        <button class="btn-danger" onclick="clearLocalData()">🗑 Limpiar datos locales</button>
      </div>
    </div>
    <div class="settings-card">
      <h3 class="settings-title">ℹ️ Sobre Quantum</h3>
      <p style="color:#888;font-size:.85rem;line-height:1.7">
        Quantum v1.0.0 · Dashboard de red de equipo<br>
        Tecnología: HTML · CSS · JavaScript · Google Sheets · Apps Script<br>
        Diseñado para escalar con productos, CRM, n8n y más.
      </p>
    </div>
  `;
}

async function saveGasUrl() {
  const val = document.getElementById("gas-url-input").value.trim();
  // Escribir la URL en memoria (no podemos modificar la constante, usamos localStorage)
  localStorage.setItem("quantum_gas_url", val);
GAS_URL = val;
alert("URL guardada correctamente. Ya podés probar la conexión.");
}

async function testConnection() {
  const url = document.getElementById("gas-url-input").value.trim() || GAS_URL;
  const res  = document.getElementById("connection-test-result");
  if (!url) { res.innerHTML = `<div class="alert-error">⚠ Ingresa una URL primero.</div>`; return; }
  res.innerHTML = `<div class="alert-info">🔄 Probando conexión…</div>`;
  try {
    const r = await fetch(`${url}?action=ping`, { cache: "no-store" });
    const j = await r.json();
    res.innerHTML = j.ok
      ? `<div class="alert-success">✅ Conexión exitosa — ${j.timestamp}</div>`
      : `<div class="alert-error">❌ Error: ${j.error}</div>`;
  } catch (e) {
    res.innerHTML = `<div class="alert-error">❌ Sin conexión: ${e.message}</div>`;
  }
}

async function forceSyncAll() {
  setSyncStatus("syncing");
  await fetchTeam();
  await fetchHistory();
  renderAll();
  attachSectionListeners();
}

function exportData() {
  const data = {
    team:    State.team,
    history: State.history,
    exported:new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `quantum-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement("input");
  input.type  = "file";
  input.accept= ".json";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.team) { State.team = data.team; saveToLocal(State.team); }
        if (data.history) { State.history = data.history; saveHistoryToLocal(State.history); }
        alert("✅ Datos importados correctamente.");
        renderAll();
        attachSectionListeners();
      } catch (err) {
        alert("❌ Error al importar: " + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearLocalData() {
  if (!confirm("¿Eliminar todos los datos locales? Esta acción no se puede deshacer.")) return;
  localStorage.removeItem("quantum_team");
  localStorage.removeItem("quantum_history");
  localStorage.removeItem("quantum_gas_url");
  State.team    = SEED_TEAM;
  State.history = [];
  alert("Datos locales eliminados. Se cargaron los datos de ejemplo.");
  renderAll();
  attachSectionListeners();
}

// ┌─────────────────────────────────────────────────────────┐
// │  NAVEGACIÓN                                             │
// └─────────────────────────────────────────────────────────┘

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: ACERCA DEL NEGOCIO                            │
// └─────────────────────────────────────────────────────────┘

function renderAbout() {
  const el = document.getElementById("section-about");
  if (!el) return;

  const total  = groupTotal(State.team);
  const { current } = calcLevel(total);

  el.innerHTML = `
    <!-- Hero con logo -->
    <div class="about-hero">
      <div class="about-hero-glow"></div>
      <img src="logo.png" alt="Quantum" class="about-logo" onerror="this.style.display='none'">
      <h1 class="about-tagline">Construye tu red.<br>Escala tu libertad.</h1>
      <p class="about-tagline-sub">
        Quantum es un modelo de negocio basado en distribucion por redes donde cada persona
        puede generar ingresos crecientes ayudando a otros a crecer.
      </p>
      <div class="about-cta-row">
        <button class="btn-primary" onclick="navigate('dashboard')">Ver mi Dashboard →</button>
        <button class="btn-secondary" onclick="navigate('network')">Ver mi Red →</button>
      </div>
    </div>

    <!-- Stats en vivo -->
    <div class="about-live-stats">
      <div class="about-stat">
        <div class="about-stat-val">${fmt(total)}</div>
        <div class="about-stat-label">Puntos grupales</div>
      </div>
      <div class="about-stat">
        <div class="about-stat-val" style="color:var(--blue)">${current ? current.label : 'Sin nivel'}</div>
        <div class="about-stat-label">Nivel actual</div>
      </div>
      <div class="about-stat">
        <div class="about-stat-val">${State.team.filter(m => m.activo).length}</div>
        <div class="about-stat-label">Integrantes</div>
      </div>
      <div class="about-stat">
        <div class="about-stat-val" style="color:var(--green)">Activo</div>
        <div class="about-stat-label">Estado de la red</div>
      </div>
    </div>

    <!-- Cómo funciona -->
    <div class="about-section">
      <h2 class="about-section-title">¿Cómo funciona Quantum?</h2>
      <div class="about-cards">

        <div class="about-card">
          <div class="about-card-icon" style="background:rgba(77,163,255,.1);color:var(--blue)">1</div>
          <div class="about-card-body">
            <h3>Te uniós y compartis</h3>
            <p>Cada integrante tiene un Sponsor (upline) que lo invitó. Vos también podés invitar personas y construir tu propia red frontal.</p>
          </div>
        </div>

        <div class="about-card">
          <div class="about-card-icon" style="background:rgba(46,204,113,.1);color:var(--green)">2</div>
          <div class="about-card-body">
            <h3>Acuémulás puntos</h3>
            <p>Cada compra o acción genera <strong>puntos personales</strong>. Los puntos de toda tu red se suman para calcular el <strong>puntaje grupal</strong> y tu nivel de calificación.</p>
          </div>
        </div>

        <div class="about-card">
          <div class="about-card-icon" style="background:rgba(241,196,15,.1);color:var(--yellow)">3</div>
          <div class="about-card-body">
            <h3>Subís de nivel</h3>
            <p>A mayor puntaje grupal, mayor es tu porcentaje de ganancia. Desde <strong>3%</strong> hasta <strong>21%</strong>, cada nivel desbloquea más beneficios y comisiones.</p>
          </div>
        </div>

        <div class="about-card">
          <div class="about-card-icon" style="background:rgba(155,92,255,.1);color:var(--violet)">4</div>
          <div class="about-card-body">
            <h3>Tu equipo crece contigo</h3>
            <p>Cuando ayudás a tus frontales a alcanzar sus metas, <strong>todos ganan más</strong>. El éxito de tu red es tu éxito.</p>
          </div>
        </div>

      </div>
    </div>

    <!-- Niveles -->
    <div class="about-section">
      <h2 class="about-section-title">Escala de niveles</h2>
      <p class="about-section-sub">El puntaje grupal de tu red determina en qué nivel estás y cuánto ganás.</p>
      <div class="about-levels">
        ${LEVELS.map(l => {
          const reached = total >= l.points;
          const pct = Math.min(100, Math.round((total / l.points) * 100));
          return `
            <div class="about-level ${reached ? 'level-reached' : ''} ${current && current.label === l.label ? 'level-current' : ''}">
              <div class="about-level-label">${l.label}</div>
              <div class="about-level-pts">${fmt(l.points)} pts</div>
              <div class="progress-bar" style="margin-top:.4rem;height:4px">
                <div class="progress-fill" style="width:${pct}%;background:${reached ? 'var(--green)' : current && current.label === l.label ? 'var(--blue)' : 'var(--grey)'}"></div>
              </div>
              ${current && current.label === l.label ? '<div class="level-badge">Tu nivel actual</div>' : ''}
              ${reached && !(current && current.label === l.label) ? '<div class="level-badge level-badge-done">✓ Superado</div>' : ''}
            </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Objetivos clave -->
    <div class="about-section">
      <h2 class="about-section-title">Objetivos clave del equipo</h2>
      <div class="about-goals-grid">

        <div class="about-goal-card">
          <div class="about-goal-icon">🏆</div>
          <h3>Gana Más</h3>
          <p>Cada integrante activo llega a <strong>150 puntos</strong> propios. Cuando todos califican, el ingreso grupal se multiplica.</p>
          <button class="btn-secondary" style="margin-top:1rem;font-size:.8rem" onclick="navigate('goals');setTimeout(()=>setGoalMode('Gana Más'),100)">Ver estado →</button>
        </div>

        <div class="about-goal-card">
          <div class="about-goal-icon">🥉</div>
          <h3>Mini Bronce</h3>
          <p>Líder con <strong>300 pts</strong> + 3 frontales con <strong>150 pts</strong> cada uno. El primer gran logro del equipo.</p>
          <button class="btn-secondary" style="margin-top:1rem;font-size:.8rem" onclick="navigate('goals');setTimeout(()=>setGoalMode('Mini Bronce'),100)">Ver estado →</button>
        </div>

        <div class="about-goal-card">
          <div class="about-goal-icon">⚡</div>
          <h3>Simulador</h3>
          <p>Proyectá cuántos puntos necesita cada persona para que el equipo suba de nivel. Planificación inteligente.</p>
          <button class="btn-secondary" style="margin-top:1rem;font-size:.8rem" onclick="navigate('simulator')">Abrir simulador →</button>
        </div>

      </div>
    </div>

    <!-- Por qué Quantum -->
    <div class="about-why">
      <div class="about-why-inner">
        <div class="about-why-logo">
          <img src="logo.png" alt="Q" style="width:48px;opacity:.8" onerror="this.style.display='none'">
        </div>
        <h2>¿Por qué Quantum?</h2>
        <p>
          Quantum es un sistema de crecimiento colaborativo. No se trata solo de acumular puntos,
          sino de construir una comunidad donde el éxito de cada persona impulsa al resto.
          Con herramientas de visualización, simulación y seguimiento en tiempo real,
          cada decisión está respaldada por datos.
        </p>
        <div class="about-values">
          <div class="about-value"><span>🤝</span> Colaboración</div>
          <div class="about-value"><span>📈</span> Crecimiento</div>
          <div class="about-value"><span>🔍</span> Transparencia</div>
          <div class="about-value"><span>🚀</span> Escalabilidad</div>
        </div>
      </div>
    </div>
  `;
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: FLUJO DE PUNTOS                               │
// └─────────────────────────────────────────────────────────┘

/** Estado del visualizador de flujo */
let _selectedFlowId = null;

function renderFlow() {
  const el = document.getElementById('section-flow');
  if (!el) return;
  const team = State.team;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Cómo viajan los puntos en la red</h2>
      <span class="section-sub">Entendé cómo la actividad de cada persona impacta en toda la estructura</span>
    </div>

    <!-- Conceptos PP / PG -->
    <div class="flow-concepts">
      <div class="flow-concept-card">
        <div class="concept-num" style="background:rgba(77,163,255,.12);color:var(--blue)">PP</div>
        <div>
          <strong>Puntos Personales</strong>
          <p>Los puntos que genera cada persona con su propia actividad o consumo de productos.</p>
        </div>
      </div>
      <div class="flow-concept-card">
        <div class="concept-num" style="background:rgba(155,92,255,.12);color:var(--violet)">PG</div>
        <div>
          <strong>Puntos Grupales</strong>
          <p>PP propios + los PP de <em>toda</em> la red que está por debajo dentro de la estructura.</p>
        </div>
      </div>
    </div>

    <!-- Estado actual: PP y PG -->
    <div class="about-section">
      <h3 class="about-section-title">Estado actual — PP y PG de cada persona</h3>
      <div class="pg-overview-grid">
        ${team.filter(m => m.activo).map(m => {
          const pg  = computeGroupPoints(m.id, team);
          const desc = getAllDescendants(m.id, team).filter(d => d.activo);
          const netPts = desc.reduce((s, d) => s + Number(d.puntos), 0);
          const col  = nodeColor(m);
          return `
            <div class="pg-card" style="border-color:${col}30">
              <div class="pg-card-name" style="color:${col}">${m.nombre}</div>
              <div class="pg-formula">
                <div class="pg-formula-part">
                  <span class="pg-formula-val">${fmt(m.puntos)}</span>
                  <span class="pg-formula-label">PP propio</span>
                </div>
                <div class="pg-formula-op">+</div>
                <div class="pg-formula-part">
                  <span class="pg-formula-val">${fmt(netPts)}</span>
                  <span class="pg-formula-label">de red (${desc.length} pers.)</span>
                </div>
                <div class="pg-formula-op">=</div>
                <div class="pg-formula-part pg-formula-total" style="color:${col}">
                  <span class="pg-formula-val">${fmt(pg)}</span>
                  <span class="pg-formula-label">PG total</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Visualizador interactivo -->
    <div class="about-section">
      <h3 class="about-section-title">Visualizador de flujo</h3>
      <p class="about-section-sub">Seleccioná una persona para ver cómo sus puntos personales viajan hacia arriba en la estructura.</p>
      <div class="flow-person-buttons" id="flow-person-btns">
        ${team.filter(m => m.activo).map(m => `
          <button class="flow-person-btn" data-id="${m.id}"
                  onclick="showFlowFor('${m.id}')"
                  style="--btn-col:${nodeColor(m)}">
            <span class="flow-btn-avatar" style="background:${nodeColor(m)}20;color:${nodeColor(m)}">${initials(m.nombre)}</span>
            ${m.nombre}
          </button>
        `).join('')}
      </div>
      <div id="flow-viz" class="flow-viz-container"></div>
      <div id="flow-expl" class="flow-expl-wrap"></div>
    </div>

    <!-- Simulador de impacto -->
    <div class="about-section">
      <h3 class="about-section-title">Simulador de impacto</h3>
      <p class="about-section-sub">¿Qué pasa si alguien sube sus puntos? Calculá el efecto en cascada sobre toda la cadena upline.</p>
      <div class="impact-sim-layout">
        <div class="impact-sim-inputs">
          <div class="form-group">
            <label>Persona</label>
            <select id="impact-member-sel" class="form-input" onchange="updateImpactSim()">
              ${team.filter(m => m.activo).map(m =>
                `<option value="${m.id}">${m.nombre} — ${fmt(m.puntos)} PP actuales</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Nuevos puntos personales</label>
            <input type="number" id="impact-new-pts" class="form-input"
                   min="0" placeholder="Ej: 100" oninput="updateImpactSim()">
          </div>
          <button class="btn-primary" onclick="updateImpactSim()">⚡ Calcular impacto</button>
        </div>
        <div id="impact-sim-result" class="impact-sim-result">
          <div class="empty-state">Seleccioná una persona e ingresá sus nuevos puntos</div>
        </div>
      </div>
    </div>
  `;

  // Auto-seleccionar el primer miembro
  if (team.length > 0) {
    const firstActive = team.find(m => m.activo);
    if (firstActive) showFlowFor(firstActive.id);
  }
}

/** Muestra el flujo animado desde un miembro hacia sus líderes */
function showFlowFor(memberId) {
  _selectedFlowId = memberId;
  const team  = State.team;
  const chain = getUplineChain(memberId, team); // [self, padre, abuelo…]
  const self  = chain[0];

  // Actualizar botones
  document.querySelectorAll('.flow-person-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === memberId);
  });

  const viz = document.getElementById('flow-viz');
  if (!viz) return;

  // Mostrar top-down: raíz arriba, seleccionado abajo
  const display = [...chain].reverse();

  viz.innerHTML = display.map((m, i) => {
    const isSelected  = m.id === memberId;
    const isLast      = i === display.length - 1;
    const pg          = computeGroupPoints(m.id, team);
    const contribution = Number(self.puntos);
    const col         = nodeColor(m);

    return `
      <div class="flow-chain-item">
        <div class="flow-node-card ${isSelected ? 'flow-selected' : 'flow-impacted'}"
             style="--nc:${col};border-color:${col}40">
          <div class="flow-node-header">
            <div class="flow-node-av" style="background:${col}20;border-color:${col}">
              <span style="color:${col}">${initials(m.nombre)}</span>
            </div>
            <div class="flow-node-meta">
              <div class="flow-node-name">${m.nombre}</div>
              ${isSelected
                ? `<div class="flow-badge flow-badge-origin">✦ Origen de los puntos</div>`
                : `<div class="flow-badge flow-badge-impact">+${fmt(contribution)} PG recibidos</div>`
              }
            </div>
          </div>
          <div class="flow-node-stats">
            <div class="flow-stat">
              <span class="flow-stat-lbl">PP propio</span>
              <span class="flow-stat-val">${fmt(m.puntos)}</span>
            </div>
            <div class="flow-stat flow-stat-pg">
              <span class="flow-stat-lbl">PG total</span>
              <span class="flow-stat-val" style="color:${col}">${fmt(pg)}</span>
            </div>
          </div>
        </div>
        ${!isLast ? `
          <div class="flow-connector">
            <div class="flow-conn-line">
              <div class="flow-dot-up" style="--d:0s"></div>
              <div class="flow-dot-up" style="--d:0.4s"></div>
              <div class="flow-dot-up" style="--d:0.8s"></div>
            </div>
            <div class="flow-conn-label">↑ ${fmt(contribution)} PP suben hacia ${display[i-1]?.nombre || 'arriba'}</div>
          </div>
        ` : ''}
      </div>`;
  }).join('');

  // Explicación
  const expl = document.getElementById('flow-expl');
  if (!expl) return;
  const impacted = chain.slice(1); // upline sin el self

  expl.innerHTML = `
    <div class="flow-expl-card">
      <div class="flow-expl-icon">💡</div>
      <div class="flow-expl-body">
        <p>Los <strong>${fmt(self.puntos)} puntos personales</strong> de <strong>${self.nombre}</strong>
           impactan directamente en:</p>
        <ul class="flow-expl-list">
          <li><span style="color:${nodeColor(self)}">✦</span> <strong>${self.nombre}</strong> — propio</li>
          ${impacted.map(m =>
            `<li><span style="color:${nodeColor(m)}">↑</span> <strong>${m.nombre}</strong> — upline</li>`
          ).join('')}
        </ul>
        ${impacted.length === 0
          ? `<p class="flow-expl-note">Este integrante es la raíz de la red. Sus PP solo impactan en su propio PG.</p>`
          : `<p class="flow-expl-note">Regla: cada punto generado por una persona sube por toda la cadena hacia sus líderes.</p>`
        }
      </div>
    </div>`;
}

/** Actualiza el resultado del simulador de impacto */
function updateImpactSim() {
  const sel    = document.getElementById('impact-member-sel');
  const input  = document.getElementById('impact-new-pts');
  const result = document.getElementById('impact-sim-result');
  if (!sel || !input || !result) return;

  const memberId = sel.value;
  const newPts   = input.value === '' ? null : Number(input.value);
  result.innerHTML = _renderImpactResult(memberId, newPts);
}

function _renderImpactResult(memberId, newPts) {
  const team = State.team;
  const member = team.find(m => m.id === memberId);
  if (!member) return '<div class="empty-state">Seleccioná una persona</div>';

  const currentPts = Number(member.puntos);
  if (newPts === null) return '<div class="empty-state">Ingresá los nuevos puntos</div>';

  const diff  = newPts - currentPts;
  const chain = getUplineChain(memberId, team);

  const rows = chain.map(m => {
    const pgBefore = computeGroupPoints(m.id, team);
    const pgAfter  = pgBefore + diff;
    const col      = nodeColor(m);
    return { m, pgBefore, pgAfter, diff, col };
  });

  const diffColor = diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--grey)';
  const sign      = diff > 0 ? '+' : '';

  return `
    <div class="impact-result">
      <div class="impact-result-header">
        <span>${member.nombre}:</span>
        <strong>${fmt(currentPts)} PP
          ${diff !== 0 ? `→ <span style="color:${diffColor}">${fmt(newPts)} PP (${sign}${fmt(diff)})</span>` : '(sin cambio)'}
        </strong>
      </div>
      <div class="impact-chain">
        ${rows.map((r, i) => `
          <div class="impact-row">
            <div class="impact-row-member">
              <div class="impact-av" style="background:${r.col}20;border-color:${r.col}">
                <span style="color:${r.col}">${initials(r.m.nombre)}</span>
              </div>
              <div>
                <div class="impact-row-name">${r.m.nombre}</div>
                <div class="impact-row-type">${i === 0 ? 'Persona seleccionada' : 'Upline'}</div>
              </div>
            </div>
            <div class="impact-row-values">
              <span class="impact-pg-before">PG: ${fmt(r.pgBefore)}</span>
              <span class="impact-arrow">→</span>
              <span class="impact-pg-after" style="color:${r.diff !== 0 ? diffColor : 'var(--grey2)'}">
                ${fmt(r.pgAfter)}
                ${r.diff !== 0 ? `<small>(${sign}${fmt(r.diff)})</small>` : ''}
              </span>
            </div>
          </div>`
        ).join('')}
      </div>
      ${diff !== 0 ? `
        <div class="impact-total">
          <span>Impacto total en la red:</span>
          <strong style="color:${diffColor}">${sign}${fmt(diff)} puntos grupales</strong>
        </div>` : ''}
    </div>`;
}

// ┌─────────────────────────────────────────────────────────┐
// │  SECCIÓN: ENTENDIENDO EL MODELO                         │
// └─────────────────────────────────────────────────────────┘

function renderModel() {
  const el = document.getElementById('section-model');
  if (!el) return;

  el.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">Entendiendo el modelo</h2>
      <span class="section-sub">Información clara y objetiva sobre redes de comercialización</span>
    </div>

    <!-- ¿Qué es una red? -->
    <div class="model-block">
      <div class="model-block-icon">🌐</div>
      <div class="model-block-body">
        <h3>¿Qué es una red de comercialización?</h3>
        <p>Una red de comercialización es un sistema donde las personas pueden participar en
           múltiples formas según su nivel de compromiso:</p>
        <div class="model-features">
          <div class="model-feature"><span class="mf-icon">🛍</span><span>Consumir productos</span></div>
          <div class="model-feature"><span class="mf-icon">💬</span><span>Recomendar productos</span></div>
          <div class="model-feature"><span class="mf-icon">💼</span><span>Vender productos</span></div>
          <div class="model-feature"><span class="mf-icon">🤝</span><span>Enseñar a otros a hacer lo mismo</span></div>
        </div>
        <div class="model-key-rule">
          <span>📌</span>
          <span>La actividad se mide mediante <strong>puntos generados por el movimiento de productos</strong>.
          Sin productos, sin actividad, sin puntos.</span>
        </div>
      </div>
    </div>

    <!-- ¿Qué es una estafa piramidal? -->
    <div class="model-block model-block-danger">
      <div class="model-block-icon">⚠️</div>
      <div class="model-block-body">
        <h3>¿Qué es una estafa piramidal?</h3>
        <p>Una estafa piramidal es un sistema donde el dinero proviene
           principalmente del <strong>ingreso de nuevas personas</strong>, no del movimiento de productos.</p>
        <div class="model-features">
          <div class="model-feature model-feature-no"><span class="mf-icon">❌</span><span>No existen productos reales o tienen poco valor</span></div>
          <div class="model-feature model-feature-no"><span class="mf-icon">❌</span><span>El reclutamiento es la principal fuente de ingresos</span></div>
          <div class="model-feature model-feature-no"><span class="mf-icon">❌</span><span>El sistema depende constantemente de incorporar nuevas personas</span></div>
          <div class="model-feature model-feature-no"><span class="mf-icon">❌</span><span>Cuando deja de entrar gente, el sistema colapsa</span></div>
        </div>
      </div>
    </div>

    <!-- Tabla comparativa -->
    <div class="about-section">
      <h3 class="about-section-title">Diferencias principales</h3>
      <div class="model-comparison">
        <div class="model-col model-col-bad">
          <div class="model-col-header">⚠️ Estafa piramidal</div>
          <div class="model-col-body">
            <div class="model-row-bad"><span>❌</span> El dinero viene del ingreso de personas</div>
            <div class="model-row-bad"><span>❌</span> No existe una actividad comercial real</div>
            <div class="model-row-bad"><span>❌</span> Reclutar es la principal fuente de ingresos</div>
            <div class="model-row-bad"><span>❌</span> Sin nuevos integrantes, no hay ingresos</div>
          </div>
        </div>
        <div class="model-col model-col-good">
          <div class="model-col-header">✅ Red de comercialización</div>
          <div class="model-col-body">
            <div class="model-row-good"><span>✅</span> Existen productos reales y consumibles</div>
            <div class="model-row-good"><span>✅</span> Los productos pueden consumirse sin participar del negocio</div>
            <div class="model-row-good"><span>✅</span> Los puntos se generan por movimiento de productos</div>
            <div class="model-row-good"><span>✅</span> Incorporar personas NO genera puntos por sí solo</div>
            <div class="model-row-good"><span>✅</span> Sin actividad y sin productos no existe crecimiento</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mitos frecuentes -->
    <div class="about-section">
      <h3 class="about-section-title">Mitos frecuentes</h3>
      <div class="model-myths">

        <div class="myth-card">
          <div class="myth-claim">💬 &ldquo;Si entra gente, gano dinero&rdquo;</div>
          <div class="myth-answer">
            <div class="myth-answer-header">Realidad:</div>
            <p>No necesariamente. Una persona sin actividad genera <strong>0 puntos</strong>.
               El crecimiento depende de la actividad y del movimiento de productos, no de cuántas personas se unen.</p>
          </div>
        </div>

        <div class="myth-card">
          <div class="myth-claim">💬 &ldquo;Solo importa reclutar&rdquo;</div>
          <div class="myth-answer">
            <div class="myth-answer-header">Realidad:</div>
            <p>Sin puntos, sin productos y sin actividad <strong>no existe crecimiento de la red</strong>.
               El reclutamiento es una herramienta, no el motor del sistema.</p>
          </div>
        </div>

        <div class="myth-card">
          <div class="myth-claim">💬 &ldquo;Los puntos aparecen por agregar personas&rdquo;</div>
          <div class="myth-answer">
            <div class="myth-answer-header">Realidad:</div>
            <p>Los puntos aparecen cuando existe <strong>movimiento de productos</strong> dentro de la red.
               Agregar personas sin actividad no genera puntos.</p>
          </div>
        </div>

      </div>
    </div>

    <!-- Disclaimer -->
    <div class="model-disclaimer">
      <div class="model-disclaimer-icon">📋</div>
      <div>
        <strong>Aclaración importante</strong>
        <p>
          Quantum es una <strong>herramienta educativa y de visualización</strong>.
          No garantiza resultados ni ingresos. Su objetivo es ayudar a comprender
          la estructura, los puntos, los objetivos y el crecimiento de una red
          de forma clara, visual y basada en datos reales.
        </p>
        <p style="margin-top:.5rem;color:var(--grey)">
          Los resultados dependen exclusivamente de la actividad, el esfuerzo y
          el movimiento de productos de cada integrante de la red.
        </p>
      </div>
    </div>
  `;
}

// ┌─────────────────────────────────────────────────────────┐
// │  NAVEGACIÓN                                             │
// └─────────────────────────────────────────────────────────┘

const SECTIONS = ["about", "dashboard", "network", "goals", "simulator", "path", "team", "history", "flow", "model", "settings"];


function navigate(section) {
  if (!SECTIONS.includes(section)) return;
  State.activeSection = section;

  // Mostrar/ocultar secciones
  SECTIONS.forEach(s => {
    const el = document.getElementById("section-" + s);
    if (el) el.style.display = s === section ? "block" : "none";
  });

  // Actualizar nav links
  document.querySelectorAll(".nav-link").forEach(a => {
    a.classList.toggle("active", a.dataset.section === section);
  });

  // Cerrar sidebar en mobile
  closeSidebar();

  // Renderizar sección activa
  renderSection(section);
}

function renderSection(section) {
  switch (section) {
    case "about":      renderAbout();     break;
    case "dashboard":  renderDashboard(); break;
    case "network":    renderNetwork();   break;
    case "goals":      renderGoals();     break;
    case "simulator":  renderSimulator(); break;
    case "path":       renderPath();      break;
    case "team":       renderTeam();      break;
    case "history":    renderHistory();   break;
    case "flow":       renderFlow();      break;
    case "model":      renderModel();     break;
    case "settings":   renderSettings();  break;
  }
  attachSectionListeners();
}

function renderAll() {
  renderSection(State.activeSection);
}

// ┌─────────────────────────────────────────────────────────┐
// │  SIDEBAR / MOBILE MENU                                  │
// └─────────────────────────────────────────────────────────┘

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("visible");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  sidebar.classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("visible");
}

// ┌─────────────────────────────────────────────────────────┐
// │  EVENT LISTENERS DINÁMICOS                              │
// └─────────────────────────────────────────────────────────┘

function attachSectionListeners() {
  // Los listeners dinámicos se manejan con onclick inline
  // Aquí se pueden agregar listeners adicionales si es necesario
}

// ┌─────────────────────────────────────────────────────────┐
// │  INICIALIZACIÓN                                         │
// └─────────────────────────────────────────────────────────┘

async function init() {
  // Leer URL guardada en localStorage
  const savedUrl = localStorage.getItem("quantum_gas_url");
  if (savedUrl) {
    // Inyectamos la URL en el módulo (workaround por const)
    window._GAS_URL = savedUrl;
  }

  // Render inicial con skeleton
  document.getElementById("section-dashboard").style.display = "block";

  // Escuchar nav links
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigate(link.dataset.section);
    });
  });

  // Mobile bottom nav
  document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.section));
  });

  // Hamburguesa
  const hamburger = document.getElementById("hamburger");
  if (hamburger) hamburger.addEventListener("click", toggleSidebar);

  // Overlay sidebar
  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) overlay.addEventListener("click", closeSidebar);

  // Cerrar modal con Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeModal();
  });

  // Cerrar modal al hacer clic fuera
  document.getElementById("modal-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Cargar datos
  await fetchTeam();
  await fetchHistory();

  // Render inicial — mostrar la página de inicio (About)
  renderSection("about");
  navigate("about");
}

// Arrancar cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", init);
