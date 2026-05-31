// ============================================================
//  QUANTUM — Google Apps Script API
//  Pegar este código en: Extensions > Apps Script
//  Publicar como: Web App (Anyone can access)
// ============================================================

// ─── CONFIGURACIÓN ──────────────────────────────────────────
const SHEET_NAME_TEAM    = "Equipo";
const SHEET_NAME_HISTORY = "Historial";

// ─── CABECERAS CORS ─────────────────────────────────────────
function setCORSHeaders(output) {
  return output
    .setHeader("Access-Control-Allow-Origin",  "*")
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─── PUNTO DE ENTRADA GET ───────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || "";
  let result;

  try {
    switch (action) {
      case "getTeam":
        result = getTeam();
        break;
      case "getHistory":
        result = getHistory();
        break;
      case "ping":
        result = { ok: true, timestamp: new Date().toISOString() };
        break;
      default:
        result = { error: "Acción GET desconocida: " + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  const output = ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);

  return setCORSHeaders(output);
}

// ─── PUNTO DE ENTRADA POST ──────────────────────────────────
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    body = {};
  }

  const action = body.action || "";
  let result;

  try {
    switch (action) {
      case "saveMember":
        result = saveMember(body.data);
        break;
      case "deleteMember":
        result = deleteMember(body.id);
        break;
      case "saveSnapshot":
        result = saveSnapshot(body.data);
        break;
      default:
        result = { error: "Acción POST desconocida: " + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  const output = ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);

  return setCORSHeaders(output);
}

// ─── OPTIONS (preflight CORS) ────────────────────────────────
function doOptions(e) {
  const output = ContentService.createTextOutput("");
  return setCORSHeaders(output);
}

// ============================================================
//  GET: Equipo
// ============================================================
function getTeam() {
  const sheet = getOrCreateSheet(SHEET_NAME_TEAM, [
    "ID", "Nombre", "SponsorID", "Puntos",
    "MetaPersonal", "Activo", "FechaActualizacion"
  ]);

  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { team: [] };

  const headers = rows[0].map(h => String(h).trim());
  const team = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return {
      id:                String(obj["ID"]        || ""),
      nombre:            String(obj["Nombre"]     || ""),
      sponsorId:         String(obj["SponsorID"]  || ""),
      puntos:            Number(obj["Puntos"]      || 0),
      metaPersonal:      Number(obj["MetaPersonal"]|| 0),
      activo:            obj["Activo"] === true || String(obj["Activo"]).toUpperCase() === "TRUE",
      fechaActualizacion:String(obj["FechaActualizacion"] || ""),
    };
  });

  return { team };
}

// ============================================================
//  GET: Historial
// ============================================================
function getHistory() {
  const sheet = getOrCreateSheet(SHEET_NAME_HISTORY, [
    "Fecha", "TotalGrupal", "Nivel", "Objetivo", "Observacion"
  ]);

  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { history: [] };

  const headers = rows[0].map(h => String(h).trim());
  const history = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return {
      fecha:       String(obj["Fecha"]       || ""),
      totalGrupal: Number(obj["TotalGrupal"] || 0),
      nivel:       String(obj["Nivel"]       || ""),
      objetivo:    String(obj["Objetivo"]    || ""),
      observacion: String(obj["Observacion"] || ""),
    };
  });

  return { history };
}

// ============================================================
//  POST: Guardar/actualizar miembro
// ============================================================
function saveMember(data) {
  if (!data || !data.id) return { error: "Datos de miembro inválidos" };

  const sheet = getOrCreateSheet(SHEET_NAME_TEAM, [
    "ID", "Nombre", "SponsorID", "Puntos",
    "MetaPersonal", "Activo", "FechaActualizacion"
  ]);

  const rows   = sheet.getDataRange().getValues();
  const idCol  = 0; // columna A = ID
  let targetRow = -1;

  // Buscar fila existente
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(data.id)) {
      targetRow = i + 1; // 1-indexed
      break;
    }
  }

  const now  = new Date().toISOString().split("T")[0];
  const rowData = [
    String(data.id),
    String(data.nombre       || ""),
    String(data.sponsorId    || ""),
    Number(data.puntos       || 0),
    Number(data.metaPersonal || 0),
    data.activo !== false,
    now,
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return { ok: true, id: data.id, timestamp: now };
}

// ============================================================
//  POST: Eliminar miembro
// ============================================================
function deleteMember(id) {
  if (!id) return { error: "ID requerido" };

  const sheet = getOrCreateSheet(SHEET_NAME_TEAM, [
    "ID", "Nombre", "SponsorID", "Puntos",
    "MetaPersonal", "Activo", "FechaActualizacion"
  ]);

  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true, deleted: id };
    }
  }

  return { error: "Miembro no encontrado: " + id };
}

// ============================================================
//  POST: Guardar snapshot de historial
// ============================================================
function saveSnapshot(data) {
  if (!data) return { error: "Datos de snapshot inválidos" };

  const sheet = getOrCreateSheet(SHEET_NAME_HISTORY, [
    "Fecha", "TotalGrupal", "Nivel", "Objetivo", "Observacion"
  ]);

  const now = new Date().toISOString().split("T")[0];
  sheet.appendRow([
    data.fecha       || now,
    Number(data.totalGrupal || 0),
    String(data.nivel       || ""),
    String(data.objetivo    || ""),
    String(data.observacion || ""),
  ]);

  return { ok: true, timestamp: now };
}

// ============================================================
//  UTILIDAD: Obtener o crear hoja con encabezados
// ============================================================
function getOrCreateSheet(name, headers) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  return sheet;
}

// ============================================================
//  DATOS SEMILLA (ejecutar manualmente UNA SOLA VEZ)
//  Tools > Run > seedInitialData
// ============================================================
function seedInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Equipo ──
  let teamSheet = ss.getSheetByName(SHEET_NAME_TEAM);
  if (teamSheet) ss.deleteSheet(teamSheet);
  teamSheet = ss.insertSheet(SHEET_NAME_TEAM);

  const teamHeaders = ["ID","Nombre","SponsorID","Puntos","MetaPersonal","Activo","FechaActualizacion"];
  teamSheet.appendRow(teamHeaders);
  teamSheet.getRange(1, 1, 1, teamHeaders.length).setFontWeight("bold");

  const today = "2026-05-31";
  const members = [
    [1, "Joy",  "",  201, 300, true, today],
    [2, "Jon",  1,    85, 150, true, today],
    [3, "Wall", 1,    25, 150, true, today],
    [4, "Mamá", 2,    25, 150, true, today],
  ];
  members.forEach(r => teamSheet.appendRow(r));

  // ── Historial ──
  let histSheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (histSheet) ss.deleteSheet(histSheet);
  histSheet = ss.insertSheet(SHEET_NAME_HISTORY);

  const histHeaders = ["Fecha","TotalGrupal","Nivel","Objetivo","Observacion"];
  histSheet.appendRow(histHeaders);
  histSheet.getRange(1, 1, 1, histHeaders.length).setFontWeight("bold");
  histSheet.appendRow([today, 336, "3%", "300 puntos", "Datos iniciales Quantum"]);

  SpreadsheetApp.getUi().alert("✅ Datos semilla cargados correctamente.");
}
