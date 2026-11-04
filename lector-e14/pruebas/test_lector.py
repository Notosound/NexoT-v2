"""Prueba de punta a punta del lector con E14 de mentira.
   python -m unittest pruebas/test_lector.py   (desde la carpeta lector-e14)"""
import json, subprocess, sys, tempfile, unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent

class Lector(unittest.TestCase):
    def test_lee_y_marca_las_dudosas(self):
        with tempfile.TemporaryDirectory() as tmp:
            e14 = Path(tmp) / "e14"; sal = Path(tmp) / "salida"
            subprocess.run([sys.executable, str(AQUI / "pruebas/generar_e14.py"), str(e14)], check=True, cwd=AQUI)
            subprocess.run([sys.executable, str(AQUI / "lector.py"), "leer", "--mesas", str(e14 / "mesas.csv"), "--entrada", str(e14),
                            "--config", str(AQUI / "config.ejemplo.json"), "--salida", str(sal)], check=True, cwd=AQUI)
            verdad = json.loads((e14 / "verdad.json").read_text())
            items = json.loads((sal / "lecturas.json").read_text())["items"]
            self.assertEqual(len(items), len(verdad))
            claras = [i for i in items if i["votos"] and float(i["confianza"]) >= 0.9 and not i["alternativa"]]
            errores_claros = [i for i in claras if int(i["votos"]) != verdad[i["mesa"]]]
            aciertos = sum(1 for i in items if i["votos"] and int(i["votos"]) == verdad[i["mesa"]])
            print(f"\n  {len(claras)} claras, {len(items) - len(claras)} para revisar, {aciertos}/{len(items)} aciertos, {len(errores_claros)} errores entre las claras")
            self.assertTrue(all((sal / "recortes" / i["recorte"]).exists() for i in items))
            # Lo importante: lo que se marca como claro casi nunca está mal
            self.assertLessEqual(len(errores_claros), max(1, len(claras) // 20))
            self.assertGreaterEqual(aciertos, len(items) * 0.6)

if __name__ == "__main__":
    unittest.main()
