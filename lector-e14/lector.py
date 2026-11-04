#!/usr/bin/env python3
"""
Lector de E14 para NexoT.

Recorta la casilla del candidato en cada formulario E14 (PDF o imagen),
lee el número con Tesseract y produce:
  salida/lecturas.json   -> se sube en NexoT: E14 → Lecturas automáticas
  salida/recortes/*.png  -> la imagen de cada casilla (se suben junto al JSON)

Uso:
  python lector.py calibrar --e14 un_formulario.pdf --config config.json
  python lector.py leer --mesas plantilla_E14.xlsx --entrada carpeta_e14 --config config.json --salida salida
  python lector.py leer --mesas plantilla_E14.xlsx --config config.json --salida salida   (descarga con url_plantilla)

La lectura de números escritos a mano NUNCA es 100 % confiable: cada
lectura trae una confianza; las dudosas las confirma una persona en NexoT.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
POR_DEFECTO = {
    "pagina": 1,
    "caja": [0.62, 0.41, 0.80, 0.455],
    "dpi": 200,
    "patron_archivo": "{zona}_{codigo_puesto}_{mesa}",
    "extensiones": [".pdf", ".png", ".jpg", ".jpeg"],
    "url_plantilla": "",
    "pausa_segundos": 2.0,
    "umbral_tinta": 0.003,
}


def cargar_config(ruta: str | None) -> dict:
    cfg = dict(POR_DEFECTO)
    if ruta:
        cfg.update({k: v for k, v in json.loads(Path(ruta).read_text(encoding="utf-8")).items() if not k.startswith("_")})
    x0, y0, x1, y1 = cfg["caja"]
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        sys.exit("La 'caja' debe ser [x0, y0, x1, y1] con valores entre 0 y 1 (x0 < x1, y0 < y1).")
    return cfg


# ---------------------------------------------------------------------------
# Lista de mesas (la plantilla E14 que exporta NexoT, en Excel o CSV)
# ---------------------------------------------------------------------------
def _norm(t) -> str:
    t = unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"\s+", " ", t)


ALIAS = {
    "localidad": {"localidad"},
    "zona": {"zona", "codigo zona", "cod zona"},
    "codigo_puesto": {"codigo puesto", "codigo de puesto", "cod puesto", "pp"},
    "puesto": {"puesto", "puesto de votacion", "nombre puesto"},
    "mesa": {"mesa", "numero de mesa", "no mesa"},
}


def leer_mesas(ruta: str) -> list[dict]:
    p = Path(ruta)
    if p.suffix.lower() == ".csv":
        with p.open(encoding="utf-8-sig") as f:
            filas = list(csv.reader(f))
    else:
        import openpyxl
        hoja = openpyxl.load_workbook(p, read_only=True, data_only=True).worksheets[0]
        filas = [[c for c in fila] for fila in hoja.iter_rows(values_only=True)]
    inicio = next((i for i, f in enumerate(filas) if sum(1 for c in f if c not in (None, "")) >= 3), None)
    if inicio is None:
        sys.exit("La lista de mesas está vacía.")
    columnas = {}
    for j, h in enumerate(filas[inicio]):
        for campo, alias in ALIAS.items():
            if _norm(h) in alias and campo not in columnas:
                columnas[campo] = j
    faltan = [c for c in ("zona", "codigo_puesto", "mesa") if c not in columnas]
    if faltan:
        sys.exit(f"A la lista de mesas le faltan columnas: {', '.join(faltan)}. Usa la plantilla E14 que descarga NexoT.")
    mesas = []
    for f in filas[inicio + 1:]:
        d = {c: ("" if j >= len(f) or f[j] is None else str(f[j]).strip()) for c, j in columnas.items()}
        if d.get("mesa"):
            d["zona"] = codigo(d["zona"]); d["codigo_puesto"] = codigo(d["codigo_puesto"])
            d["mesa"] = str(int(float(d["mesa"])))
            mesas.append(d)
    return mesas


def codigo(t: str) -> str:
    """Mismo criterio que NexoT: '4' → '04', ' b4 ' → 'B4'."""
    v = re.sub(r"\s", "", str(t or "")).upper()
    if v.endswith(".0"):
        v = v[:-2]
    return v.zfill(2) if v.isdigit() and len(v) <= 3 else v


# ---------------------------------------------------------------------------
# Imagen: abrir el E14 y recortar la casilla
# ---------------------------------------------------------------------------
def abrir_pagina(ruta: Path, pagina: int, dpi: int) -> np.ndarray:
    if ruta.suffix.lower() == ".pdf":
        import pymupdf
        with pymupdf.open(ruta) as doc:
            if pagina > doc.page_count:
                raise ValueError(f"el PDF tiene {doc.page_count} páginas, se pidió la {pagina}")
            pix = doc[pagina - 1].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
            return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()
    img = cv2.imread(str(ruta), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError("no se pudo abrir la imagen")
    return img


def recortar(img: np.ndarray, caja) -> np.ndarray:
    h, w = img.shape[:2]
    x0, y0, x1, y1 = caja
    return img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)].copy()


def limpiar(recorte: np.ndarray) -> np.ndarray:
    """Agranda, binariza y borra las líneas de la cuadrícula del formulario."""
    g = cv2.resize(recorte, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    g = cv2.GaussianBlur(g, (3, 3), 0)
    b = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    for tam in ((max(25, b.shape[1] // 3), 1), (1, max(25, b.shape[0] // 2))):
        lineas = cv2.morphologyEx(b, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, tam))
        b = cv2.subtract(b, lineas)
    b = cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # Borra lo que toca el borde (restos de la cuadrícula) y las manchas pequeñas
    n, etiquetas, stats, _ = cv2.connectedComponentsWithStats(b, 8)
    alto, ancho = b.shape
    minimo = max(30, int(alto * ancho * 0.0008))
    limpia = np.zeros_like(b)
    for k in range(1, n):
        x, y, w, h, area = stats[k]
        toca_borde = x <= 2 or y <= 2 or x + w >= ancho - 2 or y + h >= alto - 2
        es_linea = (w > ancho * 0.6 and h < alto * 0.12) or (h > alto * 0.85 and w < ancho * 0.05)
        if area >= minimo and not es_linea and not (toca_borde and (h > alto * 0.7 or w > ancho * 0.5 or area < minimo * 4)):
            limpia[etiquetas == k] = 255
    return 255 - limpia  # texto negro sobre blanco para Tesseract


def tinta(limpia: np.ndarray) -> float:
    return float((limpia < 128).mean())


# ---------------------------------------------------------------------------
# Lectura con Tesseract (dos pasadas distintas para medir la duda)
# ---------------------------------------------------------------------------
def tesseract(img: np.ndarray, psm: int) -> tuple[str, float]:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as t:
        cv2.imwrite(t.name, cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255))
        ruta = t.name
    try:
        r = subprocess.run(["tesseract", ruta, "stdout", "--psm", str(psm), "-c", "tessedit_char_whitelist=0123456789", "tsv"],
                           capture_output=True, text=True, timeout=30)
    finally:
        Path(ruta).unlink(missing_ok=True)
    texto, confs = "", []
    for linea in r.stdout.splitlines()[1:]:
        c = linea.split("\t")
        if len(c) >= 12 and c[11].strip():
            texto += re.sub(r"\D", "", c[11])
            try:
                confs.append(float(c[10]))
            except ValueError:
                pass
    return texto, (min(confs) / 100 if confs else 0.0)


@dataclass
class Lectura:
    votos: int | None
    alternativa: int | None
    confianza: float
    metodo: str
    nota: str = ""


def leer_numero(recorte: np.ndarray, umbral_tinta: float) -> Lectura:
    """Tres lecturas independientes (dos limpiezas de imagen y dos modos de
    Tesseract). Es clara si coinciden y Tesseract está seguro; si no, se
    marca para que una persona la confirme mirando el recorte."""
    limpia = limpiar(recorte)
    if tinta(limpia) < umbral_tinta:
        return Lectura(None, None, 0.0, "sin_tinta", "casilla vacía o tachada")
    g = cv2.resize(recorte, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    _, otsu = cv2.threshold(cv2.GaussianBlur(g, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    pasadas = [tesseract(limpia, 7), tesseract(limpia, 6), tesseract(otsu, 7)]
    lecturas = [(int(t), c) for t, c in pasadas if t and len(t) <= 3]
    if not lecturas:
        return Lectura(None, None, 0.0, "tesseract", "no se reconoció un número")
    cuenta: dict[int, list[float]] = {}
    for v, c in lecturas:
        cuenta.setdefault(v, []).append(c)
    orden = sorted(cuenta.items(), key=lambda kv: (len(kv[1]), max(kv[1])), reverse=True)
    principal, confs = orden[0]
    alternativa = orden[1][0] if len(orden) > 1 else None
    if len(confs) == 3:
        return Lectura(principal, None, round(max(confs), 3), "tesseract_3de3")
    if len(confs) == 2:
        # Dos coinciden: clara solo si una de ellas es muy segura y la tercera no leyó otra cosa
        conf = round(max(confs), 3) if alternativa is None else round(min(max(confs), 0.75), 3)
        return Lectura(principal, alternativa, conf, "tesseract_2de3", "" if alternativa is None else "una lectura distinta")
    return Lectura(principal, alternativa, round(min(max(confs), 0.5), 3), "tesseract_desacuerdo", "las lecturas no coinciden")


# ---------------------------------------------------------------------------
# Comandos
# ---------------------------------------------------------------------------
def buscar_archivo(carpeta: Path, mesa: dict, cfg: dict) -> Path | None:
    base = cfg["patron_archivo"].format(**{k: mesa.get(k, "") for k in ("zona", "codigo_puesto", "mesa", "localidad", "puesto")})
    for ext in cfg["extensiones"]:
        p = carpeta / f"{base}{ext}"
        if p.exists():
            return p
    return None


def descargar(mesa: dict, cfg: dict, destino: Path) -> Path | None:
    """Descarga desde 'url_plantilla' (el portal cambia en cada elección: se configura)."""
    url = cfg["url_plantilla"].format(**{k: mesa.get(k, "") for k in ("zona", "codigo_puesto", "mesa")})
    nombre = cfg["patron_archivo"].format(**{k: mesa.get(k, "") for k in ("zona", "codigo_puesto", "mesa", "localidad", "puesto")})
    ext = Path(url.split("?")[0]).suffix or ".pdf"
    archivo = destino / f"{nombre}{ext}"
    if archivo.exists():
        return archivo
    req = urllib.request.Request(url, headers={"User-Agent": "NexoT-lector-E14/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r, archivo.open("wb") as f:
            shutil.copyfileobj(r, f)
    except Exception as e:  # noqa: BLE001
        print(f"  ! no se pudo descargar {url}: {e}")
        return None
    finally:
        time.sleep(float(cfg["pausa_segundos"]))  # sin afán: no saturar el portal
    return archivo


def cmd_calibrar(a):
    cfg = cargar_config(a.config)
    img = abrir_pagina(Path(a.e14), cfg["pagina"], cfg["dpi"])
    h, w = img.shape
    x0, y0, x1, y1 = cfg["caja"]
    color = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    cv2.rectangle(color, (int(x0 * w), int(y0 * h)), (int(x1 * w), int(y1 * h)), (0, 0, 255), max(2, w // 400))
    salida = Path(a.salida or "calibracion")
    salida.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(salida / "pagina_con_caja.png"), color)
    rec = recortar(img, cfg["caja"])
    cv2.imwrite(str(salida / "recorte.png"), rec)
    cv2.imwrite(str(salida / "recorte_limpio.png"), limpiar(rec))
    l = leer_numero(rec, cfg["umbral_tinta"])
    print(f"Página de {w}x{h} px. Revisa {salida}/pagina_con_caja.png: el rectángulo rojo debe encerrar SOLO la casilla del candidato.")
    print(f"Lectura de prueba: {asdict(l)}")


def cmd_leer(a):
    cfg = cargar_config(a.config)
    mesas = leer_mesas(a.mesas)
    salida = Path(a.salida); (salida / "recortes").mkdir(parents=True, exist_ok=True)
    entrada = Path(a.entrada) if a.entrada else None
    if not entrada and not cfg["url_plantilla"]:
        sys.exit("Indica --entrada (carpeta con los E14) o configura 'url_plantilla' para descargarlos.")
    descargas = salida / "e14"; descargas.mkdir(exist_ok=True)
    items, resumen = [], {"automaticas": 0, "dudosas": 0, "sin_archivo": 0, "errores": 0}
    for i, m in enumerate(mesas, 1):
        archivo = buscar_archivo(entrada, m, cfg) if entrada else descargar(m, cfg, descargas)
        clave = f"{m['zona']}-{m['codigo_puesto']}-{m['mesa']}"
        if not archivo:
            resumen["sin_archivo"] += 1
            continue
        try:
            rec = recortar(abrir_pagina(archivo, cfg["pagina"], cfg["dpi"]), cfg["caja"])
            l = leer_numero(rec, cfg["umbral_tinta"])
        except Exception as e:  # noqa: BLE001
            print(f"  ! {clave}: {e}")
            resumen["errores"] += 1
            continue
        nombre_rec = f"{clave}.png"
        cv2.imwrite(str(salida / "recortes" / nombre_rec), rec)
        clara = l.votos is not None and l.confianza >= a.umbral and l.alternativa is None
        resumen["automaticas" if clara else "dudosas"] += 1
        items.append({"localidad": m.get("localidad", ""), "zona": m["zona"], "codigo_puesto": m["codigo_puesto"], "puesto": m.get("puesto", ""),
                      "mesa": m["mesa"], "votos": "" if l.votos is None else str(l.votos), "alternativa": "" if l.alternativa is None else str(l.alternativa),
                      "confianza": f"{l.confianza:.3f}", "metodo": l.metodo, "nota": l.nota, "documento_url": archivo.name, "recorte": nombre_rec})
        if i % 50 == 0:
            print(f"  {i}/{len(mesas)} mesas…")
    (salida / "lecturas.json").write_text(json.dumps({"generado": time.strftime("%Y-%m-%d %H:%M"), "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Listo: {len(items)} lecturas ({resumen['automaticas']} claras, {resumen['dudosas']} para revisar), "
          f"{resumen['sin_archivo']} mesas sin E14, {resumen['errores']} con error.")
    print(f"Sube {salida}/lecturas.json y la carpeta {salida}/recortes en NexoT → E14 → Lecturas automáticas.")


def main(argv=None):
    p = argparse.ArgumentParser(description="Lector de E14 para NexoT")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("calibrar", help="dibuja la caja sobre un E14 para ajustarla")
    c.add_argument("--e14", required=True); c.add_argument("--config"); c.add_argument("--salida")
    l = sub.add_parser("leer", help="lee todas las mesas de la lista")
    l.add_argument("--mesas", required=True, help="plantilla E14 de NexoT (Excel o CSV)")
    l.add_argument("--entrada", help="carpeta con los E14 ya descargados")
    l.add_argument("--config"); l.add_argument("--salida", default="salida")
    l.add_argument("--umbral", type=float, default=0.90, help="confianza mínima para una lectura clara")
    a = p.parse_args(argv)
    if not shutil.which("tesseract"):
        sys.exit("Falta Tesseract. Instálalo: Windows https://github.com/UB-Mannheim/tesseract/wiki · Mac: brew install tesseract · Linux: apt install tesseract-ocr")
    {"calibrar": cmd_calibrar, "leer": cmd_leer}[a.cmd](a)


if __name__ == "__main__":
    main()
