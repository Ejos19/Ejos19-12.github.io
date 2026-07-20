// codigo.gs - Versión optimizada y robusta
// Soporta:
//  - doGet(e) ?rif=value -> devuelve registro {status, record}
//  - doPost(e) -> inserta nuevo registro (como antes) o actualiza si body.action === 'update'
//  - subida de archivos (fileData base64) en inserción o actualización
//  - manejo dinámico y seguro de cabeceras (headers)

const DATA_ENTRY_SHEET_NAME = "Registros";
const TIME_STAMP_COLUMN_NAME = "Timestamp";
const FOLDER_ID = "1UOjTWSo863tZvllJu5esGsOZpjqWZEM_";
const FILE_LINK_COLUMN_NAME = "FileLink";
const UPLOADED_FILE_NAME_COLUMN = "UploadedFileName";
const UNIQUE_ID_COLUMN = "RIF"; // columna única para buscar/actualizar

/** Util: devuelve salida JSON con el mime type correcto */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** doGet: buscar por RIF
 *  Ejemplo: GET ?rif=J-123456
 */
function doGet(e) {
  try {
    const rif =
      e.parameter && e.parameter.rif ? String(e.parameter.rif).trim() : null;
    if (!rif) {
      return jsonResponse({
        status: "error",
        message: "Parametro rif requerido",
      });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DATA_ENTRY_SHEET_NAME);
    if (!sheet)
      return jsonResponse({ status: "error", message: "Hoja no encontrada" });

    const headers = getHeaders(sheet);
    const rowIndex = findRowByColumnValue(
      sheet,
      headers,
      UNIQUE_ID_COLUMN,
      rif
    );
    if (rowIndex === -1) {
      return jsonResponse({ status: "not_found" });
    }

    const rowValues = sheet
      .getRange(rowIndex, 1, 1, headers.length)
      .getValues()[0];
    const record = {};
    headers.forEach((h, i) => {
      record[h] = rowValues[i];
    });

    return jsonResponse({ status: "success", record: record });
  } catch (err) {
    console.error(err);
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/** doPost: inserta o actualiza según el payload
 *  Si el JSON incluye { action: 'update', rif: '...', updates: { ... } } -> actualiza
 *  En otro caso se interpreta como inserción de nuevo registro (como tu versión previa)
 */
function doPost(e) {
  try {
    // parse body (apoya content-type: text/plain con JSON)
    let payload = {};
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        // si no se pudo parsear, intentar tomar parámetros form-data
        console.warn(
          "JSON parse failed, attempting to read parameter map",
          parseErr
        );
        payload = e.parameter || {};
      }
    } else {
      payload = e.parameter || {};
    }

    // Abrir hoja
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(DATA_ENTRY_SHEET_NAME);
    if (!sheet)
      throw new Error("Sheet '" + DATA_ENTRY_SHEET_NAME + "' not found");

    // Si action === 'update' -> actualizar
    if (payload.action && String(payload.action).toLowerCase() === "update") {
      const rif =
        payload.rif || (payload.updates && payload.updates.RIF)
          ? String(payload.rif || payload.updates.RIF).trim()
          : null;
      if (!rif) throw new Error("RIF requerido para actualizar");

      const updates = payload.updates || {};

      // Si viene fileData dentro de updates, procesarla y sustituir por FileLink / UploadedFileName
      if (updates.fileData) {
        const fileInfo = saveFile(updates.fileData);
        updates[FILE_LINK_COLUMN_NAME] = fileInfo.url;
        updates[UPLOADED_FILE_NAME_COLUMN] = fileInfo.name;
        delete updates.fileData;
      }

      const updated = updateRowByUniqueColumn(
        sheet,
        UNIQUE_ID_COLUMN,
        rif,
        updates
      );
      if (!updated) {
        return jsonResponse({
          status: "not_found",
          message: "RIF no encontrado para actualizar",
        });
      }

      return jsonResponse({
        status: "success",
        message: "Registro actualizado",
      });
    }

    // De lo contrario, inserción de nuevo registro
    // Soportar fileData (base64) en payload
    let fileInfo = null;
    if (payload.fileData) {
      fileInfo = saveFile(payload.fileData);
      delete payload.fileData;
    }

    // Añadir timestamp
    payload[TIME_STAMP_COLUMN_NAME] = new Date(); // usar objeto Date para hoja

    if (fileInfo) {
      payload[FILE_LINK_COLUMN_NAME] = fileInfo.url;
      payload[UPLOADED_FILE_NAME_COLUMN] = fileInfo.name;
    }

    appendToGoogleSheet(payload, sheet);

    return jsonResponse({
      status: "success",
      message: "Data submitted successfully",
    });
  } catch (err) {
    console.error(err);
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

/** Obtiene headers de la hoja, crea si está vacía.
 *  Devuelve array de headers (strings)
 */
function getHeaders(sheet) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  const headers = headerRange
    .getValues()[0]
    .map((h) => (h === null ? "" : String(h).trim()));

  // Si primera celda vacía y fila vacía -> retorna [] para indicar hoja vacía
  const isEmpty = headers.every((h) => h === "");
  if (isEmpty) return [];
  return headers;
}

/** Asegura que todos los keys de data existen como headers en la hoja.
 *  Si no existen, los añade al final. Devuelve headers actualizados.
 */
function ensureHeaders(sheet, dataKeys) {
  let headers = getHeaders(sheet);
  if (!headers || headers.length === 0) {
    headers = [];
  }

  let changed = false;
  dataKeys.forEach((key) => {
    if (!headers.includes(key)) {
      headers.push(key);
      changed = true;
    }
  });

  if (changed) {
    // sobrescribir la fila de cabeceras
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return headers;
}

/** Añade una fila (obj data -> mapea a headers) */
function appendToGoogleSheet(data, sheet) {
  // keys del objeto
  const keys = Object.keys(data);
  const headers = ensureHeaders(
    sheet,
    keys.concat([
      TIME_STAMP_COLUMN_NAME,
      FILE_LINK_COLUMN_NAME,
      UPLOADED_FILE_NAME_COLUMN,
    ])
  );

  // Mapear valores en el orden de headers
  const row = headers.map((h) => {
    // Si es objeto Date, dejarlo como tal para que Sheets reconozca la fecha
    const v = data.hasOwnProperty(h) ? data[h] : "";
    if (v instanceof Date) return v;
    return v == null ? "" : String(v);
  });

  sheet.appendRow(row);
}

/** Buscar la fila (1-based) que contiene columnName == value. Devuelve fila (index) o -1 si no existe
 *  Asume que la fila 1 son headers
 */
function findRowByColumnValue(sheet, headers, columnName, value) {
  if (!headers || headers.length === 0) return -1;
  // localizar índice de columna (case-sensitive por exactitud - buscar igualando mayúsculas/minúsculas)
  const colIndex = headers.findIndex(
    (h) =>
      String(h).trim().toUpperCase() === String(columnName).trim().toUpperCase()
  );
  if (colIndex === -1) return -1;

  const dataRange = sheet.getRange(
    2,
    colIndex + 1,
    Math.max(1, sheet.getLastRow() - 1),
    1
  );
  const values = dataRange.getValues().map((r) => r[0]);
  for (let i = 0; i < values.length; i++) {
    const cell = values[i];
    if (String(cell).trim() === String(value).trim()) {
      return i + 2; // fila real (1-based)
    }
  }
  return -1;
}

/** Actualiza una fila encontrada por columna única (ej. RIF). Devuelve true si actualizó. */
function updateRowByUniqueColumn(sheet, uniqueColumn, uniqueValue, updates) {
  const headers = getHeaders(sheet);
  if (!headers || headers.length === 0) return false;

  const rowIndex = findRowByColumnValue(
    sheet,
    headers,
    uniqueColumn,
    uniqueValue
  );
  if (rowIndex === -1) return false;

  // Asegurar headers para cualquier nueva key en updates
  const updateKeys = Object.keys(updates || {});
  const finalHeaders = ensureHeaders(
    sheet,
    updateKeys.concat([
      TIME_STAMP_COLUMN_NAME,
      FILE_LINK_COLUMN_NAME,
      UPLOADED_FILE_NAME_COLUMN,
    ])
  );

  // Leer fila actual
  const rowValues = sheet
    .getRange(rowIndex, 1, 1, finalHeaders.length)
    .getValues()[0];

  // Aplicar updates
  updateKeys.forEach((key) => {
    const colIdx = finalHeaders.findIndex(
      (h) => String(h).trim().toUpperCase() === String(key).trim().toUpperCase()
    );
    if (colIdx !== -1) {
      rowValues[colIdx] =
        updates[key] instanceof Date ? updates[key] : updates[key];
    }
  });
  // Actualizar Timestamp de modificación
  const tsIdx = finalHeaders.findIndex(
    (h) => String(h).trim() === TIME_STAMP_COLUMN_NAME
  );
  if (tsIdx !== -1) {
    rowValues[tsIdx] = new Date();
  }

  // Escribir la fila completa (asegura tamaño correcto)
  sheet.getRange(rowIndex, 1, 1, finalHeaders.length).setValues([rowValues]);
  return true;
}

/** Guarda archivo en Drive, devuelve {url, name, id}
 *  fileData: { fileName, mimeType, data } donde data es base64
 */
function saveFile(fileData) {
  try {
    if (!fileData || !fileData.data) throw new Error("fileData inválido");
    const bytes = Utilities.base64Decode(fileData.data);
    const blob = Utilities.newBlob(
      bytes,
      fileData.mimeType || "application/octet-stream",
      fileData.fileName || "upload"
    );
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(blob);
    // permitir ver por enlace
    try {
      file.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
      );
    } catch (shareErr) {
      console.warn("No se pudo ajustar sharing:", shareErr);
    }
    return {
      url: "https://drive.google.com/uc?export=view&id=" + file.getId(),
      name: file.getName(),
      id: file.getId(),
    };
  } catch (err) {
    console.error("File upload error:", err);
    throw new Error("Failed to upload file: " + err.toString());
  }
}
