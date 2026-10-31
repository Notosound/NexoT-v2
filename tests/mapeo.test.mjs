import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapearEncabezados, filaACanonica, repararTexto, normalizarEncabezado } from '../src/importacion/mapeo.mjs';

test('reconoce el formato de exportación del piloto', () => {
  const r = mapearEncabezados(['Nombre', 'Cedula', 'Telefono', 'Localidad', 'Departamento', 'Puesto', 'Mesa', 'Fecha', 'Estado']);
  assert.deepEqual(Object.values(r.mapeo),
    ['nombres', 'cedula', 'telefono', 'localidad', 'departamento', 'puesto', 'mesa', 'fecha_registro']);
  assert.deepEqual(r.faltan, []);
  assert.deepEqual(r.sinReconocer, []);   // "Estado" se ignora a propósito
});

test('acepta variantes con tildes, mayúsculas y puntuación', () => {
  const r = mapearEncabezados(['CÉDULA', 'Nombres', 'Apellidos', 'Género', 'Fecha de Nacimiento', 'Celular', 'Puesto de votación', 'No. Mesa']);
  assert.deepEqual(Object.values(r.mapeo),
    ['cedula', 'nombres', 'apellidos', 'sexo', 'fecha_nacimiento', 'telefono', 'puesto', 'mesa']);
});

test('no adivina: "fecha" no se confunde con "fecha de nacimiento"', () => {
  const r = mapearEncabezados(['Cedula', 'Nombre', 'Fecha', 'Fecha de nacimiento']);
  assert.equal(r.mapeo[2], 'fecha_registro');
  assert.equal(r.mapeo[3], 'fecha_nacimiento');
});

test('reporta lo que falta, lo desconocido y lo repetido', () => {
  const r = mapearEncabezados(['Nombre', 'Celular', 'Teléfono', 'Color favorito']);
  assert.deepEqual(r.faltan, ['cedula']);
  assert.deepEqual(r.sinReconocer, ['Color favorito']);
  assert.equal(r.repetidos.length, 1);
});

test('limpia valores: doble codificación, "Invalid Date", fechas y números', () => {
  const { mapeo } = mapearEncabezados(['Cedula', 'Nombre', 'Departamento', 'Fecha', 'Fecha de nacimiento']);
  const datos = filaACanonica([80111222, '  Ana   María  ', 'BogotÃ¡ D.C.', 'Invalid Date', new Date(Date.UTC(1990, 4, 21))], mapeo);
  assert.deepEqual(datos, { cedula: '80111222', nombres: 'Ana María', departamento: 'Bogotá D.C.', fecha_nacimiento: '1990-05-21' });
});

test('repararTexto no toca texto correcto', () => {
  assert.equal(repararTexto('Bogotá'), 'Bogotá');
  assert.equal(repararTexto('EngativÃ¡'), 'Engativá');
  assert.equal(normalizarEncabezado(' Puesto  de VOTACIÓN '), 'puesto de votacion');
});
