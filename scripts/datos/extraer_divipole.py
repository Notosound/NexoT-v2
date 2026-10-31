"""Extrae todas las tablas del PDF del Divipole a un CSV crudo.

No interpreta columnas: guarda cada fila tal cual con su página, para
procesarla después con reglas revisables. Además escribe un archivo de
inspección con el texto de las primeras páginas y conteos.

Uso: python extraer_divipole.py divipole.pdf salida_dir
"""
import csv
import hashlib
import sys
from pathlib import Path

import pdfplumber

pdf_path, salida = Path(sys.argv[1]), Path(sys.argv[2])
salida.mkdir(parents=True, exist_ok=True)

sha = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
filas_totales = 0
paginas_sin_tabla = []

with pdfplumber.open(pdf_path) as pdf, \
     open(salida / "divipole_crudo.csv", "w", newline="", encoding="utf-8") as f_csv, \
     open(salida / "inspeccion.txt", "w", encoding="utf-8") as f_insp:
    w = csv.writer(f_csv)
    w.writerow(["pagina", "fila", "celdas..."])
    f_insp.write(f"archivo: {pdf_path.name}\nsha256: {sha}\npaginas: {len(pdf.pages)}\n\n")

    for i, page in enumerate(pdf.pages, start=1):
        if i <= 3 or i == len(pdf.pages):
            f_insp.write(f"===== TEXTO PÁGINA {i} =====\n{(page.extract_text() or '')[:4000]}\n\n")
        tablas = page.extract_tables()
        if not tablas:
            # Respaldo: tabla por alineación de texto
            tablas = page.extract_tables({"vertical_strategy": "text", "horizontal_strategy": "text"})
        if not tablas:
            paginas_sin_tabla.append(i)
            continue
        for t in tablas:
            for j, fila in enumerate(t):
                celdas = [(c or "").replace("\n", " ").strip() for c in fila]
                if any(celdas):
                    w.writerow([i, j, *celdas])
                    filas_totales += 1
        if i <= 3:
            f_insp.write(f"===== TABLAS PÁGINA {i} (primeras filas) =====\n")
            for t in tablas:
                for fila in t[:8]:
                    f_insp.write(" | ".join((c or "").replace("\n", " ") for c in fila) + "\n")
            f_insp.write("\n")

    f_insp.write(f"filas extraídas: {filas_totales}\n")
    f_insp.write(f"páginas sin tabla: {paginas_sin_tabla[:50]}{' …' if len(paginas_sin_tabla) > 50 else ''}\n")

print(f"OK: {filas_totales} filas, {len(paginas_sin_tabla)} páginas sin tabla")
