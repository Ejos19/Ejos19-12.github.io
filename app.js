// ====== Selección de elementos del DOM que vamos a usar ======
// Obtenemos el formulario
const form = document.getElementById("form");
// Botón de envío (submit)
const submitButton = document.getElementById("submit-button");
// Div para mostrar mensajes (éxito/error/estado)
const messageDiv = document.getElementById("message");
// Input de tipo file
const fileInput = document.getElementById("fileInput");
// Span donde mostramos el nombre del archivo seleccionado
const fileNameDisplay = document.getElementById("fileNameDisplay");
// Select de modo (Ingresar / Consultar)
const modeSelect = document.getElementById("modeSelect");

// CONFIGURACIÓN: campos que se permiten editar en modo "ingresar".
// Modifica este array con los nombres (atributo name) que quieras permitir editar
// cuando el usuario esté creando un NUEVO registro.
const INSERT_EDITABLE_FIELDS = [
  // por defecto permitir estos (ajusta según tus necesidades)
  "FECHA",
  "REGION",
  "EJECUTIVO",
  "RIF",
  "RAZON_SOCIAL",
  "SERVICIO",
  "PROPUESTA",
  "SRM",
  "DESCUENTO",
  "ESTATUS",
  "OBSERVACIONES",
  "CATEGORIA",
  "theFile",
  "TLF_CONTACTO",
  "CONTACTO",
  "CORREO_CONTACTO",
];

// Aplica las restricciones de edición para el modo "ingresar".
function applyInsertFieldRestrictions() {
  if (!modeSelect) return;
  const mode = modeSelect.value;
  if (mode !== "ingresar") {
    // Si no estamos en modo ingresar, no aplicar restricciones aquí.
    // (editor.js manejará el modo consultar)
    return;
  }
  for (let i = 0; i < form.elements.length; i++) {
    const el = form.elements[i];
    if (!el.name) continue;
    // Si el name está en la lista de permitidos, habilitar; si no, deshabilitar
    if (INSERT_EDITABLE_FIELDS.includes(el.name)) {
      el.disabled = false;
    } else {
      el.disabled = true;
    }
  }
}

// Crea inputs ocultos espejo para campos deshabilitados para asegurarnos de
// que su valor se incluya en FormData al enviar (FormData omite controles disabled).
function createHiddenMirrorsForDisabledFields() {
  const created = [];
  for (let i = 0; i < form.elements.length; i++) {
    const el = form.elements[i];
    if (!el.name) continue;
    if (el.disabled) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = el.name;
      // En algunos casos el elemento puede ser select o textarea
      hidden.value = el.value || "";
      form.appendChild(hidden);
      created.push(hidden);
    }
  }
  return created;
}

// -------------------------------------------------------------
// Actualizar el nombre mostrado cuando el usuario selecciona un archivo
// fileInput.addEventListener se ejecuta cada vez que cambia el input file.
fileInput.addEventListener("change", function () {
  // this.files es una FileList; si hay al menos un archivo, mostramos su nombre
  if (this.files && this.files.length > 0) {
    fileNameDisplay.textContent = this.files[0].name;
  } else {
    // Si no hay archivo seleccionado, volvemos al texto por defecto
    fileNameDisplay.textContent = "No file selected";
  }
});

// -------------------------------------------------------------
// Función auxiliar para convertir un File en objeto con base64 (para enviarlo al servidor)
// Devuelve una promesa que resuelve con { fileName, mimeType, data }
async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader(); // FileReader lee el contenido del archivo en el cliente
    fr.onload = (e) => {
      // Cuando termine, e.target.result es una data URL: "data:<mime>;base64,<datos>"
      const data = e.target.result.split(","); // separa el header de los datos base64
      const obj = {
        fileName: file.name,
        // data[0] contiene algo como "data:application/pdf;base64"
        mimeType: data[0].match(/:(\w.+);/)[1], // extrae el mimeType con regex
        data: data[1], // la parte base64 pura
      };
      resolve(obj);
    };
    fr.onerror = reject; // si hay error de lectura, rechazamos la promesa
    fr.readAsDataURL(file); // iniciamos la lectura como data URL
  });
}

// -------------------------------------------------------------
// Manejador del evento submit del formulario
form.addEventListener("submit", async function (e) {
  e.preventDefault(); // evita el envío tradicional (recarga de página)

  // Mostrar mensaje de "submitting" y estado visual
  messageDiv.textContent = "Submitting...";
  messageDiv.style.display = "block";
  messageDiv.style.backgroundColor = "beige";
  messageDiv.style.color = "black";
  submitButton.disabled = true; // deshabilitamos el botón para evitar doble envío
  submitButton.classList.add("is-loading"); // clase Bulma para spinner

  // guardamos mirrors creados para limpiarlos luego
  let _createdMirrors = [];
  try {
    // Si estamos en modo "ingresar", aplicamos restricciones y creamos mirrors
    if (modeSelect && modeSelect.value === "ingresar") {
      applyInsertFieldRestrictions();
      _createdMirrors = createHiddenMirrorsForDisabledFields();
    }
    // Recogemos los datos del formulario en un FormData
    const formData = new FormData(this);
    const formDataObj = {};

    // Convertimos FormData a un objeto plano { clave: valor }
    for (let [key, value] of formData.entries()) {
      formDataObj[key] = value;
    }

    // Si hay archivo seleccionado, lo convertimos a base64 y lo añadimos
    if (fileInput.files.length > 0) {
      const fileObj = await uploadFile(fileInput.files[0]);
      formDataObj.fileData = fileObj; // agregamos la propiedad fileData al objeto
    }

    // URL del Web App (Google Apps Script) al que se enviará el JSON
    const scriptURL =
      "https://script.google.com/macros/s/AKfycbxp4INN-jxLIgjAreMsfkDvUQxVs7ZPn6p3LxwqBJYPviuTshbwuoK_ei-dHmm58G6Zfg/exec";

    // Enviamos la petición POST con body en JSON (aquí Content-Type text/plain fue usado
    // en el original para sortear algunas políticas, pero se podría usar application/json si el server lo acepta)
    const response = await fetch(scriptURL, {
      redirect: "follow",
      method: "POST",
      body: JSON.stringify(formDataObj),
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
    });

    // Esperamos y parseamos la respuesta JSON
    const data = await response.json();

    // Si la respuesta indica éxito, mostramos mensaje y reseteamos el formulario
    if (data.status === "success") {
      messageDiv.textContent = data.message || "Data submitted successfully!";
      messageDiv.style.backgroundColor = "#48c78e"; // verde (éxito)
      messageDiv.style.color = "white";
      form.reset(); // reset de todos los campos
      fileNameDisplay.textContent = "No file selected"; // reset del nombre del archivo mostrado
      // refrescar la página después de un breve delay para actualizar la UI
      setTimeout(() => {
        try {
          location.reload();
        } catch (e) {
          /* ignore */
        }
      }, 1200);
    } else {
      // Si el servidor devolvió status distinto a success, lanzamos error para caer al catch
      throw new Error(data.message || "Submission failed");
    }
  } catch (error) {
    // Manejo global de errores: log y mostrar en UI
    console.error("Error:", error);
    messageDiv.textContent = "Error: " + error.message;
    messageDiv.style.backgroundColor = "#f14668"; // rojo (error)
    messageDiv.style.color = "white";
  } finally {
    // Eliminar mirrors ocultos si se crearon
    try {
      if (_createdMirrors && _createdMirrors.length) {
        _createdMirrors.forEach(
          (el) => el.parentNode && el.parentNode.removeChild(el),
        );
      }
    } catch (cleanupErr) {
      console.warn("Error limpiando inputs ocultos:", cleanupErr);
    }
    // Siempre: reactivar el botón y quitar el spinner
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");

    // Ocultar el mensaje transitorio después de 4s
    setTimeout(() => {
      messageDiv.textContent = "";
      messageDiv.style.display = "none";
    }, 4000);
  }
});

// -------------------------------------------------------------
// Mejorar el comportamiento del botón "Cancel" que está en el form.
// Se añade un listener al botón con clase is-danger (tal como en el HTML original).
const cancelButton = form.querySelector("button.is-danger");
cancelButton.addEventListener("click", function () {
  form.reset(); // limpiar todos los campos
  fileNameDisplay.textContent = "No file selected"; // limpiar nombre de archivo
  messageDiv.style.display = "none"; // ocultar mensajes
});

// Aplicar restricciones iniciales si estamos en modo ingresar
try {
  applyInsertFieldRestrictions();
} catch (err) {
  console.warn("No se pudieron aplicar restricciones iniciales:", err);
}

// Cuando el usuario cambie el modo a ingresar, reaplicar las restricciones
if (modeSelect) {
  modeSelect.addEventListener("change", () => {
    if (modeSelect.value === "ingresar") {
      try {
        applyInsertFieldRestrictions();
      } catch (err) {
        console.warn(
          "Error aplicando restricciones al cambiar a ingresar:",
          err,
        );
      }
    }
  });
}
