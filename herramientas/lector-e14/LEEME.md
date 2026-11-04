# Lector de E14

Lee automáticamente los votos del candidato en los formularios E14 y prepara
un archivo para subir a NexoT. Idea rescatada del piloto: la máquina lee lo
claro, y lo dudoso lo revisa una persona **viendo el recorte de la imagen**.

## Cómo encaja con NexoT

- Cada lectura **clara** cuenta como **la primera digitación** de la mesa.
  Una persona digita la segunda (sin ver lo que leyó la máquina): si coinciden,
  la mesa queda verificada; si no, pasa a revisión del administrador.
- Las lecturas **dudosas** no cuentan solas: entran a la cola
  **E14 → Lectura automática**, donde el digitador ve el recorte en grande y escribe el número.
- Las mesas con simpatizantes de la campaña aparecen primero.

## Pasos

1. Instalar (una vez): `pip install -r requirements.txt` y tener `pdftoppm` (poppler).
2. **Descargar** los E14 publicados (ver instrucciones dentro de `descargar.py`):
   `python3 descargar.py --lista e14_urls.csv --destino e14/`
3. **Calibrar** con un formulario real de esa elección: dónde está la casilla del candidato.
   Copia `calibracion.ejemplo.json` a `calibracion.json` y prueba:
   `python3 lector.py --calibrar e14/Z01_P01_M1.pdf --calibracion calibracion.json --salida prueba/`
   Mira `prueba/calibracion_pagina.png` (rectángulo rojo) y ajusta `x`, `y`, `ancho`, `alto`
   (fracciones de la página) hasta que el rectángulo cubra exactamente las casillas de los votos.
4. **Leer** todos: `python3 lector.py --documentos e14/ --manifiesto e14/manifiesto.csv --calibracion calibracion.json --salida resultado/`
5. **Subir** a NexoT: E14 → Lectura automática → *Subir lecturas del lector*: elige `resultado/lecturas.csv`
   y todas las imágenes de `resultado/recortes/`.

## Qué tan bien lee

El clasificador se entrena con 10.000 dígitos manuscritos de MNIST, los de
scikit-learn y las formas locales (1 con banderita, 7 cruzado, 4 abierto).
En formularios de prueba generados (`pruebas/`) leyó bien entre el 56 % y el 59 % de las mesas;
de las que dio por **claras**, entre el 91 % y el 96 % estaba bien (por eso una persona siempre digita la segunda vez). Con E14 reales hay que
medirlo de nuevo con una muestra y ajustar `umbral` en la calibración: subirlo
manda más mesas a revisión humana y reduce errores.

**Nunca se publica un resultado solo con la lectura automática.**

## Pruebas

    python3 pruebas/generar_e14_falsos.py /tmp/e14f 120
    python3 lector.py --documentos /tmp/e14f --calibracion calibracion.ejemplo.json --salida /tmp/e14r
    python3 pruebas/evaluar.py /tmp/e14f/verdad.csv /tmp/e14r/lecturas.csv

## Datos de entrenamiento

`mnist10k.npz`: 10.000 dígitos de MNIST (Y. LeCun, C. Cortes, C. Burges; CC BY-SA 3.0),
tomados del paquete npm `mnist` (MIT).
