document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("form");
  const submitButton = document.getElementById("submit-button");
  const cancelButton = form ? form.querySelector("button.is-danger") : null;

  // =========================================================
  // CONFIGURACIÓN: Lista los nombres (name) de los campos obligatorios
  // =========================================================
  const camposObligatorios = [
    "FECHA",
    "REGION",
    "EJECUTIVO",
    "RIF",
    "RAZON_SOCIAL",
    "CATEGORIA",
    "CONTACTO",
    "TLF_CONTACTO",
    "CORREO_CONTACTO", // Valida el select o el input si selecciona "OTROS"
  ];

  // Crear e inyectar contenedor para notificaciones tipo Toast
  const toastContainer = document.createElement("div");
  toastContainer.id = "toast-container";
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 350px;
  `;
  document.body.appendChild(toastContainer);

  if (form && submitButton) {
    // 1. Validar el estado del formulario en tiempo real
    function validarFormulario() {
      let todoValido = true;

      camposObligatorios.forEach(function (nombreCampo) {
        const elemento = form.querySelector(`[name="${nombreCampo}"]`);

        if (elemento) {
          const estaVacio = !elemento.value || elemento.value.trim() === "";

          if (estaVacio) {
            todoValido = false;
          } else {
            // Si el campo ya se completó, removemos las marcas visuales de error
            quitarErrorCampo(elemento);
          }
        } else {
          // Si por alguna razón el elemento no existe en el DOM, no es válido
          todoValido = false;
        }
      });

      // Habilitar o deshabilitar el botón Submit
      if (todoValido) {
        submitButton.removeAttribute("disabled");
      } else {
        submitButton.setAttribute("disabled", "disabled");
      }

      return todoValido;
    }

    // 2. Marcar/desmarcar errores en un campo individual
    function marcarErrorCampo(elemento) {
      elemento.classList.add("is-danger");
      const control = elemento.closest(".control");
      if (control) {
        control.classList.add("has-icons-right");
        if (!control.querySelector(".campo-error-icon")) {
          const iconSpan = document.createElement("span");
          iconSpan.className = "icon is-small is-right campo-error-icon";
          iconSpan.style.color = "#f14668";
          iconSpan.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
          control.appendChild(iconSpan);
        }
      }
    }

    function quitarErrorCampo(elemento) {
      elemento.classList.remove("is-danger");
      const control = elemento.closest(".control");
      if (control) {
        const icon = control.querySelector(".campo-error-icon");
        if (icon) icon.remove();
      }
    }

    // 3. Escuchar eventos 'input' y 'change' en todo el formulario
    form.addEventListener("input", validarFormulario);
    form.addEventListener("change", validarFormulario);

    // 4. Marcar campos vacíos y mostrar notificación si se intenta enviar
    submitButton.addEventListener("click", function (event) {
      if (!validarFormulario()) {
        event.preventDefault();

        // Marcar visualmente en rojo los campos que falta completar
        camposObligatorios.forEach(function (nombreCampo) {
          const elemento = form.querySelector(`[name="${nombreCampo}"]`);
          if (elemento && (!elemento.value || elemento.value.trim() === "")) {
            marcarErrorCampo(elemento);
          }
        });

        mostrarNotificacionToast(
          "Por favor, completa los campos obligatorios para continuar.",
          "is-danger",
        );
      }
    });

    // 5. Soporte para el botón Cancelar: Resetear errores y deshabilitar botón
    if (cancelButton) {
      cancelButton.addEventListener("click", function () {
        setTimeout(() => {
          form
            .querySelectorAll(".is-danger")
            .forEach((el) => el.classList.remove("is-danger"));
          form
            .querySelectorAll(".campo-error-icon")
            .forEach((icon) => icon.remove());
          validarFormulario(); // Volverá a deshabilitar el botón
        }, 50);
      });
    }

    // Estado inicial al cargar la página
    validarFormulario();
  }

  // Función para mostrar la notificación tipo Toast (Top-Right)
  function mostrarNotificacionToast(mensaje, tipo) {
    toastContainer.innerHTML = "";

    const toast = document.createElement("div");
    toast.className = `notification ${tipo} is-light`;
    toast.style.cssText = `
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      margin: 0;
      animation: fadeIn 0.3s ease-in-out;
    `;

    toast.innerHTML = `
      <button class="delete"></button>
      <div style="display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-exclamation-circle"></i>
        <span>${mensaje}</span>
      </div>
    `;

    toast.querySelector(".delete").addEventListener("click", function () {
      toast.remove();
    });

    toastContainer.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }
});
