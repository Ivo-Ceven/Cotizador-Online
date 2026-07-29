# Historial · Cotizadores Ceven

Bitácora de qué se hizo, cuándo y **por qué**. Complementa a `ARQUITECTURA.md`
(cómo está armado hoy) y a `BASE-DE-DATOS.md` (esquema de Supabase).

> **Convención**: entradas nuevas arriba. Cada una lleva fecha, los commits que
> la respaldan y —lo importante— la razón de la decisión, que el `git log` no
> guarda. Si algo queda a medias, va a "Pendientes" al final.

---

## Estado actual (28/07/2026)

Plataforma multi-marca en producción: **https://cotizadores-ceven.vercel.app**
(Vercel, team CEVEN, proyecto `cotizadores-ceven`). Shell con login + selector de
marcas, cotizador **Apple** y cotizador **Poly** completos, HP pendiente.
PWA instalable y funcional offline. Base Supabase `iqewnebpdyctexavtpmt`.

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
- **Los signups públicos están ABIERTOS** (`disable_signup: false`). Con la app ya
  pública, cualquiera puede registrarse, confirmar su mail y —como las policies son
  `to authenticated` a secas— leer/escribir TODO el pipeline. Hoy no se filtra nada
  solo porque la base está casi vacía; se vuelve real en cuanto se siembren los
  datos. **Dashboard → Authentication → Sign In/Providers → Email → apagar "Allow
  new users to sign up"**.
- **No hay backup de los datos productivos**: viven SOLO en el `localStorage` del
  navegador del usuario, sin copia en la base. Exportar el backup JSON y, ya
  logueado, importarlo para sembrar Supabase.

### Técnicos
- **Verificar `nav.js` en un navegador real** (Atrás en el celular, Escape en cada
  modal). Nunca se probó de forma interactiva.
- `ARQUITECTURA.md` quedó desactualizado tras Poly/PWA/nav — actualizar.
- Sacar del repo los tres archivos de datos commiteados el 24/07.
- La pastilla offline de `pwa.js`: la rama que depende de `navigator.onLine` sigue
  sin verificar (la de "push pendientes" sí está verificada).

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
