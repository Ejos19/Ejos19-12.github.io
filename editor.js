// editor.js
// Nuevo archivo que permite CONSULTAR y EDITAR registros existentes por RIF.
// No modifica `app.js` ni los scripts del servidor. Solo cliente.

// --- NOTA IMPORTANTE / SUPUESTOS ---
// 1) Este cliente asume que el Web App (Google Apps Script) que ya usas
//    acepta las siguientes operaciones desde el front-end:
//    - GET ?rif=<RIF>  -> devuelve JSON { status: 'success', record: { <COL>: <VAL>, ... } }
//      si encuentra la fila con RIF (columna única RIF). Si no, devuelve { status: 'not_found' }
//    - POST con body JSON { action: 'update', rif: '<RIF>', updates: { ... } }
//      -> actualiza la fila y devuelve { status: 'success', message: '...' }
// Si tu Apps Script no soporta estos endpoints/formatos, tendrás que añadir los manejadores
// correspondientes en el Apps Script. Si quieres, te puedo generar el snippet de Apps Script
// que maneje estas dos operaciones sin tocar la lógica de inserción actual.
// -----------------------------------

(function () {
  // URL del Web App (la misma que usa app.js)
  const scriptURL =
    "https://script.google.com/macros/s/AKfycbxp4INN-jxLIgjAreMsfkDvUQxVs7ZPn6p3LxwqBJYPviuTshbwuoK_ei-dHmm58G6Zfg/exec";

  // Elementos DOM
  const modeSelect = document.getElementById("modeSelect");
  const rifControls = document.getElementById("rif-controls");
  const rifSearch = document.getElementById("rifSearch");
  const searchButton = document.getElementById("search-button");
  const clearSearch = document.getElementById("clear-search");
  const updateControl = document.getElementById("update-control");
  const updateButton = document.getElementById("update-button");
  const submitButton = document.getElementById("submit-button");
  const form = document.getElementById("form");
  const messageDiv = document.getElementById("message");

  // CONFIGURACIÓN: lista de campos que se permiten editar en modo CONSULTAR/EDITAR
  // Modifica este array según los campos que quieras permitir editar.
  // Debe coincidir exactamente con los atributos `name` de los inputs en el formulario.
  const EDITABLE_FIELDS = [
    "SERVICIO",
    "PROPUESTA",
    "SRM",
    "RIF",
    "DESCUENTOS",
    "ESTATUS",
    "FECHACAP",
    "OBSERVACIONES",
    "CODIGOCLIENTE",
    "RANGOKG",
    "CODIGOF",
    "CATEGORIA",
    "theFile",
    "TLF_CONTACTO",
    "CONTACTO",
    "CORREO_CONTACTO",
  ];

  // Inicializar estado
  function setMode(mode) {
    if (mode === "consultar") {
      rifControls.style.display = "block";
      // ocultar el botón de submit (ingresar)
      submitButton.style.display = "none";
      // ocultar update hasta que se haga una búsqueda exitosa
      updateControl.style.display = "none";
    } else {
      rifControls.style.display = "none";
      submitButton.style.display = "inline-block";
      updateControl.style.display = "none";
      // limpiar campo de búsqueda
      rifSearch.value = "";
    }
  }

  // Mensajes UI
  function showMessage(text, type = "info", timeout = 4000) {
    if (!messageDiv) return;
    messageDiv.style.display = "block";
    messageDiv.textContent = text;
    switch (type) {
      case "success":
        messageDiv.style.backgroundColor = "#48c78e";
        messageDiv.style.color = "white";
        break;
      case "error":
        messageDiv.style.backgroundColor = "#f14668";
        messageDiv.style.color = "white";
        break;
      default:
        messageDiv.style.backgroundColor = "beige";
        messageDiv.style.color = "black";
    }
    if (timeout > 0) {
      setTimeout(() => {
        messageDiv.style.display = "none";
        messageDiv.textContent = "";
      }, timeout);
    }
  }

  // Poblar el formulario con los valores del record (obj keys -> form elements by name)
  function populateForm(record) {
    if (!record) return;
    for (const key in record) {
      try {
        // Intentar localizar el elemento por su nombre exactamente, y como fallback por mayúsculas/minúsculas
        let elem = form.elements.namedItem(key);
        if (!elem) elem = form.elements.namedItem(String(key).toUpperCase());
        if (!elem) elem = form.elements.namedItem(String(key).toLowerCase());
        const value = record[key] ?? "";
        if (elem) {
          // Si es un select, intentar seleccionar la opción que coincida (ignorando espacios/mayúsculas)
          if (elem.tagName && elem.tagName.toLowerCase() === "select") {
            const valStr = String(value).trim();
            let matched = false;
            for (let i = 0; i < elem.options.length; i++) {
              const opt = elem.options[i];
              if (
                String(opt.value).trim().toLowerCase() ===
                  valStr.toLowerCase() ||
                String(opt.text).trim().toLowerCase() === valStr.toLowerCase()
              ) {
                elem.selectedIndex = i;
                matched = true;
                break;
              }
            }
            if (!matched) {
              // Si no existe la opción, crearla y seleccionarla
              const newOpt = document.createElement("option");
              newOpt.value = valStr;
              newOpt.text = valStr;
              elem.appendChild(newOpt);
              elem.value = valStr;
            }
          } else {
            // inputs, textareas
            try {
              elem.value = value ?? "";
            } catch (inner) {
              // algunos elementos pueden ser NodeList (nombre repetido), manejarlo
              if (elem.length && elem[0]) elem[0].value = value ?? "";
            }
          }
        }
      } catch (e) {
        console.warn("Error filling field", key, e);
      }
    }
    // Tras poblar, en modo consultar: habilitar solo los campos permitidos para edición
    if (modeSelect.value === "consultar") {
      enableOnlyEditableFields();
    }
  }

  // Recolectar valores del form en un objeto (similar a app.js)
  function collectFormData() {
    const formData = new FormData(form);
    const obj = {};
    for (let [key, value] of formData.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  // Recolectar solo los campos permitidos para actualizar (en modo consultar)
  function collectEditableFormData() {
    const formData = new FormData(form);
    const obj = {};
    for (let [key, value] of formData.entries()) {
      if (key === "RIF") continue; // RIF no se envía dentro de updates
      if (EDITABLE_FIELDS.includes(key)) {
        obj[key] = value;
      }
    }
    return obj;
  }

  // Buscar por RIF (GET)
  async function buscarRif(rif) {
    if (!rif || rif.trim() === "") {
      showMessage("Introduce un RIF válido.", "error");
      return null;
    }
    showMessage("Buscando...", "info", 0);
    try {
      const url = `${scriptURL}?rif=${encodeURIComponent(rif)}`;
      const resp = await fetch(url, { method: "GET", redirect: "follow" });
      const data = await resp.json();
      if (data.status === "success" && data.record) {
        showMessage("Registro encontrado.", "success");
        return data.record;
      } else if (data.status === "not_found") {
        showMessage("RIF no encontrado.", "error");
        return null;
      } else {
        showMessage(
          data.message || "Respuesta inesperada del servidor.",
          "error",
        );
        return null;
      }
    } catch (error) {
      console.error(error);
      showMessage("Error de conexión al buscar RIF.", "error");
      return null;
    }
  }

  // Actualizar registro (POST action=update)
  async function actualizarRegistro(rif, updates) {
    if (!rif) {
      showMessage("No hay RIF para actualizar.", "error");
      return;
    }
    showMessage("Enviando actualización...", "info", 0);
    try {
      const payload = {
        action: "update",
        rif: rif,
        updates: updates,
      };
      const resp = await fetch(scriptURL, {
        method: "POST",
        redirect: "follow",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain;charset=utf-8" },
      });
      const data = await resp.json();
      if (data.status === "success") {
        showMessage(data.message || "Registro actualizado.", "success");
        // refrescar la página después de breve delay para ver el mensaje
        setTimeout(() => {
          try {
            location.reload();
          } catch (e) {}
        }, 1200);
      } else {
        showMessage(data.message || "Fallo al actualizar.", "error");
      }
    } catch (error) {
      console.error(error);
      showMessage("Error al enviar actualización.", "error");
    }
  }

  // Eventos
  // Al cambiar el modo, guardamos la elección y re-renderizamos sin recargar la página.
  modeSelect.addEventListener("change", (e) => {
    const newMode = e.target.value;
    try {
      sessionStorage.setItem("prospect_mode", newMode);
    } catch (err) {
      console.warn("sessionStorage no disponible:", err);
    }
    // limpiar formulario y estado anterior
    form.reset();
    rifSearch.value = "";
    updateControl.style.display = "none";
    // ajustar UI según el modo
    setMode(newMode);
    if (newMode === "consultar") {
      // en modo consultar, solo permitir buscar (habilitar RIF)
      disableAllFieldsExcept(["RIF"]);
    }
  });

  searchButton.addEventListener("click", async () => {
    const rif = rifSearch.value.trim();
    const record = await buscarRif(rif);
    if (record) {
      populateForm(record);
      // Mostrar boton actualizar y ocultar submit de ingreso
      updateControl.style.display = "block";
      submitButton.style.display = "none";
    }
  });

  clearSearch.addEventListener("click", () => {
    rifSearch.value = "";
    // limpiar formulario
    form.reset();
    updateControl.style.display = "none";
    submitButton.style.display = "inline-block";
    showMessage("Limpio.", "info", 1200);
  });

  updateButton.addEventListener("click", async () => {
    // tomar el RIF del propio campo del formulario (name=RIF)
    const rifField = form.elements.namedItem("RIF");
    const rifValue = rifField ? rifField.value.trim() : null;
    if (!rifValue) {
      showMessage("El formulario no contiene un RIF válido.", "error");
      return;
    }
    // recoger solo los campos permitidos para editar
    const updates = collectEditableFormData();

    // Si hay input de archivo y se seleccionó un archivo, leerlo como base64 y adjuntarlo
    const fileInput = document.getElementById("fileInput");
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      try {
        const fileObj = await readFileAsBase64(fileInput.files[0]);
        updates.fileData = fileObj;
      } catch (err) {
        console.error("Error leyendo archivo:", err);
        showMessage("Error leyendo archivo seleccionado.", "error");
        return;
      }
    }

    // Eliminar keys vacías para no sobrescribir con strings vacíos
    Object.keys(updates).forEach((k) => {
      if (updates[k] === "") delete updates[k];
    });

    await actualizarRegistro(rifValue, updates);
  });

  // Helper: lee un File y devuelve { fileName, mimeType, data } data en base64
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = (e) => {
        const dataUrl = e.target.result; // data:<mime>;base64,<data>
        const parts = dataUrl.split(",");
        const header = parts[0] || "";
        const base64 = parts[1] || "";
        const mimeMatch = header.match(/data:(.*);base64/);
        const mime = mimeMatch ? mimeMatch[1] : file.type;
        resolve({ fileName: file.name, mimeType: mime, data: base64 });
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  // Habilita solo los campos declarados en EDITABLE_FIELDS. Deshabilita RIF y el resto.
  function enableOnlyEditableFields() {
    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (!el.name) continue;
      // Siempre deshabilitar el campo RIF para evitar cambiar la clave única
      if (el.name === "RIF") {
        el.disabled = true;
        continue;
      }
      // Si está en la lista editable -> habilitar, si no -> deshabilitar
      if (EDITABLE_FIELDS.includes(el.name)) {
        el.disabled = false;
      } else {
        el.disabled = true;
      }
    }
  }

  // Deshabilita todos los campos excepto los listados (por ejemplo dejar habilitado solo RIF)
  function disableAllFieldsExcept(allowNames = []) {
    for (let i = 0; i < form.elements.length; i++) {
      const el = form.elements[i];
      if (!el.name) continue;
      if (allowNames.includes(el.name)) {
        el.disabled = false;
      } else {
        el.disabled = true;
      }
    }
  }

  // Inicialización: poner modo por defecto
  setMode(modeSelect.value || "ingresar");
  // Si iniciamos en consultar, deshabilitamos todos excepto RIF para buscar
  if (modeSelect.value === "consultar") {
    disableAllFieldsExcept(["RIF"]);
  }
})();
