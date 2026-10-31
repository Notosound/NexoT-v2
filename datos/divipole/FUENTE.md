# Fuente del catálogo de puestos y mesas

- **Documento:** DIVIPOLE definitiva — Elecciones Congreso y Presidente 2026
- **Entidad:** Registraduría Nacional del Estado Civil, Dirección de Gestión Electoral
- **Fecha de corte:** 30/01/2026
- **URL:** https://registraduria.gov.co/IMG/pdf/Divipole_definitiva_%20Elecciones_Congreso_2026_GEO_CITREP_Exterior_L_V_v5.pdf
- **Archivo:** 323 páginas, SHA-256 `90dbd2571cc19a9293e1ba67d1a41c8d565714d398fe20babbeb3b15e2773ba1`
- **Bogotá:** páginas 126–152, código de departamento 16

## Cómo se generó

```bash
python scripts/datos/extraer_bogota.py divipole.pdf bogota_crudo.csv
python scripts/datos/generar_puestos_bogota.py bogota_crudo.csv datos/divipole/bogota_congreso_2026.csv supabase/migrations/<nueva>.sql
```

Para una elección futura con un Divipole nuevo, se repite el proceso y se genera una migración **nueva**. Nunca se edita la anterior.

## Puestos con localidad inferida

El Divipole no trae localidad para estos puestos (zona 90 = puesto censo, zona 98 = cárceles). Se les asignó la localidad mayoritaria de sus 7 puestos más cercanos, y quedan marcados con `localidad_inferida = true`:

| Puesto | Localidad asignada |
|---|---|
| PUESTO CENSO (FERIA EXPOSICION), Corferias | Teusaquillo |
| PENITENCIARIA LA PICOTA | Rafael Uribe Uribe |
| CARCEL DISTRITAL JUDICIAL MODELO | Puente Aranda |
| RECLUSION DE MUJERES EL BUEN PASTOR | Barrios Unidos |
| CARCEL DISTRITAL | Antonio Nariño (ambigua: limita con San Cristóbal y Santa Fe) |
