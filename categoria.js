document.addEventListener("DOMContentLoaded", function () {
  const selectCategoria = document.getElementById("select-categoria");
  const contenedorOtro = document.getElementById("campo-especificar-otros");
  const inputOtro = document.getElementById("input-categoria-otro");

  if (selectCategoria && contenedorOtro && inputOtro) {
    selectCategoria.addEventListener("change", function () {
      if (this.value === "OTROS") {
        // Mostrar el input de texto y hacerlo requerido
        contenedorOtro.style.display = "block";
        inputOtro.required = true;

        // Pasar la responsabilidad del atributo 'name' al input de texto
        inputOtro.name = "CATEGORIA";
        selectCategoria.removeAttribute("name");
      } else {
        // Ocultar el input de texto y limpiar su estado
        contenedorOtro.style.display = "none";
        inputOtro.required = false;
        inputOtro.value = "";

        // Restablecer el atributo 'name' al select
        selectCategoria.name = "CATEGORIA";
        inputOtro.removeAttribute("name");
      }
    });
  }
});
