async function consultar() {
  const placa = document.getElementById("placa").value.trim();
  if (!placa) {
    alert("Ingrese una placa válida.");
    return;
  }

  const res = await fetch("/api/consultar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ placa })
  });

  const data = await res.json();
  const contenedor = document.getElementById("resultado");
  contenedor.innerHTML = "";

  if (data.success && data.results.length) {
    const table = document.createElement("table");
    table.innerHTML = `
      <tr>
        <th>fecha</th>
        <th>placa</th>
        <th>infraccion</th>
        <th>descripcion</th>
        <th>monto</th>
        <th>estado</th>
        <th>gastos</th>
        <th>descuentos</th>
        <th>deudas</th>
        <th>estado</th>
      </tr>
    `;
    data.results.forEach(r => {
      table.innerHTML += `
        <tr>
          <td>${r.fecha}</td>
          <td>${r.placa}</td>
          <td>${r.infraccion}</td>
          <td>${r.descripcion}</td>
          <td>${r.monto}</td>
          <td>${r.estado}</td>
          <td>${r.gastos}</td>
          <td>${r.descuentos}</td>
          <td>${r.deuda}</td>
          <td>${r.estado}</td>
        </tr>
      `;
    });
    contenedor.appendChild(table);
  } else {
    contenedor.textContent = data.error || data.message || "No se encontraron resultados.";
  }
}
