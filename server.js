require("dotenv").config();
const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
 const router = express.Router();
const FormData = require("form-data");
 
const bodyParser = require("body-parser");
  
 
const PORT = 3000;

 

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));
 
// --------- FUNCIONES INDIVIDUALES ---------

async function consultarLima(placa) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const result = { success: false, results: [] };

  try {
    await page.goto("https://www.sat.gob.pe/websitev8/Popupv2.aspx?t=8", {
      waitUntil: "domcontentloaded",
    });

    let frame;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      const frames = await page.frames();
      for (const f of frames) {
        const el = await f.$("#tipoBusquedaPapeletas").catch(() => null);
        if (el) {
          frame = f;
          break;
        }
      }
      if (frame) break;
    }
    if (!frame) throw new Error("No se encontró el frame de SAT Lima");

    await frame.select("#tipoBusquedaPapeletas", "busqPlaca");
    await frame.type("#ctl00_cplPrincipal_txtPlaca", placa);

    const siteKey = "6Ldy_wsTAAAAAGYM08RRQAMvF96g9O_SNQ9_hFIJ";
    const pageUrl = "https://www.sat.gob.pe/websitev8/Popupv2.aspx?t=8";

    const captchaStart = await axios.post("https://2captcha.com/in.php", null, {
      params: {
        key: process.env.CAPTCHA_API_KEY,
        method: "userrecaptcha",
        googlekey: siteKey,
        pageurl: pageUrl,
        json: 1,
      },
    });

    const captchaId = captchaStart.data.request;
    let token;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const check = await axios.get("https://2captcha.com/res.php", {
        params: {
          key: process.env.CAPTCHA_API_KEY,
          action: "get",
          id: captchaId,
          json: 1,
        },
      });
      if (check.data.status === 1) {
        token = check.data.request;
        break;
      }
    }

    if (!token) throw new Error("Captcha Lima no resuelto");

    await frame.evaluate((token) => {
      const textarea = document.createElement("textarea");
      textarea.id = "g-recaptcha-response";
      textarea.name = "g-recaptcha-response";
      textarea.style = "display: none;";
      textarea.value = token;
      document.body.appendChild(textarea);
    }, token);

    await frame.evaluate(() => {
      __doPostBack("ctl00$cplPrincipal$CaptchaContinue", "");
    });

    await page.waitForTimeout(3000);
    const mensaje = await frame.evaluate(() => {
      const msj = document.querySelector("#ctl00_cplPrincipal_lblMensaje");
      return msj?.innerText.trim().toLowerCase() || "";
    });

    if (mensaje.includes("no se encontraron")) {
      await browser.close();
      result.success = true;
      result.results = [];
      return result;
    }

    await frame.waitForSelector("table", { timeout: 15000 });

    const tabla = await frame.evaluate(() => {
      const filas = Array.from(document.querySelectorAll("table tr"));
      return filas.slice(1).map((fila) => {
        const celdas = fila.querySelectorAll("td");
        return {
          Placa: celdas[1]?.innerText.trim() || "",
          Reglamento: celdas[2]?.innerText.trim() || "",
          Falta: celdas[3]?.innerText.trim() || "",
          Documento: celdas[4]?.innerText.trim() || "",
          FechaInfraccion: celdas[5]?.innerText.trim() || "",
          Importe: celdas[6]?.innerText.trim() || "",
          Gastos: celdas[7]?.innerText.trim() || "",
          Descuentos: celdas[8]?.innerText.trim() || "",
          Deuda: celdas[9]?.innerText.trim() || "",
          Estado: celdas[10]?.innerText.trim() || "",
        };
      });
    });

    result.success = true;
    result.results = tabla;
  } catch (err) {
    result.error = err.message;
  } finally {
    await browser.close();
    return result;
  }
}

async function consultarCallao(placa) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  const result = { success: false, resultados: [] };

  try {
    await page.goto("https://pagopapeletascallao.pe/", { waitUntil: "networkidle2" });

    const imgCaptcha = await page.$eval('img[src^="data:image"]', img => img.src);
    const formData = new FormData();
    formData.append("key", process.env.CAPTCHA_API_KEY);
    formData.append("method", "base64");
    formData.append("body", imgCaptcha.split(",")[1]);

    const { data } = await axios.post("https://2captcha.com/in.php", formData, {
      headers: formData.getHeaders(),
    });

    if (!data.startsWith("OK|")) throw new Error("No se pudo enviar captcha Callao");
    const captchaId = data.split("|")[1];

    let captchaTexto;
    for (;;) {
     const res = await axios.get(`https://2captcha.com/res.php?key=${process.env.CAPTCHA_API_KEY}&action=get&id=${captchaId}`);
      if (res.data === "CAPCHA_NOT_READY") await new Promise(r => setTimeout(r, 5000));
      else if (res.data.startsWith("OK|")) {
        captchaTexto = res.data.split("|")[1];
        break;
      } else throw new Error("Captcha Callao error: " + res.data);
    }

    await page.type("#valor_busqueda", placa);
    await page.type("#captcha", captchaTexto);
    await Promise.all([
      page.click("#idBuscar"),
      page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);

    const mensajeError = await page.$eval(".mensajeError", el => el.innerText).catch(() => null);
    if (mensajeError) throw new Error("Error Callao: " + mensajeError);

    const tabla = await page.evaluate(() => {
      const filas = [...document.querySelectorAll("table tbody tr")];
      return filas.map(fila => {
        const celdas = [...fila.querySelectorAll("td")];
        return {
          Codigo: celdas[1]?.innerText || "",
          NumeroPapeleta: celdas[2]?.innerText || "",
          FechaInfraccion: celdas[3]?.innerText || "",
          Total: celdas[4]?.innerText || "",
          Beneficio: celdas[5]?.innerText || "",
          DescuentoWeb: celdas[6]?.innerText || "",
          Cuota: celdas[7]?.innerText || "",
          Detalle: celdas[8]?.innerText || "",
          Fraccionarr: celdas[10]?.innerText || "",
        };
      }).filter(r =>
        r.Codigo &&
        !r.Codigo.includes("Valor Insoluto") &&
        !r.Codigo.includes("Sin emisión") &&
        !r.Codigo.includes("90%")
      );
    });

    result.success = true;
    result.resultados = tabla;
  } catch (err) {
    result.error = err.message;
  } finally {
    await browser.close();
    return result;
  }
}

async function consultarRevisionTecnica(placa) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  try {
    await page.goto('https://rec.mtc.gob.pe/Citv/ArConsultaCitv', { waitUntil: 'networkidle2' });

    const captchaSrc = await page.$eval('#imgCaptcha', img => img.src);
    const base64Image = captchaSrc.replace(/^data:image\/png;base64,/, '');

    const formData = new FormData();
    formData.append('method', 'base64');
    formData.append('key', process.env.CAPTCHA_API_KEY);
    formData.append('body', base64Image);
    formData.append('json', 1);

    const send = await axios.post('https://2captcha.com/in.php', formData, {
      headers: formData.getHeaders()
    });

    const requestId = send.data.request;
    let captchaResuelto;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const res = await axios.get(`https://2captcha.com/res.php?key=${process.env.CAPTCHA_API_KEY}&action=get&id=${requestId}&json=1`);
      if (res.data.status === 1) {
        captchaResuelto = res.data.request;
        break;
      }
    }
    if (!captchaResuelto) throw new Error("Captcha MTC no resuelto");

    await page.type('#texFiltro', placa);
    await page.type('#texCaptcha', captchaResuelto);
    await page.click('#btnBuscar');
    await page.waitForTimeout(5000);

    const errorMsg = await page.$eval('.msgError', el => el.innerText).catch(() => null);
    if (errorMsg) return { error: errorMsg };

    const resultados = await page.evaluate(() => {
      const rows = document.querySelectorAll('.table tbody tr');
      for (let i = 0; i < rows.length; i++) {
        const cols = rows[i].querySelectorAll('td');
        const item = {
          certificado: cols[0]?.innerText.trim(),
          placa: cols[1]?.innerText.trim(),
          fechaRevision: cols[2]?.innerText.trim(),
          fechaVencimiento: cols[3]?.innerText.trim(),
          resultado: cols[4]?.innerText.trim(),
          planta: cols[5]?.innerText.trim()
        };
        const filledFields = Object.values(item).filter(val => val && val !== "-");
        if (filledFields.length >= 4) return [item];
      }
      return [];
    });

    return { success: true, captcha: captchaResuelto, resultados };
  } catch (error) {
    return { error: error.message };
  } finally {
    await browser.close();
  }
}
async function consultarInfogas(placa) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  const result = { success: false, resultados: {} };

  try {
    await page.goto('https://vh.infogas.com.pe/', { waitUntil: 'networkidle2', timeout: 0 });

    await page.waitForSelector('#inp_ck_plate');
    await page.type('#inp_ck_plate', placa);

    const siteKey = '6LctjAQoAAAAAKxodrxo3QPm033HbyDrLf9N7x7P';
    const pageUrl = 'https://vh.infogas.com.pe/';

   const { data: request } = await axios.get(`https://2captcha.com/in.php?key=${process.env.CAPTCHA_API_KEY}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`);
    const requestId = request.request;

    let token = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 5000));
  const { data: response } = await axios.get(`https://2captcha.com/res.php?key=${process.env.CAPTCHA_API_KEY}&action=get&id=${requestId}&json=1`);
      if (response.status === 1) {
        token = response.request;
        break;
      }
    }

    if (!token) throw new Error("Captcha Infogas no resuelto");

    await page.evaluate((token) => {
      document.querySelector('#g-recaptcha-response').innerHTML = token;
    }, token);

    await page.evaluate(() => {
      document.querySelector('#btn_ck_plate').click();
    });

    await page.waitForFunction(() => {
      const el = document.querySelector('.plate_item_pran');
      return el && el.innerText.trim() !== '';
    }, { timeout: 60000 });

    const data = await page.evaluate(() => ({
      vencimientoRevisionAnual: document.querySelector('.plate_item_pran')?.innerText || '',
      vencimientoCilindro: document.querySelector('.plate_item_pvci')?.innerText || '',
      tieneCredito: document.querySelector('.plate_item_havc')?.innerText || '',
      habilitado: document.querySelector('.plate_item_vhab')?.innerText || '',
      tipoCombustible: document.querySelector('.plate_item_esgnv')?.innerText || ''
    }));

    result.success = true;
    result.resultados = data;

  } catch (error) {
    result.error = error.message;
  } finally {
    await browser.close();
    return result;
  }
}

// 🔹 SAT TARAPOTO
async function consultarTarapoto(browser, placa) {
  try {
    const page = await browser.newPage();
    await page.goto('https://www.sat-t.gob.pe/', { waitUntil: 'domcontentloaded' });

    // Cierra modal si aparece
    try {
      await page.waitForSelector('.modal-content .close', { timeout: 5000 });
      await page.click('.modal-content .close');
    } catch {}

    await page.waitForSelector('#placa_vehiculo');
    await page.type('#placa_vehiculo', placa);
    await page.click('.btn-warning');
    await page.waitForSelector('#mostrartabla', { timeout: 10000 });

    const datos = await page.evaluate(() => {
      const tabla = document.querySelector('#mostrartabla table');
      if (!tabla) return [];

      const filas = Array.from(tabla.querySelectorAll('tr')).slice(1);
      return filas.map(fila => {
        const celdas = fila.querySelectorAll('td');
        return {
          numero: celdas[0]?.innerText.trim(),
          infraccion: celdas[1]?.innerText.trim(),
          fecha: celdas[2]?.innerText.trim(),
          estado: celdas[3]?.innerText.trim(),
          monto: celdas[4]?.innerText.trim()
        };
      });
    });

    await page.close();
    return datos.length ? datos : 'No se encontraron papeletas';

  } catch (err) {
    return '⚠️ Error en Tarapoto: ' + err.message;
  }
}

// 🔹 SAT HUANCAYO
async function consultarHuancayo(browser, placa) {
  try {
    const page = await browser.newPage();
    await page.goto('http://sathuancayo.fortiddns.com:888/VentanillaVirtual/ConsultaPIT.aspx', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('#ContentPlaceHolder1_txtPlaca');
    await page.type('#ContentPlaceHolder1_txtPlaca', placa.toUpperCase());

    await Promise.all([
      page.click('#ContentPlaceHolder1_btnBuscarPlaca'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded' })
    ]);

    await page.waitForSelector('#ContentPlaceHolder1_udpPrincipal', { timeout: 10000 });

    const datos = await page.evaluate(() => {
      const tabla = document.querySelector('#ContentPlaceHolder1_udpPrincipal table');
      if (!tabla) return [];

      const filas = Array.from(tabla.querySelectorAll('tr')).slice(1);
      return filas.map(fila => {
        const celdas = fila.querySelectorAll('td');
        return {
          numero: celdas[0]?.innerText.trim(),
          placa: celdas[1]?.innerText.trim(),
          infraccion: celdas[2]?.innerText.trim(),
          fecha: celdas[3]?.innerText.trim(),
          monto: celdas[4]?.innerText.trim()
        };
      });
    });

    await page.close();
    return datos.length ? datos : 'No se encontraron papeletas';

  } catch (err) {
    return '⚠️ Error en Huancayo: ' + err.message;
  }
}
// 🔹 Consulta ATU
app.post("/api/atu", async (req, res) => {
  const { placa } = req.body;
  if (!placa) return res.status(400).json({ error: "Placa requerida" });

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto("https://sistemas.atu.gob.pe/ConsultaVehiculo/", {
      waitUntil: "networkidle2"
    });

    // Aceptar cookies
    try {
      await page.waitForSelector("a.gdpr-cookie-notice-nav-item-accept", { visible: true, timeout: 5000 });
      await page.click("a.gdpr-cookie-notice-nav-item-accept");
    } catch {}

    await page.waitForSelector("#txtNroPlaca");
    await page.type("#txtNroPlaca", placa);
    await page.click("#btnConsultar");

    // Esperar respuesta
    try {
      await page.waitForSelector("#txtMarca", { timeout: 10000 });
    } catch {
      return res.json({ registrado: false, mensaje: "❌ Placa no registrada en ATU" });
    }

    const data = await page.evaluate(() => {
     const getVal = id => document.querySelector(`#${id}`)?.value?.trim() || "";

      const marca = getVal("txtMarca");
      if (!marca) return { registrado: false };

      return {
        registrado: true,
        vehiculo: {
          placa: getVal("txtNroPlaca"),
          modalidad: getVal("txtModalidad"),
          marca,
          modelo: getVal("txtModelo"),
          circulacion: getVal("txtTipoCirculacion"),
          estado: getVal("txtEstado"),
        },
        tarjeta: {
          numero: getVal("txtNroConstancia"),
          fecha_emision: getVal("txtFecEmision"),
          fecha_vencimiento: getVal("txtFecVcto"),
        },
        titular: {
          documento: getVal("txtNumDocTitular"),
          ruta: getVal("txtRuta"),
          nombre: getVal("txtTitular")
        }
      };
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "❌ Error en la consulta ATU: " + err.message });
  } finally {
    await browser.close();
  }
});

// --------- RUTAS API ---------

app.post("/api/consultar-lima", async (req, res) => {
  const placa = req.body.placa;
  if (!placa) return res.json({ success: false, message: "Placa requerida" });
  const data = await consultarLima(placa);
  res.json(data);
});

app.post("/api/consultar-callao", async (req, res) => {
  const placa = req.body.placa;
  if (!placa) return res.json({ success: false, message: "Placa requerida" });
  const data = await consultarCallao(placa);
  res.json(data);
});

app.post("/api/consultar-revision", async (req, res) => {
  const placa = req.body.placa;
  if (!placa) return res.json({ success: false, message: "Placa requerida" });
  const data = await consultarRevisionTecnica(placa);
  res.json(data);
});
app.post("/api/consultar-infogas", async (req, res) => {
  const placa = req.body.placa;
  if (!placa) return res.json({ success: false, message: "Placa requerida" });

  const data = await consultarInfogas(placa);
  res.json(data);
});
app.post("/api/consultar", async (req, res) => {
  const { placa } = req.body;
  if (!placa || placa.trim().length < 5) {
    return res.status(400).json({ error: '❌ Placa inválida' });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  try {
    const [tarapoto, huancayo] = await Promise.all([
      consultarTarapoto(browser, placa),
      consultarHuancayo(browser, placa)
    ]);

    res.json({
      placa,
      tarapoto,
      huancayo
    });

  } catch (err) {
    res.status(500).json({ error: '❌ Error general: ' + err.message });
  } finally {
    await browser.close();
  }
});
// 🔹 Crear preferencia de pago

   


 

// ✅ Ruta para procesar pagos
 

 app.post('/culqi-pagar', async (req, res) => {
  const { token, email, placa, monto } = req.body;

 try {
    const response = await fetch('https://api.culqi.com/v2/charges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk_test_kGQnDxF3HdAxXazi' // tu clave privada
      },
      body: JSON.stringify({
        amount: monto * 100,
        currency_code: 'PEN',
        email,
        source_id: token,
        description: `Pago por consulta de placa ${placa}`
      })
    });

    const result = await response.json();

    if (result.object === 'charge') {
      res.json({ success: true, data: result });
    } else {
      res.json({ success: false, message: result.user_message || 'Error en el pago' });
    }

  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Error en el servidor' });
  }
});

module.exports = router;
// --------- INICIO ---------

app.listen(PORT, () => {
  console.log("Servidor activo en http://localhost:" + PORT);
}); 