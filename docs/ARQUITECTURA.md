# Arquitectura · Cotizadores Ceven

## Visión general

La plataforma es multi-marca: un **shell** (`src/index.html`) con el login y el panel selector, más un cotizador independiente por marca (`src/apple/` y `src/poly/` completos; HP se agregará igual). Del panel también se entra al **cotizador multimarca** (`src/multi/`), que arma un pedido con SKUs de cualquier marca y lo emite como una cotización real de cada una, y al **tablero de tareas del equipo** (`src/tareas/`). Esos dos no son marcas: son páginas que las cruzan. `src/shared/` tiene lo común a todas las páginas; `src/vendor/` las librerías auto-hospedadas (xlsx, html2canvas, jsPDF + autotable).

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
| `opciones.js` | Opciones **A/B** de una cotización: dos propuestas alternativas guardadas como una sola. Ver "Opciones A/B" más abajo |
| `catalog-core.js` | `parseCSV`, `fk`, búsqueda y pegado masivo de SKUs, selección de filas, limpieza de filtros |
| `pipeline-store.js` | `getPipeline`/`savePipeline`/`getArchive`/`saveArchive`/`currentMonthKey` |
| `pipeline-ui.js` | Filtros de mes/cliente/pills, orden de la tabla del pipeline y las pastillas de **Top clientes** (`cevenPintarTopClientes`, compartida por las dos marcas desde el 24/08 — ver abajo) |
| `pdf-core.js` | `downloadQuotePDF()` (html2canvas + jsPDF), las hojas de estilo del documento, el bloque **Condiciones Comerciales** (`cevenCondiciones`/`cevenCondicionesHTML`, único para los tres documentos) y `cevenDescargarYAbrir()`, que baja el archivo y lo abre en otra pestaña |
| `undo.js` | Deshacer cambios del pipeline, incluidas inserciones y borrados de fila |
| `nav.js` | `window.cevenNav`: integra el botón Atrás del navegador/celular y la tecla Escape (una sola pila de overlays, un solo listener `popstate`) |
| `theme.js` | Copia `CEVEN_BRAND.theme` a las variables CSS `--acc`/`--acc-h`/`--acc-soft`/`--acc-dk`. Es todo el color de marca: filete de la barra superior, vista activa, botón Guardar, links y foco. El shell no tiene marca y se queda con el default de `base.css` |
| `monthpicker.js` | Campo de mes/año (el "cierre estimado"): un `<button>` que abre una grilla de 12 meses con el año arriba. `cevenMonthField()` devuelve el HTML, `cevenMonthSet()` lo escribe desde código y `cevenMesLabel()` formatea `2026-11` → `Nov 2026`. El botón expone `value` y dispara `change` igual que el `<select>` que reemplazó |
| `navbar.js` | Barra superior de todas las páginas: chip de marca, un ítem por vista (leídos de `CEVEN_BRAND.navItems`) y el bloque de cuenta (dark mode, usuarios, quién sos + rol, contraseña, salir). `cevenNavbarSync()` marca la vista activa y esconde lo que el rol no puede usar |
| `notify.js` | Carteles, deshacer y modales genéricos — reemplazan `alert`/`confirm`/`prompt` nativos. **No quedan diálogos nativos en ninguna marca** (desde 10/08/2026 en Apple): un error o una validación se avisa con `showToast()`, y una acción destructiva se **aplica** y se ofrece `notifyUndo()` en vez de preguntar antes. `confirmModal()` queda reservado para lo irreversible que además recarga la página (restaurar un backup). El motivo no es estético: `alert()` congela el renderer —y con él cualquier driver de test— y en la PWA se ve como un cartel del navegador, no de la app |
| `todos.js` | Tareas del equipo: **store y sincronización**, no UI (tablas `todos` y `equipos` + RPC `ceven_equipo`, poll cada 15 s). Expone `window.cevenTareas`. Lo usan el shell (solo para la pastilla de pendientes) y `tareas/js/board.js`. Ojo con los nombres: `personas()` es la **gente**, `equipos()` son los **tableros** |
| `clientes.js` | Ficha por cliente (hoy: el nivel de precio con el que se le cotiza), el `<datalist>` del campo Cliente y —desde el 24/08— el **desplegable propio** que lo reemplaza en pantalla (ver "El campo Cliente" abajo). Define **`cevenNormClient()`**, la forma canónica de un nombre de cliente — vive acá y no en `pipeline-group.js` desde el 12/08/2026: el pipeline **agrupa** por cliente, no lo define, y con la dependencia al revés una página con clientes pero sin pipeline (el multimarca) reventaba al guardar. Va **antes** de `pipeline-group.js` |
| `clientes-db.js` | Complementa a `clientes.js` con la tabla real `clientes` de Supabase (Fase 0 del portal, agosto 2026): resuelve-o-crea por `nombre_norm` al cambiar el campo Cliente (`cevenClienteCambio()`), sin bloquear el guardado si la red tarda — `cevenClienteIdParaNombre()` devuelve `null` en vez de un id viejo si el nombre cambió mientras se esperaba la respuesta. El `id` resuelto viaja como `pipeline."clienteId"` (aditiva, nunca pisa el texto libre `cliente`) |
| `equipo.js` | **Quiénes son las personas de Ceven**, para poder elegir una en un campo (hoy: el Ejecutivo del multimarca). Sale de la RPC `ceven_equipo()`, que es la única fuente legible por un no-admin: `admin-users` responde 403 a todo el que no sea `admin@ceven.com`. `cevenEquipoVendedores()` filtra a los roles que cotizan (**admin** y **ventas**) y `cevenLlenarExec()` llena el `<select>` sin deshabilitarlo nunca. Comparte la caché (`ceven_equipo_cache`) con `todos.js`: mismo dato, misma RPC |
| `comprobante.js` | Comprobante de una cotización (botón 🧾 en cada tarjeta del historial, en las dos marcas). **Se descarga como PDF y se abre solo.** Se dibuja con jsPDF + autotable, no con html2canvas: el texto se selecciona y se busca, a diferencia de `pdf-core.js`, que rasteriza. Al ser todo sincrónico el `window.open` cae dentro del gesto del click y el navegador no lo bloquea. Los datos del emisor salen de `CEVEN_EMISOR` en `config.js`. Ojo con `cevenCompSan()`: las fuentes estándar del PDF no dibujan `– — “ ” …`, hay que pasar por ahí todo lo que se imprima |
| `pwa.js` | Registro del service worker, aviso de versión nueva, botón instalar, pastilla de cambios pendientes |
| `init.js` | Pinta la versión y sincroniza el ícono de dark mode |
| `css/base.css`, `css/dark.css` | Estilos, idénticos para todas las marcas. Los tokens de color (`:root`), la pila tipográfica (`--f-ui`/`--f-disp`) y la escala `.h1`/`.h2`/`.h3`/`.sub`/`.lbl` viven en `base.css`, porque el shell **no** carga `dark.css` — ahí quedó solo lo de `body.dark` |

El historial de decisiones y de por qué cada cosa está como está vive en [`HISTORIAL.md`](HISTORIAL.md).

Cada cotizador es una **SPA sin framework y sin build**: JavaScript "vanilla" con funciones y variables globales (`var`), manipulación directa del DOM. No usa ES modules — los archivos se cargan con `<script src>` clásicos y comparten el scope global.

Nació de dos HTML monolíticos (7.365 y 2.627 líneas) que en 07/2026 se partieron **por rangos contiguos de líneas**, sin reordenar código, para no arriesgar el comportamiento. Eso dejó un "monolito troceado": archivos separados pero con las constantes de cada marca adentro, y Poly como copia literal de Apple (~71 % del JS duplicado). El 28–30/07 se terminó el trabajo: la lógica común vive en `src/shared/` y lo que distingue a una marca está en un solo archivo declarativo.

## `brand.js`: el contrato de marca

`src/<marca>/brand.js` es lo **primero** que carga cada cotizador y define `window.CEVEN_BRAND`. Los módulos de `src/shared/` lo leen y **no tienen ni una constante por marca adentro**.

| Campo | Para qué |
|---|---|
| `id` | valor de la columna `brand` en Supabase (`'apple'` / `'poly'`) |
| `prefix` | prefijo de las claves de localStorage (`''` en Apple por historia, `'poly_'` en Poly) |
| `settingKeys` | claves que se sincronizan a `app_settings`, declaradas **sin** prefijo. Ojo: lo que termina en la **columna `key` de la base es la clave con prefijo** (`poly_cpl`), porque `sync.js` le aplica `cevenK()` antes de subir. Leer `app_settings` de otra marca —lo hace el multimarca— exige pedir la clave prefijada |
| `pipeCols` / `numCols` / `objCols` | columnas de la tabla `pipeline` de esa marca, cuáles son numéricas y cuáles jsonb |
| `nullableCols` | escalares que aceptan `NULL`. Hay que emitirlos explícitamente: si se omiten, PostgREST conserva el valor viejo y el poll lo revierte en un ciclo infinito |
| `localOnlyCols` | campos que existen solo en localStorage y que el poll debe preservar al mergear (`skuOvLinks`) |
| `padCols` | columnas que vuelven del servidor como número pero se guardan con ceros a la izquierda (`qNum` → `'0071'`) |
| `idbKey`, `appTag`, `backupVersion`, `pipeFilePrefix`, `fullBackupFile`, `exportPrefix`, `backupExtraKeys` | identidad de los backups de la marca |
| `plLabel` | cómo se llama el listado de productos en los carteles (`price list` / `catálogo`) |
| `theme` | color de la marca: `{accent, hover, soft, dk}`. El criterio es **distinguirse entre marcas**, no imitar el logo — Apple azul, Poly violeta, HP naranja: los datos no se mezclan y equivocarse de cotizador es fácil. Si se cambia uno, hay que tocar también la tarjeta de esa marca en el shell (`.mcard[data-brand=…]`), que no carga ningún `brand.js` |
| `quoteLists` | qué arrays componen una cotización (`items`, y en Apple también `warrantyItems`), como `{get, set}`. Lo usa `shared/opciones.js` para borrar la Opción B entera sin conocer los arrays de cada marca |
| `condicionesFijas` | líneas del bloque "Condiciones Comerciales" propias de la marca, entre la de impuestos y la de entrega. Apple: enrolamiento en Apple Business Manager. Poly: ninguna. Las otras cuatro líneas son iguales en todas las marcas y las arma `cevenCondiciones()` |
| `navItems` | vistas que muestra la barra superior, en orden: `{view, label, alsoFor?, needsPipeline?}`. `alsoFor` lista las vistas sin ítem propio que igual marcan a esta como activa (`addprod` cuelga de `catalog`, `qnac` de `quote`); `needsPipeline` esconde el ítem al rol lector |
| `qNumPrefijo` / `qNumTitulo` | cómo se **lee** el número, que no es como se **guarda**. El multimarca muestra "Pedido M-0042" pero guarda `0042`, igual que todas las marcas: la columna `qNum` de Supabase es `bigint`. Lo aplican `cevenQNumVisible()` y `cevenPintarQNum()` en `shared/quote-num.js` |

`window.cevenK(base)` devuelve `prefix + base`. **Todo** acceso a localStorage desde código compartido pasa por ahí.

Si un módulo compartido necesita algo que no está en el contrato, se **agrega el campo a las dos marcas** — nunca un `if (CEVEN_BRAND.id === 'apple')` adentro de `shared/`.

## ⚠️ El orden de carga importa

Hay código que se **ejecuta al cargar** (IIFEs, listeners, `renderQ()` inicial) y depende de que los archivos anteriores ya estén. **No reordenar los tags de script ni mover funciones entre archivos sin revisar dependencias.**

Orden en el `index.html` de cada marca:

| # | Posición | Archivo | Por qué ahí |
|---|---|---|---|
| 1 | `<head>` | `../vendor/` (xlsx, html2canvas, jsPDF) + `../shared/css/` | |
| 2 | apenas abre el `<body>` | **`brand.js`** | Define `CEVEN_BRAND` y `cevenK()`. **Va primero**: todo `shared/` depende de él |
| 3 | pegado a `brand.js` | `../shared/theme.js` | Escribe el acento de marca en `:root`. Va acá para que la primera pintura ya salga con el color correcto, en vez de arrancar con el azul del default |
| 4 | ídem | `../shared/safe.js` | Primitivas que usan todos los demás |
| 5 | ídem | `../shared/config.js`, `auth.js`, `notify.js` + guard inline | El guard redirige al shell si no hay sesión válida |
| 6 | ídem, **antes del markup** | `../shared/navbar.js` | Se pinta apenas carga, así la barra ya ocupa su lugar cuando se parsea el resto y la página no salta. Necesita `brand.js` (ítems) y `auth.js` (rol) ya cargados; sus handlers usan `goTo`/`toggleDark`, que se definen más abajo pero recién corren al hacer click |
| 7 | tras el markup | `../shared/nav.js`, `monthpicker.js`, `sync.js` | `sync.js` es un IIFE; si `SUPABASE_URL` está vacío se desactiva y la app corre 100 % local |
| 8 | ídem | `js/state.js` | Variables globales y constantes de la marca |
| 9 | ídem | `../shared/ui-core.js` → `js/pricing.js` (solo Apple) | `ui-core` corre IIFEs que necesitan `cevenK`, `cevenLsSet`, las globales de `state.js` y `cevenMonthField()` de `monthpicker.js` (arma el campo "Mes estimado de cierre" dentro de `#mes-cierre-box`) |
| 10 | ídem | resto de los módulos, propios y compartidos | |
| 11 | tras el zócalo de versión | `../shared/init.js` | Pinta versión y sincroniza el ícono de dark mode (incluido el 🌙 de la barra superior) |

Módulos propios de Apple (`src/apple/js/`):

| Archivo | Responsabilidad |
|---|---|
| `state.js` | Variables globales (`products`, `items`, `warrantyItems`…), dark mode, constantes `NAC_DEF`, `MODEL_CATEGORY`, `IVA_MAP`, `COLS`, migraciones de tasas NAC, chequeo de recuperación de datos al arrancar, contador `qNum` |
| `pricing-core.js` | Las **cuentas de Apple sin pantalla**: `cevenAppleCalcP()`, `cevenAppleNac()`, `cevenAppleIVA()`, `cevenAppleMargenDePrecio()`, `cevenAppleCategoria()`, `cevenAppleAgregados()`, y las tres tablas (NAC por defecto, familia por LOB, IVA). No lee el DOM ni ninguna global. **Lo carga también `src/multi/`**, y esa es su razón de existir: usar el mismo código —y no una copia— es lo único que garantiza que un SKU no salga a dos precios distintos según por dónde se lo cotizó. Se carga ANTES de `state.js`, que toma de ahí las tablas |
| `pricing.js` | Los envoltorios con pantalla de lo anterior: `calcP()`, `getNac()`, `getIVA()` le pasan `nacRates`, `quoteNacOverrides` e `IVA_MAP`. Además el margen global (`getM`, `recalcMarginsFromGlobal`) |
| `catalog.js` | Carga de price list (Excel/CSV), actualización de precios, limpieza de SKUs LL/A y E/A, búsqueda (incl. pegado masivo de SKUs), render del catálogo, `addToQuote()`. Ver "El price list de Apple" abajo |
| `quote.js` | Render de la cotización (`renderQ`), orden por familia, qty/margen/precio por ítem, modal de edición de ítem |
| `nac.js` | Página de % nacionalización global + overrides por cotización + diagnóstico |
| `products.js` | Alta/edición/baja de artículos manuales del price list. En **Poly** el artículo manual lleva lo mismo que uno del ERP —precios por nivel, categoría, stock e IVA— y los campos de precio los arma el propio módulo desde `CEVEN_BRAND.priceTiers`, así que no están en el HTML |
| `quotes-db.js` | Persistencia de cotizaciones en `cquotes` (guardar/sobrescribir, nueva, copiar, editar desde historial, export Excel) |
| `pipeline-data.js` | Storage del pipeline (`cpipeline`) y archivo mensual (`carchive`), `archiveOldEntries()` |
| `pipeline-core.js` | `categorize()` (familia de cada ítem), `addToPipeline()`, limpieza de filtros |
| `archive-view.js` | Render de meses archivados, restaurar/mover entradas |
| `pipeline-view.js` | Filtros, orden, dashboard KPI y render de la tabla del pipeline |
| `pipeline-detail.js` | Fila expandible por cotización: estado/mes/OV por SKU, entregas parciales (filas virtuales, merge y disolución de grupos), export Excel del pipeline |
| `picker.js` | Subpantalla flotante para agregar productos sin salir de la cotización: arriba el catálogo con un `+` por producto, abajo lo que la cotización ya lleva (cantidades, total, `×`). Comparte `_catRowHTML()` con `catalog.js` para que las dos tablas no se despeguen. **En Poly** direcciona sus filas con `data-pi` contra su propio registro, porque el catálogo usa `data-i`; **en Apple** las dos usan `data-pid` (el id del producto es único y sobrevive al round-trip por atributo, incluso el string de un artículo manual), así que no hace falta un segundo registro. Los estilos `.pk-*` son compartidos y viven en `base.css` |
| `history.js` | Historial de cotizaciones: filtros, selección, borrado |
| `pdf.js` | Generación de PDF (html2canvas + jsPDF) de la cotización actual y de seleccionadas |
| `warranties.js` | Garantías CevenCare: render, integración por `postMessage`, sugerencia automática de garantía para Macs (tabla `MAC_WARRANTIES_3Y`), modal Cliente Final/Canal. **Acá corre el init** (`renderQ()`, defaults de fecha/pago) |
| `target.js` | Modal Target Anual (objetivo de facturación, valores manuales por mes) y dashboard por SKU |

Poly tiene los mismos nombres donde el concepto es el mismo, pero su `pipeline-core.js`, `pipeline-detail.js`, `archive-view.js` y `quotes-db.js` implementan otro modelo de negocio: una fila por **OPG** con proyectos anidados, sin margen, nacionalización, IVA ni garantías. Esa divergencia es deliberada.

> **Ojo con "sala" en el código de Poly.** Lo que la UI llama **Proyecto (cliente final)** se guarda con las claves viejas: el input es `#sala`, el array de la fila es `salas[]`, cada elemento tiene `.sala`, la columna en Supabase es `salas` (jsonb, declarada en `objCols`) y la clave dentro de `cquotes` es `'Sala'` (en `COLS`). Se renombró **solo lo que se lee en pantalla** (31/07/2026); tocar las claves obligaría a migrar `cquotes`, los backups JSON y la columna de la base. La traducción del encabezado de Excel se hace en `exportDB()` con un mapa `XLS_HD`.

> **Ojo con `factura` en el pipeline de Poly.** Desde 08/2026 esa columna guarda el **link a Netsuite** del proyecto, no un número de factura. Mismo criterio que "sala": se renombró solo lo que se ve en pantalla, porque la columna existe en Supabase (`pipeCols`/`nullableCols` de `brand.js`), viaja sincronizada y ya tiene datos. El botón verde **abre** Netsuite y el ✎ amarillo de al lado **cambia** el link; sin link, el botón es rojo y lo pide. `cevenNetsuiteURL()` (en `poly/js/pipeline-detail.js`) le antepone `https://` al link pegado sin protocolo y **descarta todo lo que no sea http(s)** — el pipeline se sincroniza con todo el equipo, así que un `javascript:` guardado ahí correría en la pantalla de quien apriete el botón.

`cevencare.html` + `js/cevencare.js` + `css/cevencare.css` son una mini-app aparte (sin Supabase): cotiza garantías por dispositivo/canal y envía los ítems elegidos al cotizador con `postMessage({type:'cevencare-add-warranty', items})`; `warranties.js` los recibe y los suma a `warrantyItems`.

## `src/multi/`: el cotizador multimarca

Un pedido puede mezclar marcas (unas Mac y un equipo de video Poly). Antes eso
eran dos cotizaciones en dos cotizadores y dos PDF para el cliente.

**Pero el forecast se mide por marca**, así que el multimarca no reemplaza a los
cotizadores: **reparte**. Se arma el pedido una vez y al **emitir** se crea la
cotización REAL de cada marca —con su número, sus filas en el historial de esa
marca y su fila en su pipeline—. La plata queda donde se factura.

Para todo `src/shared/` esto es **una marca más**: tiene su `brand.js`
(`id:'multi'`, `prefix:'multi_'`), su `cquotes`, su `cqc` y su papelera, así que
reusa `sync.js`, `auth.js`, `navbar.js`, `opciones.js`, `quote-num.js`,
`clientes.js`, `equipo.js` y `backup*.js` sin una sola rama nueva adentro de
`shared/`.

| Archivo | Responsabilidad |
|---|---|
| `js/marcas.js` | **El registro**: lo único que sabe cómo se comporta cada marca (`nuevaLinea`, `repricear`, `filaCquotes`, `filaPipeline`, `pipelineExtra`, qué controles de precio necesita). Un `if (linea.brand === 'apple')` en cualquier otro archivo de `src/multi/` va mal: el lugar es este, igual que en `shared/` el lugar es `brand.js` |
| `js/catalogo-multi.js` | El catálogo unificado, **de solo lectura**. Un request a `app_settings?brand=in.(apple,poly)&key=in.(cpl,cnac)` y a caché para que ande offline |
| `js/quote.js` | La grilla, agrupada por marca y con los controles de precio de las marcas presentes |
| `js/catalog-view.js` | El catálogo en pantalla, con filtro por marca. Exporta la **fila** (`_catRowHTML`), el **filtrado** (`_catFiltradosCon`), el **recorte por marca** (`_catRecortar`) y los **chips** (`_pintarFiltroMarcas`/`bindMarcas`), que comparte con el picker |
| `js/picker.js` | La **subpantalla flotante** de "+ Agregar producto": el catálogo encima del pedido con un `+` por producto y, abajo, lo que el pedido ya lleva (con el chip de la marca a la que va a bajar). Misma pantalla que la de Poly y la de Apple, con los mismos estilos `.pk-*` |
| `js/quotes-db.js` | Persistencia del pedido |
| `js/emitir.js` | **La emisión.** Ver abajo |
| `js/history.js` | Historial, con las marcas de cada pedido y a qué número se emitió |
| `js/boot.js` | El arranque. Además de los defaults, llena el `<select>` de **Ejecutivo** (`refrescarEjecutivos()`): va acá y no en `auth.js` porque ese archivo está en el `<head>`, con el `<select>` todavía sin existir |

Lo que hay que saber para tocarlo:

- **No tiene catálogo propio** (`cpl` no está en sus `settingKeys`) y no se puede
  editar desde acá: los productos y los precios son de cada marca. Si se pudiera
  desde dos lados, uno de los dos quedaría viejo sin que nadie se entere.
- **Ninguna fórmula se escribe acá.** Los precios salen de
  `apple/js/pricing-core.js` y `poly/js/pricing-core.js`, que son los mismos
  archivos que cargan esas marcas. `scripts/check-multi.js` verifica que el
  mismo SKU dé el mismo precio por los dos caminos.
- **Cero cambios de esquema en Supabase.** El link entre el pedido y las
  cotizaciones que generó viaja en la clave `_multi` de cada fila de `cquotes`,
  que ya se sincroniza — el mismo criterio con el que las opciones A/B
  resolvieron su chapita sin agregar una columna.
- **Todavía no tiene pipeline propio.** El seguimiento vive en el pipeline de
  cada marca. Por eso `navItems` no trae el ítem: mostrarlo con la vista vacía
  se lee como un bug.

### La emisión (`js/emitir.js`)

Por cada marca presente en el pedido:

1. **Reserva número en esa marca**: `max(contador, mayor número que existe) + 1`,
   la misma regla auto-reparable de `shared/quote-num.js` pero sobre los datos
   remotos, porque el multimarca no tiene el `localStorage` de la otra marca.
2. **Escribe las filas en el `cquotes` de esa marca**, con la forma de sus
   columnas. Es lo que hace que la fila del pipeline se pueda expandir por SKU y
   que el Excel de esa marca la incluya: sin esto la fila existe pero está hueca.
3. **Upsert de la fila de pipeline** con `brand=<marca>` y la forma de esa marca.
4. **Re-emitir es idempotente**: se sacan del `cquotes` las filas de ese número
   y se reinsertan, y la fila de pipeline se busca por número y se le actualizan
   los montos **conservando** `id`, `estado`, `mesCierre` y el link de
   OV/Netsuite — que son del vendedor de esa marca, no del pedido.

`cevenEmitirPlan()` es **puro** a propósito: recibe el estado remoto y devuelve
exactamente qué se va a escribir, sin tocar la red. Todo lo que puede salir mal
en la lógica se prueba en `scripts/check-emitir.js`; la capa REST solo transporta.

> ⚠ **`cquotes` es un blob con last-write-wins.** Emitir es leer-modificar-escribir
> el historial de OTRA marca: si alguien guarda ahí en la misma ventana, una de
> las dos escrituras se pierde. Se mitiga leyendo justo antes de escribir,
> informando el resultado **por marca** (no un "listo" genérico) y con la
> idempotencia: recuperarse es volver a emitir. Las filas de `pipeline` no
> sufren esto, van fila por fila.

## `src/portal/`: el portal de clientes-canal

Autoservicio para revendedores (clientes-canal): cotizan con el catálogo real
y el nivel de precio/margen que Ceven les asignó, le suman SU propio margen de
reventa para su cliente final, y al emitir se crea la cotización REAL en el
pipeline interno de la marca — marcada con `"origenPortalId"` (chapita
"portal" en `pipeline-view.js` de Apple y Poly). No es una marca ni pertenece
al staff: no carga `shared/auth.js`, `shared/sync.js` ni `brand.js` de ninguna
marca. Ver `docs/BASE-DE-DATOS.md` § 1b para el modelo de datos completo
(tablas `portal_*`, el claim de JWT ortogonal a `user_role`, las tres Edge
Functions) y el plan "Portal de clientes-canal" para el porqué de cada
decisión.

| Archivo | Responsabilidad |
|---|---|
| `js/session.js` | Sesión GoTrue propia, con su propia clave de `localStorage` (`ceven_portal_auth_session`, **no** `ceven_auth_session` — el origin es el mismo que el shell/cotizadores, así que reusar la clave del staff pisaría su sesión). Define `cevenAuthedFetch()` con el mismo nombre y contrato que `shared/auth.js` a propósito: es lo que deja reusar `shared/asistente.js` sin tocarle una línea |
| `js/state.js` | Marca activa, catálogo bajado, carrito, cliente final elegido — todo en memoria, nada en `localStorage` (el portal no es offline-first). También `cevenDelegate`/`cevenActEl`, copiados de `shared/ui-core.js` porque ese archivo no se puede cargar acá (sus IIFEs de arranque asumen `brand.js`/`state.js` de un cotizador interno) |
| `js/onboarding.js` | El perfil que se completa una sola vez (`portal_perfiles`) |
| `js/catalog.js` | Pide el catálogo a `portal-catalogo` (ya con precio) y pinta la grilla + el carrito, mismo patrón `_catRowHTML` que `multi/js/catalog-view.js` |
| `js/pricing-client.js` | El markup de reventa, puro — no es plata de Ceven, no hace falta que sea "la misma cuenta en todos lados" como sí lo son `apple\|poly/js/pricing-core.js` |
| `js/clientes-finales.js` | CRUD de los compradores del cliente-canal, directo por REST (RLS ya filtra "los míos") |
| `js/logo.js` | Sube/muestra el logo propio (Storage `portal-logos`), no el mecanismo `clogo`/`app_settings` de los cotizadores |
| `js/pdf.js` | El documento canal→cliente final: dos logos (el propio + el de Ceven, fijo) y precios de **reventa**, nunca los de Ceven. Reusa `shared/pdf-core.js` tal cual |
| `js/emitir.js` | Llama a `portal-emitir`; arma el PDF con la respuesta CONFIRMADA del servidor, no con el carrito local |
| `js/historial.js` | Los pedidos propios (`portal_solicitudes`), con costo Ceven y precio de reventa lado a lado — es su propia plata, no la fórmula interna |
| `js/asistente-hooks.js` | Los tres hooks de `shared/asistente.js` (mismo patrón que `poly/js/catalog.js`): el chat no se construyó de nuevo, ya existía (`api/asistente.js`, agosto 2026) pensado explícitamente para este portal |
| `js/boot.js` | Cablea formularios/botones y decide login / onboarding / app según la sesión |

**Lo que NO carga y por qué**: `shared/auth.js` (domain check `@ceven.com`),
`shared/sync.js` (asume RLS de staff y el blob `app_settings`), `shared/clientes.js`
(la ficha local se reemplaza por `portal_clientes_finales`, tabla real con RLS),
`shared/ui-core.js` (sus IIFEs de arranque dependen del `state.js` de un
cotizador interno), `shared/pwa.js` (sin instalación PWA en esta primera
versión — pendiente).

## `src/tareas/`: el tablero del equipo

Una página, no una marca. Entra desde la tarjeta del shell igual que un cotizador, pero **no** carga `brand.js`, `theme.js`, `sync.js` ni nada del pipeline: son 9 scripts contra los 43 de Poly.

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Esqueleto: equipo, alta y las tres columnas vacías. Los cuerpos los llena el JS |
| `js/board.js` | Render del tablero, los dos arrastres y el modal de detalle |
| `css/board.css` | Estilos propios. Sin variante oscura: el shell es siempre claro |

Lo que hay que saber para tocarlo:

- **El estado y la sincronización no están acá**, están en `shared/todos.js` (`window.cevenTareas`). `board.js` solo pinta y llama; el shell usa el mismo store para la pastilla de pendientes.
- **Un tablero por equipo**, con pestañas arriba. ⚠ Separan el trabajo en la **pantalla, no en la base**: el cliente se baja `todos` entero y filtra en JS, y cualquier `@ceven.com` puede leer y escribir todos los equipos. Es deliberado — el porqué y qué haría falta para que fuera aislamiento real están en `20260804200000_tareas_equipos.sql`.
- **Las terminadas hace más de 3 días se archivan solas** (constante `DIAS_ARCHIVO`): salen del tablero, no se borran, y hay un botón en Done para verlas. El corte se mide sobre `terminadaEn`, que escribe **solo el trigger** de la base.
- **Conviven dos arrastres** en la misma pantalla: tarjeta→columna mueve de estado, miembro→tarjeta delega. Se distinguen por el **tipo MIME** del `dataTransfer` (`application/x-ceven-tarea` / `-miembro`), porque `getData()` no se puede leer durante `dragover` — solo `types`. Cada objetivo llama a `preventDefault()` **únicamente** para su tipo, y por eso la tarjeta anidada dentro de la columna no se pisan.
- **Todo lo que se hace arrastrando se puede hacer sin arrastrar**: en celular no existe `dragstart`. El detalle (tocar la tarjeta) mueve y delega, y con el teclado `Enter` abre y `←`/`→` mueven de columna.
- El repintado **se posterga mientras haya un arrastre en curso**: si el poll de 15 s rehace el DOM con algo en la mano, el navegador cancela el gesto sin avisar.
- Sin marca, la barra superior se declara con `window.CEVEN_PAGE = {label, icon}` antes de `shared/navbar.js` (ver el comentario de ese archivo). No es un `CEVEN_BRAND` falso a propósito.

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

Desde 2026-07-31 la superficie de navegación es la **barra superior** (`shared/navbar.js`), presente en todas las vistas y en el shell. Los saltos entre vistas de primer nivel salen de ahí; los botones sueltos que había repartidos por las toolbars (📋 al historial, 🎯 al pipeline, 🌙 dark mode) se quitaron. El "← Volver" de cada vista se conservó: en `addprod` y `qnac` es la **única** salida, porque no tienen ítem propio en la barra, y en las demás sigue siendo la vuelta al paso anterior del flujo. La barra se resincroniza en cada cambio de vista: `_navApply()` llama a `cevenSyncUserUI()` (en `auth.js`), que aplica los permisos del rol y termina llamando a `cevenNavbarSync()`.

La integración con el historial del navegador pasa por `shared/nav.js`:

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

1. **`src/hp/brand.js`**: copiar el de Poly y ajustar `id`, `prefix` (`'hp_'`), `settingKeys`, `pipeCols`/`numCols`/`objCols`/`nullableCols`, `navItems`, `theme` (el azul del logo, `#0096d6`, ya reservado en la tarjeta del shell) y los campos de backup. Este archivo es casi todo lo que la marca necesita declarar.
2. **`src/hp/index.html`**: cargar `brand.js` primero, enseguida `../shared/theme.js`, después `safe.js`, `config.js`, `auth.js`, `notify.js` + el guard de sesión, después `navbar.js`, y al final los módulos compartidos y los propios (ver "El orden de carga importa").
3. **Módulos propios en `src/hp/js/`**: solo lo que sea genuinamente distinto. Poly, que es la marca más simple, tiene 13 archivos y ~1.900 líneas; casi todo eso es su modelo de pipeline por OPG.
3b. **Sumarla al cotizador multimarca**: una entrada más en el registro
   `src/multi/js/marcas.js` (precio, repricing, fila de `cquotes`, fila de
   pipeline) y su `pricing-core.js` en el `index.html` del multimarca. El
   catálogo se junta solo: `catalogo-multi.js` recorre las marcas del registro.
4. Activar la tarjeta en el shell (`src/index.html`): convertir el `<div class="mcard soon" data-brand="hp">` en `<a class="mcard" data-brand="hp" href="hp/">` y sacarle el `<span class="badge">Próximamente</span>`. El `data-brand` ya trae el acento; si se cambia el color hay que tocarlo en los dos lados (el shell no carga `brand.js`). El logo va en `src/icons/brands/<marca>.png` (recortado, ~128 px de lado mayor) y se declara además en el mapa `MARKS` de `shared/navbar.js`, que es de donde sale el chip de la barra superior; si el logo es de un solo color oscuro se marca `mono:true` para que `dark.css` lo invierta en modo oscuro.
5. **Registrar los archivos nuevos en `ASSETS` de `src/sw.js`** (y el `index.html` en `DOCS`), subir `APP_VERSION` en `shared/config.js` y verificar con `node scripts/check-precache.js`. Si falta uno, el precache queda incompleto y la marca no abre sin conexión.

En Supabase no hay que tocar nada: las tablas ya separan por `brand` (PK compuestas `(brand,id)` / `(brand,key)`). Si la marca necesita campos propios, se agregan a `pipeline` como columnas aditivas que quedan NULL para las demás (así se hizo con `opg`/`salas`/`factura` de Poly) y se declaran en `pipeCols`.

**Qué NO hacer**: meter `if (CEVEN_BRAND.id === 'hp')` dentro de `src/shared/`. Si un módulo compartido necesita variar, el parámetro va en `brand.js`. Y a la inversa: si la lógica de la marca es realmente distinta (como el pipeline por OPG de Poly frente al de familias de Apple), **va en su carpeta** — forzarla a un módulo común con ramas por marca adentro es peor que la duplicación.

## Roles y permisos (definidos en shared/auth.js)

- **admin**: sin restricciones; único que gestiona usuarios (y `admin@ceven.com` es admin siempre, por bootstrap).
- **ventas**: ve todo; solo modifica cotizaciones/filas de pipeline cuyo "Ejecutivo" coincide con su nombre.
- **lector**: no modifica nada guardado ni usa pipeline; puede armar y guardar una cotización nueva.

El campo Vendedor (`#exec`) se autocompleta y bloquea para no-admins.

El rol se deriva **del JWT**, no de localStorage: `cevenMyRole()` lee el claim `user_role` (el que inyecta el Custom Access Token Hook, activo desde el 31/07/2026) y, si no está, cae a `user_metadata.role`. Sin token usable devuelve `lector` — fail-safe.

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

## Opciones A/B de una cotización

Desde 10/08/2026 una cotización puede llevar **dos propuestas alternativas** —
Opción A y Opción B — y guardarse como una sola. El caso real: se le ofrecen al
cliente dos armados (uno más caro y uno más económico) y él elige uno.

**La regla que sostiene todo: solo la opción *vigente* suma al pipeline, al
Target y al Excel.** Si las dos sumaran, el forecast quedaría inflado con plata
que nunca se va a facturar, y eso no se nota mirando la pantalla — se nota a fin
de mes, cuando el total no cierra.

| Dónde | Qué |
|---|---|
| Cada línea | campo `opc` (1 = A, 2 = B). Sin el campo es 1, por eso todo lo guardado antes sigue funcionando |
| `cquotes` | columna visible **`Opción`** (va al Excel) y **`_opcEf`**, la vigente, escrita en **todas** las filas de la cotización — igual que `_estado`, para no depender de filas "meta" (Poly no las tiene) |
| Pipeline | **nada**: la fila guarda los montos de la vigente y listo. No hizo falta ninguna columna nueva en Supabase |
| `brand.js` | `quoteLists`: qué arrays componen una cotización (Apple suma `warrantyItems`, Poly no), para que `cevenOpcBorrarB()` no conozca los arrays de cada marca |

Las funciones que **hay que usar** en vez de recorrer `cquotes` a mano:

- `cevenOpcFiltrar(arr, n)` — las líneas de una opción, sobre cualquier array de la marca.
- `cevenOpcFilasDeCotiz(db, qn, tipos)` — las filas guardadas de una cotización, **ya filtradas a su opción vigente**. Todo lo que lea `cquotes` para hacer cuentas o para recorrer líneas pasa por acá. Dos motivos: si no filtra, una cotización de dos opciones cuenta doble; y el `lineKey` de los overrides por SKU del pipeline es `SKU|índice` **sobre esta lista**, así que si un lugar filtra y otro no, los índices se corren y los estados por SKU se aplican a la línea equivocada.
- `cevenOpcEfectivaDeFilas(rows)` / `cevenOpcHayBEnFilas(rows)` — para leer una cotización que no está abierta (pipeline, comprobante, historial).

En pantalla: una barra de solapas sobre la grilla (`#opc-bar-box`), que con una
sola opción es apenas el botón "＋ Agregar Opción B". La grilla, el carrito de la
subpantalla flotante y las garantías muestran **solo la opción activa**; editar
la que no es vigente pinta un aviso. Desde la fila del pipeline se cambia la
vigente sin reabrir la cotización (`cambiarOpcionVigente()`), y el monto de la
fila **se recalcula** con las líneas de la opción nueva — dejarlo como estaba
sería peor que no tener la funcionalidad, porque la fila diría "Opción B" con la
plata de la A.

El PDF y el comprobante imprimen **las dos opciones**, cada una con su total, y
arriba la leyenda de `cevenOpcLeyenda()`: sin ella el cliente puede leer las dos
tablas como dos partes de la misma compra y sumar los totales.

## El price list de Apple

El catálogo de Apple **viene partido en dos Excel** que hay que cargar juntos: la
lista normal (`APPLE Price list A …`) y la FTZ (`APPLE Price list FTZ A …`). Tres
cosas de esos archivos están cableadas en `apple/js/catalog.js`:

- **El encabezado no está en la primera fila**: arriba hay cuatro renglones de
  avisos de Apple. `_plHeaderIdx()` busca la fila que tenga **dos** encabezados
  conocidos (una celda suelta que diga "SKU" en el texto de arriba no alcanza).
- **El SKU nuestro es la columna `Model #`** (`MD4P4LE/A`), no la columna `SKU`,
  que es un código interno corto de Apple (`321D38`) que no matchea con nada.
  Junto con `Model #` se cargan `Country`, `Description` y `Selling Price`;
  `LOB` y `Model` se guardan además porque de ahí salen los filtros del catálogo
  y el matching de `getNac()`.
- **Los dos archivos se pisan en algunos SKU** (14 en la lista de 06/2026) y en
  unos pocos el precio del FTZ es mayor. `_plFold()` pliega por `Model #` y
  **se queda con el precio más alto**: cotizar de menos sale plata.

`📂 Cargar Excel/CSV` reemplaza el catálogo entero (y con él los productos
manuales); `💲 Actualizar precios` mergea sobre lo que ya hay, marca `needsReview`
lo que no apareció y conserva los manuales. Los dos caminos comparten
`_plCols()`/`_plFold()`, así que no pueden discrepar sobre cuál es el SKU — que
es justo lo que pasaba antes: la carga completa guardaba el código interno y la
actualización buscaba por `Model #`, así que "actualizar" duplicaba el catálogo.

## Los dos Excel del catálogo de Poly

En `p-catalog` entran **dos archivos distintos**, con dos botones y una ayuda
desplegable (`#excel-ayuda`) que explica cuál es cuál — la ayuda está en la
pantalla y no acá porque el que carga el Excel es un vendedor. Los dos pasan
por `handlePL()`, que **decide por el CONTENIDO, no por el botón**.

| | `📂 Catálogo NetSuite` | `🎯 Deals (BOM Calculator)` |
|---|---|---|
| Origen | NetSuite, búsqueda guardada `ResultadosPreviewCatalogDistri` (`ingresoPoly.xls`) | el BOM Calculator mensual de HP/Poly, **hoja `Promos`** |
| Forma | una fila por (SKU × depósito × nivel): 77 SKU = 564 filas | una fila por SKU en promoción (673 en el archivo de 07/2026) |
| Columnas | `Nombre`, `Nombre para mostrar`, `Nivel de precio`, `Precio unitario`, `Ubicacion del inventario`+`LocAvailable`, `Programa fiscal`, `RUBRO` | `Base SKU`, `Description`, `BDNet`, `Deal`, `End Date` |
| Efecto | **reemplaza** el catálogo | **mergea**: agrega el nivel `DEAL` y da de alta los SKU que no estaban |
| Función | `processRows()` → `_processRowsTiers()` | `processDeals()` → `_leerFilasDeals()` |

Cuatro cosas cableadas en `poly/js/catalog.js`:

- **La detección es por contenido** (`_hojaPromos()` + `_pareceDeals()`). El
  archivo de deals trae 24 hojas y la primera se llama `BOM`: cargarlo por el
  camino del catálogo no daba ningún error, daba un catálogo de basura con los
  77 SKU reales y sus cuatro precios borrados. Los botones existen porque son
  donde se explica qué archivo va en cada uno, pero manda el archivo.
- **El deal es un nivel de precio más** — `precios['DEAL']`, declarado en
  `priceTiers` de `poly/brand.js` con `deal: true`. Por eso lo cotizan sin
  cambios el selector global, el de línea y `repricearLinea()`, y por eso **no
  hizo falta tocar `pricing-core.js`** (que es byte a byte igual al de las Edge
  Functions del portal). Lo que un tier no tiene —número y vencimiento— va en
  `p.deal = {nro, fin}`; el precio **no** se duplica ahí.
- **Reimportar NetSuite conserva los deals.** `processRows()` guarda el
  `p.deal`/`precios.DEAL` de lo que ya había y se lo vuelve a poner a los SKU
  del archivo nuevo, y conserva los SKU que existen solo por un deal — igual
  que hace con los `manual`. Sin eso, un deal duraba hasta la próxima
  actualización de stock, que es cosa de horas.
- **Un archivo de deals nuevo reemplaza TODOS los deals**, no los acumula: si
  se fueran sumando, un SKU que salió de la promoción se seguiría cotizando al
  precio viejo hasta que Poly rechazara la orden. Los SKU que existían solo por
  un deal que ya no está se van del catálogo (sin deal no les queda ningún
  precio); el aviso del final dice cuántos.

El nivel `DEAL` también aparece en el multimarca, que lee los niveles de las
claves de `precios` del catálogo (`nivelesPoly()` en `multi/js/quote.js`). Esa
función **une las claves de todo el catálogo** en vez de tomar las del primer
producto con precios: `DEAL` lo tienen solo algunos SKU, así que el atajo viejo
lo mostraba o no según qué producto estuviera primero.

Un deal vencido **se sigue viendo** —en rojo y tachado en el catálogo, con
`⚠ venció` en el selector de la línea— en vez de esconderse: el vendedor tiene
que poder ver a cuánto estuvo y pedir la renovación. El día del vencimiento
todavía vale (`End Date 31/07` = hasta el 31/07 inclusive).

> **`DEAL` no es lo mismo que un REGI.** El REGI (`regi_codigos`, ver
> `HISTORIAL.md` del 21/08) es un precio por SKU que **Ceven** le habilita a un
> cliente-canal puntual, y vive en el portal. El `DEAL` es el precio que
> **HP/Poly** le habilita a Ceven, vive en el catálogo interno y no llega al
> portal: `portal-catalogo` cotiza con el `poly_tier` del cliente, que nunca es
> `DEAL` (el `<select>` de esa pantalla tiene los cuatro niveles escritos a
> mano), y los SKU que solo tienen deal quedan afuera por el filtro
> `price !== null` que ya existía.

## El campo Cliente

Usaba `list="cliente-datalist"`, el desplegable nativo del navegador. Desde el
24/08 el `<input>` ya no lo abre (`autocomplete="off"`, sin `list=`) y lo
reemplaza un popover propio que vive en `shared/clientes.js`, al final del
archivo. El desplegable nativo no es estilable, y en Chrome además matchea por
**prefijo**: tipear "galicia" no encontraba "Banco Galicia".

**El `<datalist>` sigue en el HTML de las tres marcas y tiene que seguir**: dejó
de ser el desplegable y pasó a ser la fuente de datos. Lo llenan las dos
funciones que ya existían —`cevenRefreshClienteDatalist()` (local, instantánea)
y `cevenClientesDbRefreshDatalist()` (`clientes-db.js`, la tabla `clientes`, por
red y más tarde)— y el combo lo lee en cada apertura. Por eso el combo no sabe
nada de Supabase ni de en qué orden llegan las dos listas.

Lo que aporta sobre el nativo: matchea en el medio de la palabra y sin acentos
("penaflor" → Peñaflor), ordena los que **empiezan** con lo tipeado primero,
resalta la coincidencia, muestra el **nivel de precio** de cada cliente —que es
justo el que `aplicarTierDelCliente()` va a aplicar al elegirlo— y cuando no hay
coincidencias dice que se va a crear un cliente nuevo, en vez de no abrirse.

Dos detalles del código que parecen de más y no lo son:

- **`_plegar()` y `_fold()` son dos funciones.** `_plegar()` saca acentos y baja
  a minúsculas conservando el largo; `_fold()` es eso más colapsar espacios,
  para buscar. Están separadas porque `_resaltar()` busca sobre el texto plegado
  y **corta sobre el original**: si el plegado cambiara el largo, el `<b>` caería
  corrido. `_resaltar()` compara los largos antes de cortar y, si no cuadran,
  muestra el nombre sin resaltar.
- **Al elegir se dispara un `change` que burbujea.** Es el contrato con el resto
  de la app: de ese `onchange` cuelgan `aplicarTierDelCliente()` y
  `cevenClienteCambio()`. Un input escrito por JS no lo dispara solo. Mismo
  contrato que `monthpicker.js`.

`Escape` cierra el desplegable y **corta la propagación**, porque `shared/nav.js`
también escucha Escape para salir de la vista.

## Filtros del pipeline y "Top clientes"

`renderPipeline()` filtra en **dos pasos** en las dos marcas, y el intermedio no
es cosmético:

```js
var sinBuscar = pipe.filter(/* ejecutivo + estado + mes (+ familia en Apple) */);
cevenPintarTopClientes(sinBuscar);          // shared/pipeline-ui.js
var filtered = !q ? sinBuscar.slice() : sinBuscar.filter(/* búsqueda de texto */);
```

Tocar una pastilla de Top clientes **escribe el nombre del cliente en el
buscador** (`setPipeClientFilter`). Si las pastillas salieran de `filtered`, el
primer clic dejaría una sola pastilla y no habría forma de saltar a otro
cliente; si salieran de `pipe` —que es lo que hacían hasta el 24/08— dirían
números que la tabla de abajo contradice. `sinBuscar` es el punto medio correcto.
El `.slice()` tampoco sobra: `filtered.sort()` ordena en el lugar.

`cevenPintarTopClientes()` ordena **por monto**, excluye `Perdido` (no `Facturado`)
y agrupa con `cevenPipeGroupBy()`, el mismo agrupador que la tabla — así las
pastillas y los encabezados de grupo no pueden discrepar sobre quién es quién.
El detalle de los cuatro errores que tenía la versión duplicada está en el
comentario de cabecera de la función y en `HISTORIAL.md` (24/08).

El botón **"✕ Limpiar filtros"** vive dentro de la tarjeta de filtros (una celda
más de la grilla `.gf`), en rojo (`.bo.red`), no en la barra de acciones. Es el
mismo lugar donde ya estaba el "Limpiar" del Historial.

## Fórmula de precio

`calcP(base, nac, mg) = round( base · (1 + nac/100) / (1 − mg/100) )` — costo base + % nacionalización según modelo (tabla NAC con overrides por cotización), dividido por (1 − margen). Cotizaciones "FOB" (observaciones que empiezan con `FOB`) fuerzan NAC = 0.

## Puntos frágiles conocidos

- **Todo es global**: cualquier función nueva puede pisar otra si repite nombre, y el que pierde es el que se define primero — en silencio. Hay un chequeo para esto; ver más abajo.
- `qNum` se crea sin `var` (global implícito) en `state.js`, y se **incrementa en cada carga de página**, así que dos usuarios que abren la app a la vez pueden tomar el mismo número y pisarse la cotización al guardar. El arreglo de fondo es una sequence en Postgres.
- La sync sube el `localStorage` entero por clave: `app_settings.value` puede ser grande (el logo en base64, el price list), y el poll lo baja **completo cada 15 s**.
- El HTML se genera concatenando strings. Todo dato que venga de la base o de un Excel **tiene que pasar por `cevenEsc()`** antes de interpolarse: el pipeline y el price list se sincronizan entre todo el equipo, así que un `<img src=x onerror=...>` guardado como nombre de cliente se ejecutaba en la pantalla de todos. Los handlers con datos adentro van por `data-*` + delegación de eventos, nunca por `onclick="fn('"+dato+"')"` — ese escapado no cubre la barra invertida.
- **Bajarle el rol a alguien no es inmediato**: las policies leen el claim `user_role` del JWT, así que el cambio surte efecto recién cuando el token se refresca (~1 h) o el usuario vuelve a entrar. Fue el costo aceptado al elegir el hook en vez de una subconsulta por fila; está explicado en `HISTORIAL.md` (31/07).

## Verificar antes de commitear

No hay tests. Lo mínimo que conviene correr:

```bash
node scripts/check-precache.js       # rutas del service worker vs. archivos reales
node scripts/check-globals.js        # una función definida dos veces en un bundle, o llamada sin estar en él
node scripts/check-comprobante.js    # genera el comprobante en PDF y le lee el texto
node scripts/check-opciones.js       # opciones A/B: que el pipeline NO sume las dos
node scripts/check-multi.js          # multimarca: mismo SKU al mismo precio por los dos caminos + la pantalla y la flotante se arman
node scripts/check-emitir.js         # emisión: reparto, numeración y re-emisión idempotente
node scripts/check-apple-catalogo.js # importador de Apple: encabezado corrido, Model # y los dos archivos
node scripts/check-apple-picker.js   # la flotante de Apple y la fila compartida con el catálogo
node scripts/check-apple-manual.js   # alta/edición/baja de un artículo a mano en Apple
node scripts/check-combo-cliente.js  # el desplegable del campo Cliente
node scripts/check-pipe-pills.js     # pastillas del pipeline: "Top clientes" y "Cierre estimado"
node scripts/check-poly-catalogo.js  # importador de Poly: tiers, stock e IVA
node scripts/check-poly-deals.js     # importador de deals (hoja Promos) y su convivencia con el catálogo
node scripts/check-poly-tiers.js     # niveles de precio de Poly
node scripts/check-poly-manual.js    # alta/edición de un artículo a mano
node scripts/check-poly-netsuite.js  # el link de Netsuite del pipeline
node --check src/<archivo>.js        # sintaxis de lo que tocaste
```

`check-comprobante.js` corre jsPDF de verdad en Node y busca el texto esperado
dentro del archivo (jsPDF no comprime los content streams, así que se puede leer
con una expresión regular). Existe porque un error de dibujo **no tira
excepción**: sale un PDF con una columna corrida o sin condiciones comerciales, y
eso lo ve recién el cliente. Con `--guardar` deja el PDF para mirarlo.

`check-apple-catalogo.js` corre sin argumentos contra un banco que **imita la
forma** de los dos price list (avisos antes del encabezado, `SKU` interno junto a
`Model #`, un SKU repetido más caro en el FTZ), porque los `.xlsx` reales son
datos de trabajo y están en `.gitignore`. Si los tenés a mano se le pasan por
línea de comandos y corre los chequeos genéricos contra ellos:
`node scripts/check-apple-catalogo.js "APPLE Price list A ….xlsx" "APPLE Price list FTZ A ….xlsx"`.

`check-poly-deals.js` sigue el mismo criterio: banco propio por defecto (con la
fila de pie `Applied filters:` que trae el archivo real, y con las vigencias
calculadas **relativas a hoy** para que no empiece a fallar solo el mes que
viene), y los chequeos genéricos contra el archivo real si se lo pasás:
`node scripts/check-poly-deals.js "BOM-Calculator-ARG-….xlsx"`.

`check-globals.js` existe porque acá todos los `<script>` comparten scope: si dos archivos definen la misma función, **el que carga después pisa al anterior sin ningún error**. Pasó con `openSkuOvLink`/`editSkuOvLink`, duplicadas en `pipeline-detail.js` desde el corte del monolito hasta que un review las encontró; la que corría era la de abajo y la otra era código muerto que alguien podía leer y creer vigente. El riesgo creció con `shared/`: una función movida a compartido puede chocar con una copia que quedó en la marca.

Desde el 12/08/2026 revisa además **lo inverso**: una `ceven*()` que el bundle **llama y nadie define**. Sin build ni módulos eso no se nota al cargar — la página se ve perfecta y revienta recién cuando alguien toca el botón que la usa. Fue el caso de `cevenNormClient()`, que `clientes.js` usaba y vivía en `pipeline-group.js`: el multimarca carga uno y no el otro, así que el error salía en `Guardar`. Se limita al prefijo `ceven` (nuestro namespace, donde un nombre suelto siempre es un error), ignora los comentarios y respeta las dependencias opcionales declaradas con `typeof cevenX === 'function'`.

**Lo que ningún script cubre**: que la app efectivamente abra y funcione. No hay tests ni verificación automática de comportamiento — hay que abrir las dos marcas a mano.
