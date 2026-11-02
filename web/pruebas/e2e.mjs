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
    process.exitCode = 1;
  }
}

async function sesion(rol, viewport, encabezado = /^Hola/) {
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
  await page.locator('.cifra .valor').first().waitFor();
  await page.screenshot({ path: join(capturas, '01-lider-inicio.png'), fullPage: true });

  await paso('el menú del líder no muestra secciones de administración', async () => {
    const menu = await page.getByRole('navigation', { name: 'Secciones' }).innerText();
    assert.match(menu, /Mis registrados/);
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
    await page.getByRole('button', { name: 'Cambiar' }).click();
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
    await page.getByRole('link', { name: 'Mis registrados' }).click();
    await page.getByLabel('Buscar').fill('80123456');
    await page.getByText('María Fernanda Prueba Demo').waitFor();
    await page.screenshot({ path: join(capturas, '06-mis-registrados.png'), fullPage: true });
  });

  await paso('el líder no puede abrir secciones de administración', async () => {
    await page.goto(`${base}/equipo`);
    await page.getByRole('heading', { name: /^Hola/ }).waitFor();
  });
  await ctx.close();
}

console.log('Administrador (escritorio)');
{
  const { ctx, page } = await sesion('admin', escritorio);
  await page.locator('.barra-fila').first().waitFor();
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
    await page.getByLabel('Correo').fill('nuevo.lider@demo.co');
    await page.getByLabel('Nombre', { exact: true }).fill('Líder Nuevo Prueba');
    await page.getByLabel('Rol').selectOption('lider');
    await page.getByLabel('Ficha de líder').selectOption({ label: 'Líder Nuevo Prueba' });
    await page.getByRole('button', { name: 'Dar acceso' }).click();
    await page.getByText('ya tiene acceso como líder').waitFor();
    await page.screenshot({ path: join(capturas, '15-equipo.png'), fullPage: true });
  });
  await ctx.close();
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

await paso('sin errores en la consola del navegador', async () => {
  assert.deepEqual(erroresConsola, []);
});

await navegador.close();
servidor.close();
console.log(`\n${pasos} pasos correctos${process.exitCode ? ', con fallas' : ''}. Capturas en pruebas/capturas/`);
