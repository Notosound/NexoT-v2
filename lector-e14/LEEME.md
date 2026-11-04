# Lector de E14 para NexoT

Programa que corre **en tu computador** (no en la plataforma): toma los
formularios E14 (PDF o imagen), recorta la casilla del candidato, lee el
número y deja todo listo para subirlo a NexoT. Es la idea del piloto, más
ordenada:

- **Lectura clara** → entra a NexoT como *primera digitación*. Una persona
  digita la segunda sin ver lo que leyó la máquina; si coinciden, la mesa
  queda verificada.
- **Lectura dudosa** (poca confianza, dos números posibles o casilla
  ilegible) → va a la *cola de revisión*: el digitador ve el recorte y
  escribe el número.

> Leer números escritos a mano **nunca** es 100 % confiable. Por eso nada
> queda verificado solo con la máquina.

## 1. Instalar (una vez)

1. Python 3.10 o más nuevo.
2. Tesseract: Windows: https://github.com/UB-Mannheim/tesseract/wiki ·
   Mac: `brew install tesseract` · Linux: `sudo apt install tesseract-ocr`
3. En esta carpeta: `pip install -r requirements.txt`

## 2. Preparar

1. En NexoT → **E14 → Elecciones**, descarga la **plantilla de mesas**
   (mejor la de *mesas con simpatizantes*: son las que importan).
2. Consigue los E14:
   - **Opción A (recomendada):** descárgalos del portal de la Registraduría
     y guárdalos en una carpeta con nombres `ZONA_PUESTO_MESA.pdf`
     (por ejemplo `01_04_12.pdf`). El patrón se cambia en `config.json`.
   - **Opción B:** si el portal publica cada E14 en una dirección fija,
     pon esa dirección en `url_plantilla` con `{zona}`, `{codigo_puesto}` y
     `{mesa}`. El lector los baja **despacio** (`pausa_segundos`) para no
     saturar el portal. El portal cambia en cada elección: hay que
     revisarlo cuando se publiquen los E14.
3. Copia `config.ejemplo.json` como `config.json`.

## 3. Calibrar la casilla (una vez por elección)

```
python lector.py calibrar --e14 carpeta_e14/01_04_12.pdf --config config.json
```

Abre `calibracion/pagina_con_caja.png`: el rectángulo rojo debe encerrar
**solo** la casilla de votos del candidato. Si no, ajusta `caja`
(`[izquierda, arriba, derecha, abajo]` en fracciones de la página, de 0 a 1)
y repite. `recorte_limpio.png` muestra lo que ve el lector.

## 4. Leer todas las mesas

```
python lector.py leer --mesas plantilla_E14.xlsx --entrada carpeta_e14 --config config.json --salida salida
```

Queda `salida/lecturas.json` y la carpeta `salida/recortes/`.

## 5. Subir a NexoT

NexoT → **E14 → Lecturas automáticas** → elige la elección, el archivo
`lecturas.json` y **todas** las imágenes de `salida/recortes/`. Las claras
quedan como primera digitación y las dudosas en la cola de revisión.

## Prueba

`python -m unittest pruebas/test_lector.py` genera 40 E14 **de mentira** y
verifica que entre las lecturas marcadas como claras casi no haya errores.
