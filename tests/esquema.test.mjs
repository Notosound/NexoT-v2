import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase, cargarCatalogo } from './entorno.mjs';

let base, org, otraOrg;
const u = {};      // usuarios por rol
const l = {};      // líderes
let eleccion;
let cedula = 10000000;

async function persona(liderId, mesaId, extra = {}) {
  const datos = { sexo: 'femenino', fecha_nacimiento: '1990-01-01', ...extra };
  const [p] = await base.sistema(
    `insert into personas(organizacion_id, lider_id, cedula, nombres, apellidos, sexo, fecha_nacimiento, mesa_id)
     values ($1,$2,$3,'Persona','Prueba',$4,$5,$6) returning id, puesto_id`,
    [org, liderId, String(++cedula), datos.sexo, datos.fecha_nacimiento, mesaId]);
  return p;
}

async function digitar(usuario, mesa, votos) {
  await base.como(usuario,
    `insert into e14_digitaciones(eleccion_id, organizacion_id, mesa_id, votos) values ($1,$2,$3,$4)`,
    [eleccion, org, mesa, votos]);
}

before(async () => {
  base = await crearBase();
  await cargarCatalogo(base);
  [{ id: org }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Campaña Senador', 'senador') returning id`);
  [{ id: otraOrg }] = await base.sistema(`insert into organizaciones(nombre, slug) values ('Otro cliente', 'otro-cliente') returning id`);

  u.admin       = await base.crearUsuario(org, 'Admin', 'admin');
  u.candidato   = await base.crearUsuario(org, 'Candidato', 'candidato');
  u.coordinador = await base.crearUsuario(org, 'Coordinadora', 'coordinador');
  u.liderA      = await base.crearUsuario(org, 'Líder A', 'lider');
  u.dig1        = await base.crearUsuario(org, 'Digitador 1', 'digitador');
  u.dig2        = await base.crearUsuario(org, 'Digitador 2', 'digitador');
  u.adminOtra   = await base.crearUsuario(otraOrg, 'Admin otro cliente', 'admin');

  for (const [clave, perfil, coord, ced] of [
    ['A', u.liderA, u.coordinador, '900001'], ['B', null, u.coordinador, '900002'],
    ['C', null, null, '900003'], ['D', null, null, '900004'],
  ]) {
    [{ id: l[clave] }] = await base.sistema(
      `insert into lideres(organizacion_id, perfil_id, coordinador_id, nombre, cedula, meta_votos)
       values ($1,$2,$3,$4,$5,10) returning id`, [org, perfil, coord, `Líder ${clave}`, ced]);
  }

  // Escenario E14 (Pepe Sierra = mesas 1..4, Kennedy = mesa 5)
  for (let i = 0; i < 3; i++) await persona(l.A, 1);                         // mesa 1: A espera 3
  for (let i = 0; i < 2; i++) await persona(l.B, 2, { sexo: 'masculino' });  // mesa 2: B espera 2
  for (const x of ['A', 'C', 'D']) for (let i = 0; i < 2; i++) await persona(l[x], 3); // mesa 3: 6
  await persona(l.B, 4, { fecha_nacimiento: '1955-06-15' });                // mesa 4: B espera 1
  await persona(l.C, 5);                                                     // Kennedy: sin digitar

  [{ id: eleccion }] = await base.sistema(
    `insert into elecciones(organizacion_id, nombre, fecha, municipio_id) values ($1, 'Senado 2026', '2026-03-08', 1) returning id`, [org]);
});

describe('Integridad de datos', () => {
  test('la misma cédula no puede registrarse dos veces', async () => {
    await assert.rejects(
      base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres) values ($1,$2,'10000001','Repetida')`, [org, l.A]),
      /personas_cedula_uq/);
  });

  test('no acepta menores de edad', async () => {
    await assert.rejects(
      base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, fecha_nacimiento)
                    values ($1,$2,'55555','Menor', current_date - interval '15 years')`, [org, l.A]),
      /mayor de edad/);
  });

  test('el puesto siempre sale de la mesa y no puede contradecirla', async () => {
    const [p] = await base.sistema(`select puesto_id from personas where mesa_id = 5 limit 1`);
    assert.equal(p.puesto_id, 2);
    await assert.rejects(
      base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres, puesto_id, mesa_id)
                    values ($1,$2,'66666','Contradicha', 2, 1)`, [org, l.A]),
      /no pertenece al puesto/);
  });

  test('un líder de otra organización no puede recibir personas', async () => {
    const [{ id: liderAjeno }] = await base.sistema(
      `insert into lideres(organizacion_id, nombre) values ($1, 'Ajeno') returning id`, [otraOrg]);
    await assert.rejects(
      base.sistema(`insert into personas(organizacion_id, lider_id, cedula, nombres) values ($1,$2,'77777','Cruzada')`, [org, liderAjeno]),
      /foreign key/);
  });

  test('no se puede borrar una persona; el borrado lógico deja rastro', async () => {
    const [p] = await persona(l.D, null).then((x) => [x]);
    await assert.rejects(base.sistema(`delete from personas where id = $1`, [p.id]), /borrado lógico/);
    await base.como(u.admin, `select app.eliminar_persona($1)`, [p.id]);
    const [aud] = await base.sistema(
      `select cambios, usuario_id from auditoria where tabla = 'personas' and registro_id = $1 and accion = 'UPDATE'`, [p.id]);
    assert.deepEqual(aud.cambios, ['eliminado_en', 'eliminado_por']);
    assert.equal(aud.usuario_id, u.admin);
  });

  test('la auditoría registra cambios y no se puede alterar', async () => {
    const [p] = await base.sistema(`select id from personas where lider_id = $1 limit 1`, [l.A]);
    await base.como(u.admin, `update personas set telefono = '3001234567' where id = $1`, [p.id]);
    const [aud] = await base.sistema(
      `select cambios, antes->>'telefono' antes, despues->>'telefono' despues from auditoria
       where tabla='personas' and registro_id=$1 and accion='UPDATE' order by id desc limit 1`, [p.id]);
    assert.deepEqual(aud, { cambios: ['telefono'], antes: null, despues: '3001234567' });
    await assert.rejects(base.sistema(`delete from auditoria`), /solo lectura/);
    await assert.rejects(base.sistema(`update auditoria set accion = 'INSERT'`), /solo lectura/);
  });
});

describe('E14: cálculo por mesa (caso Pepe Sierra)', () => {
  test('doble digitación: coincidencias se verifican, diferencias van a revisión', async () => {
    await digitar(u.dig1, 1, 0); await digitar(u.dig2, 1, 0);
    await digitar(u.dig1, 2, 6); await digitar(u.dig2, 2, 6);
    await digitar(u.dig1, 3, 4);
    let [m3] = await base.como(u.admin, `select estado from v_e14_mesas where mesa_id = 3`);
    assert.equal(m3.estado, 'una_digitacion', 'con una sola digitación aún no cuenta');
    await digitar(u.dig2, 3, 4);
    await digitar(u.dig1, 4, 3); await digitar(u.dig2, 4, 5);

    const mesas = await base.como(u.admin, `select mesa_id, estado, votos_reales from v_e14_mesas order by mesa_id`);
    assert.deepEqual(mesas.map((m) => [m.mesa_id, m.estado, m.votos_reales]), [
      [1, 'verificado', 0], [2, 'verificado', 6], [3, 'verificado', 4], [4, 'en_revision', null], [5, 'pendiente', null],
    ]);
  });

  test('el digitador no ve lo que digitó el otro ni los esperados', async () => {
    const otras = await base.como(u.dig1, `select digitado_por from e14_digitaciones`);
    assert.ok(otras.every((d) => d.digitado_por === u.dig1));
    const pend = await base.como(u.dig1, `select * from v_e14_pendientes`);
    assert.deepEqual(pend.map((p) => p.mesa_id), [5]);
    assert.ok(!('esperados' in pend[0]));
    assert.equal((await base.como(u.dig1, `select * from v_e14_mesas`)).length, 0);
  });

  test('el admin resuelve la mesa en revisión', async () => {
    await assert.rejects(base.como(u.dig1, `select app.resolver_e14($1, 4, 1)`, [eleccion]), /administrador/);
    await base.como(u.admin, `select app.resolver_e14($1, 4, 1)`, [eleccion]);
    await digitar(u.admin, 4, 9);   // una digitación posterior no pisa la resolución
    const [m4] = await base.como(u.admin, `select estado, votos_reales from v_e14_mesas where mesa_id = 4`);
    assert.deepEqual(m4, { estado: 'verificado', votos_reales: 1 });
  });

  test('mesa 1 (3 esperados, 0 votos) y mesa 2 (2 esperados, 6 votos)', async () => {
    const r = await base.como(u.candidato,
      `select mesa_id, esperados, confirmados, faltantes, adicionales from v_e14_mesas where mesa_id in (1,2) order by 1`);
    assert.deepEqual(r, [
      { mesa_id: 1, esperados: 3, confirmados: 0, faltantes: 3, adicionales: 0 },
      { mesa_id: 2, esperados: 2, confirmados: 2, faltantes: 0, adicionales: 4 },
    ]);
  });

  test('el puesto suma mesas, no compara totales', async () => {
    const [p] = await base.como(u.candidato,
      `select esperados, votos_reales, confirmados, faltantes, adicionales from v_e14_puestos where puesto_id = 1`);
    // 12 esperados y 11 votos "parecería" casi cumplido, pero por mesa son 7 confirmados.
    assert.deepEqual(p, { esperados: 12, votos_reales: 11, confirmados: 7, faltantes: 5, adicionales: 4 });
  });

  test('reparto entre líderes: suma exacta y nadie supera lo esperado', async () => {
    const filas = await base.sistema(`
      select c.mesa_id, sum(c.confirmados)::int asignado, m.confirmados mesa, bool_and(c.confirmados <= c.esperados) ok
      from app.e14_lider_mesa_calc c join app.e14_mesas_calc m using (eleccion_id, mesa_id)
      where m.estado = 'verificado' group by c.mesa_id, m.confirmados`);
    for (const f of filas) {
      assert.equal(f.asignado, f.mesa, `mesa ${f.mesa_id}: reparto ${f.asignado} ≠ confirmados ${f.mesa}`);
      assert.ok(f.ok);
    }
    const m3 = await base.sistema(`select confirmados from app.e14_lider_mesa_calc where mesa_id = 3 order by confirmados`);
    assert.deepEqual(m3.map((x) => x.confirmados), [1, 1, 2]);   // 4 votos entre 3 líderes de 2 c/u
  });

  test('cumplimiento por líder cuadra con el total de mesas', async () => {
    const lideres = await base.como(u.candidato, `select * from v_e14_lideres`);
    const total = lideres.reduce((s, x) => s + x.confirmados, 0);
    const [mesas] = await base.como(u.candidato, `select sum(confirmados)::int c from v_e14_mesas`);
    assert.equal(total, mesas.c);
    const c = lideres.find((x) => x.lider_id === l.C);
    assert.equal(c.mesas_pendientes, 1, 'Kennedy aún no está digitada');
  });

  test('esperar 2 y obtener 4 sin dividir mal: nunca más de 100%', async () => {
    const lideres = await base.como(u.candidato, `select cumplimiento from v_e14_lideres where cumplimiento is not null`);
    assert.ok(lideres.every((x) => Number(x.cumplimiento) <= 100));
  });
});

describe('Permisos por rol', () => {
  test('el candidato no puede leer personas, solo agregados', async () => {
    assert.equal((await base.como(u.candidato, `select * from personas`)).length, 0);
    const demo = await base.como(u.candidato, `select sum(personas)::int n from v_demografia`);
    assert.equal(demo[0].n, 13);   // la persona eliminada lógicamente no cuenta
  });

  test('el líder solo ve a sus personas; la coordinadora a las de sus líderes', async () => {
    const delLider = await base.como(u.liderA, `select distinct lider_id from personas`);
    assert.deepEqual(delLider.map((x) => x.lider_id), [l.A]);
    const deCoord = await base.como(u.coordinador, `select distinct lider_id from personas order by 1`);
    assert.deepEqual(deCoord.map((x) => x.lider_id).sort(), [l.A, l.B].sort());
  });

  test('el líder no puede registrar personas a nombre de otro líder', async () => {
    await assert.rejects(
      base.como(u.liderA, `insert into personas(organizacion_id, lider_id, cedula, nombres) values ($1,$2,'88888','X')`, [org, l.B]),
      /row-level security/);
  });

  test('otra organización no ve absolutamente nada', async () => {
    assert.equal((await base.como(u.adminOtra, `select * from personas`)).length, 0);
    assert.equal((await base.como(u.adminOtra, `select * from v_demografia`)).length, 0);
    assert.equal((await base.como(u.adminOtra, `select * from v_e14_mesas`)).length, 0);
    const aud = await base.como(u.adminOtra, `select organizacion_id from auditoria`);
    assert.ok(aud.length > 0 && aud.every((a) => a.organizacion_id === otraOrg), 'solo ve su propia auditoría');
  });

  test('sin sesión no hay acceso', async () => {
    await assert.rejects(base.como(null, `select * from personas`), /permission denied/);
    await assert.rejects(base.como(null, `select * from v_demografia`), /permission denied/);
  });
});

describe('Demografía', () => {
  test('rangos de edad y sexo para el tablero del candidato', async () => {
    const r = await base.como(u.candidato,
      `select rango_edad, sexo, sum(personas)::int n from v_demografia group by 1,2 order by 1,2`);
    assert.deepEqual(r, [
      { rango_edad: '35-44', sexo: 'femenino', n: 10 },
      { rango_edad: '35-44', sexo: 'masculino', n: 2 },
      { rango_edad: '65+', sexo: 'femenino', n: 1 },    // nacida en 1955
    ]);
  });
});

describe('Importación de Excel', () => {
  let imp;
  test('valida, normaliza y reporta errores sin tocar personas', async () => {
    [{ id: imp }] = await base.como(u.admin,
      `insert into importaciones(organizacion_id, archivo, municipio_id, fecha_datos, consentimiento_version)
       values ($1, 'base_candidato.xlsx', 1, '2026-10-01', 'aviso-v1') returning id`, [org]);
    const filas = [
      { cedula: '1.020.304.050', nombres: '  maría   josé ', apellidos: 'pérez', sexo: 'F', fecha_nacimiento: '21/05/1990',
        telefono: '+57 300 123 4567', localidad: 'usaquen', puesto: 'PEPE SIERRA', mesa: '2', lider_cedula: '900001' },
      { cedula: '80111222', nombres: 'Juan', sexo: 'hombre', edad: '45', localidad: 'Kennedy', puesto: 'colegio kennedy', mesa: '1', lider_cedula: '900002' },
      { cedula: 'abc', nombres: 'Mala', sexo: 'x', localidad: 'Usaquén', puesto: 'No existe', lider_cedula: '900001' },
      { cedula: '80111222', nombres: 'Juan repetido', lider_cedula: '900002' },
      { cedula: '10000001', nombres: 'Ya existe', lider_cedula: '900001' },
      { cedula: '99887766', nombres: 'Joven', edad: '16', lider_cedula: '900001' },
      { cedula: '12345+6-', nombres: 'Cédula con símbolos', lider_cedula: '900001' },
      { cedula: '70707070', nombres: 'Vota en el Meta', departamento: 'Meta', localidad: 'Meta', puesto: 'Villavicencio',
        fecha_registro: 'Invalid Date', lider_cedula: '900001' },
      { cedula: '71717171', nombres: 'Teléfono malo', telefono: '123', fecha_registro: '25/2/2026', lider_cedula: '900001' },
    ];
    for (const [i, d] of filas.entries()) {
      await base.como(u.admin,
        `insert into importacion_filas(importacion_id, organizacion_id, fila, datos) values ($1,$2,$3,$4)`,
        [imp, org, i + 2, JSON.stringify(d)]);
    }
    const antes = (await base.sistema(`select count(*)::int n from personas`))[0].n;
    const [r] = await base.como(u.admin, `select * from app.validar_importacion($1)`, [imp]);
    assert.deepEqual([r.total_filas, r.filas_validas, r.filas_con_errores, r.filas_duplicadas], [9, 4, 3, 2]);
    assert.equal((await base.sistema(`select count(*)::int n from personas`))[0].n, antes);

    const fila = async (n) => (await base.como(u.admin,
      `select estado, errores, advertencias, cedula from importacion_filas where importacion_id=$1 and fila=$2`, [imp, n]))[0];

    // Errores bloquean; sexo y lugar solo advierten
    const mala = await fila(4);
    assert.equal(mala.estado, 'con_errores');
    assert.ok(mala.errores.some((e) => e.startsWith('cédula inválida')));
    assert.ok(mala.advertencias.some((e) => e.startsWith('sexo no reconocido')));
    assert.ok(mala.advertencias.some((e) => e.startsWith('puesto no encontrado')));

    // "12345+6-" NO se convierte en "123456"
    const simbolos = await fila(8);
    assert.equal(simbolos.estado, 'con_errores');
    assert.equal(simbolos.cedula, null);

    // Vota fuera de Bogotá: entra, pero señalada
    const meta = await fila(9);
    assert.equal(meta.estado, 'valida');
    assert.deepEqual(meta.advertencias, ['vota fuera del municipio (Meta, Meta)']);

    const tel = await fila(10);
    assert.equal(tel.estado, 'valida');
    assert.ok(tel.advertencias[0].startsWith('teléfono inválido'));
  });

  test('confirma solo las válidas, con origen trazable', async () => {
    const [r] = await base.como(u.admin, `select * from app.confirmar_importacion($1)`, [imp]);
    assert.equal(r.filas_importadas, 4);
    const [maria] = await base.sistema(`select * from personas where cedula = '1020304050'`);
    assert.equal(maria.nombres, 'María José');
    assert.equal(maria.sexo, 'femenino');
    assert.equal(maria.telefono, '3001234567');
    assert.equal(maria.puesto_id, 1);
    assert.equal(maria.importacion_fila, 2);
    assert.equal(maria.consentimiento_canal, 'importacion');
    const [juan] = await base.sistema(`select edad_declarada, edad_declarada_en, app.edad(fecha_nacimiento, edad_declarada, edad_declarada_en) edad from personas where cedula = '80111222'`);
    assert.equal(juan.edad_declarada, 45);
    assert.ok(juan.edad >= 45);
    await assert.rejects(base.como(u.admin, `select app.confirmar_importacion($1)`, [imp]), /Solo se puede confirmar/);

    const [tel] = await base.sistema(`select telefono, fecha_registro_origen::text f from personas where cedula = '71717171'`);
    assert.deepEqual(tel, { telefono: null, f: '2026-02-25' });

    const porUbicar = await base.como(u.admin, `select cedula, advertencias from v_personas_por_ubicar where importacion_id = $1 order by cedula`, [imp]);
    assert.deepEqual(porUbicar.map((p) => p.cedula), ['70707070', '71717171']);
    assert.equal((await base.como(u.candidato, `select * from v_personas_por_ubicar`)).length, 0, 'el candidato no ve esta lista');
  });

  test('un líder no puede importar', async () => {
    assert.equal((await base.como(u.liderA, `select * from importaciones`)).length, 0);
  });
});

describe('Catálogo de Bogotá', () => {
  test('20 localidades oficiales y búsqueda tolerante a tildes y alias', async () => {
    const [{ n }] = await base.sistema(`select count(*)::int n from localidades l join municipios m on m.id = l.municipio_id where m.divipola = '11001'`);
    assert.equal(n, 20);
    const buscar = async (t) => (await base.sistema(`select l.nombre from localidades l where l.id = app.buscar_localidad(1, $1)`, [t]))[0]?.nombre;
    assert.equal(await buscar('CIUDAD BOLIVAR'), 'Ciudad Bolívar');
    assert.equal(await buscar('Los Martires'), 'Los Mártires');
    assert.equal(await buscar('Martires'), 'Los Mártires');
    assert.equal(await buscar('Antonio Narino'), 'Antonio Nariño');
    assert.equal(await buscar('Meta'), undefined);
  });
});
