#!/usr/bin/env python3
"""
Genera el EJEMPLO del lector de E14 con formularios INVENTADOS (no son E14
reales) y lo pasa por el lector de verdad (herramientas/lector-e14):

  web/public/ejemplos-e14/
    e14_ejemplo.jpg            un formulario inventado completo
    e14_ejemplo_borroso.jpg    uno borroso (como los que van a revisión)
    calibracion_ejemplo.jpg    el mismo con el rectángulo de calibración
    recortes/*.png             lo que recorta el lector de cada mesa
    lecturas_ejemplo.csv       lo que leyó el lector (se puede subir al panel)
    paquete_ejemplo.zip        lecturas.csv + recortes/ (como lo deja el lector)
  scripts/demo/lecturas_demo.json   lecturas + votos verdaderos, para cargar la demostración

  python3 scripts/demo/generar_ejemplos_e14.py
"""
import csv, json, shutil, subprocess, sys, zipfile
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
LECTOR = RAIZ / 'herramientas' / 'lector-e14'
sys.path.insert(0, str(LECTOR / 'pruebas'))
from generar_e14_falsos import pagina, dibujar_digito  # noqa: E402

SALIDA = RAIZ / 'web' / 'public' / 'ejemplos-e14'
TRABAJO = Path('/tmp') / 'ejemplos-e14-trabajo'
N = 36


PARTIDOS = ['PARTIDO DEL RIO', 'MOVIMIENTO VERDE MONTANA', 'ALIANZA CIUDADANA', 'CANDIDATO DE EJEMPLO',
            'FRENTE POPULAR ANDINO', 'PARTIDO DE LA SABANA', 'COALICION NUEVA', 'VOTOS EN BLANCO']


def formulario(votos, cal, rng, borrosa, zona, codigo, mesa, nombre_puesto):
    """Página inventada con aspecto de E14: encabezado y una fila por partido.
    La fila del candidato cae justo en la casilla calibrada."""
    img = pagina(votos, cal, rng, False)
    H, W = img.shape
    c = cal['casilla']
    x0, y0, w, h = int(c['x'] * W), int(c['y'] * H), int(c['ancho'] * W), int(c['alto'] * H)
    img[160:H - 120, 90:W - 90] = 250
    f = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, 'ACTA DE ESCRUTINIO DE JURADOS DE VOTACION  E-14', (130, 230), f, 1.3, 30, 3)
    cv2.putText(img, 'EJEMPLO INVENTADO - NO ES UN DOCUMENTO REAL', (130, 290), f, 1.0, 90, 2)
    cv2.putText(img, f'ZONA {zona}   PUESTO {codigo}   MESA {mesa:03d}', (130, 380), f, 1.1, 30, 2)
    cv2.putText(img, nombre_puesto[:38], (130, 430), f, 0.9, 60, 2)
    cv2.putText(img, 'SENADO DE LA REPUBLICA (SIMULACRO)', (130, 500), f, 0.9, 60, 2)
    paso = 95
    nuestra = PARTIDOS.index('CANDIDATO DE EJEMPLO')
    for k, nom in enumerate(PARTIDOS):
        y = y0 + (k - nuestra) * paso
        cv2.line(img, (110, y - 9), (W - 110, y - 9), 170, 1)
        cv2.putText(img, f'{101 + k}  {nom}', (130, y + h // 2 + 12), f, 0.95, 35, 2)
        for i in range(4):
            cv2.line(img, (x0 + i * w // 3, y), (x0 + i * w // 3, y + h), 40, 2)
        cv2.rectangle(img, (x0, y), (x0 + w, y + h), 40, 2)
        if k != nuestra:
            v = str(int(rng.integers(0, 140))).rjust(3)
            for i, ch in enumerate(v):
                if ch != ' ':
                    dibujar_digito(img, int(ch), x0 + i * w // 3 + 6, y + 6, w // 3 - 12, h - 12, rng)
        else:
            texto = str(votos).rjust(3)
            for i, ch in enumerate(texto):
                if ch != ' ':
                    dibujar_digito(img, int(ch), x0 + i * w // 3 + 6, y + 6, w // 3 - 12, h - 12, rng)
    yf = y0 + (len(PARTIDOS) - nuestra) * paso + 60
    cv2.putText(img, 'FIRMAS DE LOS JURADOS', (130, yf), f, 0.9, 60, 2)
    for i in range(3):
        cv2.line(img, (130 + i * 500, yf + 120), (520 + i * 500, yf + 120), 80, 2)
    if borrosa:
        img = cv2.GaussianBlur(img, (0, 0), 3.5)
        img = cv2.add(img, (rng.normal(0, 18, img.shape)).astype(np.int8).astype(np.uint8))
    return img


def main():
    puestos = json.loads((RAIZ / 'web' / 'src' / 'lib' / 'demo-puestos.json').read_text())
    rng = np.random.default_rng(2026)
    # Mesas repartidas por toda la ciudad: un puesto de cada tanto, mesas 1 a 4
    elegidos = [p for i, p in enumerate(sorted(puestos, key=lambda p: (p[1], p[0]))) if i % 30 == 7][:N]
    cal = json.loads((LECTOR / 'calibracion.ejemplo.json').read_text())
    if TRABAJO.exists():
        shutil.rmtree(TRABAJO)
    docs = TRABAJO / 'e14'
    docs.mkdir(parents=True)
    verdad = {}
    borrosa_img = None
    nombre_borrosa = None
    for k, p in enumerate(elegidos):
        zona, codigo, mesa = p[9], p[10], 1 + k % min(4, max(1, p[4]))
        votos = int(rng.choice([rng.integers(0, 10), rng.integers(8, 60), rng.integers(40, 160)]))
        borrosa = k % 5 == 3
        nombre = f'Z{zona}_P{codigo}_M{mesa}.png'
        img = formulario(votos, cal, rng, borrosa, zona, codigo, mesa, p[2])
        cv2.imwrite(str(docs / nombre), img)
        verdad[(zona, codigo, str(mesa))] = votos
        if k == 0:
            primera = img
        if borrosa and borrosa_img is None:
            borrosa_img = img
            nombre_borrosa = f'{zona}-{codigo}-{mesa}.png'

    res = TRABAJO / 'resultado'
    subprocess.run([sys.executable, str(LECTOR / 'lector.py'), '--documentos', str(docs),
                    '--calibracion', str(LECTOR / 'calibracion.ejemplo.json'), '--salida', str(res)], check=True)
    subprocess.run([sys.executable, str(LECTOR / 'lector.py'), '--calibrar', str(docs / sorted(p.name for p in docs.iterdir())[0]),
                    '--calibracion', str(LECTOR / 'calibracion.ejemplo.json'), '--salida', str(TRABAJO / 'cal')], check=True)

    if SALIDA.exists():
        shutil.rmtree(SALIDA)
    (SALIDA / 'recortes').mkdir(parents=True)
    def jpg(img, destino, ancho=900):
        h, w = img.shape[:2]
        cv2.imwrite(str(destino), cv2.resize(img, (ancho, int(h * ancho / w)), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 72])
    jpg(primera[150:1500, 60:1640], SALIDA / 'e14_ejemplo.jpg')
    jpg(borrosa_img[150:1500, 60:1640], SALIDA / 'e14_ejemplo_borroso.jpg')
    calib = cv2.imread(str(TRABAJO / 'cal' / 'calibracion_pagina.png'))
    jpg(calib[150:1500, 60:1640], SALIDA / 'calibracion_ejemplo.jpg')
    yc = int(cal['casilla']['y'] * calib.shape[0])
    jpg(calib[yc - 120:yc + 200, 60:1640], SALIDA / 'calibracion_zoom.jpg')

    filas = list(csv.DictReader(open(res / 'lecturas.csv', encoding='utf-8')))
    for f in filas:
        shutil.copy(res / 'recortes' / f['recorte'], SALIDA / 'recortes' / f['recorte'])
    shutil.copy(res / 'lecturas.csv', SALIDA / 'lecturas_ejemplo.csv')
    with zipfile.ZipFile(SALIDA / 'paquete_ejemplo.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(res / 'lecturas.csv', 'resultado/lecturas.csv')
        for f in filas:
            z.write(res / 'recortes' / f['recorte'], f"resultado/recortes/{f['recorte']}")
        z.writestr('LEEME.txt',
                   'EJEMPLO con formularios E14 INVENTADOS (no son reales).\n'
                   'Así queda la carpeta "resultado" del lector de E14.\n'
                   'En NexoT: E14 > Lectura automática > Subir lecturas del lector:\n'
                   '  1. elige resultado/lecturas.csv\n  2. elige todas las imágenes de resultado/recortes\n')

    # Para la guía: un recorte claro bien leído y uno borroso
    claro = max((f for f in filas if f['votos'] and int(f['votos']) == verdad[(f['zona'], f['codigo_puesto'], f['mesa'])] and not f['alterno']),
                key=lambda f: (int(f['votos']) >= 10, float(f['confianza'])))
    shutil.copy(SALIDA / 'recortes' / claro['recorte'], SALIDA / 'recorte_claro.png')
    shutil.copy(SALIDA / 'recortes' / nombre_borrosa, SALIDA / 'recorte_borroso.png')
    demo = [{**f, 'verdad': verdad[(f['zona'], f['codigo_puesto'], f['mesa'])]} for f in filas]
    (RAIZ / 'scripts' / 'demo' / 'lecturas_demo.json').write_text(json.dumps(demo, ensure_ascii=False, indent=1))
    claras = sum(1 for f in filas if f['votos'] and float(f['confianza']) >= cal['umbral'] and not f['alterno'] and not f['motivo'])
    bien = sum(1 for f in demo if f['votos'] and int(f['votos']) == f['verdad'])
    print(f'{len(filas)} mesas · {claras} claras · {bien} leídas bien')


if __name__ == '__main__':
    main()
