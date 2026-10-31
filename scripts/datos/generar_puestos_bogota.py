"""Genera el catálogo de puestos y mesas de Bogotá a partir del Divipole.

Entrada:  CSV crudo de scripts/datos/extraer_bogota.py (filas con dd = 16)
Salidas:  datos/divipole/bogota_congreso_2026.csv   (datos limpios, revisables)
          supabase/migrations/<archivo>.sql          (migración)

Reglas:
  * La localidad sale de la columna "comuna" ("08LOCALIDAD 8 KENNEDY" → 08).
  * En Bogotá la zona electoral 01-20 coincide con el código de localidad;
    se verifica y se aborta si no.
  * Los puestos especiales sin comuna (zona 90 = Corferias, 98 = cárceles)
    reciben la localidad mayoritaria de sus 7 puestos más cercanos y quedan
    marcados como localidad_inferida.
  * Las mesas se generan 1..N con N = "mesas Domingo".
  * Coordenadas a más de 50 km de la mediana de su localidad se consideran
    error del documento: en la base quedan vacías y el puesto se marca con
    coordenadas_descartadas (el CSV conserva el valor original).

Uso: python generar_puestos_bogota.py crudo.csv salida.csv migracion.sql
"""
import collections
import csv
import math
import sys

crudo, salida_csv, salida_sql = sys.argv[1:4]

filas = [r for r in csv.reader(open(crudo, encoding="utf-8")) if r[1] != "RARO"]
# columnas: pagina, dd, mm, zz, pp, depto, municipio, puesto, comuna, direccion,
#           mujeres, hombres, total, mesas, latitud, longitud, ...
puestos = []
for r in filas:
    p = dict(pagina=int(r[0]), dd=r[1], mm=r[2], zona=r[3], codigo=r[4], nombre=" ".join(r[7].split()),
             comuna=r[8], direccion=" ".join(r[9].split()), mujeres=int(r[10]), hombres=int(r[11]),
             total=int(r[12]), mesas=int(r[13]), lat=float(r[14]), lon=float(r[15]))
    assert p["dd"] == "16" and p["mm"] == "001", r
    assert p["mujeres"] + p["hombres"] == p["total"], r
    assert p["mesas"] > 0, r
    p["localidad"] = p["comuna"][:2] if p["comuna"] else None
    p["inferida"] = False
    if p["localidad"]:
        assert p["localidad"] == p["zona"], f"zona {p['zona']} ≠ localidad {p['localidad']}: {r}"
    puestos.append(p)

claves = collections.Counter((p["zona"], p["codigo"]) for p in puestos)
assert all(v == 1 for v in claves.values()), "códigos de puesto repetidos"

con_loc = [p for p in puestos if p["localidad"]]
coslat = math.cos(math.radians(4.6))
for p in puestos:
    if p["localidad"]:
        continue
    cercanos = sorted(con_loc, key=lambda q: math.hypot(q["lat"] - p["lat"], (q["lon"] - p["lon"]) * coslat))[:7]
    p["localidad"] = collections.Counter(q["localidad"] for q in cercanos).most_common(1)[0][0]
    p["inferida"] = True

assert len({p["localidad"] for p in puestos}) == 20, "deben aparecer las 20 localidades"

por_loc = collections.defaultdict(list)
for p in puestos:
    por_loc[p["localidad"]].append(p)
for lista in por_loc.values():
    lats = sorted(x["lat"] for x in lista); lons = sorted(x["lon"] for x in lista)
    mlat, mlon = lats[len(lats) // 2], lons[len(lons) // 2]
    for x in lista:
        km = math.hypot(x["lat"] - mlat, (x["lon"] - mlon) * coslat) * 111
        x["descartadas"] = km > 50

campos = ["zona", "codigo", "localidad", "inferida", "descartadas", "nombre", "direccion", "mesas",
          "mujeres", "hombres", "total", "lat", "lon", "pagina"]
with open(salida_csv, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
    w.writeheader()
    for p in sorted(puestos, key=lambda x: (x["zona"], x["codigo"])):
        w.writerow(p)

def q(s):
    return "'" + s.replace("'", "''") + "'"

total_mesas = sum(p["mesas"] for p in puestos)
total_censo = sum(p["total"] for p in puestos)
valores = ",\n".join(
    f"  ({q(p['localidad'])}, {q(p['zona'])}, {q(p['codigo'])}, {q(p['nombre'])}, {q(p['direccion'])}, "
    f"{'null' if p['descartadas'] else format(p['lat'], '.7f')}, {'null' if p['descartadas'] else format(p['lon'], '.7f')}, "
    f"{p['mesas']}, {p['mujeres']}, {p['hombres']}, {p['total']}, "
    f"{'true' if p['inferida'] else 'false'}, {'true' if p['descartadas'] else 'false'})"
    for p in sorted(puestos, key=lambda x: (x["zona"], x["codigo"]))
)

sql = f"""-- =====================================================================
-- Catálogo oficial: puestos y mesas de Bogotá
-- =====================================================================
-- Fuente: Registraduría Nacional del Estado Civil, DIVIPOLE definitiva
--         Elecciones Congreso y Presidente 2026, fecha de corte 30/01/2026
--         (Divipole_definitiva_ Elecciones_Congreso_2026_GEO_CITREP_Exterior_L_V_v5.pdf)
-- Generado por scripts/datos/generar_puestos_bogota.py — NO editar a mano.
-- Datos revisables en datos/divipole/bogota_congreso_2026.csv
--
-- {len(puestos)} puestos, {total_mesas} mesas, censo {total_censo}.
-- Puestos con localidad inferida por cercanía (no traen localidad en el
-- Divipole): {', '.join(p['nombre'] for p in puestos if p['inferida'])}.
-- Coordenadas descartadas por estar lejos de su localidad (error del
-- documento; quedan vacías): {', '.join(p['nombre'] for p in puestos if p['descartadas']) or 'ninguna'}.

alter table public.puestos
  add column mesas_total       int check (mesas_total > 0),
  add column censo_mujeres     int check (censo_mujeres >= 0),
  add column censo_hombres     int check (censo_hombres >= 0),
  add column censo_total       int check (censo_total >= 0),
  add column localidad_inferida boolean not null default false,
  add column coordenadas_descartadas boolean not null default false,
  add column fuente            text,
  add constraint puestos_censo_cuadra check (censo_total is null or censo_total = censo_mujeres + censo_hombres);

insert into public.puestos (localidad_id, zona, codigo, nombre, direccion, latitud, longitud,
                            mesas_total, censo_mujeres, censo_hombres, censo_total, localidad_inferida,
                            coordenadas_descartadas, fuente)
select l.id, v.zona, v.codigo, v.nombre, v.direccion, v.lat::numeric, v.lon::numeric,
       v.mesas, v.mujeres, v.hombres, v.total, v.inferida, v.descartadas, 'divipole-congreso-2026'
from (values
{valores}
) as v(localidad, zona, codigo, nombre, direccion, lat, lon, mesas, mujeres, hombres, total, inferida, descartadas)
join public.localidades l on l.codigo = v.localidad
join public.municipios m on m.id = l.municipio_id and m.divipola = '11001';

insert into public.mesas (puesto_id, numero)
select p.id, g.n
from public.puestos p
cross join lateral generate_series(1, p.mesas_total) as g(n)
where p.fuente = 'divipole-congreso-2026';

-- Verificación: si algo no cuadra con el documento, la migración falla
do $$
declare v_puestos int; v_mesas int; v_censo bigint; v_loc int;
begin
  select count(*), sum(censo_total), count(distinct localidad_id) into v_puestos, v_censo, v_loc
  from public.puestos where fuente = 'divipole-congreso-2026';
  select count(*) into v_mesas from public.mesas m join public.puestos p on p.id = m.puesto_id
  where p.fuente = 'divipole-congreso-2026';
  if v_puestos <> {len(puestos)} or v_mesas <> {total_mesas} or v_censo <> {total_censo} or v_loc <> 20 then
    raise exception 'Catálogo incompleto: % puestos, % mesas, censo %, % localidades', v_puestos, v_mesas, v_censo, v_loc;
  end if;
end $$;
"""
open(salida_sql, "w", encoding="utf-8").write(sql)
print(f"{len(puestos)} puestos, {total_mesas} mesas, censo {total_censo}, inferidas: {sum(p['inferida'] for p in puestos)}, "
      f"coordenadas descartadas: {[p['nombre'] for p in puestos if p['descartadas']]}")
