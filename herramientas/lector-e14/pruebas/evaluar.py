"""Compara lecturas.csv con la verdad de los formularios falsos."""
import csv, sys, re
verdad = {r['archivo']: r for r in csv.DictReader(open(sys.argv[1]))}
lect = list(csv.DictReader(open(sys.argv[2])))
umbral = float(sys.argv[3]) if len(sys.argv) > 3 else 0.85
clave = lambda r: f"Z{r['zona']}_P{r['codigo_puesto']}_M{r['mesa']}.png"
tot = ok = auto = auto_mal = rev = 0
for r in lect:
    v = verdad[clave(r)]; tot += 1
    leido = r['votos']; correcto = leido != '' and int(leido) == int(v['votos'])
    ok += correcto
    es_auto = leido != '' and float(r['confianza']) >= umbral and r['alterno'] == '' and not r['motivo']
    if es_auto:
        auto += 1; auto_mal += not correcto
    else:
        rev += 1
print(f'mesas {tot} · lectura correcta {ok} ({100*ok//tot}%)')
print(f'aceptadas solas (confianza alta) {auto}, de ellas equivocadas {auto_mal} · a revisión humana {rev}')
