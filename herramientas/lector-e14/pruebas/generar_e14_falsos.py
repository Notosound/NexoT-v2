"""
Genera formularios E14 FALSOS para probar el lector (no son documentos reales).
Los dígitos se dibujan con trazos tipo bolígrafo (plantillas propias con
temblor, grosor e inclinación al azar), distintos de los usados para entrenar.
"""
import csv, json, sys
from pathlib import Path
import cv2
import numpy as np

TRAZOS = {  # puntos en un cuadro 0..1 (x, y)
    0: [[(.5,.05),(.2,.2),(.12,.5),(.2,.82),(.5,.95),(.8,.82),(.88,.5),(.8,.2),(.5,.05)]],
    1: [[(.3,.25),(.55,.05),(.55,.95)]],
    2: [[(.15,.25),(.35,.07),(.65,.07),(.82,.25),(.75,.5),(.15,.93),(.88,.93)]],
    3: [[(.15,.1),(.8,.1),(.45,.45),(.8,.6),(.82,.82),(.55,.95),(.15,.88)]],
    4: [[(.6,.95),(.6,.05),(.1,.65),(.9,.65)]],
    5: [[(.82,.07),(.25,.07),(.2,.45),(.6,.4),(.85,.6),(.75,.88),(.45,.95),(.15,.85)]],
    6: [[(.75,.07),(.35,.3),(.18,.65),(.3,.92),(.62,.93),(.82,.72),(.65,.5),(.3,.55),(.2,.65)]],
    7: [[(.12,.08),(.88,.08),(.45,.95)], [(.3,.5),(.7,.5)]],
    8: [[(.5,.5),(.2,.3),(.3,.08),(.7,.08),(.8,.3),(.5,.5),(.15,.72),(.3,.94),(.7,.94),(.85,.72),(.5,.5)]],
    9: [[(.8,.4),(.6,.12),(.3,.1),(.18,.32),(.35,.5),(.75,.42),(.82,.1),(.78,.6),(.6,.95)]],
}

def dibujar_digito(lienzo, d, x, y, w, h, rng):
    inc = rng.uniform(-0.18, 0.18); esc = rng.uniform(0.75, 0.95); g = int(rng.integers(3, 7))
    for trazo in TRAZOS[d]:
        pts = []
        for px, py in trazo:
            px += rng.normal(0, 0.035); py += rng.normal(0, 0.035)
            px = px + inc * (0.5 - py)
            pts.append((int(x + w * (0.5 + (px - 0.5) * esc)), int(y + h * (0.5 + (py - 0.5) * esc))))
        cv2.polylines(lienzo, [np.array(pts, np.int32)], False, int(rng.integers(10, 70)), g, cv2.LINE_AA)

def pagina(votos, cal, rng, borrosa=False):
    W, H = 1700, 2200
    img = np.full((H, W), 250, np.uint8)
    cv2.putText(img, 'FORMULARIO E-14 (FALSO - SOLO PRUEBA)', (120, 120), cv2.FONT_HERSHEY_SIMPLEX, 1.4, 30, 2)
    for k in range(25):  # renglones del formulario
        cv2.line(img, (100, 250 + k * 70), (1600, 250 + k * 70), 160, 1)
    c = cal['casilla']
    x0, y0 = int(c['x'] * W), int(c['y'] * H); w, h = int(c['ancho'] * W), int(c['alto'] * H)
    n = cal['digitos']
    for i in range(n + 1):
        cv2.line(img, (x0 + i * w // n, y0), (x0 + i * w // n, y0 + h), 40, 2)
    cv2.rectangle(img, (x0, y0), (x0 + w, y0 + h), 40, 2)
    texto = str(votos).rjust(n)
    for i, ch in enumerate(texto):
        if ch != ' ':
            dibujar_digito(img, int(ch), x0 + i * w // n + 6, y0 + 6, w // n - 12, h - 12, rng)
    if borrosa:
        img = cv2.GaussianBlur(img, (0, 0), 3.5)
        img = cv2.add(img, (rng.normal(0, 18, img.shape)).astype(np.int8).astype(np.uint8))
    return img

if __name__ == '__main__':
    destino = Path(sys.argv[1]); n = int(sys.argv[2]) if len(sys.argv) > 2 else 60
    cal = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else json.loads(Path('calibracion.ejemplo.json').read_text())
    destino.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(42)
    with open(destino / 'verdad.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['archivo', 'votos', 'borrosa'])
        for k in range(n):
            votos = int(rng.choice([rng.integers(0, 10), rng.integers(10, 100), rng.integers(100, 300)]))
            borrosa = k % 6 == 5
            nombre = f'Z{1 + k % 19:02d}_P{1 + k % 7:02d}_M{1 + k}.png'
            cv2.imwrite(str(destino / nombre), pagina(votos, cal, rng, borrosa))
            w.writerow([nombre, votos, int(borrosa)])
    print(f'{n} formularios falsos en {destino}')
