# Arquitectura · Cotizador Ceven

## Visión general

La app es una **SPA sin framework y sin build**: JavaScript "vanilla" con funciones y variables globales (`var`), manipulación directa del DOM y `onclick` inline en el HTML. No usa ES modules — los archivos de `js/` se cargan con `<script src>` clásicos y comparten el scope global.

Fue reestructurada desde dos HTML monolíticos (`index.html` de 7.365 líneas y `CevenCareV2.html` de 2.627 líneas; la carpeta legacy que los contenía ya fue eliminada). La extracción fue **por rangos contiguos de líneas**, sin reordenar código, para preservar exactamente el comportamiento.

## ⚠️ El orden de carga importa

Los `<script>` en `src/index.html` replican el orden del monolito original. Hay código que se **ejecuta al cargar** (IIFEs, listeners, `renderQ()` inicial) y depende de que los archivos anteriores ya estén cargados. **No reordenar los tags de script ni mover funciones entre archivos sin revisar dependencias.**

Orden en `index.html`:

| # | Posición en el documento | Archivo | Contenido |
|---|---|---|---|
| 1 | `<head>` | CDNs (xlsx, html2canvas, jsPDF) + `css/base.css` + `css/dark.css` | |
| 2 | después del markup de login | `js/config.js` | Credenciales Supabase, dominio, admin, `APP_VERSION` |
| 3 | ídem | `js/auth.js` | Login GoTrue por REST, sesión con refresh, roles y permisos, gestión de usuarios (Edge Function). Al final se auto-ejecuta: si hay sesión válida muestra la app |
| 4 | después de todo el markup de la app | `js/sync.js` | Capa de sincronización con Supabase (IIFE). Si `SUPABASE_URL` está vacío se desactiva y la app corre 100% local |
| 5–22 | ídem | módulos de la app (tabla siguiente) | |
| 23 | después del zócalo de versión | `js/init.js` | Pinta versión y sincroniza el ícono de dark mode |

Módulos de la app (5–22), en orden de carga:

| Archivo | Responsabilidad |
|---|---|
| `state.js` | Variables globales (`products`, `items`, `warrantyItems`…), dark mode, constantes `NAC_DEF`, `MODEL_CATEGORY`, `IVA_MAP`, `COLS`, migraciones de tasas NAC, chequeo de recuperación de datos al arrancar, contador `qNum` |
| `utils.js` | Logo (claro/oscuro), navegación `goTo()`, formateadores `fI`/`fD`/`dp`, margen global, `calcP()` (fórmula de precio), `getNac()` (matching de % nacionalización), `getIVA()`, mes de cierre |
| `catalog.js` | Carga de price list (Excel/CSV), actualización de precios, limpieza de SKUs LL/A y E/A, búsqueda (incl. pegado masivo de SKUs), render del catálogo, `addToQuote()` |
| `quote.js` | Render de la cotización (`renderQ`), orden por familia, qty/margen/precio por ítem, modal de edición de ítem |
| `nac.js` | Página de % nacionalización global + overrides por cotización + diagnóstico |
| `products.js` | Alta/edición/baja de artículos manuales del price list |
| `quotes-db.js` | Persistencia de cotizaciones en `cquotes` (guardar/sobrescribir, nueva, copiar, editar desde historial, export Excel) |
| `pipeline-data.js` | Storage del pipeline (`cpipeline`) y archivo mensual (`carchive`), `archiveOldEntries()` |
| `backup.js` | Snapshot completo de la app, export/import de backup JSON, autosnapshot |
| `pipeline-core.js` | `categorize()` (familia de cada ítem), `addToPipeline()`, limpieza de filtros |
| `archive-view.js` | Render de meses archivados, restaurar/mover entradas |
| `pipeline-view.js` | Filtros, orden, dashboard KPI y render de la tabla del pipeline |
| `pipeline-detail.js` | Fila expandible por cotización: estado/mes/OV por SKU, entregas parciales (filas virtuales, merge y disolución de grupos), export Excel del pipeline |
| `backup-folder.js` | Backup automático a carpeta (File System Access API + IndexedDB para persistir el handle) |
| `history.js` | Historial de cotizaciones: filtros, selección, borrado |
| `pdf.js` | Generación de PDF (html2canvas + jsPDF) de la cotización actual y de seleccionadas |
| `warranties.js` | Garantías CevenCare: render, integración por `postMessage`, sugerencia automática de garantía para Macs (tabla `MAC_WARRANTIES_3Y`), modal Cliente Final/Canal. **Acá corre el init** (`renderQ()`, defaults de fecha/pago) |
| `undo.js` | Deshacer cambios de estado/fecha del pipeline |
| `target.js` | Modal Target Anual (objetivo de facturación, valores manuales por mes) y dashboard por SKU |

`cevencare.html` + `js/cevencare.js` + `css/cevencare.css` son una mini-app aparte (sin Supabase): cotiza garantías por dispositivo/canal y envía los ítems elegidos al cotizador con `postMessage({type:'cevencare-add-warranty', items})`; `warranties.js` los recibe y los suma a `warrantyItems`.

## Flujo de datos

```
UI (DOM) ⇄ variables globales (items, products, …)
              ⇅ (en cada guardado)
        localStorage  ←— fuente de verdad local
              ⇅
        js/sync.js  ←— intercepta Storage.prototype.setItem (debounce 350 ms)
              ⇅ REST (PostgREST, apikey = anon key)
        Supabase: tabla `pipeline` (fila por fila) + `app_settings` (key/value en bloque)
              ⇅
        poll cada 15 s trae los cambios del resto del equipo
```

Reglas del bootstrap de sync: si el servidor tiene datos, **el servidor manda** (pisa el localStorage); si el servidor está vacío o venimos de un import manual (`_ceven_import_reload`), **el local manda** y se siembra la base. Sin conexión (o sin configurar), la app corre local.

## Páginas (SPA)

`goTo(nombre)` alterna divs `.pg`: `quote` (cotización), `catalog`, `addprod`, `nac`, `qnac` (NAC por cotización), `history`, `pipeline`. Modales: Target Anual, Análisis por SKU, edición de ítem, usuarios, CevenCare.

## Roles y permisos (definidos en auth.js)

- **admin**: sin restricciones; único que gestiona usuarios (y `admin@ceven.com` es admin siempre, por bootstrap).
- **ventas**: ve todo; solo modifica cotizaciones/filas de pipeline cuyo "Ejecutivo" coincide con su nombre.
- **lector**: no modifica nada guardado ni usa pipeline; puede armar y guardar una cotización nueva.

El campo Vendedor (`#exec`) se autocompleta y bloquea para no-admins.

## Claves de localStorage

| Clave | Contenido |
|---|---|
| `cquotes` | filas de cotizaciones guardadas (array plano, una fila por ítem) |
| `cpipeline` | entradas del pipeline |
| `carchive` | pipeline archivado por mes (`{YYYY-MM: [...]}`) |
| `cpl` | price list (productos) |
| `cnac` | tasas de nacionalización por modelo |
| `cqc` | contador del número de cotización |
| `ctarget` / `ctarget_manual` | target anual y valores manuales por mes |
| `clogo` / `clogo_dark` | logo en dataURL (claro/oscuro) |
| `cdark` | modo oscuro on/off |
| `cnac_mac24_v2` / `cnac_neo25_v3` | flags de migraciones de NAC ya aplicadas |
| `cbackup_auto` / `cbackup_session` | snapshot automático (recovery) |
| `ceven_auth_session` | sesión de auth (también puede vivir en sessionStorage) |
| `_ceven_import_reload` | flag transitorio post-import de backup |

Los que se sincronizan a `app_settings` en Supabase: `cquotes`, `cpl`, `carchive`, `cnac`, `cqc`, `ctarget`, `ctarget_manual`, `clogo`, `clogo_dark`, `cnac_mac24_v2`. `cpipeline` va a su propia tabla.

## Fórmula de precio

`calcP(base, nac, mg) = round( base · (1 + nac/100) / (1 − mg/100) )` — costo base + % nacionalización según modelo (tabla NAC con overrides por cotización), dividido por (1 − margen). Cotizaciones "FOB" (observaciones que empiezan con `FOB`) fuerzan NAC = 0.

## Puntos frágiles conocidos (heredados del original)

- Todo es global: cualquier función nueva puede pisar otra si repite nombre (p. ej. `openSkuOvLink`/`editSkuOvLink` están definidas dos veces en `pipeline-detail.js`; gana la segunda — así venía en el monolito).
- `qNum` se crea sin `var` (global implícito) en `state.js`.
- La sync sube el `localStorage` entero por clave (`app_settings.value` puede ser grande, p. ej. logo en base64).
- El HTML se genera con concatenación de strings + `onclick` inline; cuidado con escapado de comillas.
