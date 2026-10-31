import sys, csv, pdfplumber
pdf_path, salida = sys.argv[1], sys.argv[2]
n = 0; paginas_bog = set(); raros = 0
with pdfplumber.open(pdf_path) as pdf, open(salida, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    for i, page in enumerate(pdf.pages, 1):
        txt = page.extract_text() or ""
        if "BOGOTA" not in txt.upper() and "BOGOTÁ" not in txt.upper():
            continue
        for t in page.extract_tables():
            for r in t:
                c = [(x or "").replace("\n", " ").strip() for x in r]
                if len(c) >= 15 and c[0] == "16":
                    w.writerow([i] + c); n += 1; paginas_bog.add(i)
                elif len(c) >= 15 and any("BOGOT" in x.upper() for x in c):
                    raros += 1; w.writerow([i, "RARO"] + c)
print("filas Bogotá:", n, "| filas raras:", raros, "| páginas:", min(paginas_bog), "-", max(paginas_bog), len(paginas_bog))
