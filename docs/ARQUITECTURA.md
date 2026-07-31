# Arquitectura · Cotizadores Ceven

## Visión general

La plataforma es multi-marca: un **shell** (`src/index.html`) con el login, el panel selector de marcas y el organizador de tareas del equipo, más un cotizador independiente por marca (`src/apple/` y `src/poly/` completos; HP se agregará igual). `src/shared/` tiene lo común a todas las páginas; `src/vendor/` las librerías auto-hospedadas (xlsx, html2canvas, jsPDF + autotable).

Está desplegada como **PWA instalable y offline-first** en https://cotizadores-ceven.vercel.app (`src/sw.js` en la raíz, scope `/`).

Módulos de `src/shared/` (los comparten shell y cotizadores; mismo origin ⇒ misma sesión):

| Archivo | Responsabilidad |
|---|---|
| `safe.js` | Primitivas seguras: `cevenEsc()` (escapado de HTML), `cevenLsSet()` (localStorage que **devuelve booleano** y avisa si la cuota está llena), `cevenLsJSON()`, `cevenParseMoney()` |
| `config.js` | URL/key de Supabase, dominio, admin, `APP_VERSION` |
| `auth.js` | Login GoTrue por REST, sesión con refresh, roles y permisos, gestión de usuarios. Rol y vencimiento se derivan **del JWT** |
| `sync.js` | Sincronización con Supabase para cualquier marca, parametrizada por `brand.js` |
| `backup.js` / `backup-folder.js` | Snapshot, export/import JSON y backup automático a carpeta (File System Access API + IndexedDB) |
| `recovery.js` | `_checkRecovery()`: detecta que los datos están vacíos y ofrece restaurar el snapshot. Delega en `_applyBackupRestore()` de `backup.js` — **carga después que él** |
| `ui-core.js` | Logo, navegación (`_navApply`/`goTo`), formateo (`fI`/`fD`/`dp`/`getTC`), mes de cierre, dark mode, `showErr`, y los helpers de delegación `cevenDelegate`/`cevenActEl` |
| `quote-core.js` | Orden de la cotización (`sortQBy`, `getSortedItems`), `rmItem`, `upField`, `openCat` |
| `catalog-core.js` | `parseCSV`, `fk`, búsqueda y pegado masivo de SKUs, selección de filas, limpieza de filtros |
| `pipeline-store.js` | `getPipeline`/`savePipeline`/`getArchive`/`saveArchive`/`currentMonthKey` |
| `pipeline-ui.js` | Filtros de mes/cliente/pills y orden de la tabla del pipeline |
| `pdf-core.js` | `downloadQuotePDF()` (html2canvas + jsPDF) y las hojas de estilo del documento |
| `undo.js` | Deshacer cambios del pipeline, incluidas inserciones y borrados de fila |
| `nav.js` | `window.cevenNav`: integra el botón Atrás del navegador/celular y la tecla Escape (una sola pila de overlays, un solo listener `popstate`) |
| `notify.js` | Carteles, deshacer y modales genéricos — reemplazan `alert`/`confirm`/`prompt` nativos |
| `todos.js` | Organizador de tareas del equipo (tabla `todos`, poll cada 15 s). Solo lo usa el shell |
| `pwa.js` | Registro del service worker, aviso de versión nueva, botón instalar, pastilla de cambios pendientes |
| `init.js` | Pinta la versión y sincroniza el ícono de dark mode |
| `css/base.css`, `css/dark.css` | Estilos, idénticos para todas las marcas |

El historial de decisiones y de por qué cada cosa está como está vive en [`HISTORIAL.md`](HISTORIAL.md).

Cada cotizador es una **SPA sin framework y sin build**: JavaScript "vanilla" con funciones y variables globales (`var`), manipulación directa del DOM. No usa ES modules — los archivos se cargan con `<script src>` clásicos y comparten el scope global.

Nació de dos HTML monolíticos (7.365 y 2.627 líneas) que en 07/2026 se partieron **por rangos contiguos de líneas**, sin reordenar código, para no arriesgar el comportamiento. Eso dejó un "monolito troceado": archivos separados pero con las constantes de cada marca adentro, y Poly como copia literal de Apple (~71 % del JS duplicado). El 28–30/07 se terminó el trabajo: la lógica común vive en `src/shared/` y lo que distingue a una marca está en un solo archivo declarativo.

## `brand.js`: el contrato de marca

`src/<marca>/brand.js` es lo **primero** que carga cada cotizador y define `window.CEVEN_BRAND`. Los módulos de `src/shared/` lo leen y **no tienen ni una constante por marca adentro**.

| Campo | Para qué |
|---|---|
| `id` | valor de la columna `brand` en Supabase (`'apple'` / `'poly'`) |
| `prefix` | prefijo de las claves de localStorage (`''` en Apple por historia, `'poly_'` en Poly) |
| `settingKeys` | claves que se sincronizan a `app_settings`, **sin** prefijo |
| `pipeCols` / `numCols` / `objCols` | columnas de la tabla `pipeline` de esa marca, cuáles son numéricas y cuáles jsonb |
| `nullableCols` | escalares que aceptan `NULL`. Hay que emitirlos explícitamente: si se omiten, PostgREST conserva el valor viejo y el poll lo revierte en un ciclo infinito |
| `localOnlyCols` | campos que existen solo en localStorage y que el poll debe preservar al mergear (`skuOvLinks`) |
| `padCols` | columnas que vuelven del servidor como número pero se guardan con ceros a la izquierda (`qNum` → `'0071'`) |
| `idbKey`, `appTag`, `backupVersion`, `pipeFilePrefix`, `fullBackupFile`, `exportPrefix`, `backupExtraKeys` | identidad de los backups de la marca |
| `plLabel` | cómo se llama el listado de productos en los carteles (`price list` / `catálogo`) |

`window.cevenK(base)` devuelve `prefix + base`. **Todo** acceso a localStorage desde código compartido pasa por ahí.

Si un módulo compartido necesita algo que no está en el contrato, se **agrega el campo a las dos marcas** — nunca un `if (CEVEN_BRAND.id === 'apple')` adentro de `shared/`.

## ⚠️ El orden de carga importa

Hay código que se **ejecuta al cargar** (IIFEs, listeners, `renderQ()` inicial) y depende de que los archivos anteriores ya estén. **No reordenar los tags de script ni mover funciones entre archivos sin revisar dependencias.**

Orden en el `index.html` de cada marca:

| # | Posición | Archivo | Por qué ahí |
|---|---|---|---|
| 1 | `<head>` | `../vendor/` (xlsx, html2canvas, jsPDF) + `../shared/css/` | |
| 2 | tras la barra de cuenta | **`brand.js`** | Define `CEVEN_BRAND` y `cevenK()`. **Va primero**: todo `shared/` depende de él |
| 3 | ídem | `../shared/safe.js` | Primitivas que usan todos los demás |
| 4 | ídem | `../shared/config.js`, `auth.js`, `notify.js` + guard inline | El guard redirige al shell si no hay sesión válida |
| 5 | tras el markup | `../shared/nav.js`, `sync.js` | `sync.js` es un IIFE; si `SUPABASE_URL` está vacío se desactiva y la app corre 100 % local |
| 6 | ídem | `js/state.js` | Variables globales y constantes de la marca |
| 7 | ídem | `../shared/ui-core.js` → `js/pricing.js` (solo Apple) | `ui-core` corre IIFEs que necesitan `cevenK`, `cevenLsSet` y las globales de `state.js` |
| 8 | ídem | resto de los módulos, propios y compartidos | |
| 9 | tras el zócalo de versión | `../shared/init.js` | Pinta versión y sincroniza el ícono de dark mode |

Módulos propios de Apple (`src/apple/js/`):

| Archivo | Responsabilidad |
|---|---|
| `state.js` | Variables globales (`products`, `items`, `warrantyItems`…), dark mode, constantes `NAC_DEF`, `MODEL_CATEGORY`, `IVA_MAP`, `COLS`, migraciones de tasas NAC, chequeo de recuperación de datos al arrancar, contador `qNum` |
| `pricing.js` | Lo que era exclusivo de Apple en el viejo `utils.js`: margen global, `calcP()` (fórmula de precio), `getNac()` (matching de % nacionalización), `getIVA()`, `recalcMarginsFromGlobal()`. Lo genérico se fue a `shared/ui-core.js` |
| `catalog.js` | Carga de price list (Excel/CSV), actualización de precios, limpieza de SKUs LL/A y E/A, búsqueda (incl. pegado masivo de SKUs), render del catálogo, `addToQuote()` |
| `quote.js` | Render de la cotización (`renderQ`), orden por familia, qty/margen/precio por ítem, modal de edición de ítem |
| `nac.js` | Página de % nacionalización global + overrides por cotización + diagnóstico |
| `products.js` | Alta/edición/baja de artículos manuales del price list |
| `quotes-db.js` | Persistencia de cotizaciones en `cquotes` (guardar/sobrescribir, nueva, copiar, editar desde historial, export Excel) |
| `pipeline-data.js` | Storage del pipeline (`cpipeline`) y archivo mensual (`carchive`), `archiveOldEntries()` |
| `pipeline-core.js` | `categorize()` (familia de cada ítem), `addToPipeline()`, limpieza de filtros |
| `archive-view.js` | Render de meses archivados, restaurar/mover entradas |
| `pipeline-view.js` | Filtros, orden, dashboard KPI y render de la tabla del pipeline |
| `pipeline-detail.js` | Fila expandible por cotización: estado/mes/OV por SKU, entregas parciales (filas virtuales, merge y disolución de grupos), export Excel del pipeline |
| `history.js` | Historial de cotizaciones: filtros, selección, borrado |
| `pdf.js` | Generación de PDF (html2canvas + jsPDF) de la cotización actual y de seleccionadas |
| `warranties.js` | Garantías CevenCare: render, integración por `postMessage`, sugerencia automática de garantía para Macs (tabla `MAC_WARRANTIES_3Y`), modal Cliente Final/Canal. **Acá corre el init** (`renderQ()`, defaults de fecha/pago) |
| `target.js` | Modal Target Anual (objetivo de facturación, valores manuales por mes) y dashboard por SKU |

Poly tiene los mismos nombres donde el concepto es el mismo, pero su `pipeline-core.js`, `pipeline-detail.js`, `archive-view.js` y `quotes-db.js` implementan otro modelo de negocio: una fila por **OPG** con salas anidadas, sin margen, nacionalización, IVA ni garantías. Esa divergencia es deliberada.

`cevencare.html` + `js/cevencare.js` + `css/cevencare.css` son una mini-app aparte (sin Supabase): cotiza garantías por dispositivo/canal y envía los ítems elegidos al cotizador con `postMessage({type:'cevencare-add-warranty', items})`; `warranties.js` los recibe y los suma a `warrantyItems`.

## Flujo de datos

```
UI (DOM) ⇄ variables globales (items, products, …)
              ⇅ (en cada guardado)
        localStorage  ←— fuente de verdad local
              ⇅
        apple/js/sync.js  ←— intercepta Storage.prototype.setItem (debounce 350 ms)
              ⇅ REST (PostgREST, apikey = publishable key + Bearer = access_token del usuario)
        Supabase: tabla `pipeline` (fila por fila) + `app_settings` (key/value en bloque)
              (toda la sync filtra y estampa brand='apple')
              ⇅
        poll cada 15 s trae los cambios del resto del equipo
```

**Reglas del bootstrap** (reescritas el 30/07; antes el bootstrap pisaba el localStorage con lo del servidor y se perdían los cambios hechos sin conexión):

- El pipeline se **mergea por `id`**, no se reemplaza: el servidor gana en las filas que ambos tienen, las filas que solo están en local se conservan y se pushean.
- `fetchJSON` distingue **"el servidor está vacío" de "no se pudo leer"**. Si el GET falla, no se toca nada. Antes devolvía `null` en los dos casos, así que un solo request fallido borraba el pipeline entero.
- La **cola de pendientes se persiste** en `cevenK('_sync_dirty')` (que nunca debe entrar en `settingKeys`, o se sincronizaría a sí misma). Sobrevive al reload; toda clave que figure ahí gana sobre el servidor.
- Se reintenta al volver la red (`online`) y al volver la pestaña al frente (`visibilitychange`), no solo por backoff.
- Sin conexión, sin configurar o sin sesión válida, la app corre local — y el bootstrap se reintenta cada 10 s en vez de rendirse.

**Invariantes que hay que respetar** (están comentadas en `shared/sync.js`):

- Todo lo que baja del servidor se escribe con `rawSet()`, el `setItem` original. Usar `localStorage.setItem` o `cevenLsSet()` ahí haría que el intercept marque la clave como sucia y la vuelva a subir: ping-pong infinito con el poll.
- `_dirty[k]` se prende antes de cualquier request y se apaga **solo** con confirmación del servidor.
- `_pipeSnap` solo avanza con push confirmado; ante fallo parcial se hace rollback completo, porque reintentar un upsert de más es gratis y perder un delete no.

**Lo que sigue sin resolver**: no hay `updated_at` ni versión por fila, así que "quién gana" ante una edición concurrente lo decide el orden de llegada de los POST. `cquotes`, `cpl` y `carchive` viajan como **un blob único** en `app_settings`, o sea last-write-wins a nivel documento: dos usuarios que guardan dentro de la misma ventana de 15 s pueden pisarse. El pipeline no sufre esto porque va fila por fila.

## Páginas (SPA)

`goTo(nombre)` alterna divs `.pg`: `quote` (cotización), `catalog`, `addprod`, `nac`, `qnac` (NAC por cotización), `history`, `pipeline`. Modales: Target Anual, Análisis por SKU, edición de ítem, usuarios, CevenCare.

Desde 2026-07-27 la navegación pasa por `shared/nav.js`:

- `goTo(n)` delega en `cevenNav.goToView(n)`, que aplica la vista **y** empuja una entrada al historial (`#nombre` en la URL). La función que solo pinta la vista, sin tocar el historial, es `_navApply(n)` — la usa el `popstate` y el arranque.
- Cada modal llama a `cevenNav.openOverlay(closeXxx)` al abrirse (guardado con un flag `_wasOpen` para no apilar dos veces) y a `cevenNav.notifyClosed(closeXxx)` al cerrarse.
- **Atrás/Escape cierra primero el modal de más arriba**, después retrocede entre vistas, y recién desde `quote` sale de la app. Al recargar, la vista se restaura desde el `#hash`.
- Todas las llamadas están guardadas con `if(window.cevenNav)`, así que si `nav.js` no cargó la app sigue funcionando con la navegación vieja.

**Al agregar un modal nuevo**: enganchar `openOverlay`/`notifyClosed` y —si es un archivo nuevo— **agregarlo a `ASSETS` en `src/sw.js`** y correr `node scripts/check-precache.js`.

## Multi-marca: cómo enchufar HP

> **La receta vieja era "copiar `src/apple/` → `src/<marca>/`". Ya no.** Así se
> hizo Poly en 07/2026 y el resultado fue ~2.100 líneas duplicadas y bugs
> arreglados en una marca y no en la otra (el guard de IndexedDB y el filtro de
> backup solo en Poly; las clases de dark mode y `moveArchiveEntryMonth` solo en
> Apple). Con una tercera marca cada bug costaba tres arreglos.

1. **`src/hp/brand.js`**: copiar el de Poly y ajustar `id`, `prefix` (`'hp_'`), `settingKeys`, `pipeCols`/`numCols`/`objCols`/`nullableCols` y los campos de backup. Este archivo es casi todo lo que la marca necesita declarar.
2. **`src/hp/index.html`**: cargar `brand.js` primero, después `../shared/safe.js`, `config.js`, `auth.js`, `notify.js` + el guard de sesión, y al final los módulos compartidos y los propios (ver "El orden de carga importa").
3. **Módulos propios en `src/hp/js/`**: solo lo que sea genuinamente distinto. Poly, que es la marca más simple, tiene 13 archivos y ~1.900 líneas; casi todo eso es su modelo de pipeline por OPG.
4. Activar la tarjeta en el shell (`src/index.html`): quitar la clase `soon` y agregar el `onclick`.
5. **Registrar los archivos nuevos en `ASSETS` de `src/sw.js`** (y el `index.html` en `DOCS`), subir `APP_VERSION` en `shared/config.js` y verificar con `node scripts/check-precache.js`. Si falta uno, el precache queda incompleto y la marca no abre sin conexión.

En Supabase no hay que tocar nada: las tablas ya separan por `brand` (PK compuestas `(brand,id)` / `(brand,key)`). Si la marca necesita campos propios, se agregan a `pipeline` como columnas aditivas que quedan NULL para las demás (así se hizo con `opg`/`salas`/`factura` de Poly) y se declaran en `pipeCols`.

**Qué NO hacer**: meter `if (CEVEN_BRAND.id === 'hp')` dentro de `src/shared/`. Si un módulo compartido necesita variar, el parámetro va en `brand.js`. Y a la inversa: si la lógica de la marca es realmente distinta (como el pipeline por OPG de Poly frente al de familias de Apple), **va en su carpeta** — forzarla a un módulo común con ramas por marca adentro es peor que la duplicación.

## Roles y permisos (definidos en shared/auth.js)

- **admin**: sin restricciones; único que gestiona usuarios (y `admin@ceven.com` es admin siempre, por bootstrap).
- **ventas**: ve todo; solo modifica cotizaciones/filas de pipeline cuyo "Ejecutivo" coincide con su nombre.
- **lector**: no modifica nada guardado ni usa pipeline; puede armar y guardar una cotización nueva.

El campo Vendedor (`#exec`) se autocompleta y bloquea para no-admins.

El rol se deriva **del JWT**, no de localStorage: `cevenMyRole()` lee el claim `user_role` (el que inyecta el hook de la migración pendiente) y, si no está, cae a `user_metadata.role`. Sin token usable devuelve `lector` — fail-safe.

> Desde el 31/07/2026 la UI y la base **coinciden**: las policies leen el mismo claim `user_role` (ver `supabase/migrations/`). Un `lector` que fuerce la UI desde la consola igual choca contra la RLS. Ojo con `user_metadata.role`: lo edita el propio usuario con `PUT /auth/v1/user`, así que sirve de pista para la UI pero **nunca** debe usarse en una policy.

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
| `ceven_auth_session` | sesión de auth, compartida entre shell y cotizadores (también puede vivir en sessionStorage) |
| `_ceven_import_reload` | flag transitorio post-import de backup |

La tabla de arriba usa los nombres de Apple. **Poly usa los mismos con el prefijo `poly_`** (`poly_cquotes`, `poly_cpipeline`, …). Neutrales, compartidas entre marcas: `cdark` y `ceven_auth_session`.

Qué se sincroniza lo dice `settingKeys` en `brand.js`, no una lista en este doc — Apple sincroniza 10 claves y Poly 6 (no tiene nacionalización ni target). `cpipeline` va a su propia tabla, fila por fila. `_sync_dirty` (la cola de pendientes) es local por diseño y **nunca** debe entrar en `settingKeys`.

## Fórmula de precio

`calcP(base, nac, mg) = round( base · (1 + nac/100) / (1 − mg/100) )` — costo base + % nacionalización según modelo (tabla NAC con overrides por cotización), dividido por (1 − margen). Cotizaciones "FOB" (observaciones que empiezan con `FOB`) fuerzan NAC = 0.

## Puntos frágiles conocidos

- **Todo es global**: cualquier función nueva puede pisar otra si repite nombre, y el que pierde es el que se define primero — en silencio. Hay un chequeo para esto; ver más abajo.
- `qNum` se crea sin `var` (global implícito) en `state.js`, y se **incrementa en cada carga de página**, así que dos usuarios que abren la app a la vez pueden tomar el mismo número y pisarse la cotización al guardar. El arreglo de fondo es una sequence en Postgres.
- La sync sube el `localStorage` entero por clave: `app_settings.value` puede ser grande (el logo en base64, el price list), y el poll lo baja **completo cada 15 s**.
- El HTML se genera concatenando strings. Todo dato que venga de la base o de un Excel **tiene que pasar por `cevenEsc()`** antes de interpolarse: el pipeline y el price list se sincronizan entre todo el equipo, así que un `<img src=x onerror=...>` guardado como nombre de cliente se ejecutaba en la pantalla de todos. Los handlers con datos adentro van por `data-*` + delegación de eventos, nunca por `onclick="fn('"+dato+"')"` — ese escapado no cubre la barra invertida.
- **La autorización real todavía no existe**: mientras las policies sean `using(true)`, los roles de `auth.js` solo deciden qué botones se muestran. Ver la migración pendiente en `supabase/migrations/`.

## Verificar antes de commitear

No hay tests. Lo mínimo que conviene correr:

```bash
node scripts/check-precache.js       # rutas del service worker vs. archivos reales
node scripts/check-globals.js        # una misma función definida dos veces en un bundle
node --check src/<archivo>.js        # sintaxis de lo que tocaste
```

`check-globals.js` existe porque acá todos los `<script>` comparten scope: si dos archivos definen la misma función, **el que carga después pisa al anterior sin ningún error**. Pasó con `openSkuOvLink`/`editSkuOvLink`, duplicadas en `pipeline-detail.js` desde el corte del monolito hasta que un review las encontró; la que corría era la de abajo y la otra era código muerto que alguien podía leer y creer vigente. El riesgo creció con `shared/`: una función movida a compartido puede chocar con una copia que quedó en la marca.

**Lo que ningún script cubre**: que la app efectivamente abra y funcione. No hay tests ni verificación automática de comportamiento — hay que abrir las dos marcas a mano.
