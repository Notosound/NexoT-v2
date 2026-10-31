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
  create table auth.users (id uuid primary key);
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
    await this.sistema('insert into auth.users(id) values ($1)', [id]);
    await this.sistema('insert into perfiles(id, organizacion_id, nombre, rol) values ($1,$2,$3,$4)',
      [id, organizacionId, nombre, rol]);
    return id;
  }
}

// Catálogo mínimo: Bogotá con Usaquén (Pepe Sierra, mesas 1-4) y Kennedy
export async function cargarCatalogo(base) {
  await base.db.exec('reset role;');
  await base.db.exec(`
    insert into municipios(id, divipola, nombre, departamento) values (1, '11001', 'Bogotá D.C.', 'Bogotá D.C.');
    insert into localidades(id, municipio_id, codigo, nombre) values (1, 1, '01', 'Usaquén'), (2, 1, '08', 'Kennedy');
    insert into puestos(id, localidad_id, zona, codigo, nombre, latitud, longitud) values
      (1, 1, '01', '01', 'Pepe Sierra', 4.6935, -74.0480),
      (2, 2, '08', '01', 'Colegio Kennedy', 4.6280, -74.1530);
    insert into mesas(id, puesto_id, numero) values (1,1,1),(2,1,2),(3,1,3),(4,1,4),(5,2,1);
  `);
}
