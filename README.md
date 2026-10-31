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
tests/
  entorno.mjs               Postgres embebido que imita Supabase
  esquema.test.mjs          23 pruebas de reglas, E14, permisos e importación
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

## Edad

Se guarda la **fecha de nacimiento**. Si el dato solo trae la edad, se guarda `edad_declarada` junto con la fecha de captura, y la edad se va actualizando con el tiempo. Los rangos (18-24, 25-34, 35-44, 45-54, 55-64, 65+) se definen en `app.rango_edad`.

## Importar Excel

1. El navegador lee el Excel, asigna cada columna a su nombre estándar (`cedula`, `nombres`, `apellidos`, `sexo`, `fecha_nacimiento`, `edad`, `telefono`, `barrio`, `localidad`, `puesto`, `mesa`, `lider_cedula`) e inserta las filas en `importacion_filas`.
2. `app.validar_importacion(id)` normaliza los datos (tildes, mayúsculas, "F"/"mujer", "+57", fechas dd/mm/aaaa) y marca errores y duplicados. Todavía no toca la tabla de personas.
3. El admin revisa el reporte y ejecuta `app.confirmar_importacion(id)`. Solo entran las filas válidas, y cada persona queda con el archivo y la fila de donde vino.

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

- [ ] Script de carga del catálogo territorial de Bogotá
- [ ] Script de migración de los datos del piloto (MongoDB → Postgres)
- [ ] Panel web: login, registro de personas, importador de Excel, digitación E14
- [ ] Tablero del candidato (PWA): mapa, pirámide de edad y sexo, avance y E14
- [ ] Simulación de campaña
- [ ] Eventos y asistencias (existían en el piloto)
