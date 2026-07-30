# Historial · Cotizadores Ceven

Bitácora de qué se hizo, cuándo y **por qué**. Complementa a `ARQUITECTURA.md`
(cómo está armado hoy) y a `BASE-DE-DATOS.md` (esquema de Supabase).

> **Convención**: entradas nuevas arriba. Cada una lleva fecha, los commits que
> la respaldan y —lo importante— la razón de la decisión, que el `git log` no
> guarda. Si algo queda a medias, va a "Pendientes" al final.

---

## Estado actual (30/07/2026)

Plataforma multi-marca deployada en **https://cotizadores-ceven.vercel.app**
(Vercel, team CEVEN, proyecto `cotizadores-ceven`). Shell con login + selector de
marcas, cotizador **Apple** y cotizador **Poly** completos, HP pendiente.
PWA instalable y funcional offline. Base Supabase `iqewnebpdyctexavtpmt`.

**Todavía no está en uso real** (sin usuarios ni datos productivos), que es lo que
permitió el refactor del 28–30/07 sin red de contención. Los signups públicos están
cerrados: la única alta es la Edge Function `admin-users`.

---

## 28–30/07/2026 · Review completo y fin del monolito troceado

Commits `09b8525` (Ola 1), `b8bf98e` (Olas 2–3), `7241d34` (Ola 4).

**El punto de partida**: un review con agentes en paralelo sobre los ~10.500
renglones propios encontró ~60 hallazgos únicos. Tres problemas de fondo, y cada
uno explicaba varios bugs concretos: (1) no había autorización real —los roles
vivían en el cliente—, (2) el modelo de sync no tenía reloj, así que "quién gana"
lo decidía el orden de llegada de los POST, y (3) los errores se tragaban en
silencio, de modo que fallas de cuota y de red se presentaban como éxitos.

**La decisión**: el usuario pidió eliminar la estructura de monolito troceado
antes que parchar. Como la app no está en uso real, se priorizó estructura por
encima de compatibilidad. Se hizo en cuatro olas, con agentes en paralelo sobre
conjuntos de archivos disjuntos y el cableado (`index.html`, `sw.js`) siempre
reservado al hilo principal para que nadie se pisara.

**Lo que cambió estructuralmente**: `src/<marca>/brand.js` concentra todo lo que
distingue una marca (prefijo de localStorage, columnas del pipeline, claves de
settings, tags de backup). Los módulos compartidos lo leen y no tienen ni una
constante por marca adentro. Pasaron a `src/shared/`: `sync.js`, `backup.js`,
`backup-folder.js`, `ui-core.js`, `undo.js`, `init.js`, el CSS y `safe.js`
(`cevenEsc`, `cevenLsSet`, `cevenLsJSON`, `cevenParseMoney`). Apple bajó de 22 a
17 módulos propios; Poly, de 20 a 13 y ~1.900 renglones, casi solo su lógica de
negocio. Cero definiciones globales duplicadas en el bundle de cada marca.

El total de renglones **subió ~290**: la dedup sacó ~1.900 pero los fixes
agregaron más. `sync.js` pasó de 751 (sumando las dos copias) a 954 porque ahora
persiste la cola de pendientes, mergea por id, distingue "vacío" de "no se pudo
leer" y maneja los races.

**Los arreglos que más importaban**:
- El precio unitario se multiplicaba por 100 al reeditarlo, en las dos marcas: el
  input mostraba el número crudo de JS (`1041.67`) y el parser borraba todos los
  puntos asumiendo separador de miles.
- El backup de Apple volcaba **todas** las claves de localStorage —incluido el
  `access_token` y el `refresh_token`— a un JSON que se reescribe cada 8 s en la
  carpeta del usuario, típicamente OneDrive. Poly ya lo filtraba bien. Ahora es
  lista blanca derivada de `settingKeys`, aplicada también al import.
- XSS almacenado: `cliente`, `SKU` y `descripción` se concatenaban crudos en
  `innerHTML` en ~20 módulos, y como esos datos se sincronizan, el payload se
  ejecutaba en la pantalla de todo el equipo. Todo pasa por `cevenEsc()` y los
  handlers inline con datos adentro se convirtieron a delegación de eventos.
- El rol salía de localStorage: escribir `{role:'admin'}` a mano alcanzaba para
  habilitar la UI de admin. Ahora se deriva del JWT.
- CSP con `connect-src` acotado a Supabase, que corta la exfiltración aunque
  quede un XSS sin ver.

**Verificación**: toda estática —sintaxis, precache, globales duplicadas, y
bancos de prueba en Node para sync (37/37 Apple, 34/34 Poly) y para auth (7
escenarios, incluida la sesión forjada). **Nadie abrió la app en un navegador.**

---

## 27/07/2026 · Navegación con botón Atrás y Escape

Commits `1c535b5` ("d"), `51aba99` ("dd"), `49f860f` ("deploy").

**Problema**: la navegación era un SPA casero que solo prendía/apagaba divs `.pg`
sin tocar el historial del navegador. Consecuencia: estando en Catálogo, Pipeline,
Historial o Nacionalización, el botón **Atrás** del celular **te sacaba de la app
entera**; y varios modales (Target Anual, Análisis por SKU, CevenCare, editar
ítem, Usuarios, Editar perfil) solo cerraban con la "×".

**Solución**: módulo nuevo `src/shared/nav.js` (`window.cevenNav`) con **una sola
pila de overlays y un solo listener `popstate`**, más flags anti-doble-cierre
(`_internalClose` / `_closingViaBack`) para que cerrar por "×" y cerrar por Atrás
no se pisen. `goTo()` se partió en `_navApply()` (aplica la vista, no toca el
historial) + `goTo()` (delega en `cevenNav`). Cada `openXxx/closeXxx` se enganchó
a la pila. Se agregó restauración desde el `#hash` al recargar.

Resultado: Atrás/Escape cierra primero el modal de arriba, después retrocede
entre vistas, y recién desde `quote` sale de la app. Apple y Poly espejados.

**Ojo**: esto se implementó con un agente en segundo plano y **nunca se verificó
en un navegador real** — la validación fue estática (sintaxis + trazado manual de
los flujos de historial). Ver "Pendientes".

### Mismo día, antes: organizador de tareas del equipo

Tabla nueva `todos` en Supabase (sin columna `brand`: un solo checklist para todo
el equipo) + `src/shared/todos.js`, con poll cada 15 s. Sincroniza por REST
directo, no por el intercept de `localStorage` de los cotizadores.

De paso, el sistema de cartel/deshacer/modal que vivía dentro de `poly/js/boot.js`
se extrajo a `src/shared/notify.js` — era código genérico y el shell lo reusa en
vez de duplicarlo. Se reemplazaron los `alert`/`confirm`/`prompt` nativos de Poly.

### Mismo día, antes: reparación de Poly (`4c31bd9`)

Poly había nacido como copia de Apple; esta tanda emparejó el comportamiento real
(backup, pipeline, undo, historial, productos) y arregló el service worker.

---

## 24/07/2026 · Cotizador Poly + PWA

Commit `aca19bb` ("comit", 3.800 líneas).

- **Poly completo**: `src/poly/` siguiendo la receta de `ARQUITECTURA.md`
  (claves de localStorage prefijadas `poly_*`, `BRAND='poly'` en su `sync.js`).
- **PWA**: `src/manifest.webmanifest`, `src/sw.js` (scope `/`), `src/shared/pwa.js`
  (registro + aviso de versión + botón instalar + pastilla offline), `src/icons/`.
- `scripts/check-precache.js`: valida la lista `ASSETS` del service worker. Existe
  porque **el install es todo-o-nada**: una sola ruta rota y el worker nunca
  activa, en silencio.
- Migración aditiva en la tabla `pipeline`: campos `opg`, `salas`, `factura`
  (solo Poly) conviviendo con los de Apple, que quedan NULL para `brand='poly'`.
- Se colaron al repo tres archivos de datos (`Camuzzi.xlsx`,
  `LP Y STOCK INFORMATICA 20-07.xlsx`, `COT_6589_QUALIX SRL.pdf`). El repo es
  privado, así que no hay exposición, pero no deberían estar versionados.

**Decisión de diseño del SW**: la versión se **importa** (`importScripts`) desde
`shared/config.js` en vez de pasarse por query string. Motivo: el chequeo de
actualización del navegador compara también los scripts importados, así que subir
`APP_VERSION` dispara el worker nuevo en la carga siguiente. Pasándola desde la
página, se leía un `config.js` servido por el propio worker desde caché y el bump
tardaba **dos** cargas en notarse.

---

## 16/07/2026 · Pérdida de datos offline (bug crítico) + deploy

**El bug**: `syncPipeline()` marcaba los cambios como subidos *antes* de que el
push resolviera, y los push se tragaban los errores. Al reconectar, el `poll()`
pisaba el `localStorage` con lo que había en el servidor ⇒ **se perdían las
ediciones hechas sin conexión**.

**El fix**: los tres push devuelven `true`/`false` y nunca rechazan;
`syncPipeline()` guarda un `prevSnap` y lo restaura si el push falla;
`retryLater(k)` reintenta con backoff (5 s → 60 s) reusando `_timers[k]`, que ya
bloqueaba el pisado del poll. `window._syncPendingCount()` + el evento
`ceven-sync-pending` alimentan la pastilla de `pwa.js`.

Verificado con Chrome/CDP en las dos mitades: (a) edición offline ⇒ pendiente=1,
dato intacto, el poll no pisa; (b) al volver la red, el reintento reconstruye el
diff y el POST lleva la fila. Los push son upserts por PK / deletes por id, así
que reintentar es idempotente.

> **⚠ CORRECCIÓN (30/07/2026): este fix nunca funcionó del todo.** El review
> encontró que el bloque de rescate del `bootstrap()` leía `cpipeline` *después*
> de que la línea de arriba ya lo había pisado con lo del servidor, así que su
> condición era inalcanzable **por construcción**: `lp` siempre daba `[]`. Había
> además una segunda vía, más barata: `fetchJSON` devolvía `null` igual para
> "vacío" que para "no se pudo leer", de modo que un solo GET fallido borraba el
> pipeline entero. Arreglado en `b8bf98e`, ahora con merge por `id`.
>
> Lo que la verificación de arriba probó fue el camino del **reintento en
> memoria**, que sí andaba. El que perdía datos era el del **reload**, que no se
> cubrió: la cola de pendientes vivía solo en variables del IIFE. Moraleja para
> quien lea esta bitácora: acá "verificado" significa "se probó el escenario que
> se le ocurrió a quien lo escribió", no "es correcto".

**Deploy**: primer deploy a Vercel (team CEVEN). Atención: `vercel deploy` a secas
mandó el primer deploy **directo a producción**, no hizo preview.

---

## 13–14/07/2026 · Reestructuración del monolito y base nueva

Commits `1267ef8` (estado previo) → `bb1251a` … `4aeac51` (Fases 1–6).

**El punto de partida**: dos HTML monolíticos — `index.html` de **7.365 líneas** y
`CevenCareV2.html` de 2.627. Todo mezclado: markup, estilos, lógica de negocio y
persistencia en el mismo archivo.

**Cómo se hizo**: extracción **por rangos contiguos de líneas, sin reordenar
código**. Fue una decisión deliberada: preservar exactamente el comportamiento de
un sistema en producción sin tests, aceptando arrastrar las rarezas del original
(globals implícitos, funciones duplicadas) antes que arriesgar regresiones
silenciosas en cálculos de precios.

**Resultado**: shell (`src/index.html`) + `src/shared/` + `src/apple/` (22
módulos) + `src/vendor/` (librerías auto-hospedadas, sin CDN). Hoy el archivo más
grande es de 870 líneas.

**Base de datos**: se descartó la Supabase vieja (`llxhfhkwqjjdgzsietdo`) y se
endureció la nueva (`iqewnebpdyctexavtpmt`): columna `brand`, PK compuestas
`(brand,id)` / `(brand,key)`, policies `to authenticated` + revoke a `anon`
(verificado: publishable key sola ⇒ 401), Edge Function `admin-users` con
validaciones server-side.

---

## Pendientes

### 🔴 Urgente — depende del usuario
- **Aplicar la migración de RLS**: `supabase/migrations/20260730120000_rls_por_rol_y_marca.sql`,
  escrita el 30/07 y **sin aplicar**. Hoy las policies siguen siendo
  `for all using(true) with check(true)`, así que cualquier usuario autenticado
  —incluido un `lector`— puede borrar el pipeline entero o pisar el price list con
  un `curl`. Los roles de la app son solo UI. La migración tiene los pasos manuales
  del dashboard comentados arriba; es **fail-closed**, así que el orden importa:
  entre aplicar las policies y activar el hook, nadie puede escribir.
- **No hay backup de los datos productivos**: viven SOLO en el `localStorage` del
  navegador del usuario, sin copia en la base. Exportar el backup JSON y, ya
  logueado, importarlo para sembrar Supabase.

### Técnicos
- **Nada de lo hecho el 28–30/07 se probó en un navegador**: la verificación fue
  estática (sintaxis, precache, globales duplicadas, y bancos de prueba en Node
  para sync y auth). Falta abrir las dos marcas y recorrer los flujos.
- **Verificar `nav.js` en un navegador real** (Atrás en el celular, Escape en cada
  modal). Nunca se probó de forma interactiva.
- Sacar del repo los tres archivos de datos commiteados el 24/07.
- La pastilla offline de `pwa.js`: la rama que depende de `navigator.onLine` sigue
  sin verificar (la de "push pendientes" sí está verificada).
- `shared/pwa.js` necesita `updateViaCache: 'none'` en el `register()`.
- La Edge Function `admin-users` escribe el rol solo en `user_metadata`: después de
  aplicar la migración hay que agregarle el upsert a `user_roles` o el modal de
  usuarios deja de cambiar permisos reales (detalle en la migración, paso 5).

### Decisiones de datos pendientes
Dos cosas que los fixes del 30/07 cortan hacia adelante pero no limpian hacia atrás:
- **Cotizaciones con `Margen %` en 0 que en realidad era negativo** (el clamp viejo).
  Es recomputable desde `_base` y `_nac`, pero reabrir la cotización no lo corrige:
  `itemMargin` se carga del valor guardado. Pipeline y Target siguen reportando 0%.
- **Ítems marcados `_nacIncluded:true` por el bug de FOB**: nunca vuelven a
  nacionalizar aunque se saque el FOB, con el costo subestimado ~24%. Una migración
  tendría que distinguir los NAC✓ legítimos de los accidentes de FOB.

---

## Trampas conocidas del entorno (para no volver a pisarlas)

- **Chrome + CDP con `--user-data-dir` en el scratchpad**: falla con
  `CacheStorage: Unexpected internal error`. La ruta es tan profunda que el
  `disk_cache` pega contra el MAX_PATH de 260 de Windows (localStorage e IndexedDB
  sí andan, lo que despista). Usar un perfil en ruta corta tipo `C:/pwa-verif`.
- No usar `--virtual-time-budget` con service workers: los timers corren en tiempo
  virtual y Chrome vuelca el DOM antes de que termine el precache.
- **Testear auth con un token falso cuelga el navegador**: token inválido ⇒ 401 ⇒
  `sfetch` llama a `cevenRefreshToken()` ⇒ el refresh falla ⇒ `cevenForceLogout()`
  dispara un `alert()` que **congela el renderer y cuelga cualquier driver CDP**.
  Para probar la sync: sesión válida + red cortada
  (`Network.emulateNetworkConditions`), nunca un token bogus. Y enganchar siempre
  `Page.javascriptDialogOpening` → `handleJavaScriptDialog`.
