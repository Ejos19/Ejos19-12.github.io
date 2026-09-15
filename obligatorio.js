document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("form");

  // =========================================================
  // CONFIGURACIÓN: Lista los nombres (name) de los campos obligatorios
  // =========================================================
  const camposObligatorios = [
    "FECHA",
    "REGION",
    "EJECUTIVO",
    "RIF",
    "RAZON_SOCIAL",
    "CATEGORIA", // Valida el select o el input si selecciona "OTROS"
  ];

  // Inyectar contenedor de notificaciones en la esquina superior derecha
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

  if (form) {
    form.addEventListener("submit", function (event) {
      let formValido = true;
      let primerCampoError = null;

      // Limpiar errores y avisos previos
      limpiarErrores();

      camposObligatorios.forEach(function (nombreCampo) {
        const elemento = form.querySelector(`[name="${nombreCampo}"]`);

        if (elemento) {
          // Validar si está vacío
          if (!elemento.value || elemento.value.trim() === "") {
            formValido = false;

            // 1. Marcar borde rojo
            elemento.classList.add("is-danger");

            // 2. Agregar icono de advertencia al final del campo
            agregarIconoError(elemento);

            if (!primerCampoError) {
              primerCampoError = elemento;
            }
          }
        }
      });

      // Si hay errores, detener el envío y mostrar la notificación
      if (!formValido) {
        event.preventDefault();
        event.stopPropagation();

        mostrarNotificacionToast(
          "Por favor, completa todos los campos obligatorios marcados en rojo.",
          "is-danger",
        );

        if (primerCampoError) {
          primerCampoError.focus();
        }
      }
    });
  }

  // Función para mostrar la notificación tipo Toast (Top-Right)
  function mostrarNotificacionToast(mensaje, tipo) {
    // Eliminar notificaciones anteriores si existen
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

    // Botón para cerrar la notificación manualmente
    toast.querySelector(".delete").addEventListener("click", function () {
      toast.remove();
    });

    toastContainer.appendChild(toast);

    // Auto-ocultar después de 5 segundos
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  // Función para agregar icono de advertencia usando la estructura de Bulma
  function agregarIconoError(elemento) {
    const control = elemento.closest(".control");
    if (!control) return;

    // Asegurar clase de Bulma para iconos a la derecha
    control.classList.add("has-icons-right");

    // Crear elemento del icono
    const iconSpan = document.createElement("span");
    iconSpan.className = "icon is-small is-right campo-error-icon";
    iconSpan.style.color = "#f14668"; // Color rojo de Bulma (is-danger)
    iconSpan.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';

    control.appendChild(iconSpan);
  }

  // Función para limpiar estados de error en reintentos
  function limpiarErrores() {
    // Quitar bordes rojos
    form.querySelectorAll(".is-danger").forEach((el) => {
      el.classList.remove("is-danger");
    });

    // Remover iconos agregados previamente
    form.querySelectorAll(".campo-error-icon").forEach((icon) => {
      icon.remove();
    });
  }
});
