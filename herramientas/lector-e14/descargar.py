#!/usr/bin/env python3
"""
Descarga los E14 publicados por la Registraduría, despacio y sin repetir.

  python3 descargar.py --lista e14_urls.csv --destino e14/

e14_urls.csv: columnas zona, codigo_puesto, mesa, url
  (la URL pública de cada formulario en el portal de divulgación de E14)

- Una descarga cada 1,5 segundos (configurable): no se debe saturar el portal.
- Si se corta, se vuelve a ejecutar y sigue donde iba.
- Guarda Z{zona}_P{puesto}_M{mesa}.pdf y un manifiesto.csv para el lector.

Cómo obtener las URL: el portal cambia en cada elección. Cuando publique los
E14, abre una mesa en el navegador, copia el enlace del PDF y fíjate en el
patrón (suele incluir departamento, municipio, zona, puesto y mesa). Con ese
patrón y la plantilla de mesas de NexoT (E14 → Plantilla) se arma la lista.
Usa solo datos públicos y respeta los términos del portal.
"""
import argparse, csv, time, urllib.request
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lista', type=Path, required=True)
    ap.add_argument('--destino', type=Path, required=True)
    ap.add_argument('--pausa', type=float, default=1.5, help='segundos entre descargas')
    a = ap.parse_args()
    a.destino.mkdir(parents=True, exist_ok=True)
    filas = list(csv.DictReader(open(a.lista, encoding='utf-8-sig')))
    manifiesto = a.destino / 'manifiesto.csv'
    nuevo = not manifiesto.exists()
    with open(manifiesto, 'a', newline='', encoding='utf-8') as m:
        w = csv.writer(m)
        if nuevo:
            w.writerow(['archivo', 'zona', 'codigo_puesto', 'mesa', 'url'])
        bajados = fallas = 0
        for i, r in enumerate(filas, 1):
            nombre = f"Z{r['zona']}_P{r['codigo_puesto']}_M{r['mesa']}{Path(r['url'].split('?')[0]).suffix or '.pdf'}"
            archivo = a.destino / nombre
            if archivo.exists() and archivo.stat().st_size > 0:
                continue
            try:
                req = urllib.request.Request(r['url'], headers={'User-Agent': 'NexoT-lector-E14/1.0'})
                with urllib.request.urlopen(req, timeout=40) as resp:
                    archivo.write_bytes(resp.read())
                w.writerow([nombre, r['zona'], r['codigo_puesto'], r['mesa'], r['url']])
                bajados += 1
            except Exception as e:
                fallas += 1
                print(f'  ! mesa {r["zona"]}-{r["codigo_puesto"]}-{r["mesa"]}: {e}')
            if i % 25 == 0:
                print(f'  {i}/{len(filas)} revisadas · {bajados} nuevas · {fallas} fallas')
            time.sleep(a.pausa)
    print(f'Listo: {bajados} descargados, {fallas} con falla. Vuelve a ejecutar para reintentar las fallas.')


if __name__ == '__main__':
    main()
