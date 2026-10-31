// Entorno de pruebas: Postgres embebido (PGlite) que imita lo mínimo de
// Supabase (esquema auth, auth.uid(), roles anon/authenticated) y aplica
// las migraciones reales de supabase/migrations en orden.
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIGRACIONES = new URL('../supabase/migrations/', import.meta.url).pathname;

const SUPABASE_MINIMO = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function crearBase() {
  const db = new PGlite();
  await db.exec(SUPABASE_MINIMO);
  const archivos = (await readdir(MIGRACIONES)).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    try {
      await db.exec(await readFile(join(MIGRACIONES, archivo), 'utf8'));
    } catch (e) {
      throw new Error(`Falló la migración ${archivo}: ${e.message}`);
    }
  }
  return new Base(db);
}

class Base {
  constructor(db) { this.db = db; }

  // Ejecuta como superusuario (equivale al service role / scripts de carga)
  async sistema(sql, params) {
    await this.db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    return (await this.db.query(sql, params)).rows;
  }

  // Ejecuta como un usuario autenticado concreto, sujeto a RLS
  async como(usuarioId, sql, params) {
    await this.db.exec(`reset role; select set_config('request.jwt.claim.sub', '${usuarioId ?? ''}', false);`);
    await this.db.exec(`set role ${usuarioId ? 'authenticated' : 'anon'};`);
    try {
      return (await this.db.query(sql, params)).rows;
    } finally {
      await this.db.exec('reset role;');
    }
  }

  async crearUsuario(organizacionId, nombre, rol) {
    const id = randomUUID();
    await this.sistema('insert into auth.users(id, email) values ($1, $2)', [id, `${id}@prueba.co`]);
    await this.sistema('insert into perfiles(id, organizacion_id, nombre, rol) values ($1,$2,$3,$4)',
      [id, organizacionId, nombre, rol]);
    return id;
  }

  // Usuario invitado en Supabase Auth, todavía sin perfil
  async invitar(email) {
    const id = randomUUID();
    await this.sistema('insert into auth.users(id, email) values ($1, $2)', [id, email]);
    return id;
  }
}

// Catálogo de prueba. Bogotá y sus localidades ya vienen de la migración
// 0009; aquí se agregan puestos y mesas inventados:
//   Usaquén: Pepe Sierra (mesas 1-4)   Kennedy: Colegio Kennedy (mesa 5)
export async function cargarCatalogo(base) {
  await base.db.exec('reset role;');
  // Las pruebas de reglas usan un catálogo pequeño y conocido; el oficial
  // se prueba aparte en catalogo.test.mjs
  await base.db.exec(`
    delete from mesas; delete from puestos;
    insert into puestos(id, localidad_id, zona, codigo, nombre, direccion, latitud, longitud) values
      (1, (select id from localidades where codigo = '01'), '01', '01', 'Pepe Sierra', 'Cl 116 # 15-30', 4.6935, -74.0480),
      (2, (select id from localidades where codigo = '08'), '08', '01', 'Colegio Kennedy', 'Kr 78 # 41-20 Sur', 4.6280, -74.1530);
    insert into mesas(id, puesto_id, numero) values (1,1,1),(2,1,2),(3,1,3),(4,1,4),(5,2,1);
  `);
}
