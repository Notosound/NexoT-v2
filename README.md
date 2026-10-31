# NexoT v2

Plataforma para registrar simpatizantes, analizarlos por territorio, edad y sexo, y medir el cumplimiento de los líderes con los resultados E14.

Esta primera entrega es **la base de datos completa**, con sus reglas, permisos y pruebas. El panel web y el tablero del candidato se construyen encima.

## Principios

1. **La base de datos es la que manda.** Las reglas viven en Postgres (restricciones, triggers y permisos por fila), no solo en el código. Si el código tiene un error, el dato malo no entra.
2. **Una sola fuente de verdad.** Cada métrica se define una vez, como vista SQL. La web y la app leen las mismas vistas, así que no pueden mostrar números distintos.
3. **Nada se borra.** Las personas se eliminan de forma lógica (`eliminado_en`) y todo cambio queda en `auditoria`, que es de solo lectura.
4. **El candidato solo ve agregados.** No tiene acceso a la tabla de personas.

## Estructura

```
supabase/migrations/
  …0100_base.sql            organizaciones, perfiles y roles
  …0200_territorio.sql      municipio → localidad → puesto → mesa
  …0300_personas.sql        líderes, personas, edad y rango de edad
  …0400_auditoria.sql       auditoría automática e inmutable
  …0500_importaciones.sql   importación de Excel por etapas
  …0600_e14.sql             digitación E14 y cálculo de cumplimiento
  …0700_metricas.sql        vistas para tableros
  …0800_permisos.sql        permisos por fila (RLS)
  …0900_catalogo_bogota…    Bogotá y sus 20 localidades (+ alias)
  …1000_importacion_v2.sql  errores vs advertencias, formato real de los Excel
  …1100_ubicacion_reportada  puesto "Otro", direcciones, alias aprendidos; sexo y edad obligatorios
  …1200_importacion_v3.sql  la importación conserva lo reportado y ubica automáticamente
  …1300_catalogo_bogota_puestos  1.083 puestos y 18.156 mesas oficiales (generada)
datos/divipole/             CSV de Bogotá extraído del Divipole + fuente y huella
scripts/datos/              extracción del PDF y generación de la migración
src/importacion/mapeo.mjs   reconocimiento de columnas de Excel (Node y navegador)
scripts/prueba-importacion.mjs  prueba en seco de un Excel
tests/
  entorno.mjs               Postgres embebido que imita Supabase
  esquema.test.mjs          pruebas de reglas, E14, permisos, importación y catálogo
  mapeo.test.mjs            pruebas del reconocimiento de columnas
  catalogo.test.mjs         catálogo oficial: totales, localidades, mesas, coordenadas
.github/workflows/
  base-de-datos.yml         pruebas + despliegue por rama
```

## Roles

| Rol | Puede |
|---|---|
| `admin` | Todo dentro de su organización: importar, resolver E14, ver auditoría |
| `coordinador` | Ver y gestionar los líderes a su cargo y sus personas |
| `lider` | Registrar personas y ver solo las suyas |
| `digitador` | Transcribir E14. No ve personas, ni esperados, ni lo que digitó otro |
| `candidato` | Ver solo métricas agregadas (mapa, edades, sexo, avance, E14) |

Cada cliente es una `organizacion`. Ninguna organización puede ver datos de otra.

## Reglas E14

Todo se calcula **por mesa** y luego se suma hacia arriba:

- **esperados**: personas registradas en la mesa
- **confirmados**: el menor entre esperados y votos reales
- **faltantes**: esperados − confirmados
- **adicionales**: votos reales − confirmados (apoyo que no viene de los líderes)

Si varios líderes comparten una mesa, los confirmados se reparten en proporción a lo esperado, por **residuo mayor**. La suma siempre es exacta y ningún líder recibe más de lo que esperaba.

**Digitación doble** (por defecto): dos digitadores transcriben la misma mesa. Si coinciden, la mesa queda verificada. Si no, pasa a revisión y el admin la resuelve con `app.resolver_e14(eleccion, mesa, votos)`. Para usar una sola digitación, cambia la elección a `modo_digitacion = 'simple'`.

## Lugar de votación y la opción "Otro"

La consulta de la Registraduría a veces muestra el puesto con un nombre distinto al del listado oficial. Por eso el registro funciona así:

1. El votante elige localidad y busca su puesto en el **listado oficial**.
2. Si no lo encuentra, elige **"Otro"** y escribe el nombre tal como le aparece, la **dirección del puesto** (opcional) y su mesa.
3. El sistema intenta ubicarlo solo, en este orden:
   - nombre oficial exacto (sin importar tildes ni mayúsculas);
   - **alias aprendido** (ver punto 4);
   - **dirección** del puesto oficial. `Cl 46 Sur # 27-12`, `Calle 46 sur No. 27 - 12` y `cll 46 #27-12 sur` se reconocen como la misma.

   Si ninguna coincide con seguridad, la persona queda `por_revisar` y aparece en `v_ubicaciones_por_revisar`, agrupada por lo que escribieron y con una sugerencia (misma cuadra o nombre parecido).
4. El admin resuelve con `app.resolver_ubicacion(persona, puesto)`. El nombre escrito se guarda como **alias** de ese puesto y se aplica a **todas** las personas pendientes que escribieron lo mismo. Cada una conserva su mesa. La lista de nombres alternativos se construye sola con el uso.

Estado de ubicación de cada persona (`ubicacion_estado`): `completa` (puesto y mesa), `sin_mesa`, `por_revisar` o `sin_dato`. El método queda en `ubicacion_metodo`: `lista_oficial`, `nombre_oficial`, `alias`, `direccion` o `revision_admin`.

**Sexo y edad** (fecha de nacimiento o edad) son obligatorios en todo registro nuevo, y la base de datos lo exige. Solo las listas importadas pueden venir sin ellos.

## Edad

Se guarda la **fecha de nacimiento**. Si el dato solo trae la edad, se guarda `edad_declarada` junto con la fecha de captura, y la edad se va actualizando con el tiempo. Los rangos (18-24, 25-34, 35-44, 45-54, 55-64, 65+) se definen en `app.rango_edad`.

## Importar Excel

1. Se lee el Excel y cada columna se asigna a su nombre estándar con `src/importacion/mapeo.mjs`. El reconocimiento es por coincidencia **exacta** (sin tildes ni mayúsculas): `Nombre`, `Cédula`, `Celular`, `Puesto de votación`, etc. Lo que no se reconoce se reporta; no se adivina.
2. `app.validar_importacion(id)` normaliza y clasifica cada fila. Todavía no toca la tabla de personas.
   - **Errores** (la fila no entra): cédula inválida, falta el nombre, líder no encontrado, menor de edad, duplicada.
   - **Advertencias** (la persona entra con ese dato vacío): lugar de votación no encontrado, vota fuera del municipio, teléfono, sexo o fechas inválidas.
3. El admin revisa el reporte y ejecuta `app.confirmar_importacion(id)`. Cada persona queda con el archivo y la fila de donde vino. Las que quedaron sin mesa aparecen en `v_personas_por_ubicar`.

La cédula solo admite dígitos y separadores (puntos, espacios, comas). Un valor como `12345+6-` es un error: nunca se "limpia" a otra cédula.

### Prueba en seco

```bash
npm run importar:prueba -- ruta/al/archivo.xlsx
```

Valida el archivo contra una base temporal en memoria y muestra **solo conteos y tipos de problema**, sin nombres, cédulas ni teléfonos. No guarda nada.

## Ejecutar las pruebas

```bash
npm install
npm test
```

No necesitas Supabase ni internet: las pruebas corren en un Postgres embebido.

## Ramas y despliegue

| Rama | Se despliega en | Cuándo |
|---|---|---|
| `develop` | Supabase **pruebas** | Automático en cada push, si las pruebas pasan |
| `main` | Supabase **producción** | Al hacer merge de `develop` a `main`, después de que tú lo apruebes |

Forma de trabajo:
1. Trabajas en `develop` (o en una rama que luego unes a `develop`).
2. GitHub corre las pruebas y aplica las migraciones al proyecto de pruebas.
3. Revisas que todo esté bien en pruebas.
4. Abres un Pull Request de `develop` a `main`. Al unirlo, el despliegue a producción espera tu aprobación.

### Configuración (una sola vez)

En GitHub → **Settings → Secrets and variables → Actions**:

- **Secreto del repositorio** `SUPABASE_ACCESS_TOKEN`: se crea en supabase.com → Account → Access Tokens.

En GitHub → **Settings → Environments**, crea dos entornos:

- **`pruebas`**, con los secretos:
  - `SUPABASE_PROJECT_REF`: el código del proyecto de pruebas. Es lo que aparece en la URL `supabase.com/dashboard/project/<ref>`.
  - `SUPABASE_DB_PASSWORD`: la contraseña de la base de ese proyecto.
- **`produccion`**, con los mismos dos secretos pero del proyecto de producción. Activa además **Required reviewers** y ponte a ti, para que nada llegue a producción sin tu aprobación.

Recomendado: en **Settings → Branches**, protege `main` para que solo reciba cambios por Pull Request.

### Reglas

- Cada cambio a la base es un archivo **nuevo** en `supabase/migrations/`. Nunca se edita una migración que ya se aplicó.
- Las contraseñas y llaves van solo en los secretos de GitHub y Supabase, nunca en el código.

### Después del primer despliegue

Hay que cargar el catálogo territorial (municipio, localidades, puestos y mesas). El piloto ya tenía estos datos; el siguiente paso es un script que los importe.

## Pendientes

- [x] Localidades de Bogotá
- [x] Puestos y mesas de Bogotá: Divipole Congreso 2026 (ver `datos/divipole/FUENTE.md`)
- [ ] Script de migración de los datos del piloto (MongoDB → Postgres)
- [ ] Panel web: login, registro de personas, importador de Excel, digitación E14
- [ ] Tablero del candidato (PWA): mapa, pirámide de edad y sexo, avance y E14
- [ ] Simulación de campaña
- [ ] Eventos y asistencias (existían en el piloto)
