"""Genera E14 de mentira (formulario con cuadrícula y un número escrito
en la casilla del candidato) para probar el lector. No son E14 reales."""
import random, sys
from pathlib import Path
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

FUENTES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/freefont/FreeSansOblique.ttf",
           "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
W, H = 1700, 2200            # carta a 200 dpi
CAJA = (0.62, 0.41, 0.80, 0.455)

def pagina(votos, semilla):
    r = random.Random(semilla)
    img = Image.new("L", (W, H), 245)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FUENTES[0], 30)
    d.text((120, 120), "FORMULARIO E-14  (DOCUMENTO DE PRUEBA)", fill=20, font=f)
    for i in range(30):  # tabla de candidatos
        y = 600 + i * 100
        d.line([(120, y), (W - 120, y)], fill=40, width=3)
        d.text((140, y + 30), f"{100 + i}  CANDIDATO {i}", fill=30, font=ImageFont.truetype(FUENTES[0], 26))
    for x in (120, int(CAJA[0] * W), int(CAJA[2] * W), W - 120):
        d.line([(x, 600), (x, H - 100)], fill=40, width=3)
    # número "a mano" en la casilla (fila del candidato 105)
    x0, y0 = int(CAJA[0] * W) + r.randint(25, 80), int(CAJA[1] * H) + r.randint(8, 20)
    capa = Image.new("L", (300, 140), 0)
    ImageDraw.Draw(capa).text((10, 5), str(votos), fill=255, font=ImageFont.truetype(r.choice(FUENTES), r.randint(58, 72)))
    capa = capa.rotate(r.uniform(-7, 7), resample=Image.BICUBIC, expand=False)
    tinta = Image.new("L", capa.size, r.randint(10, 60))
    img.paste(tinta, (x0, y0), capa)
    a = np.array(img).astype(np.float32)
    a += np.random.default_rng(semilla).normal(0, r.uniform(4, 14), a.shape)       # ruido de escáner
    a = cv2.GaussianBlur(np.clip(a, 0, 255).astype(np.uint8), (0, 0), r.uniform(0.4, 1.4))
    M = cv2.getRotationMatrix2D((W / 2, H / 2), r.uniform(-0.6, 0.6), 1.0)          # hoja un poco torcida
    return cv2.warpAffine(a, M, (W, H), borderValue=245)

if __name__ == "__main__":
    salida = Path(sys.argv[1] if len(sys.argv) > 1 else "pruebas/e14_falsos"); salida.mkdir(parents=True, exist_ok=True)
    rnd = random.Random(7)
    filas = ["Localidad,Zona,Código puesto,Puesto,Mesa"]
    verdad = {}
    for mesa in range(1, 41):
        votos = rnd.choice([0, 3, 7, 12, 18, 23, 31, 46, 58, 64, 75, 89, 104, 117, 9, 41])
        img = pagina(votos, mesa)
        nombre = f"01_01_{mesa}"
        if mesa % 10 == 0:   # algunos en PDF
            import pymupdf
            ok, png = cv2.imencode(".png", img)
            doc = pymupdf.open(); pag = doc.new_page(width=612, height=792); pag.insert_image(pag.rect, stream=png.tobytes()); doc.save(salida / f"{nombre}.pdf")
        else:
            cv2.imwrite(str(salida / f"{nombre}.png"), img)
        filas.append(f"Usaquén,01,01,PUESTO DE PRUEBA,{mesa}")
        verdad[str(mesa)] = votos
    (salida / "mesas.csv").write_text("\n".join(filas), encoding="utf-8")
    import json; (salida / "verdad.json").write_text(json.dumps(verdad))
    print(f"{len(verdad)} E14 de prueba en {salida}")
