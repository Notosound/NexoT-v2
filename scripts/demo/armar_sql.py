#!/usr/bin/env python3
"""Arma scripts/demo/cargar_demo.sql con las lecturas del ejemplo de E14."""
import json
from pathlib import Path
aqui = Path(__file__).parent
lect = json.loads((aqui / 'lecturas_demo.json').read_text())
sql = (aqui / 'plantilla_demo.sql').read_text().replace('__LECTURAS__', json.dumps(lect, ensure_ascii=False))
(aqui / 'cargar_demo.sql').write_text(sql)
print('scripts/demo/cargar_demo.sql listo')
