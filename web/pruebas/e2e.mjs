// Prueba de punta a punta del panel en MODO DEMO (sin Supabase).
// Compila la demo, la sirve localmente y recorre los flujos con un navegador
// real. Guarda capturas en pruebas/capturas/.
//
//   npm run test:e2e
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Playwright puede estar instalado global (NODE_PATH) o en el proyecto
const { chromium } = createRequire(import.meta.url)('playwright');

const web = new URL('..', import.meta.url).pathname;
const dist = join(web, 'dist-demo');
const capturas = join(web, 'pruebas', 'capturas');
await mkdir(capturas, { recursive: true });

execSync('npx vite build --mode demo --outDir dist-demo', { cwd: web, stdio: 'ignore' });

const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = join(dist, ruta);
  const final = existsSync(archivo) && extname(archivo) ? archivo : join(dist, 'index.html');
  res.setHeader('content-type', tipos[extname(final)] ?? 'application/octet-stream');
  res.end(await readFile(final));
}).listen(0);
const base = `http://localhost:${servidor.address().port}`;

// Excel de prueba con datos inventados
const require = createRequire(join(web, '..', 'package.json'));
const ExcelJS = require('exceljs');
const excel = join(capturas, 'prueba.xlsx');
{
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Datos');
  hoja.addRow(['Nombre', 'Cédula', 'Teléfono', 'Localidad', 'Puesto', 'Mesa', 'Estado']);
  hoja.addRow(['Prueba Uno', '1.000.111', '3001234567', 'Usaquen', 'SERVITA', '3', 'Confirmado']);
  hoja.addRow(['Prueba Dos', '1000222', '', 'Kennedy', 'Colegio que no existe', '1', 'Confirmado']);
  hoja.addRow(['Prueba Tres', '12345+6-', '', 'Suba', '', '', 'Confirmado']);
  hoja.addRow(['Prueba Repetida', '1000111', '', '', '', '', 'Confirmado']);
  hoja.addRow(['Prueba Cuatro', '1000444', '123', 'Bosa', '', '', 'Confirmado']);
  await libro.xlsx.writeFile(excel);
}

async function leerDescarga(page, accion) {
  const [descarga] = await Promise.all([page.waitForEvent('download'), accion()]);
  const ruta = join(capturas, descarga.suggestedFilename());
  await descarga.saveAs(ruta);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(ruta);
  return { ruta, libro, nombre: descarga.suggestedFilename() };
}

const navegador = await chromium.launch();
const erroresConsola = [];
let pasos = 0;
async function paso(nombre, fn) {
  try {
    await fn();
    pasos++;
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    console.error(`  ✗ ${nombre}\n    ${e.message.split('\n').slice(0, 4).join('\n    ')}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=${nombre}::${e.message.split('\n').slice(0, 6).join(' | ').replace(/\x1b\[[0-9;]*m/g, '')}`);
    process.exitCode = 1;
  }
}

async function sesion(rol, viewport, encabezado = /Hola/) {
  const ctx = await navegador.newContext({ viewport, locale: 'es-CO' });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/.test(m.text()) && /openstreetmap/.test(m.location()?.url ?? '')) return;
    erroresConsola.push(`[${rol}] ${m.text()} ${m.location()?.url ?? ''}`);
  });
  page.on('pageerror', (e) => erroresConsola.push(`[${rol}] ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(base);
  await page.getByLabel('Correo').fill(`${rol}@demo.co`);
  await page.getByLabel('Contraseña').fill('x');
  await page.getByLabel('Ver como').selectOption(rol);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('heading', { name: encabezado }).waitFor();
  return { ctx, page };
}

const movil = { width: 390, height: 844 };
const escritorio = { width: 1280, height: 860 };

console.log('Líder (móvil)');
{
  const { ctx, page } = await sesion('lider', movil);
  await page.locator('.cifra-tarjeta .valor').first().waitFor();
  await page.screenshot({ path: join(capturas, '01-lider-inicio.png'), fullPage: true });

  await paso('el menú del líder no muestra secciones de administración', async () => {
    const menu = await page.getByRole('navigation', { name: 'Secciones' }).innerText();
    assert.match(menu, /Mis registros/);
    assert.doesNotMatch(menu, /Equipo|Importar|revisar/);
  });

  await page.getByRole('link', { name: 'Registrar persona' }).first().click();
  await page.getByRole('heading', { name: 'Registrar persona' }).waitFor();

  await paso('sin datos: muestra los errores y no guarda', async () => {
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    for (const t of ['La cédula debe tener', 'Escribe el nombre', 'Elige una opción', 'fecha de nacimiento', 'Elige la localidad', 'Sin la autorización']) {
      await page.getByText(t, { exact: false }).first().waitFor({ timeout: 2000 });
    }
    await page.screenshot({ path: join(capturas, '02-registro-errores.png'), fullPage: true });
  });

  await paso('registro completo con puesto de la lista oficial', async () => {
    await page.getByLabel('Cédula').fill('80.123.456');
    await page.getByLabel('Nombres').fill('María Fernanda');
    await page.getByText('Escribe el nombre.').waitFor({ state: 'detached', timeout: 2000 });
    await page.getByLabel('Apellidos').fill('Prueba Demo');
    await page.getByRole('button', { name: 'Femenino' }).click();
    await page.getByRole('button', { name: 'Solo la edad' }).click();
    await page.getByLabel('Edad en años').fill('34');
    await page.getByLabel('Localidad').selectOption({ label: 'Usaquén' });
    await page.getByPlaceholder('Busca por nombre o dirección…').fill('servita');
    await page.getByRole('option', { name: /SERVITA/ }).click();
    await page.getByLabel(/^Mesa/).fill('5');
    await page.getByLabel(/La persona autoriza/).check();
    await page.screenshot({ path: join(capturas, '03-registro-lleno.png'), fullPage: true });
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await page.getByText('quedó registrada').waitFor();
    await page.getByText('Lugar de votación confirmado: SERVITA').waitFor();
    assert.equal(await page.getByLabel('Cédula').inputValue(), '', 'el formulario se limpia');
    assert.equal(await page.getByLabel('Localidad').inputValue() !== '', true, 'conserva la localidad');
    await page.screenshot({ path: join(capturas, '04-registro-ok.png') });
  });

  await paso('la misma cédula no se puede registrar dos veces', async () => {
    await page.getByLabel('Cédula').fill('80123456');
    await page.getByLabel('Nombres').fill('Otra');
    await page.getByRole('button', { name: 'Masculino' }).click();
    await page.getByRole('button', { name: 'Fecha de nacimiento' }).click();
    await page.getByLabel('Fecha de nacimiento').fill('1980-02-02');
    await page.getByLabel('Todavía no sabe dónde vota').check();
    await page.getByLabel(/La persona autoriza/).check();
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await page.getByText('Esta cédula ya está registrada.').waitFor();
  });

  await paso('menor de edad: no deja registrar', async () => {
    await page.getByLabel('Cédula').fill('99999991');
    const hace15 = new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10);
    await page.getByLabel('Fecha de nacimiento').fill(hace15);
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await page.getByText('Debe ser mayor de edad.').waitFor();
  });

  await paso('"Otro" con el nombre oficial: sugiere el puesto correcto', async () => {
    await page.getByLabel('Todavía no sabe dónde vota').uncheck();
    await page.getByLabel('Localidad').selectOption({ label: 'Usaquén' });
    await page.getByRole('button', { name: /No aparece en la lista/ }).click();
    await page.getByLabel('Nombre del puesto como le aparece').fill('Servita');
    await page.getByText('¿Es').waitFor();
    await page.screenshot({ path: join(capturas, '05-otro-sugerencia.png'), fullPage: true });
    await page.getByRole('button', { name: 'Sí, es ese' }).click();
    await page.locator('.elegido').getByText('SERVITA').waitFor();
  });

  await paso('"Otro" con un nombre desconocido: queda para revisión', async () => {
    await page.getByRole('button', { name: 'Cambiar', exact: true }).click();
    await page.getByRole('button', { name: /No aparece en la lista/ }).click();
    await page.getByLabel('Nombre del puesto como le aparece').fill('Colegio de las Palmas Sede Norte');
    await page.getByLabel(/^Mesa/).fill('2');
    await page.getByLabel('Cédula').fill('99999992');
    await page.getByLabel('Fecha de nacimiento').fill('1975-05-05');
    await page.getByLabel(/La persona autoriza/).check();
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await page.getByText('El puesto quedó para revisión del administrador.').waitFor();
  });

  await paso('mis registrados: búsqueda por cédula', async () => {
    await page.getByRole('link', { name: 'Mis registros' }).click();
    await page.getByLabel('Buscar').fill('80123456');
    await page.getByText('María Fernanda Prueba Demo').waitFor();
    await page.screenshot({ path: join(capturas, '06-mis-registrados.png'), fullPage: true });
  });

  await paso('el líder no puede abrir secciones de administración', async () => {
    await page.goto(`${base}/equipo`);
    await page.getByRole('heading', { name: /Hola/ }).waitFor();
  });
  await ctx.close();
}

console.log('Administrador (escritorio)');
{
  const { ctx, page } = await sesion('admin', escritorio);
  await page.locator('.barra-h').first().waitFor();
  await page.screenshot({ path: join(capturas, '10-admin-inicio.png'), fullPage: true });

  await paso('bandeja de revisión: agrupa y resuelve aprendiendo el nombre', async () => {
    await page.getByRole('link', { name: /Puestos por revisar/ }).click();
    await page.getByRole('heading', { name: 'Puestos por revisar' }).waitFor();
    await page.locator('.tarjeta h2').first().waitFor();
    await page.screenshot({ path: join(capturas, '11-revision.png'), fullPage: true });
    // La demo guarda los datos por pestaña: se usa un grupo de los datos de ejemplo
    const primera = page.locator('.tarjeta', { has: page.locator('h2') }).filter({ has: page.getByRole('button', { name: /Elegir puesto|Es otro puesto/ }) }).first();
    const titulo = await primera.locator('h2').innerText();
    const tarjeta = page.locator('.tarjeta', { has: page.getByRole('heading', { name: titulo, exact: true }) });
    await tarjeta.getByRole('button', { name: /Elegir puesto|Es otro puesto/ }).click();
    await tarjeta.getByRole('option').first().click();
    const elegido = (await tarjeta.locator('.elegido strong').innerText()).trim();
    await tarjeta.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByText(new RegExp(`ubicadas? en ${elegido.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\. Nombre aprendido\\.`)).waitFor();
    await page.getByRole('heading', { name: titulo, exact: true }).waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(500);  // tras recargar la bandeja, el grupo no vuelve
    assert.equal(await page.getByRole('heading', { name: titulo, exact: true }).count(), 0, 'el grupo desaparece');
  });

  await paso('importar Excel: lee, valida y reporta sin guardar', async () => {
    await page.getByRole('link', { name: 'Importar Excel' }).click();
    await page.getByLabel('Archivo de Excel (.xlsx)').setInputFiles(excel);
    await page.getByText('5 filas con datos').waitFor();
    await page.getByText(/Cédula → Cédula/).waitFor();
    await page.getByLabel(/Líder al que se asignan/).selectOption({ label: 'Germán Ríos' });
    await page.screenshot({ path: join(capturas, '12-importar-leido.png'), fullPage: true });
    await page.getByRole('button', { name: 'Revisar 5 filas' }).click();
    await page.getByText('entrarán').waitFor();
    const cifra = async (etiqueta) => Number((await page.locator('.cifra', { hasText: etiqueta }).locator('.valor').innerText()).replace(/\D/g, ''));
    assert.equal(await cifra('entrarán'), 3);
    assert.equal(await cifra('con errores'), 1);
    assert.equal(await cifra('duplicadas'), 1);
    await page.getByText('cédula inválida: "12345+6-"').waitFor();
    await page.screenshot({ path: join(capturas, '13-importar-reporte.png'), fullPage: true });
  });

  await paso('importar Excel: confirma solo las válidas', async () => {
    await page.getByRole('button', { name: 'Importar 3 personas' }).click();
    await page.getByText('3 personas importadas.').waitFor();
  });

  await paso('crear líder', async () => {
    await page.getByRole('link', { name: 'Líderes' }).click();
    await page.getByRole('button', { name: 'Nuevo líder' }).click();
    await page.getByLabel('Nombre').fill('Líder Nuevo Prueba');
    await page.getByLabel(/Meta de personas/).fill('30');
    await page.getByRole('button', { name: 'Crear líder' }).click();
    await page.getByText('Líder Nuevo Prueba quedó creado.').waitFor();
    await page.screenshot({ path: join(capturas, '14-lideres.png'), fullPage: true });
  });

  await paso('equipo: dar acceso a un líder existente', async () => {
    await page.getByRole('link', { name: 'Equipo' }).click();
    await page.getByRole('button', { name: 'Invitar a alguien' }).click();
    await page.getByLabel('Correo').fill('nuevo.lider@demo.co');
    await page.getByLabel('Nombre', { exact: true }).fill('Líder Nuevo Prueba');
    await page.getByRole('radio', { name: /^Líder/ }).check();
    await page.getByLabel('Ficha de líder').selectOption({ label: 'Líder Nuevo Prueba (ya existe, sin usuario)' });
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await page.getByText('Invitación enviada a nuevo.lider@demo.co').waitFor();
    const fila = page.locator('tr', { hasText: 'nuevo.lider@demo.co' });
    assert.match(await fila.innerText(), /Invitación enviada/);
    await page.screenshot({ path: join(capturas, '15-equipo.png'), fullPage: true });
  });
  await paso('ver como líder: su panel, sus datos y solo lectura', async () => {
    await page.locator('.barra').getByRole('button', { name: 'Ver como' }).click();
    await page.locator('.lista-opciones button', { hasText: 'Líder Demo' }).click();
    await page.getByText(/Estás viendo el panel como/).waitFor();
    const menu = await page.getByRole('navigation', { name: 'Secciones' }).innerText();
    assert.match(menu, /Mis registros/);
    assert.match(menu, /Mi enlace y QR/);
    assert.doesNotMatch(menu, /Equipo|Importar/);
    await page.screenshot({ path: join(capturas, '16-ver-como-lider.png'), fullPage: true });
    // Intentar registrar: la vista no deja escribir
    await page.getByRole('link', { name: 'Registrar persona' }).first().click();
    await page.getByLabel('Líder que registra').selectOption({ label: 'Líder Demo' }).catch(() => {});
    await page.getByLabel('Cédula').fill('99999995');
    await page.getByLabel('Nombres').fill('No');
    await page.getByRole('button', { name: 'Femenino' }).click();
    await page.getByLabel('Fecha de nacimiento').fill('1980-01-01');
    await page.getByLabel('Todavía no sabe dónde vota').check();
    await page.getByLabel(/La persona autoriza/).check();
    await page.getByRole('button', { name: 'Registrar', exact: true }).click();
    await page.getByText(/solo lectura/).first().waitFor();
    await page.getByRole('button', { name: 'Volver a mi panel' }).click();
    await page.getByRole('heading', { name: 'Equipo' }).waitFor();
    assert.equal(await page.getByText(/Estás viendo el panel como/).count(), 0);
  });
  await ctx.close();
}

console.log('Enlace del líder y formulario público (móvil)');
{
  const { ctx, page } = await sesion('lider', movil);
  let url;
  await paso('el líder ve su enlace con QR', async () => {
    await page.getByRole('link', { name: /Mi enlace y QR/ }).first().click();
    await page.locator('.qr svg').waitFor();
    url = (await page.locator('.caja-enlace').innerText()).trim();
    assert.match(url, /\/r\/\w+/);
    await page.screenshot({ path: join(capturas, '17-mi-enlace.png'), fullPage: true });
  });
  await ctx.close();
  const publico = await navegador.newContext({ viewport: movil, locale: 'es-CO' });
  const p = await publico.newPage();
  p.on('pageerror', (e) => erroresConsola.push(`[publico] ${e.message}`));
  await paso('formulario público: valida y registra sin iniciar sesión', async () => {
    await p.goto(base + new URL(url).pathname);
    await p.getByText('Te invita').waitFor();
    await p.getByRole('button', { name: 'Registrarme' }).click();
    await p.getByRole('alert').waitFor();
    await p.getByLabel('Cédula').fill('99999996');
    await p.getByLabel('Nombres').fill('Persona');
    await p.getByLabel('Apellidos').fill('Del Enlace');
    await p.getByRole('button', { name: 'Masculino' }).click();
    await p.getByLabel('Fecha de nacimiento').fill('1990-03-03');
    await p.getByLabel(/Autorizo el tratamiento/).check();
    await p.screenshot({ path: join(capturas, '18-formulario-publico.png'), fullPage: true });
    await p.getByRole('button', { name: 'Registrarme' }).click();
    await p.getByText('¡Gracias! Tu registro quedó listo.').waitFor();
  });
  await publico.close();
}

console.log('Candidato (móvil)');
{
  const { ctx, page } = await sesion('candidato', movil, 'Tablero');
  await paso('el tablero es su pantalla de inicio y solo ve agregados', async () => {
    const menu = await page.getByRole('navigation', { name: 'Secciones' }).innerText();
    assert.doesNotMatch(menu, /Personas|Registrar|Líderes/);
    await page.locator('.leaflet-interactive').first().waitFor();
    assert.ok(await page.locator('.leaflet-interactive').count() > 10, 'hay puestos en el mapa');
    assert.equal(await page.locator('.piramide-fila').count(), 6);
    await page.screenshot({ path: join(capturas, '20-candidato-tablero.png'), fullPage: true });
  });
  await paso('filtros: sexo y localidad cambian las cifras', async () => {
    const total = async () => Number((await page.locator('.cifra .valor').first().innerText()).replace(/\D/g, ''));
    const todos = await total();
    await page.getByRole('button', { name: 'Mujeres', exact: true }).click();
    const mujeres = await total();
    assert.ok(mujeres > 0 && mujeres < todos, `${mujeres} < ${todos}`);
    await page.getByLabel('Localidad').selectOption({ label: 'Kennedy' });
    await page.getByRole('heading', { name: 'La localidad' }).waitFor();
    const filas = await page.locator('.tarjeta', { has: page.getByRole('heading', { name: 'La localidad' }) }).locator('tbody tr').count();
    assert.equal(filas, 1);
    assert.ok(await total() < mujeres);
    await page.screenshot({ path: join(capturas, '21-candidato-filtros.png'), fullPage: true });
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    assert.equal(await total(), todos);
  });
  await paso('no puede abrir el listado de personas', async () => {
    await page.goto(`${base}/personas`);
    await page.getByRole('heading', { name: 'Tablero' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Personas' }).count(), 0);
  });
  await ctx.close();
}

console.log('Coordinador (escritorio)');
{
  const { ctx, page } = await sesion('coordinador', escritorio);
  await paso('el coordinador abre el tablero desde el menú', async () => {
    await page.getByRole('link', { name: 'Tablero' }).click();
    await page.locator('.leaflet-interactive').first().waitFor();
    await page.screenshot({ path: join(capturas, '22-tablero-escritorio.png'), fullPage: true });
  });
  await ctx.close();
}

console.log('E14: digitador (móvil)');
{
  const { ctx, page } = await sesion('digitador', movil);
  await paso('el digitador solo ve la pestaña de digitar', async () => {
    await page.getByRole('link', { name: /Digitar mesas/ }).click();
    await page.getByRole('heading', { name: /^Avance:/ }).waitFor();
    assert.deepEqual(await page.getByRole('tab').allInnerTexts(), ['Digitar', 'Subir Excel']);
    const menu = await page.getByRole('navigation', { name: 'Secciones' }).innerText();
    assert.doesNotMatch(menu, /Personas|Registrar|Tablero/);
  });
  await paso('digita una mesa con el teclado y pasa a la siguiente', async () => {
    // Abre el primer puesto que tenga al menos dos mesas
    const bloque = page.locator('.puesto-e14').filter({ has: page.locator('.insignia', { hasText: /^[2-9]\d* mesas$/ }) }).first();
    await bloque.locator('.cabecera-puesto').click();
    const primera = bloque.locator('input').first();
    await primera.waitFor();
    const id = await primera.getAttribute('id');
    await primera.fill('7');
    await primera.press('Enter');
    await page.locator('.fila-e14.hecha', { hasText: '✓ 7 votos' }).first().waitFor();
    const enfocado = await page.evaluate(() => document.activeElement?.id);
    assert.ok(enfocado && enfocado !== id && enfocado.startsWith('m-'), 'el foco pasó a la siguiente mesa del puesto');
    await page.screenshot({ path: join(capturas, '30-e14-digitar.png'), fullPage: true });
  });
  await paso('no acepta valores inválidos', async () => {
    const input = page.locator('.puesto-e14 input:not([disabled])').first();
    await input.fill('5000');
    await input.press('Enter');
    await page.getByText('Escribe un número de 0 a 1000.').first().waitFor();
    await input.fill('');
  });
  await paso('corrige lo que digitó', async () => {
    await page.getByRole('button', { name: 'Ver y corregir' }).click();
    await page.getByRole('button', { name: 'Corregir' }).first().click();
    await page.getByLabel('Votos corregidos').fill('8');
    await page.getByRole('button', { name: 'Guardar' }).last().click();
    await page.getByRole('cell', { name: '8', exact: true }).first().waitFor();
  });
  await ctx.close();
}

console.log('E14 por Excel (digitador)');
{
  const { ctx, page } = await sesion('digitador', escritorio);
  await page.goto(`${base}/e14?vista=excel`);
  let plantilla;
  await paso('descarga la plantilla con las mesas y sus códigos oficiales', async () => {
    const { libro, nombre } = await leerDescarga(page, () => page.getByRole('button', { name: 'Plantilla: mesas con simpatizantes' }).click());
    assert.match(nombre, /^Plantilla_E14_mesas_con_simpatizantes_/);
    const hoja = libro.getWorksheet('E14');
    assert.deepEqual(hoja.getRow(1).values.slice(1), ['Localidad', 'Zona', 'Código de puesto', 'Puesto', 'Mesa', 'Votos E14', 'Observación']);
    assert.ok(hoja.rowCount > 20, `${hoja.rowCount} filas`);
    assert.ok(libro.getWorksheet('Instrucciones'));
    plantilla = libro;
  });
  await paso('sube la plantilla llena: revisión fila por fila y luego guarda', async () => {
    const hoja = plantilla.getWorksheet('E14');
    hoja.getRow(2).getCell(6).value = 3;
    hoja.getRow(3).getCell(6).value = 0;
    hoja.getRow(4).getCell(6).value = 'muchos';           // error
    hoja.getRow(5).getCell(6).value = 2;
    hoja.addRow(['Usaquén', '01', '01', '', 999, 4]);      // mesa inexistente (por códigos)
    hoja.addRow(['Kennedy', '08', '01', 'COLEGIO EL FERROL LA PAZ IED', 1, 2]); // el código no es de ese puesto (El Ferrol es 08-B4)
    const ruta = join(capturas, 'e14-lleno.xlsx');
    await plantilla.xlsx.writeFile(ruta);
    await page.getByLabel('Archivo de Excel (.xlsx)').setInputFiles(ruta);
    await page.getByText(/Votos E14 → votos/).waitFor();
    await page.getByRole('button', { name: /^Revisar \d+ filas$/ }).click();
    await page.getByRole('heading', { name: '3. Revisa y confirma' }).waitFor();
    const cifra = async (t) => Number((await page.locator('.cifra', { hasText: t }).locator('.valor').innerText()).replace(/\D/g, ''));
    assert.equal(await cifra('mesas nuevas'), 3);
    assert.equal(await cifra('con error'), 3);
    await page.getByText('votos inválidos: "muchos"').waitFor();
    await page.getByText(/la mesa 999 no existe/).waitFor();
    await page.getByText(/el código 08-01 es "COLEGIO DISTRITAL CLASS SEDE A", no "COLEGIO EL FERROL LA PAZ IED"/).waitFor();
    await page.screenshot({ path: join(capturas, '34-e14-excel-reporte.png'), fullPage: true });
    await page.getByRole('button', { name: 'Guardar 3 mesas' }).click();
    await page.getByText(/^Guardado\./).waitFor();
  });
  await paso('subir el mismo archivo otra vez no cuenta como segunda verificación', async () => {
    await page.getByLabel('Archivo de Excel (.xlsx)').setInputFiles(join(capturas, 'e14-lleno.xlsx'));
    await page.getByRole('button', { name: /^Revisar \d+ filas$/ }).click();
    await page.getByRole('heading', { name: '3. Revisa y confirma' }).waitFor();
    const nuevas = Number((await page.locator('.cifra', { hasText: 'mesas nuevas' }).locator('.valor').innerText()).replace(/\D/g, ''));
    assert.equal(nuevas, 0);
    assert.ok(await page.getByRole('button', { name: 'Guardar 0 mesas' }).isDisabled());
  });
  await ctx.close();
}

console.log('E14: administrador (escritorio)');
{
  const { ctx, page } = await sesion('admin', escritorio);
  await page.getByRole('link', { name: 'E14' }).click();
  await paso('resultados: cumplimiento, líderes y detalle por mesa', async () => {
    await page.locator('.cifra-tarjeta', { hasText: 'de cumplimiento' }).waitFor();
    assert.ok(await page.locator('tbody tr').count() >= 3, 'hay líderes');
    await page.getByRole('tab', { name: 'Por puesto' }).click();
    const enlace = page.locator('tbody .enlace').first();
    const nombre = await enlace.innerText();
    await enlace.click();
    try {
      await page.locator('table table th', { hasText: 'Votos E14' }).waitFor({ timeout: 10000 });
    } catch (e) {
      const texto = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      const i = texto.indexOf(nombre);
      throw new Error(`No apareció el detalle de "${nombre}". Pantalla: ${texto.slice(Math.max(0, i - 100), i + 400)}`);
    }
    await page.screenshot({ path: join(capturas, '31-e14-resultados.png'), fullPage: true });
  });
  await paso('diferencias: el admin elige el valor correcto', async () => {
    const pestana = page.getByRole('tab', { name: /^Diferencias/ });
    const antes = Number(((await pestana.innerText()).match(/\((\d+)\)/) ?? [0, 0])[1]);
    assert.ok(antes > 0, 'hay mesas con diferencia en los datos de ejemplo');
    await pestana.click();
    await page.locator('.tarjeta h3').first().waitFor();
    await page.screenshot({ path: join(capturas, '32-e14-diferencias.png'), fullPage: true });
    await page.locator('.tarjeta', { has: page.locator('h3') }).first().getByRole('button', { name: /votos/ }).first().click();
    await page.getByText(/quedó con \d+ votos/).waitFor();
    await page.waitForTimeout(300);
    const despues = Number(((await page.getByRole('tab', { name: /^Diferencias/ }).innerText()).match(/\((\d+)\)/) ?? [0, 0])[1]);
    assert.equal(despues, antes - 1);
  });
  await paso('crear una elección nueva', async () => {
    await page.getByRole('tab', { name: 'Elecciones' }).click();
    await page.getByLabel('Nombre').fill('Cámara 2026 prueba');
    await page.getByRole('button', { name: 'Simple' }).click();
    await page.getByRole('button', { name: 'Crear elección' }).click();
    await page.getByText('Elección “Cámara 2026 prueba” creada.').waitFor();
    await page.getByLabel('Elección').waitFor();
  });
  await ctx.close();
}

console.log('Análisis y exportes (administrador)');
{
  const { ctx, page } = await sesion('admin', escritorio);
  await page.getByRole('link', { name: 'Análisis' }).click();
  await paso('jerarquía: localidad → puesto → mesa, cruzado con E14', async () => {
    await page.getByRole('tab', { name: 'Territorio' }).click();
    await page.getByRole('navigation', { name: 'Nivel' }).waitFor();
    await page.locator('tbody .enlace').first().click();
    await page.getByText(/puestos con simpatizantes$/).waitFor();
    await page.locator('tbody .enlace').first().click();
    await page.locator('th', { hasText: 'Votos E14' }).first().waitFor();
    await page.screenshot({ path: join(capturas, '40-analisis-mesas.png'), fullPage: true });
    const { libro } = await leerDescarga(page, () => page.getByRole('button', { name: 'Exportar a Excel' }).click());
    assert.equal(libro.worksheets[0].getRow(1).getCell(1).value, 'Mesa');
  });
  await paso('calidad de datos y rendimiento de líderes', async () => {
    await page.getByRole('tab', { name: 'Calidad de los datos' }).click();
    await page.getByText(/con puesto y mesa confirmados/).waitFor();
    await page.getByRole('tab', { name: 'Líderes', exact: true }).click();
    await page.getByLabel('Ordenar por').selectOption('cumplimiento');
    await page.screenshot({ path: join(capturas, '41-analisis-lideres.png'), fullPage: true });
  });
  await paso('simulación: el escenario cambia la proyección', async () => {
    await page.getByRole('tab', { name: 'Simulación' }).click();
    const proyectado = async () => Number((await page.locator('.cifra-tarjeta', { hasText: 'proyectados' }).locator('.valor').innerText()).replace(/\D/g, ''));
    const moderado = await proyectado();
    await page.getByRole('button', { name: 'Optimista' }).click();
    assert.ok(await proyectado() > moderado);
    await page.getByLabel('Crecimiento de la base (%)').fill('0');
    assert.equal(await page.getByRole('button', { name: 'Personalizado' }).getAttribute('aria-pressed'), 'true');
    const futuro = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    await page.getByLabel(/Fecha objetivo/).fill(futuro);
    await page.getByText(/al ritmo actual/).waitFor();
    await page.screenshot({ path: join(capturas, '42-simulacion.png'), fullPage: true });
  });
  await paso('plantilla de registros con instrucciones y puestos oficiales', async () => {
    await page.getByRole('link', { name: 'Importar Excel' }).click();
    const { libro } = await leerDescarga(page, () => page.getByRole('button', { name: 'Descargar plantilla de registros' }).click());
    assert.deepEqual(libro.worksheets.map((h) => h.name), ['Registros', 'Instrucciones', 'Puestos oficiales']);
    assert.equal(libro.getWorksheet('Puestos oficiales').rowCount, 1084);
  });
  await paso('exportar personas a Excel', async () => {
    await page.getByRole('link', { name: 'Personas' }).click();
    await page.locator('tbody tr').first().waitFor();
    const { libro } = await leerDescarga(page, () => page.getByRole('button', { name: 'Exportar a Excel' }).click());
    assert.equal(libro.worksheets[0].getRow(1).getCell(1).value, 'Cédula');
    assert.ok(libro.worksheets[0].rowCount > 100);
  });
  await ctx.close();
}

console.log('E14: candidato');
{
  const { ctx, page } = await sesion('candidato', movil, 'Tablero');
  await paso('el candidato ve resultados, no digitación ni diferencias', async () => {
    await page.getByRole('link', { name: 'E14' }).click();
    await page.locator('.cifra-tarjeta', { hasText: 'de cumplimiento' }).waitFor();
    assert.equal(await page.getByRole('tablist').count(), 1, 'solo las pestañas internas de resultados');
    assert.equal(await page.getByRole('tab', { name: /Digitar|Diferencias|Elecciones/ }).count(), 0);
    await page.screenshot({ path: join(capturas, '33-e14-candidato.png'), fullPage: true });
  });
  await ctx.close();
}

await paso('sin errores en la consola del navegador', async () => {
  if (erroresConsola.length) console.log(erroresConsola.join('\n'));
  assert.deepEqual(erroresConsola, []);
});

await navegador.close();
servidor.close();
console.log(`\n${pasos} pasos correctos${process.exitCode ? ', con fallas' : ''}. Capturas en pruebas/capturas/`);
