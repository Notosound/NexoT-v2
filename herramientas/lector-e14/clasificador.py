"""
Clasificador de dígitos escritos a mano para las casillas del E14.

Se entrena la primera vez (menos de un minuto) y queda guardado en modelo.joblib:
  - 10.000 dígitos manuscritos de MNIST (mnist10k.npz; MNIST, Y. LeCun y
    C. Cortes, licencia CC BY-SA 3.0; copia tomada del paquete npm "mnist", MIT)
  - los 1.797 dígitos manuscritos de scikit-learn
  - algunos dígitos sintéticos rotados y con ruido
Devuelve el dígito más probable, su probabilidad y el segundo candidato:
con eso NexoT decide si la lectura es clara o si la revisa una persona.
"""
import warnings
from pathlib import Path

import cv2
import joblib
import numpy as np
from sklearn.datasets import load_digits
from sklearn.svm import SVC

LADO = 16  # las muestras se normalizan a 16x16


def normalizar(b: np.ndarray) -> np.ndarray:
    """Recorta la tinta, la centra en un cuadrado y la lleva a LADO x LADO (0..1)."""
    ys, xs = np.nonzero(b)
    if len(xs) == 0:
        return np.zeros(LADO * LADO, np.float32)
    b = b[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = b.shape
    lado = max(h, w) + 4
    cuadro = np.zeros((lado, lado), np.uint8)
    y0, x0 = (lado - h) // 2, (lado - w) // 2
    cuadro[y0:y0 + h, x0:x0 + w] = b
    p = cv2.resize(cuadro, (LADO, LADO), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    return p.ravel()


# Formas de escribir frecuentes en Colombia que MNIST (letra de EE. UU.) casi
# no trae: el 1 con "banderita" (y a veces base), el 7 cruzado, el 4 abierto,
# el 9 con cola recta. Trazos en un cuadro 0..1.
ESTILOS_LOCALES = {
    1: [[[(.28, .28), (.55, .05), (.55, .95)]], [[(.3, .25), (.55, .05), (.55, .95)], [(.35, .95), (.75, .95)]]],
    7: [[[(.12, .08), (.88, .08), (.45, .95)], [(.3, .5), (.72, .5)]], [[(.15, .15), (.85, .08), (.5, .95)]]],
    4: [[[(.6, .95), (.6, .05), (.1, .65), (.9, .65)]], [[(.2, .05), (.15, .55), (.85, .55)], [(.65, .3), (.65, .95)]]],
    9: [[[(.8, .4), (.6, .12), (.3, .1), (.18, .32), (.35, .5), (.75, .42), (.82, .1), (.78, .6), (.6, .95)]]],
    6: [[[(.75, .07), (.35, .3), (.18, .65), (.3, .92), (.62, .93), (.82, .72), (.65, .5), (.3, .55), (.2, .65)]]],
}


def _locales(rng, por_estilo=160):
    X, y = [], []
    for d, estilos in ESTILOS_LOCALES.items():
        for trazos in estilos:
            for _ in range(por_estilo):
                img = np.zeros((64, 64), np.uint8)
                inc, esc, g = rng.uniform(-0.2, 0.2), rng.uniform(0.7, 0.95), int(rng.integers(3, 7))
                for t in trazos:
                    pts = [(int(64 * (0.5 + ((px + rng.normal(0, .04) + inc * (0.5 - py)) - 0.5) * esc)),
                            int(64 * (0.5 + ((py + rng.normal(0, .04)) - 0.5) * esc))) for px, py in t]
                    cv2.polylines(img, [np.array(pts, np.int32)], False, 255, g, cv2.LINE_AA)
                _, img = cv2.threshold(img, 100, 255, cv2.THRESH_BINARY)
                X.append(normalizar(img)); y.append(d)
    return X, y


def _sinteticos(rng):
    fuentes = [cv2.FONT_HERSHEY_SCRIPT_SIMPLEX, cv2.FONT_HERSHEY_SCRIPT_COMPLEX, cv2.FONT_HERSHEY_SIMPLEX,
               cv2.FONT_HERSHEY_DUPLEX, cv2.FONT_HERSHEY_PLAIN, cv2.FONT_HERSHEY_COMPLEX_SMALL]
    X, y = [], []
    for d in range(10):
        for _ in range(40):
            img = np.zeros((64, 64), np.uint8)
            f = fuentes[rng.integers(len(fuentes))]
            esc = rng.uniform(1.4, 2.2)
            grosor = int(rng.integers(2, 6))
            cv2.putText(img, str(d), (int(rng.integers(8, 20)), int(rng.integers(44, 56))), f, esc, 255, grosor, cv2.LINE_AA)
            m = cv2.getRotationMatrix2D((32, 32), rng.uniform(-14, 14), 1.0)
            m[0, 1] += rng.uniform(-0.2, 0.2)  # inclinación
            img = cv2.warpAffine(img, m, (64, 64))
            if rng.random() < 0.5:
                img = cv2.dilate(img, np.ones((2, 2), np.uint8))
            ruido = (rng.random(img.shape) < 0.01).astype(np.uint8) * 255
            img = cv2.bitwise_or(img, ruido)
            _, img = cv2.threshold(img, 100, 255, cv2.THRESH_BINARY)
            X.append(normalizar(img)); y.append(d)
    return X, y


AQUI = Path(__file__).parent


class Clasificador:
    nombre = 'svm-mnist-local-v3'

    def __init__(self, semilla: int = 7):
        guardado = AQUI / 'modelo.joblib'
        if guardado.exists():
            m = joblib.load(guardado)
            if m.get('nombre') == self.nombre:
                self.modelo = m['modelo']
                return
        rng = np.random.default_rng(semilla)
        X, y = [], []
        datos = np.load(AQUI / 'mnist10k.npz')
        for im, t in zip(datos['x'], datos['y']):
            _, g = cv2.threshold(im, 80, 255, cv2.THRESH_BINARY)
            if rng.random() < 0.3:
                g = cv2.dilate(g, np.ones((2, 2), np.uint8))  # bolígrafo más grueso
            X.append(normalizar(g)); y.append(int(t))
        dig = load_digits()
        for im, t in zip(dig.images, dig.target):
            g = (im / 16.0 * 255).astype(np.uint8)
            g = cv2.resize(g, (32, 32), interpolation=cv2.INTER_CUBIC)
            _, g = cv2.threshold(g, 60, 255, cv2.THRESH_BINARY)
            X.append(normalizar(g)); y.append(t)
        Xs, ys = _sinteticos(rng)
        X += Xs; y += ys
        Xl, yl = _locales(np.random.default_rng(semilla + 100))
        X += Xl; y += yl
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            self.modelo = SVC(C=8, gamma='scale', probability=True, random_state=semilla)
            self.modelo.fit(np.array(X), np.array(y))
        joblib.dump({'nombre': self.nombre, 'modelo': self.modelo}, guardado)

    def leer(self, binaria: np.ndarray):
        """binaria: tinta = 255. Devuelve (dígito, prob, segundo, prob_segundo)."""
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            p = self.modelo.predict_proba([normalizar(binaria)])[0]
        orden = np.argsort(p)[::-1]
        return int(orden[0]), float(p[orden[0]]), int(orden[1]), float(p[orden[1]])
