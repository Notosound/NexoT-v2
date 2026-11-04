#!/usr/bin/env python3
"""
Lector de E14: recorta la casilla de votos del candidato en cada formulario,
lee los dígitos escritos a mano y genera un archivo para subir a NexoT
(E14 → Con imagen → Subir lecturas).

  python3 lector.py --documentos e14/ --calibracion calibracion.json --salida resultado/
  python3 lector.py --calibrar e14/un_formulario.pdf --calibracion calibracion.json

Entrada: carpeta con PDF/PNG/JPG. Cada archivo se asocia a su mesa por:
  - un manifiesto CSV (--manifiesto) con columnas archivo, zona, codigo_puesto, mesa, [url]
  - o el nombre del archivo: Z01_P05_M12.pdf  (zona 01, puesto 05, mesa 12)

Salida (carpeta --salida):
  lecturas.csv  zona, codigo_puesto, mesa, votos, alterno, confianza, metodo, documento, recorte, motivo
  recortes/     imagen de la casilla de cada mesa (es la que ve el digitador)

La lectura de escritura a mano NUNCA es 100 % confiable: NexoT usa solo las
lecturas de alta confianza como primera digitación y manda las demás a una
revisión humana con la imagen.
"""
import argparse, csv, json, os, re, subprocess, sys, tempfile
from pathlib import Path

import cv2
import numpy as np

from clasificador import Clasificador

PATRON_NOMBRE = re.compile(r'Z(?P<zona>[0-9A-Z]{1,3})[_-]P(?P<puesto>[0-9A-Z]{1,3})[_-]M(?P<mesa>\d{1,4})', re.I)


def cargar_pagina(archivo: Path, pagina: int, dpi: int) -> np.ndarray:
    """Devuelve la página como imagen en gris (PDF vía pdftoppm, o imagen directa)."""
    if archivo.suffix.lower() == '.pdf':
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / 'p'
            subprocess.run(['pdftoppm', '-r', str(dpi), '-f', str(pagina), '-l', str(pagina), '-gray', '-png', str(archivo), str(base)],
                           check=True, capture_output=True)
            png = next(Path(tmp).glob('p*.png'))
            img = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
    else:
        img = cv2.imread(str(archivo), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f'No se pudo abrir {archivo.name}')
    return img


def recortar(img: np.ndarray, cal: dict) -> np.ndarray:
    c = cal['casilla']
    h, w = img.shape
    x0, y0 = int(c['x'] * w), int(c['y'] * h)
    x1, y1 = int((c['x'] + c['ancho']) * w), int((c['y'] + c['alto']) * h)
    return img[max(0, y0):min(h, y1), max(0, x0):min(w, x1)]


def tinta(caja: np.ndarray) -> np.ndarray:
    """Binariza (tinta = 255) y quita los bordes impresos de la casilla."""
    _, b = cv2.threshold(cv2.GaussianBlur(caja, (3, 3), 0), 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Solo se quitan líneas que cruzan casi toda la casilla (bordes y renglones
    # impresos); los trazos del número (la barra del 7, del 4…) son más cortos
    for k in ((max(8, int(caja.shape[1] * 0.9)), 1), (1, max(8, int(caja.shape[0] * 0.9)))):
        lineas = cv2.morphologyEx(b, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, k))
        b = cv2.subtract(b, lineas)
    return cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))


def leer_casilla(recorte: np.ndarray, cal: dict, clf: Clasificador):
    n = int(cal.get('digitos', 3))
    margen = float(cal.get('margen', 0.1))
    h, w = recorte.shape
    ancho = w / n
    digitos = []   # (digito | None, prob, segundo, prob_segundo)
    for i in range(n):
        x0, x1 = int(i * ancho + margen * ancho), int((i + 1) * ancho - margen * ancho)
        y0, y1 = int(margen * h), int(h - margen * h)
        b = tinta(recorte[y0:y1, x0:x1])
        if b.size == 0 or (b > 0).mean() < float(cal.get('tinta_minima', 0.02)):
            digitos.append((None, 1.0, None, 0.0))
            continue
        digitos.append(clf.leer(b))
    return digitos


def componer(digitos):
    """Arma el número, su confianza y una lectura alternativa (el dígito más dudoso cambiado)."""
    leidos = [d for d in digitos if d[0] is not None]
    if not leidos:
        return None, None, 0.0, 'casillas vacías (¿cero o sin diligenciar?)'
    # una casilla vacía entre dígitos es sospechosa
    primero = next(i for i, d in enumerate(digitos) if d[0] is not None)
    if any(d[0] is None for d in digitos[primero:]):
        motivo_hueco = 'casilla vacía entre dígitos'
    else:
        motivo_hueco = ''
    votos = int(''.join(str(d[0]) for d in leidos))
    confianza = float(np.prod([d[1] for d in leidos]))
    dudoso = min(range(len(leidos)), key=lambda i: leidos[i][1])
    alterno = None
    if leidos[dudoso][2] is not None and leidos[dudoso][3] > 0.15:
        alt = [d[0] for d in leidos]
        alt[dudoso] = leidos[dudoso][2]
        alterno = int(''.join(str(x) for x in alt))
    motivo = motivo_hueco or ('dígito poco claro' if leidos[dudoso][1] < 0.8 else '')
    return votos, alterno, confianza, motivo


def mesa_de(archivo: Path, manifiesto: dict):
    if archivo.name in manifiesto:
        return manifiesto[archivo.name]
    m = PATRON_NOMBRE.search(archivo.stem)
    if not m:
        return None
    return {'zona': m['zona'], 'codigo_puesto': m['puesto'], 'mesa': m['mesa'], 'url': ''}


def guardar_recorte(recorte: np.ndarray, cal: dict, destino: Path):
    """Guarda la casilla ampliada con la división de dígitos marcada (para el digitador)."""
    escala = max(1, int(300 / max(1, recorte.shape[0])))
    vista = cv2.cvtColor(cv2.resize(recorte, None, fx=escala, fy=escala, interpolation=cv2.INTER_CUBIC), cv2.COLOR_GRAY2BGR)
    n = int(cal.get('digitos', 3))
    for i in range(1, n):
        x = int(i * vista.shape[1] / n)
        cv2.line(vista, (x, 0), (x, vista.shape[0]), (230, 160, 60), 1)
    cv2.imwrite(str(destino), vista, [cv2.IMWRITE_PNG_COMPRESSION, 9])


def calibrar(archivo: Path, cal: dict, salida: Path):
    img = cargar_pagina(archivo, int(cal.get('pagina', 1)), int(cal.get('dpi', 200)))
    vista = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    c = cal['casilla']
    h, w = img.shape
    x0, y0 = int(c['x'] * w), int(c['y'] * h)
    x1, y1 = int((c['x'] + c['ancho']) * w), int((c['y'] + c['alto']) * h)
    cv2.rectangle(vista, (x0, y0), (x1, y1), (0, 0, 255), 3)
    # cuadrícula de referencia cada 5 %
    for p in range(0, 101, 5):
        cv2.line(vista, (int(p / 100 * w), 0), (int(p / 100 * w), 12), (255, 0, 0), 2)
        cv2.putText(vista, str(p), (int(p / 100 * w) + 2, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 1)
        cv2.line(vista, (0, int(p / 100 * h)), (12, int(p / 100 * h)), (255, 0, 0), 2)
        cv2.putText(vista, str(p), (16, int(p / 100 * h) + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 1)
    salida.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(salida / 'calibracion_pagina.png'), vista)
    guardar_recorte(recortar(img, cal), cal, salida / 'calibracion_casilla.png')
    print(f'Revisa {salida}/calibracion_pagina.png (rectángulo rojo) y calibracion_casilla.png.')
    print('Si no cae justo sobre la casilla del candidato, ajusta x, y, ancho y alto (fracciones de la página) en la calibración.')


def main():
    ap = argparse.ArgumentParser(description='Lector de E14 para NexoT')
    ap.add_argument('--documentos', type=Path, help='carpeta con los E14 (PDF o imagen)')
    ap.add_argument('--calibracion', type=Path, required=True)
    ap.add_argument('--manifiesto', type=Path, help='CSV: archivo, zona, codigo_puesto, mesa[, url]')
    ap.add_argument('--salida', type=Path, default=Path('resultado'))
    ap.add_argument('--calibrar', type=Path, help='un E14 para probar dónde cae la casilla')
    a = ap.parse_args()
    cal = json.loads(a.calibracion.read_text(encoding='utf-8'))

    if a.calibrar:
        calibrar(a.calibrar, cal, a.salida)
        return
    if not a.documentos:
        ap.error('falta --documentos')

    manifiesto = {}
    if a.manifiesto:
        with open(a.manifiesto, encoding='utf-8-sig') as f:
            for r in csv.DictReader(f):
                manifiesto[r['archivo']] = r

    clf = Clasificador()
    (a.salida / 'recortes').mkdir(parents=True, exist_ok=True)
    archivos = sorted(p for p in a.documentos.iterdir() if p.suffix.lower() in ('.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff'))
    filas, resumen = [], {'legibles': 0, 'dudosas': 0, 'ilegibles': 0, 'sin_mesa': 0}
    for i, archivo in enumerate(archivos, 1):
        mesa = mesa_de(archivo, manifiesto)
        if not mesa:
            resumen['sin_mesa'] += 1
            print(f'  ! {archivo.name}: no se sabe de qué mesa es (usa el manifiesto o el nombre Z01_P05_M12)')
            continue
        nombre_recorte = f"{mesa['zona']}-{mesa['codigo_puesto']}-{mesa['mesa']}.png"
        try:
            img = cargar_pagina(archivo, int(cal.get('pagina', 1)), int(cal.get('dpi', 200)))
            rec = recortar(img, cal)
            guardar_recorte(rec, cal, a.salida / 'recortes' / nombre_recorte)
            votos, alterno, confianza, motivo = componer(leer_casilla(rec, cal, clf))
        except Exception as e:  # documento dañado, página que no existe…
            votos, alterno, confianza, motivo = None, None, 0.0, f'no se pudo leer: {e}'
            nombre_recorte = ''
        umbral = float(cal.get('umbral', 0.85))
        estado = 'legibles' if votos is not None and confianza >= umbral and alterno is None and not motivo else 'dudosas' if votos is not None else 'ilegibles'
        resumen[estado] += 1
        filas.append({'zona': mesa['zona'], 'codigo_puesto': mesa['codigo_puesto'], 'mesa': mesa['mesa'],
                      'votos': '' if votos is None else votos, 'alterno': '' if alterno is None else alterno,
                      'confianza': f'{confianza:.3f}', 'metodo': clf.nombre, 'documento': mesa.get('url') or archivo.name,
                      'recorte': nombre_recorte, 'motivo': motivo})
        if i % 50 == 0:
            print(f'  {i}/{len(archivos)} leídos…')

    with open(a.salida / 'lecturas.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['zona', 'codigo_puesto', 'mesa', 'votos', 'alterno', 'confianza', 'metodo', 'documento', 'recorte', 'motivo'])
        w.writeheader()
        w.writerows(filas)
    print(f"Listo: {len(filas)} mesas → {a.salida}/lecturas.csv")
    print(f"  claras: {resumen['legibles']} · para revisar: {resumen['dudosas']} · ilegibles: {resumen['ilegibles']} · sin mesa: {resumen['sin_mesa']}")


if __name__ == '__main__':
    sys.exit(main())
