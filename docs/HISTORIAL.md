# Historial · Cotizadores Ceven

## Estado de avance

**Instruccion para el agente que retome este proyecto:** leer este archivo
completo antes de tocar nada. Esta seccion resume el estado real; el resto del
archivo contiene la arquitectura y las decisiones necesarias para continuar.

### Fase 0 — Clientes reales en Supabase

- **Estado: HECHA, incluido el backfill** (19/08/2026). Los 21 clientes
  distintos que ya había en `pipeline` (todos de Poly) se crearon en
  `clientes` y se les completó `pipeline."clienteId"` en las 28 filas que
  matchearon por nombre normalizado. "Gabriel Tosso"/"Tosso Gabriel"
  (nombre invertido, dos filas por el match exacto) ya se fusionaron a mano.
- Detalle completo, con el porqué de cada decisión, en la entrada
  "Portal de clientes-canal + tabla `clientes` real" más abajo.

### Fase 1 — Portal de clientes-canal

- **Estado: HECHA y probada con HTTP real** (20/08/2026). El 19/08 quedó
  construida de punta a punta pero sin probar en un navegador; el 20/08 se
  probó de verdad (con el card admin-only 🧪 "Portal · vista cliente") y
  aparecieron dos bugs de producción reales — ver la entrada del 20/08 más
  abajo: "Portal probado en vivo: catálogo 500, RLS de Mis clientes,
  seguimiento propio del cliente-canal". Los dos quedaron arreglados y
  deployados.
- El portal no tiene PWA/offline (no carga `shared/pwa.js`, no está en
  `src/sw.js`) — decisión deliberada, sin verificar cómo interactuaría con el
  service worker ya activo en `/`.

### Fase 3 — Pulido operativo

- **Estado: HECHA** (19/08/2026): panel 🧑‍💼 "Clientes del portal" en el
  shell (alta/suspender/reactivar, admin-only — `shared/portal-clientes-admin.js`,
  mismo patrón que el modal de Usuarios) y un trigger (`trg_portal_sync_estado`
  sobre `pipeline`) que copia `estado` hacia `portal_solicitudes.estado_ceven`
  cuando un vendedor cambia el estado de una fila — así el cliente-canal ve
  en qué va su pedido sin poder leer `pipeline`.
- **No hecho**: extraer `shared/session-core.js` de `auth.js` (el refactor de
  DRY que evitaría mantener dos copias del refresh de JWT). Se descartó a
  propósito: es beneficio interno puro sobre un archivo `auth.js` que ya
  funciona y que usan todas las páginas de staff — no vale el riesgo de
  regresión sin un motivo funcional que lo empuje.

### Fase 5 — REGI (Deal Registration de Poly) en el portal

- **Estado: construida y verificada por SQL directo, NO probada en un
  navegador todavía** (21/08/2026). Ver la entrada de esa fecha más abajo
  para el diseño completo. Cero Edge Functions nuevas — todo el matching
  vive en dos funciones SQL `security definer` nuevas
  (`portal_equipo_ceven()`, `portal_regi_solicitar()`), verificadas en vivo
  contra la base real simulando el JWT de un cliente-canal real (pendiente,
  aprobado automático, reintentos idempotentes, rechazo y su re-match
  posterior, y que RLS bloquea un insert directo de `regi_solicitudes`) —
  con limpieza de los datos de prueba al final. `portal-catalogo` y
  `portal-emitir` se extendieron (no se tocó `_shared/pricing/*`) y se
  redeployaron.
- **Pendiente**: la prueba de punta a punta en navegador (cliente pide un
  REGI real desde `src/portal/`, staff lo aprueba/rechaza desde el modal
  🎯 del shell, se emite y se confirma el badge + ejecutivo real en el
  pipeline de Poly) — no se hizo porque este agente no tiene credenciales
  de ninguna cuenta de portal ni acceso a navegador en esta sesión.

### Fases siguientes

| Fase | Alcance | Estado |
|---|---|---|
| 2 | Notificaciones por mail al emitir y al cambiar de estado. **Bloqueada**: el proveedor elegido por `vercel integration discover --category messaging` fue Resend, pero instalarlo pide aceptar términos en el navegador (`vercel.com/ceven1/~/integrations/accept-terms/resend`) — paso que solo puede hacer el usuario. Se le preguntó y pidió pausar esta fase. | Pausada, esperando esa aceptación. |
| 4 | Nice to have: notificación interna a Ceven y markup por línea. | Sin empezar. |

**Requisito de acceso:** el agente necesita acceso al mismo proyecto Supabase
`iqewnebpdyctexavtpmt` (por MCP o credenciales) para aplicar migraciones. El
server MCP correcto es `mcp__supabase__*` (no `claude_ai_Supabase`, que está
autenticado con otra cuenta y no ve este proyecto). Para retomar la Fase 2:
confirmar con el usuario si ya aceptó los términos de Resend en
`vercel.com/ceven1`, y si no, preguntar si sigue queriendo Resend o prefiere
otro proveedor antes de reintentar `vercel integration add resend/resend-email`.

Bitácora de qué se hizo, cuándo y **por qué**. Complementa a `ARQUITECTURA.md`
(cómo está armado hoy) y a `BASE-DE-DATOS.md` (esquema de Supabase).

> **Convención**: entradas nuevas arriba. Cada una lleva fecha, los commits que
> la respaldan y —lo importante— la razón de la decisión, que el `git log` no
> guarda. Si algo queda a medias, va a "Pendientes" al final.

---

## Estado actual (19/08/2026)

Plataforma multi-marca deployada en **https://cotizadores-ceven.vercel.app**
(Vercel, team CEVEN, proyecto `cotizadores-ceven`). Shell con login + selector de
marcas, cotizador **Apple** y cotizador **Poly** completos, **multimarca** en
marcha, HP pendiente. PWA instalable y funcional offline. Base Supabase
`iqewnebpdyctexavtpmt`, con RLS por rol y marca aplicada y restringida a cuentas
`@ceven.com`. 8 cuentas activas (3 admin + 5 ventas).

Desde el 19/08/2026 hay además una tabla `clientes` real compartida por todas
las marcas (con backfill aplicado) y un **portal de autoservicio para
clientes-canal** (`src/portal/`, cuentas separadas del staff, nunca
`@ceven.com`), ya probado con HTTP real el 20/08/2026 (ver "Estado de avance"
arriba y la entrada del 20/08 más abajo) — catálogo, alta de clientes finales,
y un seguimiento propio del cliente-canal (estado + motivo de pérdida frente a
SU cliente final) que se ve espejado en el pipeline interno de Ceven.

---

## 🔴 LOS DATOS DE POLY YA SON REALES

Hasta el 31/07/2026 esta base no tenía nada productivo, y eso es lo que permitió
el refactor del 28–30/07 y el cambio de modelo de Poly del 03/08 **borrando y
recreando** en vez de migrar. **Eso se terminó.**

Hoy Poly tiene cotizaciones y pipeline de verdad cargados por el equipo. A partir
de ahora, cualquier cosa que toque `pipeline`, `app_settings` o las claves
`poly_*`:

- **nada de `delete` ni `drop` sobre datos de Poly.** Lo que antes se resolvía
  borrando lo de prueba, ahora se migra;
- **las migraciones se leen enteras antes de aplicarlas**, incluso las que ya
  están en `supabase/migrations/`. Una escrita cuando no había datos puede
  empezar con un `delete` que en su momento era correcto;
- ante la duda, primero un `select count(*)` para saber qué hay del otro lado.

### ⚠ La trampa concreta que ya está en el repo

`supabase/migrations/20260803120000_poly_pipeline_por_proyecto.sql`
**nunca se aplicó** a la base productiva (se ve en `supabase migration list`, y en
que la columna `salas` —que ese archivo dropea— sigue existiendo). Y **NO se
puede aplicar como está**, porque empieza con:

```sql
delete from public.pipeline      where brand = 'poly';
delete from public.app_settings  where brand = 'poly'
  and key in ('poly_cquotes', 'poly_carchive', 'poly_cqc');
```

Era correcto el 03/08 —su encabezado dice "NO HAY DATOS PRODUCTIVOS"— y hoy
borraría **18 filas de pipeline y ~34 KB de historial de Poly**. Si alguna vez
hace falta lo que ese archivo agrega, hay que sacarle los `delete` y aplicar solo
la parte de esquema.

Consecuencia que sigue abierta: la columna `pipeline."esFOB"` **no existe en la
base** porque venía en ese archivo. Ver la entrada del 12/08 más abajo.

Los signups públicos están cerrados: la única alta es la Edge Function
`admin-users`.

---

## 21/08/2026 · REGI: código de Deal Registration de Poly, pedido desde el portal

El pedido: durante la cotización, el cliente-canal tiene que poder cargar un
número de REGI (el Deal Registration que Poly le aprueba a Ceven para un
negocio puntual) + elegir a su ejecutivo Ceven de confianza + pedir
aprobación. Si el código coincide con uno que Ceven ya cargó para ESE
cliente y sigue vigente, se aprueba solo y la lista de precios de ese REGI
se aplica al toque; si no, queda pendiente para que Ceven lo revise a mano.

Alcance acordado con el usuario: **solo Poly** (Apple no tiene este
mecanismo), **solo el portal** (el cotizador interno de Poly no se toca),
precio **propio por SKU** (no un tier ni un % de descuento), un REGI **atado
a un cliente/proyecto puntual** (el mismo código pedido por otro cliente-
canal no matchea), aprobación **por cotización** (se re-verifica siempre
fresco, nunca se asume vigente sin volver a pedirla), y el ejecutivo elegido
**reemplaza** el `ejecutivo: '—'` que hasta ahora quedaba fijo en todo
pedido del portal.

### Decisión que ordenó todo el diseño: cero Edge Functions nuevas

El matching de REGI (¿este código + este cliente existen y siguen vigentes?)
es lógica SQL pura — no toca `auth.users`, no necesita la fórmula de pricing
embebida. Va por el mismo camino que ya usa `ceven_equipo()`: una función
`security definer`, auto-gateada, otorgada a `authenticated`. Evita repetir
el riesgo que ya mordió al equipo el 20/08 (las Edge Functions de Supabase
no pueden leer archivos en runtime) y evita tocar
`scripts/build-portal-pricing-embeds.js`.

Dos funciones nuevas (migración
`20260821120000_regi_deal_registration.sql`, refinada por
`20260821121500_regi_solicitar_informa_rechazo_previo.sql`):

- **`portal_equipo_ceven()`** — la lista de ejecutivos (admin+ventas, nunca
  lector) que puede leer un cliente-canal para elegir a quién dirigir su
  solicitud. **No envuelve `ceven_equipo()`**: esa función filtra
  `where ceven_is_staff()` adentro, y `ceven_is_staff()` lee el `auth.jwt()`
  del llamador REAL de la sesión — no cambia por estar invocada desde otra
  función SQL. Un cliente-canal jamás pasa ese filtro aunque la llame
  indirecto. Se repitió la misma selección de `auth.users`+`user_roles`,
  gateada con `ceven_is_portal_client()` en vez de `ceven_is_staff()`.
  Verificado en vivo: sí devuelve el equipo completo bajo un JWT de portal
  simulado.
- **`portal_regi_solicitar(codigo, ejecutivo_email)`** — el matching. El
  match se re-evalúa SIEMPRE fresco contra `regi_codigos` (nunca se reusa un
  `aprobado` viejo: el REGI puede haber vencido entre una cotización y la
  siguiente). La idempotencia es acotada a propósito: una solicitud
  **pendiente** sin resolver no se duplica en cada reintento, y una
  **rechazada** se devuelve tal cual (con su motivo) en vez de generar otro
  pendiente — pero si Ceven carga el código DESPUÉS de haberlo rechazado, un
  match nuevo siempre gana y aprueba. Las cuatro combinaciones (sin match →
  pendiente; pendiente repetido → no duplica; match nuevo → aprueba; match
  nuevo después de un rechazo → aprueba igual, sin quedar bloqueado por el
  rechazo previo) se probaron en vivo contra la base real, simulando el JWT
  de la única cuenta de portal que ya existe (`Ivo`/cliente 23) con
  `set local role authenticated; set local "request.jwt.claims" = ...` — y
  se confirmó además que un `insert` directo a `regi_solicitudes` con ese
  mismo JWT lo rechaza RLS (`42501`): el único camino de escritura para el
  cliente-canal es esta función. Los datos de prueba se borraron al terminar.

### Las tablas nuevas y por qué el panel de staff no necesita Edge Function

- **`regi_codigos`** — maestro cargado por Ceven: `codigo` (único),
  `cliente_id`, `proyecto`, `vigente_desde/hasta`, `precios` (jsonb,
  `{sku: precio}`), `notas`. RLS: `select` para `ceven_is_staff()`,
  `insert/update/delete` para `ceven_is_writer()`. Sin ninguna policy para
  el cliente-canal.
- **`regi_solicitudes`** — una fila por pedido de aprobación desde el
  portal: `codigo`, `ejecutivo_email/nombre`, `estado` (pendiente/aprobado/
  rechazado), `regi_codigo_id`, `motivo_rechazo`, `resuelto_por/at`. RLS:
  `select` propio + `select` staff, `update` para `ceven_is_writer()` (así
  el panel de staff aprueba/rechaza con un `PATCH` directo), **sin policy de
  `insert`** para `authenticated` — el único insert lo hace la función de
  arriba.
- `pipeline."regiCodigo"` (text, nullable, aditiva) — mismo criterio que
  `origenPortalId`/`origenPortalEstado`: llega gratis al `select=*` de
  `sync.js` sin tocar `pipeCols` de `poly/brand.js`, de solo lectura para el
  staff.

Ninguna de las dos tablas nuevas es del tipo "solo Edge Function puede
tocarla": a diferencia de `portal_clientes` (que sí necesita `service_role`
porque crea logins de Supabase Auth), cargar un código REGI o aprobar/
rechazar una solicitud es lógica de negocio común, igual que ya pasa con
`clientes`/`pipeline`/`todos` — el staff ya puede leer/escribir esas tablas
directo por REST con su propio JWT, y `regi_codigos`/`regi_solicitudes`
siguen el mismo patrón. Esto le ahorró al panel de staff (`shared/
portal-regi-admin.js`, modal 🎯 "Códigos REGI" en el shell, calcado de
`portal-clientes-admin.js`) tener que escribir y desplegar una función
nueva.

Gate de permiso del modal: **no admin-only** como "Clientes del portal"
(que crea cuentas) — alcanza con no ser `lector`, mismo criterio que
`ceven_is_writer()` en la base, porque cargar un REGI o aprobarlo es una
acción de venta, no de administración de cuentas.

### `portal-catalogo` y `portal-emitir`: extendidas, no reescritas

Ambas Edge Functions aceptan ahora un `regiSolicitudId` opcional en el
body. Si viene, se re-valida server-side que la solicitud sea `aprobado` y
propia del que llama (nunca se confía en el id que manda el cliente sin
re-chequear ownership — mismo criterio que ya usaba `portal-emitir` con
`clienteFinalId`), y el precio de tier se pisa SKU por SKU con
`regi_codigos.precios` — los SKU que el REGI no cubre siguen con el precio
de tier normal, así que el cliente-canal sigue necesitando `poly_tier`
asignado para cotizar en general (REGI pisa precios puntuales, no reemplaza
el onboarding). `portal-emitir` además escribe el `ejecutivo` real (en vez
de `"—"`) y el código REGI en `pipeline."regiCodigo"` y en un campo nuevo
`cquotes["REGI"]` — **`"OPG"` no se tocó**, sigue siendo el texto libre de
siempre del cotizador interno; mezclar los dos conceptos (uno histórico sin
lógica de precio, uno nuevo que sí la dispara) hubiera sido confuso.

No hizo falta tocar `_shared/pricing/*.js` ni
`scripts/build-portal-pricing-embeds.js`: el pisado de precio por REGI es
lógica nueva alrededor del cálculo existente, no un cambio a la fórmula.

### Portal cliente

Tarjeta nueva "🎯 ¿Tenés un código REGI para este pedido?" en la vista
Catálogo, visible solo cuando `_portalMarca === 'poly'` (`src/portal/js/
regi.js`, nuevo). El estado se resetea al cambiar de marca — "por
cotización" significa que no persiste entre pedidos nuevos, aunque
reingresar el mismo código ya aprobado antes lo vuelve a confirmar al
toque (el match se re-evalúa, no hace falta que Ceven apruebe dos veces
mientras el REGI siga vigente). Las filas del catálogo y del carrito
cubiertas por el REGI llevan un badge 🎯; el resumen antes de emitir
muestra qué ejecutivo y qué código van a quedar escritos.

### Pendiente

- La prueba de punta a punta en un navegador real (ver "Fase 5" en el
  Estado de avance, arriba) — todo lo que se pudo probar por SQL directo
  contra la base real quedó verificado, pero ni el flujo del portal
  (`src/portal/`) ni el modal del shell (`shared/portal-regi-admin.js`) se
  abrieron en un navegador todavía.
- Badge de cantidad de solicitudes pendientes en el botón 🎯 de la navbar:
  evaluado y descartado para esta pasada por tiempo, no por dificultad —
  queda para cuando alguien lo pida.

---

## 20/08/2026 · Portal probado en vivo: catálogo 500, RLS de Mis clientes, seguimiento propio del cliente-canal

Primera vez que el portal (construido el 19/08, ver entrada de abajo) se probó
con un navegador y llamadas HTTP reales, usando el card admin-only 🧪
"Portal · vista cliente" agregado en `9bb7fd2`. Aparecieron tres problemas
reales, uno detrás del otro.

### 1. Catálogo del portal: 500 siempre — `Deno.readTextFile` no funciona deployado

`portal-catalogo`/`portal-emitir` cargaban `_shared/pricing/*.js` con
`Deno.readTextFile` + eval indirecto (para colgar `var`/`function` en
`globalThis` sin exports). Daba 500 con
`NotFound: path not found: .../_shared/pricing/apple-pricing-core.js` en los
logs, sin importar qué archivos se incluyeran en el deploy.

Se confirmó con una función de diagnóstico temporal (`debug-fs`, deployada y
borrada en la misma sesión) que **el runtime de Edge Functions de Supabase no
da NINGÚN permiso de lectura de filesystem en producción** — ni siquiera puede
leer su propio `index.ts` en ejecución. `Deno.readTextFile` ahí solo puede
funcionar en `supabase functions serve` local; deployado, nunca.

**Arreglo**: el código de `_shared/pricing/{apple,poly}-pricing-core.js` ahora
va EMBEBIDO como string (`JSON.stringify`) dentro de
`portal-catalogo/index.ts` y `portal-emitir/index.ts`, entre marcadores
`BEGIN_PRICING_EMBED`/`END_PRICING_EMBED`. `_shared/pricing/*.js` sigue siendo
la fuente de verdad (para el parity check contra `src/{apple,poly}/js/
pricing-core.js`); `node scripts/build-portal-pricing-embeds.js` regenera los
embeds después de tocarlo, y `scripts/check-portal-pricing-parity.js` ahora
también falla si un embed queda desincronizado. Después de tocar el _shared,
el flujo es: correr el build script → redeployar las dos funciones.

### 2. "Mis clientes" del portal: RLS rechazaba el alta

`clientes-finales.js` insertaba en `portal_clientes_finales` sin mandar
`portal_client_id` — la columna es `NOT NULL` y la policy de INSERT exige
`portal_client_id = ceven_portal_client_id()`, así que con NULL la fila
siempre violaba RLS. `onboarding.js` sí lo hacía bien (mismo patrón, mandando
el claim del JWT); se copió ese patrón. Ver commit `96fcec9`.

### 3. Seguimiento propio del cliente-canal: pedido explícito del dueño de Ceven

El pedido original ("hacé que el pipeline de los clientes sea completo") se
aclaró en la conversación: **no** es exponerle al cliente-canal el pipeline
interno de Ceven (`margenPond`, `perdidoMotivo` de Ceven nunca se tocan ni se
exponen). Es lo opuesto en dos sentidos:

- El cliente-canal necesita cargar **su propio** estado y motivo de pérdida
  sobre la venta a SU cliente final — no existía ningún campo para eso.
  Se agregó `portal_solicitudes.estado_cliente` (Cotizado/Negociación/
  Ganado/Perdido) y `.motivo_perdida` (jsonb `{motivo, detalle}`, mismas 4
  categorías fijas que ya usa el modal de Apple), editables por el cliente-
  canal vía UPDATE con **grant restringido a columna** (no solo RLS de fila):
  `authenticated` ya tenía UPDATE de tabla completa por default de Supabase,
  así que sin el `revoke`+`grant (estado_cliente, motivo_perdida)` la policy
  hubiera dejado tocar `portal_client_id` — o sea, "robarse" un pedido ajeno
  cambiando el dueño.
- El dueño de Ceven pidió expresamente **acceso total de lectura** sobre todo
  lo que un cliente-canal carga (nunca al revés). Ninguna tabla `portal_*`
  tenía policy de SELECT para staff — se agregó `ceven_is_staff()` en las 5
  (mismo criterio que pipeline/clientes/app_settings/todos/equipos).
- Y en vez de una pantalla nueva, el pedido fue verlo DENTRO del pipeline
  interno existente: un trigger (`trg_portal_sync_estado_cliente`, espejo en
  sentido inverso de `trg_portal_sync_estado`) copia
  `estado_cliente`/`motivo_perdida` a dos columnas nuevas de `pipeline`
  (`origenPortalEstado`/`origenPortalMotivo`) cada vez que el cliente-canal
  las cambia. No hizo falta tocar `pipeCols`/`objCols` de `brand.js`: el pull
  de `sync.js` ya hace `select=*` (igual que `origenPortalId`, que tampoco
  está en `pipeCols` y ya se mostraba como badge) — son de solo lectura para
  el staff, nunca se pushean de vuelta. El badge "portal" que ya existía en
  `apple|poly/js/pipeline-view.js` ahora también muestra el estado propio del
  cliente y, si es "Perdido", su motivo en un tooltip 💬.
- **Pendiente, ofrecido y explícitamente pausado por el usuario**: una
  sección/filtro aparte en el pipeline para "solo pedidos del portal"
  (`origenPortalId IS NOT NULL`). Los filtros de pipeline (mes/cliente/pills)
  viven en un archivo aparte de `pipeline-view.js` que no se llegó a leer
  todavía — retomar ahí si se pide.

Migraciones: `20260820193000_portal_solicitudes_estado_motivo_cliente`,
`20260820200000_portal_lectura_staff`,
`20260820203000_pipeline_espejo_estado_cliente_portal`.

---

## 19/08/2026 · Portal de clientes-canal + tabla `clientes` real

El pedido: una web de autoservicio para los clientes-canal (revendedores) de
Ceven — cotizan con el catálogo y el nivel de precio que Ceven les asignó, le
suman su propio margen de reventa para armar el precio a su cliente final, y
al enviar el pedido eso tiene que aparecer como una cotización real en el
pipeline interno. Sobre la marcha se sumaron dos pedidos más: una tabla
`clientes` real (los cotizadores internos venían atando el cliente a un blob
sin dueño en `app_settings`) y notificaciones por mail (Fase 2, en curso).

### La pregunta que ordenó todo el diseño: ¿puede un cliente-canal tocar la base?

No, nunca. Las policies de `pipeline`/`app_settings`/`todos` exigen
`ceven_is_staff()` (dominio `@ceven.com`) **sin ninguna excepción**, y eso no
se tocó. Un cliente-canal:

- tiene su propia identidad de sesión, un claim de JWT (`portal_client_id`)
  **ortogonal** al de staff (`user_role`) — inyectado por el mismo
  `custom_access_token_hook`, en una rama nueva que no toca la lógica
  existente. Una cuenta nunca es staff y cliente-canal a la vez: lo garantiza
  la Edge Function de alta, no la base;
- solo puede leer/escribir tablas nuevas (`portal_*`), todas con RLS propia
  contra ese claim;
- **nunca** ve el catálogo ni el pipeline directo — todo pasa por tres Edge
  Functions (`portal-admin`, `portal-catalogo`, `portal-emitir`) que corren
  con `service_role`, mismo esqueleto que ya usa `admin-users`: validan
  server-side quién llama y nunca confían en el body para nada que le cueste
  plata a Ceven.

El precio que ve un cliente-canal (y el que se escribe al pipeline al emitir)
**siempre se recalcula server-side**, con una copia byte a byte de
`apple/js/pricing-core.js` / `poly/js/pricing-core.js` — nunca lo manda el
cliente. Es el mismo movimiento que ya usa el multimarca para no duplicar la
fórmula, llevado a una Edge Function: las copias viven en
`supabase/functions/_shared/pricing/` y se cargan con **`eval` indirecto**
(`Deno.readTextFile` + `(0,eval)(src)`) — funciona porque esos archivos son
scripts sloppy-mode sin `'use strict'` ni exports, así que sus
`var`/`function` quedan en `globalThis`. `scripts/check-portal-pricing-parity.js`
(nuevo) compara las copias contra el original y falla si alguien edita una
sin la otra.

Y el monto que entra al pipeline/forecast interno es **siempre el precio
Ceven→canal, nunca el de reventa** que el canal le cobra a su cliente final —
mismo principio que ya está firmado en el código con Opciones A/B ("solo la
opción vigente suma"): si el markup ajeno se mezclara, el forecast quedaría
inflado con plata que Ceven nunca factura.

### `clientes`: la tabla que faltaba, no solo para el portal

Antes de esto, "el cliente" de una cotización era: un campo de texto libre en
`pipeline`/`cquotes`, más un blob `cclientes` en `app_settings` (una entrada
por cliente, sin dueño, sincronizado como una clave más de settings —
last-write-wins sobre **todo el diccionario**). Suficiente para mostrar un
nombre, nada para atarle un mail o un nivel de precio de forma confiable.

`clientes` es la tabla madre, compartida por Apple/Poly/Multi **y** el
portal. `nombre_norm` es una columna **generada** (`lower(regexp_replace(
btrim(nombre),'\s+',' ','g'))`) — el mismo criterio que ya usaba
`cevenNormClient()` en JS, ahora garantizado del lado del servidor, con un
índice único que hace que el alta sea un upsert idempotente
(`on_conflict=nombre_norm`) tanto desde los cotizadores internos
(`shared/clientes-db.js`, nuevo) como desde `portal-admin`.

**No reemplaza nada**: `pipeline.cliente`/`cquotes.Cliente` (texto libre)
siguen siendo lo que se muestra siempre. `pipeline."clienteId"` es aditiva,
nullable, y se resuelve en segundo plano al cambiar el campo Cliente —
`cevenClienteIdParaNombre()` devuelve `null` si el nombre cambió mientras se
esperaba la respuesta de la red, así que nunca se aplica el id de un cliente
a la fila de otro, y nunca bloquea el guardado si la red tarda.

Apple no tenía ni datalist de cliente ni ningún cableado de este tipo en su
campo `#client` (Poly y Multi sí, con tier); se lo agregó parejo.

**Backfill**: 21 clientes distintos ya existían en `pipeline` (todos de
Poly — Apple tiene 0 filas de pipeline por el bug de `esFOB` de más abajo).
Se corrió un dry-run primero, se revisó, y recién después se aplicó: 21
clientes creados, 28 filas de `pipeline` con `clienteId` completado por match
exacto de nombre normalizado. Nunca se tocó `pipeline.cliente` ni se borró
nada. Caso a fusionar a mano cuando alguien tenga tiempo: "Gabriel Tosso" y
"Tosso Gabriel" son casi seguro el mismo cliente con el nombre invertido — el
backfill por match exacto los dejó como dos filas separadas, decisión
deliberada (nunca fusionar de más, que es peor que fusionar de menos).

### El chat IA no se construyó de nuevo — ya existía

Hallazgo a mitad de sesión: el 18/08/2026 —un día antes de arrancar esto— ya
se había construido toda la infraestructura del asistente IA (`api/asistente.js`,
`src/shared/asistente.js`, tabla `asistente_usage` para el rate-limit), con el
comentario de cabecera diciendo literalmente que era *"para el cotizador de
clientes externos que se está por construir"*. Ya estaba integrada en Poly
(botón "✨ Asistente IA"). El portal la reusó **tal cual, sin tocarle una
línea** — solo se escribieron los tres hooks que el módulo ya pedía
(`_asisCatalogoCompacto`/`_asisItemsActuales`/`_asisAplicarSeleccion`), mismo
patrón que ya usaba `poly/js/catalog.js`.

### Lo que arma un pedido del portal

`src/portal/` (14 archivos): login propio con su propia clave de
`localStorage` (`ceven_portal_auth_session`, **no** la del staff — mismo
origin, así que reusar la clave pisaría la sesión de un vendedor con las dos
pestañas abiertas), onboarding de una sola vez, selector de marca (recarga el
catálogo entero al cambiar, nunca mezcla dos marcas en memoria), catálogo +
carrito + chat IA en la misma pantalla, clientes finales propios (CRUD
directo por REST, RLS ya filtra "los míos"), logo propio (Storage
`portal-logos`, no el mecanismo `clogo`/`app_settings` de los cotizadores
internos — ese se descarga completo cada 15 s por cada sesión de staff
abierta, sumarle un logo por cliente-canal habría agravado ese problema
latente), PDF con dos logos (el del canal + el de Ceven, siempre) e historial
propio.

El PDF y el "Enviar pedido" arman el documento con la **respuesta confirmada
del servidor**, nunca con los números que tenía el carrito local — pueden
haber cambiado entre que se armó el pedido y se emitió.

En el pipeline interno, la fila que genera un pedido del portal lleva
`"origenPortalId"` (badge "portal" agregado en `pipeline-view.js` de Apple y
Poly) y `ejecutivo:'—'` a propósito: no hay un vendedor real todavía, así que
solo un admin puede tocarla hasta que alguien la reasigne
(`cevenCanEditPipelineRow` ya hace esa cuenta con cualquier ejecutivo que no
matchee).

### Verificación

Ninguna, más allá de lo estático: los 18 `scripts/check-*.js` existentes
siguen pasando (confirmando que Fase 0 no rompió nada de los cotizadores
internos — `check-multi.js`, `check-emitir.js` y `check-pipe-roundtrip.js`
son los que más importaban acá), `node --check` sobre los 12 `.js` nuevos del
portal, y `scripts/check-portal-pricing-parity.js` (nuevo, 10/10) para la
paridad de precios. Los `get_advisors(security)` de Supabase se corrieron
después de cada migración: sin warnings nuevos en ninguna.

**Lo que NO se probó**: ninguna llamada HTTP real a las tres Edge Functions,
ni el flujo completo en un navegador. El usuario cortó la verificación en
vivo a mitad de sesión ("no verifiques, hacelo bien de una"). El riesgo
residual más concreto es el `eval` indirecto para cargar `_shared/pricing/`
en runtime: si el path relativo no resolviera bien en el bundle desplegado,
el fallo es un 500 limpio (ya hay try/catch), nunca un precio mal calculado
en silencio — pero sigue siendo el primer lugar para mirar si algo falla.

### Fase 3, mismo día: panel de staff + estado sincronizado

Dos agregados chicos, después de que el usuario pausó la Fase 2 (mail) porque
instalar Resend pedía aceptar términos en el navegador — algo que solo puede
hacer él.

**Alta de clientes-canal desde el shell**: hasta acá la única forma de dar de
alta una cuenta era `curl` a mano contra `portal-admin`. Se agregó el modal
🧑‍💼 "Clientes del portal" (`shared/portal-clientes-admin.js`), calcado del
modal "👤 Usuarios" que ya existía (`cevenOpenUsers`/`cevenRenderUsers` en
`auth.js`): mismo patrón de `navbar.js` pintando el botón solo si el modal
`#ceven-portal-modal` existe en la página (así solo aparece en el shell), y
la misma Edge Function ya desplegada. El nombre del cliente en el alta es
texto libre a propósito — `portal-admin` ya resuelve-o-crea por
`nombre_norm`, así que si el nombre coincide con un cliente que un vendedor
ya cargó, se reusa esa fila de `clientes` en vez de duplicarla.

**El cliente ve el estado de su pedido sin poder leer `pipeline`**: un
trigger (`trg_portal_sync_estado`, `AFTER UPDATE OF estado ON pipeline`,
`WHEN (old.estado IS DISTINCT FROM new.estado)`) copia el nuevo estado hacia
`portal_solicitudes.estado_ceven` cada vez que un vendedor cambia el estado
de la fila que originó ese pedido. El `WHEN` es la parte que importa: sin
él, cualquier `PATCH` que hace `sync.js` en el poll de 15 s dispararía el
trigger aunque no tocara `estado`.

La función del trigger es `security definer` (`portal_solicitudes` no tiene
policy de UPDATE para `authenticated`, así que el trigger necesita correr con
los privilegios del owner) — y ahí `get_advisors` marcó algo que valía la
pena arreglar: Postgres le da `EXECUTE` a `PUBLIC` por default en cualquier
función nueva de `public`, así que quedaba invocable por `anon`/
`authenticated` vía `/rest/v1/rpc/portal_sync_estado_desde_pipeline` — aunque
llamarla directo ya falla sola (es una función de trigger, necesita
`NEW`/`OLD` de verdad), se revocó `EXECUTE` igual, mismo criterio que ya
aplica el resto del repo a las funciones privilegiadas. Confirmado con
`get_advisors` después: vuelve a quedar en los dos warnings de siempre, sin
nada nuevo.

### Pendiente

- Probar el flujo completo en un navegador: alta de un cliente-canal desde
  el shell (🧑‍💼), login, onboarding, cotizar (catálogo y chat IA), cliente
  final + logo, emitir, y confirmar la fila en el pipeline interno con el
  badge y el monto correcto.
- Fase 2 (notificaciones por mail): **bloqueada** en instalar Resend — el
  usuario tiene que aceptar los términos en
  `vercel.com/ceven1/~/integrations/accept-terms/resend` antes de reintentar
  `vercel integration add resend/resend-email --no-claim --non-interactive`.
- El portal no tiene PWA/offline (no está en `src/sw.js`, no carga
  `shared/pwa.js`) — sin verificar cómo interactuaría con el service worker
  ya activo en `/`.
- `shared/session-core.js`: descartado por ahora (ver Fase 3 arriba), no
  bloquea nada.

---

## 12/08/2026 · Emitir a Apple da 400: falta la columna `pipeline."esFOB"`

```
POST https://iqewnebpdyctexavtpmt.supabase.co/rest/v1/pipeline 400 (Bad Request)
    at cevenEmitirEscribirMarca (emitir.js:267)
    at emitirAMarcas (emitir.js:343)
```

**Diagnosticado, NO arreglado** — por decisión del usuario: lo de Apple va a
cambiar, así que no se toca la base todavía. Queda acá para no volver a
diagnosticarlo desde cero.

### Qué pasa

La fila de pipeline que arma el multimarca para Apple incluye `esFOB`
(`pipelineExtra()` en `js/marcas.js`), y **esa columna no existe en la base**.
PostgREST rechaza el insert entero con 400. Se comparó campo por campo lo que se
manda contra `information_schema.columns`: es la única que falta. Poly manda
`{monto, opg, factura}` y las tres existen — por eso Poly emite bien.

Falta porque venía en la migración del 03/08 que nunca se aplicó y que hoy **no
se puede aplicar** (borra los datos reales de Poly). Ver el bloque rojo al
principio de este archivo.

### Lo que el 400 destapó, que es más grande

**No es solo el multimarca.** El propio cotizador de Apple escribe `esFOB` en
cada fila (`pipeCols` en `src/apple/brand.js`, `addToPipeline()` en
`js/pipeline-core.js`), y `shared/sync.js` reporta el fallo del upsert así:

```js
if(!r.ok) r.text().then(function(t){ console.warn('[sync] upsert pipeline ' + r.status + ':', t); });
```

Un `console.warn` y sigue. O sea que **el pipeline de Apple viene fallando en
silencio**. La base lo confirma: `app_settings` tiene cotizaciones de Apple
(`(apple,'cquotes')`, 4,8 KB) y la tabla `pipeline` tiene **0 filas de Apple** y
18 de Poly. No es prueba concluyente —podría ser que nadie usó el pipeline de
Apple— pero es exactamente lo que se esperaría ver.

### Cuando se quiera arreglar

Un solo comando, aditivo y reversible con un `drop column`:

```sql
alter table public.pipeline add column if not exists "esFOB" boolean;
```

Queda NULL en las filas existentes, que es lo que `esFOBEntry()` ya trata como
"no es FOB". **No aplicar** el archivo del 03/08 entero.

Y aparte, valga o no `esFOB`: que `sync.js` se coma un 400 del pipeline con un
`console.warn` es lo que hizo que esto no se viera durante nueve días. Un fallo
de upsert que se repite debería llegar a la pantalla.

---

## 12/08/2026 · `cevenNormClient is not defined` al guardar en el multimarca

```
Uncaught ReferenceError: cevenNormClient is not defined
    at cevenClienteSet (clientes.js:47)
    at doSave (quotes-db.js:116)
    at saveQuote (quotes-db.js:136)
```

**La dependencia iba al revés.** `shared/clientes.js` —la ficha del cliente—
usaba `cevenNormClient()`, que vivía en `shared/pipeline-group.js`. O sea: el
módulo del cliente dependía del módulo del pipeline. Poly cargaba los dos y no
pasaba nada; el multimarca carga `clientes.js` pero **no** el pipeline (emite a
las marcas, no tiene uno propio), así que la página cargaba entera, se veía
perfecta, y reventaba recién al apretar Guardar.

La función se mudó a `clientes.js`, que es su lugar: **el pipeline agrupa por
cliente, no lo define.** `pipeline-group.js` pasa a depender de `clientes.js`, y
Apple —que agrupa su pipeline por cliente pero no tenía `clientes.js` en su
bundle— ahora lo carga, antes de `pipeline-group.js`.

También afectaba a `aplicarTierDelCliente()` y al selector de nivel de Poly
dentro del multimarca: los tres caminos pasan por la misma función.

### Lo que deja: el chequeo del caso inverso

`check-globals.js` verificaba que un nombre no estuviera definido **dos veces**.
Ahora verifica además que no esté definido **ninguna**: si un bundle llama a una
`ceven*()` que ninguno de sus `<script>` define, lo dice. Es la misma clase de
falla que el duplicado —silenciosa, sin build que la detecte— pero al revés, y
esta ni siquiera aparece al cargar la página: espera al click.

Detalles que hicieron falta para que sirva:

- **Se ignoran los comentarios.** Esta base documenta mucho y nombra funciones
  —y hasta funciones SQL, `ceven_equipo()`— al explicar por qué algo es como es.
  Sin esto el chequeo denunciaba la prosa: 15 falsos positivos en la primera
  corrida.
- **Se cuentan los `window.cevenX = …` indentados.** Varios módulos compartidos
  se escriben adentro de un IIFE y publican así (`monthpicker.js`). El ancla de
  columna 0 que usa la detección de duplicados —y que ahí es lo que evita
  decenas de falsos positivos— no los ve.
- **Se respetan las dependencias opcionales.** Todo `shared/` pregunta
  `typeof cevenX === 'function'` antes de usar lo que puede no estar en esa
  marca; esas llamadas son el mecanismo, no un error.

Se verificó al revés: renombrando `cevenNormClient` a mano, el chequeo lo
encuentra y falla.

---

## 12/08/2026 · El Ejecutivo del multimarca no se podía elegir

Módulo nuevo `src/shared/equipo.js`.

Reporte del usuario: *"en multimarca no me deja seleccionar ejecutivo"*. El
`<select id="exec">` traía UNA sola opción —el placeholder— y **ningún**
ejecutivo: nadie lo llenaba. Como guardar y emitir exigen uno
(`cevenRequireExec()`), el campo no era un detalle: dejaba el pedido trabado.

Es el mismo defecto que Poly ya había arreglado en su `boot.js` el 31/07 y que
acá volvió a aparecer entero, porque el multimarca nació después y copió el
markup pero no el arranque. `cevenApplyVendorAutofill()` (auth.js) tampoco lo
salvaba: `auth.js` se carga en el `<head>` y el `<select>` está ~60 líneas más
abajo, así que `getElementById('exec')` daba `null` y la función volvía en seco.

### De dónde sale la lista

La decisión que ordena todo: **la fuente tiene que ser legible por un no-admin.**
La Edge Function `admin-users` valida server-side
`caller.email === admin@ceven.com` y responde 403 a todos los demás — armar la
lista con ella habría dejado el selector vacío para todo el equipo menos una
persona, que es exactamente el problema que esto viene a resolver.

La fuente correcta ya existía: la RPC `ceven_equipo()` (migración del 04/08, para
delegar tareas). Es `security definer` —`auth.users` no es legible por
`authenticated`—, devuelve solo email, nombre y rol, y lleva el filtro
`ceven_is_staff()` adentro. Se verificó contra la base: la función está aplicada,
`authenticated` la puede ejecutar, y hoy hay 8 cuentas @ceven.com que cotizan
(3 admin + 5 ventas), todas con nombre cargado.

`shared/equipo.js` la envuelve y comparte la caché con `todos.js`
(`ceven_equipo_cache`): mismo dato, misma RPC, misma forma. Así el selector
arranca con la lista puesta —incluso sin conexión— si ya se abrió el tablero de
tareas alguna vez.

### Tres reglas que valen la pena

- **Solo admin y ventas.** Un `lector` no cotiza; ofrecerlo como ejecutivo sería
  darle un dueño a la cotización que después no la va a poder tocar.
- **Nunca se deshabilita.** En el multimarca se arma el pedido de otro, así que
  poder ponerle su nombre es la razón de existir del campo. Apple y Poly siguen
  con `cevenApplyVendorAutofill()`, que a los no-admin los clava en su propio
  nombre; el multimarca no lo llama.
- **Una respuesta vacía NO pisa la caché**, y a la lista se le suman siempre el
  nombre de quien está logueado, los ejecutivos que ya figuran en pedidos
  guardados y el que está elegido en ese momento. Sin lo último, abrir un pedido
  viejo de alguien que se dio de baja le blanqueaba el ejecutivo al repintarse el
  `<select>`.

### Lo que esto habilita, y lo que no

Un `ventas` ahora puede asignarle un pedido a otro, pero **no va a poder
editarlo después**: `cevenCanEditQuote()` sigue pidiendo
`cevenOwnsExecutive()`. Es el modelo de permisos de siempre y no se tocó; queda
anotado porque el síntoma ("lo guardé y ahora no puedo abrirlo") no se parece en
nada a la causa.

`check-multi.js` suma el bloque 10 (13 chequeos): que aparezcan admin y ventas,
que NO aparezca un lector, que quede habilitado, que lo elegido sobreviva al
repintado y que una respuesta vacía conserve la caché. Todas fallas silenciosas
—una lista vacía se ve igual que una lista bien filtrada— así que no alcanzaba
con mirar la pantalla.

---

## 12/08/2026 · El multimarca agrega productos como Poly: la subpantalla flotante

Archivo nuevo `src/multi/js/picker.js`. `APP_VERSION` 6.2 → 6.3 (cambió la lista
de precache).

En el multimarca, `+ Agregar producto` llamaba a `openCat()`, que hace
`goTo('catalog')`: te sacaba del pedido, elegías en otra pantalla y recién al
volver veías qué había quedado. Era el mismo flujo que Poly y Apple ya habían
dejado atrás (ver 03/08 y 05/08), **y acá duele más**: un pedido mixto se arma
salteando entre marcas, así que el ida y vuelta se paga una vez por salto.

Ahora se abre la misma capa flotante que las otras dos marcas, encima del pedido:
arriba el catálogo con un `+` por producto (`✓` si ya está, y ese mismo botón lo
saca), abajo lo que el pedido ya lleva con cantidades, total y `×`. La mitad de
abajo es el punto: se ve crecer el pedido sin cerrar nada.

**Lo propio del multimarca son dos cosas**, y las dos van en la flotante:

- el filtro es por **marca** y no por rubro (chips, mismo `.pk-rub` que los
  rubros de Poly), porque es la columna que el catálogo unificado agrega;
- cada línea del carrito lleva su **chip de marca**. En una marca sola sobraría;
  acá es el dato que dice a qué cotización va a bajar esa línea al emitir, que es
  justo lo que el usuario no puede deducir mirando SKUs.

**Una sola fila para las dos tablas.** `_catRowHTML()`, `_catFiltradosCon()`,
`_catRecortar()` y los chips viven en `catalog-view.js` y el picker los reusa —
si cada tabla armara la suya, agregar una columna de un lado y olvidarse del otro
no daría ningún error, solo dos tablas desalineadas. La vista Catálogo también
pasó a mostrar el `+` en la primera columna, que es donde lo tiene la flotante.

Efectos colaterales del reuso, los dos buscados:

- **La marca elegida se mudó del módulo al `data-marca` del contenedor.** Con una
  variable compartida, elegir marca en la flotante le movía el filtro a la vista
  Catálogo. Mismo criterio que `_rubroElegido()` en Poly. El chip lleva `data-mk`
  y el contenedor `data-marca`: con el mismo nombre, el `closest()` del cableado
  matchearía además el contenedor y un clic en el borde borraría el filtro.
- **Los chips no tenían estilo.** Salían con clase `pk-rubro`, que no existe en
  `base.css` (la clase es `pk-rub`), así que eran botones grises del navegador.

**Pegado de una columna de SKUs**: el multimarca no carga
`shared/catalog-core.js` —arrastra la selección con checkboxes y el alta manual
de artículos, dos cosas que acá no existen—, así que el pegado se escribió
aparte, chico. Lo propio de acá es la **ambigüedad**: el mismo SKU podría existir
en dos marcas. Con el filtro puesto se resuelve solo; sin filtro se toma la
primera del registro **y se avisa cuál**, porque agregar la línea de la marca
equivocada la manda a la cotización equivocada al emitir.

`check-multi.js` suma el bloque 8c (17 chequeos): la flotante abre, lista las dos
marcas, el carrito crece al agregar, el `✓` saca solo esa línea sin tocar la otra
marca, el pegado agrega lo que existe y avisa lo que no. Existe porque el picker
reusa tres funciones de `catalog-view.js`: renombrar cualquiera de ellas deja
esta pantalla tirando en el navegador y en ningún otro lado.

---

## 12/08/2026 · El multimarca mostraba solo Apple: tres bugs, uno de ellos en la documentación

Reporte del usuario: *"solo me muestra los productos apple"*. Eran **tres bugs
independientes**, y cada uno alcanzaba para producir exactamente ese síntoma.

### 1. La clave de `app_settings` lleva el prefijo de la marca

`sync.js` sube como `key` la clave **REAL de localStorage**, o sea con el
prefijo: el catálogo de Poly vive en `(poly, 'poly_cpl')` y el de Apple en
`(apple, 'cpl')` — este último **solo porque el prefijo de Apple es `''`**, por
historia. El multimarca pedía `key=in.(cpl,cnac)`, así que recibía Apple y nada
más. Sin error, sin fila, sin pista: PostgREST descarta la fila server-side.

**El origen del error no fue el código sino los docs**: `BASE-DE-DATOS.md`
documentaba la columna como `key -- cquotes | cpl | carchive…` y
`ARQUITECTURA.md` decía que `settingKeys` va "sin prefijo" (cierto para la
*declaración* en `brand.js`, falso para lo que termina en la base). Los dos
quedaron corregidos, porque si no el próximo que lea `app_settings` de otra
marca vuelve a caer igual.

El mismo error estaba **dos veces**: en la URL y en el parser (`f.key === 'cpl'`).
Arreglar solo uno no cambiaba nada.

**Y estaba también en la emisión, donde era peor**: se escribía
`(poly, 'cquotes')`, una fila fantasma que el cotizador de Poly nunca lee. La
cotización emitida no habría aparecido jamás en esa marca y desde el multimarca
todo se veía exitoso. Además, al leer vacío, la emisión creía que Poly estaba en
cero y le asignaba el número 0001 — pisando su primera cotización.

El prefijo pasó a declararse en el registro `CEVEN_MULTI_MARCAS`, con
`cevenMultiClave()`/`cevenMultiClaves()`. `window.cevenK()` **no sirve** acá:
prefija con `multi_`, que es el del multimarca y no el de la marca que se lee.

### 2. El tope de filas era, en la práctica, un filtro por marca

`renderCat()` recortaba a 300 filas sobre la lista entera, y `products` se arma
marca por marca (Apple primero, con cientos de SKUs). El corte caía **antes** de
la primera línea de Poly: 300 filas, 100 % Apple. El tope hace falta —pintar
miles de filas congela la pantalla— pero **sobre una lista ordenada por marca, un
tope global es un filtro por marca encubierto**. Ahora el tope es por marca, y el
contador dice cuál quedó recortada y cuánto.

### 3. La marca vacía desaparecía en vez de mostrarse en cero

El chip de Poly se escondía si no tenía productos, así que el bug 1 se leía como
"el multimarca no conoce Poly" en vez de "el catálogo de Poly no bajó" — y
además tapaba la única vía de escape al bug 2. Ahora se muestran todas las marcas
del registro; la que no tiene catálogo sale con `· 0` y deshabilitada.

### De yapa, dos que encontró la revisión

- **`shared/init.js` tiraba en la primera línea** del multimarca: escribía en
  `#app-ver-num` sin guarda y yo le había puesto otro id al zócalo. La excepción
  se llevaba puesto todo lo que venía abajo. Se corrigió el id **y** se le puso
  guarda al archivo compartido, que es donde estaba el filo.
- **`agregarAlPedido()` no repintaba la grilla**: se agregaban productos desde el
  catálogo y la cotización mostraba la lista vieja hasta que otra acción
  disparara un render (cambiar de vista no repinta).

### Lo que deja esto

Los tres bugs principales son **silenciosos**: ninguno tira excepción, todos
devuelven vacío o de menos. Por eso quedaron cubiertos con bancos que miran el
payload y los datos, no la pantalla: `check-multi.js` verifica la clave
prefijada, que coincida con el `brand.js` de cada marca, y que una marca con 800
SKUs no tape a otra con 2; `check-emitir.js` inspecciona el **body exacto** que
sale a la red y confirma que se escribe en `poly_cquotes` y nunca en `cquotes`.

---

## 11/08/2026 · Cotizador multimarca: un pedido que se reparte en cotizaciones reales

Hay pedidos que mezclan marcas —unas Mac y un equipo de video Poly— y hasta hoy
eran dos cotizaciones en dos cotizadores, con dos números y dos PDF para el
mismo cliente.

**La decisión que ordena todo el diseño: el multimarca no reemplaza a los
cotizadores, reparte.** El forecast se mide por marca; la plata de Poly tiene que
estar en el pipeline de Poly y la de Apple en el de Apple, o el responsable de
cada marca no ve lo suyo. Entonces se arma el pedido una vez y al **emitir** se
crea la cotización REAL de cada marca: su número, sus filas en ese historial y su
fila en ese pipeline. La alternativa —una fila multimarca que fuera la buena— nos
dejaba con el problema de a qué marca imputarle la plata.

Esto además es la base del cotizador para clientes que viene después: ese portal
es este mismo armado de pedido, con otra puerta de entrada y otros permisos.

### Primero se sacaron las fórmulas de la pantalla

El multimarca cotiza SKUs de Apple sin ser la app de Apple. Copiar la fórmula era
garantizar que tarde o temprano el mismo SKU saliera a dos precios distintos
según por dónde se lo cotizó — y eso se descubre cuando el cliente compara los
dos PDF. Así que las cuentas se mudaron a `apple/js/pricing-core.js` y
`poly/js/pricing-core.js`: sin DOM, sin globales, todo por parámetro. Las marcas
ahora **delegan** (`calcP`, `getNac`, `getIVA`, `categorize`, `_pipeAgregados`,
`tierDeLinea`, `precioDeCatalogo`, `repricearLinea`, `_pipeMontoDeItems`), y el
multimarca carga esos mismos archivos.

Es el mismo movimiento que ya se había hecho con `_pipeAgregados()` cuando
llegaron las opciones A/B: **una sola cuenta, varios llamadores**. La red de
contención fueron los 14 bancos que ya existían — el refactor no tocó ni un
chequeo y siguieron pasando.

### Lo único que sabe de marcas es un archivo

`src/multi/js/marcas.js` es el espejo de `brand.js`: allá una app declara "soy
Apple", acá una app que las cruza declara "así se trata una línea de Apple".
Precio, repricing, la fila de `cquotes` de esa marca, la de su pipeline y qué
controles necesita en pantalla. Un `if (linea.brand === 'apple')` en cualquier
otro archivo va mal, por el mismo motivo por el que no van adentro de `shared/`.

En pantalla eso se ve así: la grilla agrupa por marca con su subtotal —que es el
número que va a terminar en el pipeline de esa marca— y arriba aparecen **solo
los controles de las marcas presentes**. Sin líneas de Poly no hay selector de
nivel; sin líneas de Apple no hay margen. Mostrar un control que no mueve nada
invita a tocarlo y a no entender por qué no pasa nada.

### Cero cambios en Supabase

El plan original agregaba dos columnas a `pipeline` (`origen`, `multiQNum`). No
hicieron falta: el link entre el pedido y las cotizaciones que generó viaja en la
clave `_multi` de cada fila de `cquotes`, que ya se sincroniza. Es exactamente lo
que habían hecho las opciones A/B — una migración para un dato que ya viaja es
trabajo y riesgo de más. Y de paso desaparece el riesgo de deployar la app antes
que la migración.

### La emisión, que es lo caro de equivocar

Por cada marca: se reserva número con la regla auto-reparable de siempre
(`max(contador, mayor que existe) + 1`, pero sobre los datos remotos), se
escriben las filas en su `cquotes` —sin eso la fila del pipeline existe pero no
expande por SKU, que se ve como un bug— y se hace upsert de la fila.

**Re-emitir pisa, no duplica.** Se sacan las filas de ese número y se reinsertan,
y la fila del pipeline se busca por número: se le actualizan los montos y se le
**conservan** `id`, `estado`, `mesCierre` y el link de OV/Netsuite. Eso último no
es un detalle: son datos del vendedor de esa marca, no del pedido, y pisarlos
sería peor que no dejar re-emitir.

`cevenEmitirPlan()` quedó **puro** a propósito —recibe el estado remoto y
devuelve qué se va a escribir, sin tocar la red— para poder probar en Node todo
lo que puede salir mal. La capa REST solo transporta.

Lo que **no** se puede garantizar: `cquotes` es un blob con last-write-wins, y
emitir es leer-modificar-escribir el historial de otra marca. Si alguien guarda
ahí en la misma ventana, una de las dos escrituras se pierde. Se mitiga leyendo
justo antes de escribir, informando el resultado **por marca** en vez de un
"listo" genérico —con dos marcas y una que falló, el vendedor tiene que saber
cuál quedó— y con la idempotencia: recuperarse es volver a apretar el botón.

### Verificación

`scripts/check-multi.js` (93 chequeos) corre los archivos reales de cada marca
contra los del multimarca y compara: el mismo SKU tiene que dar el mismo precio,
la misma nacionalización, el mismo IVA y —en Apple— los mismos agregados de
pipeline byte a byte. Su última sección carga el **bundle real de la página**, en
el orden del HTML, y arma la grilla sobre un DOM mínimo: en una app sin build y
toda global, una llamada a una función que no existe no la detecta nada hasta que
alguien abre la pantalla.

`scripts/check-emitir.js` (44) cubre reparto, numeración con el contador
atrasado, re-emisión idempotente y que el seguimiento de la marca no se pise.

`APP_VERSION` → 6.2.

**Queda pendiente**: el pipeline propio del multimarca (hoy el seguimiento vive
en el de cada marca, y por eso el ítem no está en la barra), el PDF único del
pedido y el comprobante.

---

## 10/08/2026 · Una cotización, dos opciones — y el pipeline que no las suma dos veces

Se le ofrecen al cliente dos armados (uno más caro y uno más económico) y él
elige uno. Hasta ahora eso eran **dos cotizaciones** con dos números, y las dos
entraban al pipeline: el forecast del equipo contaba plata que nunca se iba a
facturar. Ahora una cotización puede llevar **Opción A y Opción B** y guardarse
como una sola.

**La regla que sostiene todo: solo la opción vigente suma** al pipeline, al
Target y al Excel. No es un detalle de implementación, es el motivo de la
funcionalidad: si las dos sumaran no habría ninguna ganancia sobre cotizar dos
veces. Y el error no se ve en pantalla — se ve a fin de mes, cuando el total no
cierra.

### El modelo, lo más chico posible

Cada línea lleva `opc` (1 = A, 2 = B) y **lo que no diga 2 es 1**: por eso todas
las cotizaciones guardadas hasta hoy siguen funcionando sin migración ni flags.
En `cquotes` viajan dos campos: la columna visible **`Opción`** (que va al Excel)
y **`_opcEf`**, la vigente, escrita en *todas* las filas de la cotización — igual
que `_estado`, para no depender de filas "meta", que Poly no tiene.

**En el pipeline no hizo falta ninguna columna nueva de Supabase.** La fila
guarda los montos de la opción vigente, que es lo que siempre guardó; cuál es la
vigente sale de `cquotes`, que ya se sincroniza. Una migración de base para un
dato que ya viajaba habría sido trabajo y riesgo de más.

### Dónde se filtra (y por qué en un solo lugar)

Todo lo que lee `cquotes` para hacer cuentas o recorrer líneas pasa por
`cevenOpcFilasDeCotiz(db, qn, tipos)`. Son doce lugares entre las dos marcas
—pipeline, detalle por SKU, archivo mensual, Target, dashboards— y **tienen que
filtrar todos igual**, no solo para no contar doble: el `lineKey` de los
overrides por SKU del pipeline es `SKU|índice` sobre esa lista, así que si un
lugar filtra y otro no, los índices se corren y el estado "Facturado" de una
línea se le aplica a otra. Con una sola opción devuelve exactamente lo de
siempre.

### En pantalla

Una barra de solapas sobre la grilla. Con una sola opción **no hay solapas**:
queda un botón discreto "＋ Agregar Opción B", porque el 95 % de las cotizaciones
va a tener una sola y no hay por qué cobrarles el ruido. Con dos, cada solapa
muestra su total y la vigente lleva ★. La grilla, el carrito de la subpantalla
flotante y las garantías CevenCare muestran **solo la opción activa** — y
`_enCotizacion()` también, porque el mismo SKU suele estar en las dos y si no,
agregarlo a la B quedaba bloqueado por estar en la A. Editar la opción que no es
la vigente pinta un aviso amarillo: sin él se carga media cotización en la B, se
agrega al pipeline y el monto que ve el equipo es el de la A, sin ninguna pista.

**Desde la fila del pipeline se cambia la vigente sin reabrir la cotización**
(la chapita `Opc. A`/`Opc. B`), que es el momento real en que el cliente define.
El monto de la fila **se recalcula** con las líneas de la opción nueva: dejarlo
como estaba sería peor que no tener la funcionalidad, porque la fila diría
"Opción B" con la plata de la A. En Apple se recalculan además las cantidades por
familia, las garantías y el margen ponderado, con la misma función que usa
`addToPipeline()` (`_pipeAgregados()`) — si fueran dos cuentas distintas, cambiar
de opción dejaría la fila con un total que no es el de ninguna de las dos.

Si la opción vigente está **vacía**, agregar al pipeline se corta con un cartel
en vez de meter una fila en 0.

### El PDF, el comprobante y el historial

El PDF y el comprobante imprimen **las dos opciones**, cada una con su tabla y su
total, y arriba la leyenda: *"Opciones alternativas: A y B son propuestas
excluyentes — se factura UNA sola."* Sin esa línea, un cliente puede leer las dos
tablas como dos partes de la misma compra y sumar los totales. La tarjeta del
historial muestra el total de la **vigente**, una chapita "2 opciones · vigente
A" y las líneas de las dos, separadas por rótulo.

### Verificación

`scripts/check-opciones.js` (60 chequeos) corre las funciones reales de las dos
marcas: que el pipeline tome solo la vigente —incluidas familias, garantías y
margen ponderado en Apple—, que cambiar la vigente recalcule la fila, que borrar
la Opción B se lleve también las garantías, y que una cotización **sin** opciones
se comporte exactamente como antes. La última sección verifica el **cableado**
(que `doSave()` siga sellando las filas, que `renderQ()` siga pintando la barra,
que el PDF siga imprimiendo la leyenda…): son llamadas de una línea, fáciles de
perder en un merge, y perderlas no rompe nada visible.

`APP_VERSION` → 6.1.

---

## 10/08/2026 · Apple se pone al día con Poly: sin diálogos nativos, con flotante y con la tabla legible

Cuatro cosas que Poly ya tenía y Apple no. No son mejoras sueltas: eran la misma
app comportándose distinto según la marca.

### Ningún `alert()` ni `confirm()` más

Apple tenía **44 `alert(`, 17 `confirm(` y 3 `prompt(`**; Poly había quedado en
uno de cada uno. El criterio, el mismo que ya estaba escrito en `notify.js`:

- un error, una validación o un permiso denegado se avisa con `showToast()`;
- una acción destructiva **se hace** y el cartel ofrece **Deshacer**, en vez de
  preguntar antes. Nunca se pierde el clic y nunca se bloquea la pantalla;
- `confirmModal()` queda para lo irreversible que además recarga la página
  (restaurar un backup), que vive en `shared/`.

No es estético: `alert()` **congela el renderer** —por eso cuelga cualquier
driver CDP, ya está anotado en las trampas del entorno— y en una PWA instalada se
ve como un cartel del navegador, no de la app.

Lo que ganó cada pantalla:

- **Historial**: borrar ya no pregunta; borra, deja la cotización en la papelera
  30 días y ofrece Deshacer en el acto (Poly hacía exactamente esto desde el 07/08).
- **Catálogo**: "Eliminar SKU LL/A" y "E/A" se unificaron en `_catBajaMasiva()`
  con Deshacer. Además, si el guardado falla ahora **se revierte en memoria**:
  antes la pantalla quedaba sin los SKU y el localStorage con ellos, o sea que
  "se borraron" duraba hasta el próximo reload.
- **Pipeline**: agregar sobre una cotización que ya estaba, unir líneas, quitar
  los overrides de un SKU y eliminar una fila pasan por `pushPipeUndo()` /
  `pushPipeUndoInsert()` / `pushPipeUndoRemove()` (`shared/undo.js`, que Apple ya
  cargaba pero casi no usaba). Los links de OV y de OC parcial se editan con
  `promptModal()`; el pipeline se **relee dentro del callback**, porque entre que
  se abre el modal y se acepta puede haber entrado el poll de 15 s.
- **Nueva / copiar / cargar del historial**: `_snapshotQuoteState()` y
  `_restoreQuoteState()`, portados de Poly y ampliados con **garantías CevenCare
  y overrides de nacionalización** —que Poly no tiene—: sin eso, Deshacer
  devolvía los productos y se comía las CevenCare. Deshacer una copia además la
  **borra de `cquotes`**, no solo repinta la pantalla.
- **CevenCare** (`cevencare.html`) ahora carga `shared/notify.js`, así que su
  aviso también es un cartel de la app — y de paso `cevenLsSet()` deja de caer en
  su fallback a `alert()`.

### La subpantalla flotante de productos

`+ Agregar producto` abría la vista Catálogo entera: elegías con checkboxes,
apretabas "Agregar (N)" y recién al volver veías qué había quedado. Ahora abre la
misma capa flotante que estrenó Poly el 05/08: arriba el catálogo con un `＋` por
producto (`✓` si ya está), abajo lo que la cotización lleva, con cantidades,
total y `×`.

Para que las dos tablas no se despeguen, la fila se pinta con **una sola**
función (`_catRowHTML()`) y el alta pasa por **un solo** camino
(`_sumarProductoAItems()`). Eso es lo que verifica `check-apple-picker.js`: si el
alta de a uno y el alta en lote se desincronizaran, un producto entraría con un
precio distinto según por dónde se lo agregó, sin ningún error a la vista.

Dos diferencias con el de Poly, a propósito:

- **Direcciona por `data-pid`** (id de producto) y no por índice de fila. Poly
  necesita dos registros (`data-i` / `data-pi`) porque referencia por posición;
  en Apple el id es único y sobrevive al round-trip por atributo, incluso el
  string de un artículo manual (`pm_1730…_3`).
- La fila muestra **costo, costo nacionalizado y precio de venta** con el margen
  global del momento, los tres del mismo `_catCalc()` que usa la vista Catálogo.
  El FOB y el flag "precio ya nacionalizado" se respetan igual que en el alta en
  lote.

`openCat()` sigue existiendo: es el camino de "editar ítem", que sí necesita la
vista entera.

### La tabla del catálogo entra en pantalla

Misma pasada que Poly: **SKU y los tres importes en px** y todo lo que sobra a
Descripción (eran porcentajes, así que en una pantalla ancha el SKU se llevaba
150 px vacíos mientras la descripción salía con puntos suspensivos), `min-width`
para que en el celular la tabla **scrollee** dentro de `.tw` en vez de aplastarse,
y las tres chapitas —`manual`, `NAC✓`, `⚠ Revisar costo`— **mudadas del SKU a
Descripción**, que es la única celda que puede crecer.

### El precio del artículo manual, en es-AR

Era `type=number` + `parseFloat`: tipear **"1.250,50"** con el teclado es-AR
dejaba el campo vacío, y si entraba, `parseFloat` cortaba en el primer punto y
guardaba **1,25**. Ahora es `type=text inputmode=decimal` + `cevenParseMoney()`,
el mismo parser que los importes de la cotización, y al reeditar el campo vuelve
formateado con `fD()`. De paso, `_catPintarFiltros()` conserva el filtro elegido:
dar de alta un artículo reseteaba Model y País a "Todos".

Quedan `check-apple-picker.js` (27 chequeos) y `check-apple-manual.js` (17),
que corren las funciones reales contra un DOM de mentira.

---

## 10/08/2026 · El price list de Apple se carga como viene: dos archivos y el SKU de verdad

Los archivos que manda Apple (`APPLE Price list A …` + `APPLE Price list FTZ A …`)
no se podían cargar con el botón de carga. Tres problemas distintos, uno arriba
del otro, en `apple/js/catalog.js`:

**1. El encabezado está en la fila 5, no en la 1.** Arriba hay cuatro renglones
de avisos ("The models listed below are currently impacted by import tariffs…").
`sheet_to_json()` tomaba la primera fila como encabezado, que está vacía, y
devolvía columnas `__EMPTY`, `__EMPTY_1`… La carga moría con **"No se encontró
Selling Price"** y no había forma de importar el catálogo. Ahora `_plHeaderIdx()`
busca la fila del encabezado; pide **dos** nombres conocidos en la misma fila
porque el preámbulo tiene una celda suelta que dice "SKU" y no es la tabla.

**2. El SKU estaba saliendo de la columna equivocada.** El archivo trae `SKU`
(un código interno de Apple, `321D38`) y `Model #` (`MD4P4LE/A`, el que se
cotiza, se factura y viaja al pipeline). La carga completa usaba `SKU` y
**"Actualizar precios" usaba `Model #`**: los dos botones producían catálogos con
identificadores distintos, así que actualizar precios sobre un catálogo cargado
no actualizaba nada — agregaba los 528 productos otra vez como "nuevos" y dejaba
los viejos marcados "a revisar". Ahora las columnas se resuelven en una sola
función (`_plCols()`) que usan los dos caminos, y el SKU es `Model #`. Con él se
cargan **`Country`, `Description` y `Selling Price`**; `LOB` y `Model` se siguen
guardando porque de ahí salen los filtros del catálogo y el matching de `getNac()`.

**3. El catálogo viene partido en dos archivos.** El input aceptaba uno solo, así
que cargar el segundo borraba el primero y el catálogo quedaba a la mitad
(285 o 257 productos en vez de 528). Ahora `handlePL()` toma varios y los pliega
juntos. Los dos archivos se pisan en **14 SKU** y en 4 de ellos el FTZ vale unos
dólares más (el arancel): se conserva el **precio más alto**, mismo criterio que
ya usaba el merge de precios, porque cotizar de menos sale plata.

Lo que **no** cambió: `📂 Cargar Excel/CSV` sigue reemplazando el catálogo entero
—y con él los productos manuales—, y `💲 Actualizar precios` sigue siendo el
camino que conserva lo que ya hay. Ahora los dos leen el archivo igual.

Queda `scripts/check-apple-catalogo.js`, que corre el importador real. Sin
argumentos usa un banco con la misma forma que los archivos (preámbulo, `SKU`
interno al lado de `Model #`, un SKU repetido más caro en el FTZ, un precio
tipeado en formato es-AR), porque los `.xlsx` son datos de trabajo y están en
`.gitignore`; con los archivos reales pasados por línea de comandos corre los
chequeos genéricos contra ellos (528 productos de 542 filas, ningún SKU repetido,
todos con forma de `Model #`). Este importador no tiraba excepción al romperse:
salía un catálogo con los códigos equivocados, y eso se ve recién cuando el
cliente recibe una cotización con un SKU que no reconoce.

`APP_VERSION` → 6.0.

---

## 07/08/2026 · Catálogo de Poly: artículos manuales completos y filas a la mitad

### Un artículo cargado a mano ya se cotiza como cualquier otro

Tenía **solo SKU y descripción**. Salía con "—" en la columna de precios,
`precioDeCatalogo()` devolvía null y había que tipear el importe **en cada
cotización, todas las veces**. Ahora el formulario lleva lo mismo que trae un
producto del ERP: precios por nivel, categoría, stock e IVA. Cargado una vez, se
cotiza solo al nivel que tenga la cotización.

Los inputs de precio los arma `products.js` leyendo `CEVEN_BRAND.priceTiers`, no
están en el HTML: sumar o sacar un nivel se hace en `brand.js` y la pantalla lo
sigue. La categoría va con un `<datalist>` de los rubros que ya existen, pero se
puede escribir uno nuevo — la lista sale del Excel y cambia en cada importación.

Tres reglas que parecen detalles y no lo son (están en `check-poly-manual.js`):

- **Un precio vacío no es 0.** Vacío = "ese nivel no aplica" y la línea se
  completa a mano; 0 = sin cargo y se cotiza en cero. Guardar el vacío como 0
  haría que un servicio saliera cotizado en cero sin que nadie lo note.
- **Stock vacío (`null`, "sin dato") no es 0 ("agotado")**, la misma distinción
  que ya respetaba el importador.
- Los precios se tipean en **formato es-AR** ("1.250,50"), así que el campo es
  `type=text` + `cevenParseMoney()`: un `type=number` rechaza la coma decimal.

Al editar, los campos se asignan **uno por uno** en vez de reemplazar el objeto:
la fila puede traer cosas que este formulario no edita y reemplazarla las perdía.

### La tabla del catálogo entraba en pantalla, ahora sí

Los 4 niveles de precio iban **uno debajo del otro**: cada fila medía ~83 px y el
catálogo entero (77 productos) pasaba los 6.000 px, con la columna Descripción
medio vacía al lado. En dos columnas (`.cat-tiers`, en `base.css`) la fila bajó a
**51 px** y los 6 productos de prueba entran de una en la pantalla.

De paso, en la misma pasada:

- **Anchos**: SKU y Precios en px (su contenido no crece con la ventana) y todo
  lo que sobra a Descripción, que es lo único que se cortaba.
- La chapita **"manual" se mudó a Descripción**, al lado de la de categoría: con
  el SKU a 130 px, la chapita le comía lugar y el propio SKU salía con puntos
  suspensivos.
- **`min-width` en la tabla**: las columnas fijas suman ~564 px, así que en un
  celular Descripción se aplastaba a nada. Ahora scrollea dentro de `.tw`.
- El **estado vacío** decía "No hace falta precio — se carga a mano en cada
  cotización", que dejó de ser cierto cuando el archivo del ERP empezó a traer
  los cuatro niveles.

Los colores salen de los tokens `--ct1`/`--ct3`, así que el modo oscuro se da
vuelta solo (verificado en el navegador, claro y oscuro).

---

## 07/08/2026 · Papelera: lo eliminado se guarda 30 días

Eliminar del historial sacaba las filas de `cquotes` y listo. Había un
"Deshacer" en el cartel, pero dura lo que dura el toast: si te dabas cuenta un
minuto después, no había forma de recuperar la cotización.

Ahora pasa a `cpapelera` y se puede restaurar durante 30 días
(`CEVEN_PAPELERA_DIAS`). El "Deshacer" del cartel sigue estando —es el camino
rápido para el error inmediato— y al usarlo la entrada sale también de la
papelera, para que la cotización no aparezca en los dos lados.

Está en `shared/papelera.js`, en las **dos marcas**, dentro de un `<details>`
cerrado al pie del Historial.

### El orden de las dos escrituras

Borrar son dos escrituras: meter en `cpapelera` y sacar de `cquotes`. Se hace
siempre en ese orden, y **si la primera falla no se hace la segunda**. Por dos
razones distintas que terminan igual:

- **Cuota llena.** `cevenLsSet()` devuelve `false` cuando localStorage no entra.
  Sacando primero de `cquotes`, la cotización desaparecía de las dos partes.
- **Sync.** `cquotes` y `cpapelera` son dos claves de `app_settings` con su
  propio last-write-wins: puede subir una y la otra no. Con este orden el peor
  caso es un duplicado (se ve y se arregla); al revés, el peor caso es la
  pérdida.

Por lo mismo, borrar varias seleccionadas es **una sola escritura**
(`cevenPapeleraTirarVarias`): si la séptima fallara, antes quedaban seis en la
papelera con sus cotizaciones todavía en el historial.

### Decisiones

- **Sincroniza**: `cpapelera` está en `settingKeys` de los dos `brand.js`, así
  que la papelera es del equipo. Borrás en la notebook y restaurás desde la PC.
  Entra sola al backup, que se arma de `settingKeys`.
- **La purga corre en cada arranque**, no al abrir el Historial: una cotización
  tiene que dejar de existir a los 30 días aunque nadie mire nunca la papelera.
  Solo escribe si venció algo — si no, cada carga de cada dispositivo marcaría
  la clave como sucia y dispararía un push al pedo.
- **Restaurar sobre un número que ya existe se rechaza.** Mezclaría las líneas
  de dos cotizaciones distintas bajo el mismo número, y eso no se ve hasta que
  alguien abre el PDF.
- **Una entrada con fecha ilegible no se purga.** Ante la duda no se tira nada.
- **Los permisos valen también acá**: la papelera es compartida, así que
  restaurar y eliminar definitivamente pasan por `cevenCanEditQuote()`. "Vaciar
  papelera" saca solo lo que el usuario puede eliminar, y dice cuánto quedó
  afuera en vez de dejar una papelera "vaciada" con cosas adentro.

### Verificación

`scripts/check-papelera.js` (nuevo, 49 chequeos). El que más importa es el de
atomicidad: con la cuota fallando **solo** para `cpapelera`, se comprueba que el
historial no se haya tocado. También la purga (31 días se va, 29 se queda), los
días restantes, el rechazo al restaurar sobre un número existente y los
permisos. No se mockea el reloj: las entradas de prueba se escriben con la fecha
de borrado ya corrida hacia atrás.

Además, probado en el navegador: restaurar desde la papelera devuelve las dos
líneas a `cquotes`, saca la entrada y actualiza el contador.

### Pendiente

Eliminar una cotización **no** toca el pipeline: si esa cotización tenía una
fila en `cpipeline`, sigue ahí. Era así antes de la papelera y no se cambió.

---

## 07/08/2026 · Encabezado del comprobante unificado y la entrega como selector

Dos pedidos sobre los documentos que ve el cliente.

### 1. El cliente entra a la misma tabla que el número de cotización

El comprobante tenía el encabezado partido en dos: una caja con
`Cotización N° | Fecha | Ejecutivo` y, más abajo, una sección **"Datos del
cliente"** con el nombre en cuerpo 16 y el proyecto debajo. Los cinco datos que
identifican el documento se leían en dos lugares distintos, y el nombre suelto en
cuerpo grande competía con el título COTIZACIÓN.

Ahora es **una sola tabla de tres filas**: la de arriba con N° / Fecha /
Ejecutivo (sin cambios) y debajo `Cliente:` y `Proyecto:`, cada uno con su
rótulo. El proyecto sigue leyéndose de `Proyecto` con `OPG` de respaldo, sin
preguntar por la marca.

Las filas se **miden antes de dibujar** (`splitTextToSize`) y crecen con el
contenido: un cliente o un proyecto largo se parte en varios renglones en vez de
recortarse. Recortar dejaría afuera parte de un dato que identifica el trabajo.

Lo que **no** volvió es el renglón "CUIT / DNI" en blanco: ese dato es de un
comprobante fiscal, y esto no lo es.

### 2. La entrega deja de ser texto libre

Era un `<input type="text">` donde cada uno tipeaba el plazo. Dos consecuencias:
el mismo plazo salía impreso de varias formas ("inmediata", "Inmediata",
"INMEDIATA"), y no había forma confiable de reconocer la entrega inmediata para
destacarla.

Ahora es un `<select id="delivery">` con **Inmediata / 3 días hábiles / Entre 5 y
7 días hábiles / Otra…**, con el mismo mecanismo que la condición de pago:
`cevenDelivery()` / `cevenSetDelivery()` / `cevenToggleDeliveryOtra()` en
`shared/ui-core.js`, y el resto del código no sabe del marcador `__otra`. Está en
las **dos marcas**.

Tres cosas que valen la pena anotar:

- **La primera opción es vacía.** Antes el campo arrancaba en blanco y el PDF
  imprimía `Entrega: —`. Sin opción vacía, toda cotización nueva saldría
  afirmando un plazo que nadie eligió.
- **Las cotizaciones viejas entran por "Otra…"** con su texto intacto: se
  guardaron cuando esto era texto libre y tienen cualquier cosa en la columna
  `Entrega`.
- `cevenSetDelivery('')` limpia **también** el campo libre. El chequeo lo
  encontró: la opción vacía matchea por valor en el recorrido de opciones, así
  que salía por ahí y el texto de la cotización anterior quedaba escondido en el
  input, listo para reaparecer al elegir "Otra…".

### 3. La entrega inmediata sale en verde

En los tres documentos: el PDF de la cotización, el del historial y el
comprobante. `cevenCondiciones()` devolvía strings pelados y hay código que
depende de eso, así que se agregó **`cevenCondicionesDetalle()`**, que devuelve
`{texto, destacar}`; `cevenCondiciones()` es ahora un `.map()` sobre ella y no
cambió para nadie.

Los dos HTML usan la clase `.cd-ok` (chip verde, definido en las **dos** hojas de
`pdf-core.js`); el comprobante pinta el texto y un `roundedRect` de fondo con el
mismo par de verdes. Es un chip y no solo texto de color porque el PDF de la
cotización termina rasterizado por html2canvas y achicado para entrar en una
hoja: a ese tamaño un cambio de color solo se pierde.

Se destaca **solo** el texto exacto "inmediata" (sin distinguir mayúsculas ni
espacios de más, para agarrar también lo escrito a mano). `"no inmediata"` o
`"inmediata sujeta a stock"` son justamente los casos en los que pintar de verde
engañaría al cliente.

### Verificación

`scripts/check-entrega.js` (nuevo, 37 chequeos): reconocimiento de la entrega
inmediata, round-trip por el selector, que `cevenDelivery()` nunca devuelva
`__otra`, que se destaque una sola línea, y que el comprobante escriba el verde
—leyendo los operadores de color del PDF, comparados como **números**: jsPDF
emite el color del texto con 3 decimales y el del relleno con 2, y clavar el
formato hacía fallar un chequeo que estaba bien.

Además, mirado en el navegador: el comprobante generado, el bloque de condiciones
con y sin entrega inmediata, y el selector con la opción libre desplegada.

---

## 06/08/2026 · El comprobante pasa a PDF, condiciones comerciales en todos lados e IVA desde el Excel

Tres pedidos que resultaron estar encadenados.

### 1. El comprobante se descarga y se abre

Hasta hoy el botón 🧾 armaba un HTML, lo escribía en una ventana nueva y disparaba
`window.print()`: para quedarse con el archivo había que elegir "Guardar como PDF"
en el diálogo. Ahora se **descarga solo y se abre** en otra pestaña.

Se dibuja con **jsPDF + autotable**, no con html2canvas. La razón por la que en su
momento se eligió imprimir en vez de generar un PDF sigue siendo válida —
html2canvas rasteriza y el texto queda como imagen, sin poder seleccionarse ni
buscarse— pero se puede tener las dos cosas: este documento es texto y una tabla,
y jsPDF lo dibuja como texto real. El plugin ya estaba en `vendor/` y precacheado
(lo usaba solo `cevencare.html`); hubo que cargarlo en los dos `index.html`.

Efecto lateral que terminó siendo la clave del punto siguiente: al ser todo
**sincrónico**, el `window.open` cae dentro del gesto del click y el navegador no
lo bloquea.

**Dos cosas que costaron y quedaron en `check-comprobante.js`**:

- Las 14 fuentes base del PDF codifican **WinAnsi**, y los caracteres del bloque
  0x80–0x9F de CP1252 (`– — “ ” … •`) **no se dibujan: desaparecen sin ningún
  aviso**. La condición de pago salía "30 días FF  TC Dólar billete BNA" —con el
  guión comido y dos espacios— y nadie lo habría notado hasta que el cliente
  recibiera el papel. Se normaliza todo lo que se imprime con `cevenCompSan()`,
  no solo los textos fijos: las descripciones vienen de un Excel del ERP. Los
  acentos, la `ñ`, el `°` y el `·` sí están en Latin-1 y salen bien.
- Con la columna SKU a 26 mm, `A4LZ8AA#ABM` se partía en dos renglones. Está a 30.

`check-comprobante.js` genera el PDF de verdad en Node y le lee el texto (jsPDF no
comprime los content streams). Existe porque un error de dibujo **no tira
excepción**: sale un PDF con una columna corrida y eso se ve recién en el cliente.

**Segunda pasada de diseño, el mismo día**, sobre el documento ya funcionando:

- El título dice **COTIZACIÓN**, no "COMPROBANTE". No es cosmético: sin CAE de
  AFIP esto no es un comprobante fiscal, y "cotización" es lo que realmente es.
  Por lo mismo se sacó el renglón en blanco de **CUIT / DNI** del cliente (el CUIT
  del *emisor* sigue en el encabezado).
- **Datos del cliente**: el nombre en cuerpo 16 y el proyecto abajo en gris, sin
  rótulos "Recibe:" / "Organización:". Si no hay proyecto no se imprime nada — un
  guión suelto debajo del nombre no aporta.
- El **ejecutivo subió al encabezado**, como tercera celda de la caja junto al N° y
  la fecha (antes estaba al pie, en letra chica). El pie quedaba repitiendo esos
  dos datos, así que ahora es solo la razón social.
- La columna **IVA pasó al final**, después del Subtotal: es informativa y no tiene
  por qué separar la cantidad del precio, que se leen juntos.

### El nombre de los archivos

Los dos PDF que se le mandan al cliente pasaron a llamarse

    <cliente> - <proyecto> - Ceven - <validez>.pdf

(la validez es "Propuesta efectiva hasta", en `YYYY-MM-DD`, que además ordena bien
por nombre). Antes eran `Cotizacion_0563_Vista_Energy.pdf` y
`Comprobante_0563_Vista_Energy.pdf`, con el slug copiado en tres lugares. Ahora lo
arma `cevenNombreDocumento()` en `shared/pdf-core.js`.

Detalles que están en `check-comprobante.js`: los tramos sin dato se **omiten
enteros** (si no quedaba `Vista Energy -  - Ceven - `), el `—` de "sin dato" de
`cquotes` no entra, en Poly se cae al OPG si no hay proyecto, y los caracteres de
control se cambian por **un espacio** en vez de borrarse — un tab pegado desde un
Excel separa dos palabras, y borrarlo daba "HospitalItaliano".

> ⚠ **Los dos botones producen ahora el MISMO nombre de archivo**, porque ni el
> número de cotización ni el tipo de documento entran en el formato pedido.
> Bajar los dos para la misma cotización deja el segundo como "… (1).pdf", y dos
> cotizaciones distintas del mismo cliente/proyecto con la misma validez también
> chocan. Es una consecuencia del formato, no un descuido: si molesta, la
> solución es agregar un tramo (el N° o una palabra que distinga los documentos).

### 2. Condiciones comerciales: un solo lugar, y en todos los documentos

Estaban escritas cuatro veces y ya se habían despegado entre sí:

- el **comprobante no las tenía**: solo un renglón "Forma de pago: ____" en blanco;
- el PDF del historial (las dos marcas) **omitía el bloque entero** si faltaban los
  tres campos editables — incluidas las líneas fijas, que son ciertas siempre;
- **en Poly no salían nunca desde el historial**, porque `doSave()` no guardaba
  `Condición de pago` / `Propuesta efectiva hasta` / `Entrega`. El PDF los leía de
  esas claves y siempre venían vacías. Apple ya lo había arreglado; Poly no.

Ahora las arma `cevenCondiciones()` en `shared/pdf-core.js`, a partir de la fila de
`cquotes` (documento guardado) o de los campos de la pantalla (cotización en vivo).
Las líneas que dependen de un dato salen con `—` si no lo hay, en vez de
desaparecer: un bloque que cambia de tamaño según lo que se cargó se lee como si
faltara algo.

Lo propio de cada marca va en **`brand.js` → `condicionesFijas`** (Apple: el
enrolamiento en Apple Business Manager; Poly: ninguna, todavía), nunca un `if` por
marca adentro de `shared/`.

Poly también guarda ahora esos tres campos y los repone al reabrir del historial.

### 3. IVA desde el Excel del ERP (Poly)

El export trae la columna **"Programa fiscal"** con dos valores: `IVA GENERAL` e
`IVA REDUCIDO` (520 y 44 filas del último archivo, que son 67 y 10 SKUs). La regla
es la del negocio, tal cual: **si dice reducido es 10,5 %; todo lo demás, 21 %** —
incluido un artículo cargado a mano, que no tiene programa fiscal y cae en la
general. El match es `/reducid/i` y no el texto entero: nada garantiza que mañana
el ERP no exporte "Reducido".

El dato ya se importaba pero moría en una pastilla "IVA reducido" al lado de la
descripción, que solo aparecía en los reducidos: no había forma de ver la alícuota
del resto. Ahora es una **columna propia** en el catálogo, en la subpantalla de
productos, en la cotización, en los dos PDF, en el comprobante y en el historial, y
viaja a `cquotes` en la columna `IVA` (que sale al Excel).

**Por ahora solo se muestra**: no se suma a los precios ni se discrimina en un
total. Los documentos siguen diciendo "Los precios expresados NO incluyen
Impuestos".

La alícuota **viaja con la línea de la cotización**, no se rebusca en el catálogo:
el catálogo se reimporta y una cotización guardada tiene que seguir diciendo con
qué IVA se cotizó. Al reabrir una cotización vieja (sin la columna) se deduce del
catálogo, que es mejor que dejarla en blanco.

Apple también escribe ahora la columna visible `IVA`; antes el dato estaba en la
clave interna `_taxes`, que no sale al Excel ni la puede leer un módulo compartido
sin saber que es de Apple. Se sigue leyendo `_taxes` como respaldo.

### 4. El pipeline de Poly: de "número de factura" a "link de Netsuite"

El botón de la columna Acciones llevaba el número de factura del proyecto. Ahora
lleva el **link a Netsuite**:

- **con link** → botón verde `Netsuite ↗`, y al hacer clic **abre Netsuite** en
  otra pestaña. Al lado, un **✎ amarillo chico** para cambiar el link;
- **sin link** → botón rojo `Netsuite —`, que al hacer clic lo pide (ahí el ✎
  sobraría, porque el botón grande ya edita).

Abrir el link lo puede hacer cualquiera —es de solo lectura—; editarlo lo sigue
frenando `cevenCanEditPipelineRow()`, así que un ejecutivo no toca los proyectos
de otro. El ✎ ni siquiera se dibuja si no tenés permiso.

**El dato se sigue guardando en la clave `factura`**, igual que "sala" → Proyecto:
esa columna existe en Supabase, viaja sincronizada y ya tiene valores. Renombrarla
obligaría a migrar la tabla `pipeline` y los backups JSON para no ganar nada. Se
renombró **solo lo que se lee en pantalla** (y el encabezado del Excel, que ahora
dice "Netsuite").

Dos cosas que resolvió `cevenNetsuiteURL()`, y que están en
`check-poly-netsuite.js`:

- **Solo http y https.** El pipeline se sincroniza con TODO el equipo, así que
  ese valor no es de confianza: un `javascript:...` guardado como link correría
  en la pantalla de quien apretara el botón. Es el mismo agujero que ya se cerró
  en el resto de la app escapando lo que viene de la base, pero acá escapar no
  alcanza — hay que validar el esquema. Se valida **al guardar y al abrir**.
- **Un link pegado sin protocolo** ("app.netsuite.com/…") lo tomaría el navegador
  como ruta relativa de la propia app. Se le antepone `https://`, pero solo si lo
  que va antes de la primera barra parece un dominio: sin ese chequeo, las filas
  viejas —que guardaban el NÚMERO de factura— se convertían en `https://0001-123`
  y el botón salía **en verde** como si tuviera un link que no lleva a ningún
  lado. Ahora esas filas quedan en rojo, que es la verdad: falta cargar el link.

### Lo que NO quedó resuelto

- **La pestaña del PDF de la cotización.** El comprobante se abre solo; el 📄 PDF
  no puede: se arma con html2canvas, que es asincrónico, y para cuando termina el
  gesto del usuario ya se consumió — **comprobado en Chrome, incluso apretando el
  botón a mano**. La salida fue abrir la pestaña ANTES de generar, todavía dentro
  del click, con un cartel de "⏳ Generando el PDF…", y mandarla al archivo cuando
  está listo (`cevenPestanaEnEspera()`). Si el navegador la bloquea igual, el
  archivo se descarga y el cartel ofrece un botón "Abrir".
  **Este camino es el único que no se llegó a ver terminar en el navegador**: al
  abrirse, la pestaña nueva toma el foco y manda la original al fondo, y la prueba
  quedó a mitad. html2canvas no usa `requestAnimationFrame` (0 apariciones en el
  bundle), así que una pestaña oculta lo ralentiza pero no debería trabarlo —
  igual, hay que apretar 📄 PDF en las dos marcas y confirmar que la pestaña
  termina mostrando el PDF.
- Poly no tiene ninguna condición comercial propia. Si la tiene (garantía del
  fabricante, plazo de RMA), el lugar es `condicionesFijas` en su `brand.js`.

### De paso

Dos chequeos del repo estaban rotos **desde antes** y reportaban en falso:
`check-poly-catalogo.js` moría con `el.getAttribute is not a function` (al stub del
DOM le faltaban `getAttribute`/`setAttribute`/`closest`, que usa el filtro de
rubros) y `check-poly-tiers.js` buscaba la etiqueta `Manual`, que se había
renombrado a `Custom`. Los dos arreglados.

---

## 05/08/2026 · `promptModal` y `confirmModal` nunca funcionaron

`APP_VERSION` 5.5 → 5.6. Una línea de `shared/notify.js`.

Salió a la luz al no poder crear un equipo en el tablero de tareas, pero el bug
no era del tablero: los dos modales genéricos se pintaban **sin input y sin
botones**. Solo se veía el título y la única salida era clickear el fondo, que
cancela.

La causa es un selector:

```js
wrap.querySelector('div>div').textContent = title;   // ❌
```

`wrap` **también es un div**, y la tarjeta es su hija: `div>div` matchea primero
la **tarjeta entera**, no el párrafo de adentro. Ponerle `textContent` a la
tarjeta borra el input y los dos botones. El detalle de CSS que lo hace posible
es que `querySelector()` con un combinador puede usar ancestros de **fuera** del
elemento raíz para satisfacer el selector: solo el último compuesto tiene que
caer adentro. Ahora el párrafo va marcado con `[data-txt]`.

**Lo que estaba roto sin que nadie lo notara**, porque los cuatro caminos son
poco frecuentes:

- el **número de factura** de una fila del pipeline de Poly (`promptModal`);
- la **restauración de un backup** (`confirmModal`, `shared/backup.js`);
- la **recuperación de datos** cuando el arranque los encuentra vacíos
  (`confirmModal`, `shared/recovery.js`) — el cartel aparecía sin el botón de
  confirmar, así que la recuperación era imposible;
- crear y borrar equipos en el tablero de tareas.

**Verificación**: en navegador contra el Supabase real. El modal ahora trae
input y los botones Cancelar/Crear, el equipo se crea, la pestaña aparece y
queda activa, y quien lo crea entra como miembro. El camino de error también se
probó: con un token inválido el POST devuelve 401 y sale el cartel "No tenés
permiso…", en vez de fallar en silencio. Aparte, se confirmó en la base que el
`INSERT` en `equipos` pasa las policies con claims de admin y que
`authenticated` tiene los grants — el problema era 100 % del cliente.

---

## 05/08/2026 · Poly: agregar productos sin cambiar de pantalla

Archivo nuevo `src/poly/js/picker.js`. `APP_VERSION` 5.3 → 5.5.

### El problema era el viaje de ida y vuelta

"+ Agregar producto" llamaba a `openCat()`, que hace `goTo('catalog')`: te sacaba
de la cotización, elegías con checkboxes, apretabas "Agregar (N)" y **recién al
volver** veías qué había quedado. Armar una cotización era ir y venir a ciegas
entre dos pantallas.

Ahora se abre una capa flotante **encima** de la cotización, partida en dos:
arriba el catálogo con un `+` por producto (`✓` y fila verde si ya está), abajo
lo que la cotización ya lleva, con cantidades, total y `×`. La mitad de abajo es
el punto: se ve crecer la cotización sin cerrar nada.

El checkbox y el botón "Agregar (N)" se fueron. La vista Catálogo del menú
**queda**: ahí se importa el Excel y se crean artículos a mano.

### Sacar el checkbox rompía el pegado masivo de SKUs

`processMultiSKUs()` (compartida) marcaba los SKUs pegados con
`selIds[...] = _nextSel()` y avisaba "encontrados y **seleccionados**"; después
se remataba con "Agregar (N)". Sin checkbox ni botón de lote, **pegar una
columna de SKUs habría dejado de agregar nada, sin error y sin aviso**.

De ahí sale `cevenAplicarSkusPegados()`: la marca que sabe agregar directo la
define, la que no conserva el camino de la selección. Es el mismo patrón que
`renderCat`/`getFiltered`/`addToQuote` — shared llama, la marca implementa —, no
un `if` por marca adentro de `shared/`.

### Dos bugs encontrados al probarlo

- **El alta de un SKU faltante navegaba detrás de la flotante.** El camino de
  "no encontrados" hace `goTo('addprod')`; con la capa abierta, la app cambiaba
  de vista por atrás y el usuario seguía mirando el catálogo. Ahora se cierra
  primero.
- **El SKU faltante nunca se precargaba** — y esto es **anterior** a este
  trabajo. `promptForNextPendingSKU()` llenaba `#np-sku` y *después* llamaba a
  `goTo('addprod')`, que dispara `prepAddProd()` desde `_navApply()` y lo limpia.
  El formulario aparecía vacío justo en el flujo cuyo único objetivo es no
  volver a tipear el SKU. Se invirtió el orden.

### Un gateo por rol que estaba de más

Los controles del carrito arrancaron escondidos para el rol `lector`, pero el
`+` de la lista no los miraba: se podía sumar un producto y después no cambiarle
la cantidad ni sacarlo. Y era incorrecto de fondo: la regla de `auth.js` es que
un lector **sí puede armar y guardar una cotización nueva** — lo que no puede
tocar es lo ya guardado y el pipeline. El permiso se resuelve al guardar, no al
elegir productos.

### Además

- **`Manual` pasó a decir `Custom`** en el nivel de precio. El valor guardado
  sigue siendo `'MANUAL'`: viaja a `cquotes`, se sincroniza y ya está escrito en
  las cotizaciones existentes.
- **Condición de pago con opción libre** ("Otra…"). Había ocho lugares leyéndola
  a mano; ahora pasan todos por `cevenPayMode()` / `cevenSetPayMode()` de
  `shared/ui-core.js`. Con que uno se olvidara de resolver el marcador, el PDF
  habría salido diciendo `__otra`.
- **Filtro por categoría en Poly**, sobre el `RUBRO` que ya venía del ERP.
- **El logo se fue de la pantalla de cotización.** No del sistema: `_logo` sigue
  saliendo en el PDF, que es lo que ve el cliente. Lo que ya no hay es forma de
  cambiarlo desde la app.

### Ajustes de uso (misma tanda, `APP_VERSION` 5.7)

- **La fila de la cotización perdió el ✎ y quedó solo la papelera.** En esa
  tabla ya se editan a mano la cantidad, el nivel, el precio y la nota; lo único
  que quedaba detrás del lápiz era cambiarle el SKU y la descripción a una
  línea, que es raro y se confundía con "editar el producto del catálogo".
  Se borraron también `openQuoteItemEdit()` / `closeQuoteItemEdit()` /
  `saveQuoteItemEdit()` y el markup de `#qitem-edit-modal`: sin el ✎ quedaban
  sin punto de entrada. **Apple lo conserva** — allá el ✎ sigue en la fila.
- **Cantidad con `−` y `+`**, conservando el input: escribir 12 de una es más
  rápido que apretar doce veces. Los pasos leen del ítem y **no del input**,
  porque el valor del DOM puede estar a medio tipear ("1" mientras se escribe
  "12" haría que el `+` salte a 2 en vez de a 13). Bajar de 1 no borra la línea:
  para eso está la papelera.
- **Las categorías de la flotante pasaron de `<select>` a globitos pastel.** El
  color sale de un hash del nombre y es estable entre importaciones — si "AUDIO"
  cambiara de color, dejaría de servir como señal. El activo se marca con un
  anillo y no con otro color, por lo mismo. Tocar el activo saca el filtro.
  La elegida vive en el `data-rubro` del contenedor, así `_rubroElegido()` la lee
  igual que el `value` de un `<select>` y el filtrado sigue siendo uno solo.
- **El `+` de agregar quedó celeste azulado** (`#2f9be0`): se lee como la acción
  principal de la lista, sin competir con el negro de Guardar ni el rojo de
  eliminar.

**Verificación**: en navegador, con el harness aislado. Se probó el alta con `+`,
el estado verde, los `−/+` del carrito, el `×`, el filtro por categoría, el
pegado de cuatro SKUs (uno repetido y uno inexistente), Escape, y que la tabla
de la cotización coincida con el carrito. De los ajustes: los globitos filtran y
se destildan, los pasos de cantidad suben y no bajan de 1, y en la fila ya no
hay lápiz. Estáticos: `check-globals`, `check-precache`, `check-tareas`.

---

## 04/08/2026 · Tareas: archivado automático y tableros por equipo

Migraciones `20260804180000_tareas_archivado.sql` y
`20260804200000_tareas_equipos.sql`. `APP_VERSION` 5.1 → 5.3.

### Done crecía para siempre

Nada archivaba ni purgaba: el único borrado era manual, tarjeta por tarjeta.
Ahora una tarea terminada hace más de **3 días** sale del tablero, con un botón
en la cabecera de Done para verlas. **No se borra nada** — es archivado de
presentación, y las filas siguen viniendo en el poll.

Hizo falta una columna: `fechaISO` es cuándo se **creó** la tarea, no cuándo se
terminó. Archivar por ese campo daba lo contrario de lo buscado — una tarea
vieja recién terminada nacía archivada, y una creada y cerrada hoy tardaba 3
días en irse. `terminadaEn` la escribe **solo el trigger**: el reloj del
navegador es del usuario, y una máquina adelantada archivaría tareas de más para
todo el equipo. El backfill usa `fechaISO` (cota inferior: se terminaron después
de crearse), así que lo viejo queda archivado de entrada, que es el efecto
buscado.

Un detalle que costó: el sello se pone al **entrar** a done, no al **estar**. Si
no, renombrar o delegar una tarea terminada le reiniciaba los 3 días.

### Un tablero por equipo de trabajo

Un solo tablero para toda la empresa mezclaba trabajos sin relación. Ahora hay
una pestaña por equipo, con el conteo de pendientes y un punto en los tuyos.
Crear equipos y sumar gente se hace desde el propio tablero, sin pasar por el
admin.

**⚠ Es separación de PANTALLA, no de permisos** — decisión explícita del equipo.
El cliente se baja `todos?select=*` entero y filtra en JavaScript, y las
policies siguen dejando que cualquier `@ceven.com` lea y escriba todos los
equipos. Sirve para organizarse, no para esconder: un `curl` con el token de
cualquiera lista todo. Está escrito en la migración, en `BASE-DE-DATOS.md` y en
el encabezado de `shared/todos.js` para que nadie lo confunda más adelante.

`todos.equipo` guarda el **nombre** y no una FK, porque la app es offline-first
y una tarea creada sin conexión no puede depender de resolver un id contra el
servidor. Efecto buscado: una tarea que nombra un equipo que ya no existe igual
se ve, en un tablero con ese nombre. Con una FK habría desaparecido. El precio
es que renombrar implicaría tocar todas sus tareas, así que **no se ofrece
renombrar**: se crea otro y se mueven. Borrar un equipo **no borra sus tareas**,
las manda a General.

### Dos cosas que se llamaban igual

`ceven_equipo()` (la RPC) devuelve **gente**; `equipos` (la tabla) son
**tableros**. En el store quedaron como `personas()` y `equipos()`, con el aviso
arriba del archivo: el nombre de la RPC no se tocó porque ya está aplicada, y
renombrarla sería otra migración por un problema de prolijidad.

### La degradación dejó de ser un booleano

Había un flag `_sinTablero` para "faltan las columnas nuevas". Con tres
migraciones en vuelo eso no alcanzaba: que faltara `equipo` habría dejado de
mandar también `estado`. Ahora se registra **qué columna** rechazó el servidor
(PostgREST la nombra en el error) y se recorta solo esa, reintentando — el ciclo
termina sí o sí porque el conjunto solo crece.

**Verificación**: `check-tareas.js` (ampliado con la columna nueva) más
`check-globals` y `check-precache`. El archivado se probó en navegador con
tareas sembradas a 2,9 / 3,1 / 40 días. **Los tableros por equipo no se
probaron en navegador.**

---

## 04/08/2026 · Las tareas del equipo pasan a ser un tablero propio

Página nueva `src/tareas/` (`index.html` + `js/board.js` + `css/board.css`).
`shared/todos.js` reescrito como store. Migración
`20260804100000_tareas_tablero_y_equipo.sql`. `APP_VERSION` 5.0 → 5.1.

### Deja de ser un panel del shell

Era una checklist plana embutida abajo del selector de marcas: texto, quién la
cargó y un checkbox. Ahora se entra con una tarjeta, igual que a un cotizador, y
adentro hay tres columnas —**To do / Doing / Done**— con miembros delegados.

En el shell queda **la puerta y el número de pendientes**, nada más. Ese conteo
es el motivo de que `shared/todos.js` siga cargándose en las dos páginas: es el
único dato del tablero que sirve sin entrar.

### Delegar necesitó abrir la lista del equipo

Para arrastrar un miembro sobre una tarjeta hay que saber quiénes son los
miembros, y **la única forma de listarlos era la Edge Function `admin-users`,
que valida server-side `caller.email === admin@ceven.com`**. Con eso, delegar
habría sido una función que solo podía usar una persona.

De ahí sale `ceven_equipo()`: `security definer` porque `auth.users` no es
legible por `authenticated` (ni tiene que serlo), devolviendo **solo email,
nombre y rol** y con el filtro `ceven_is_staff()` **dentro del cuerpo** — con un
token que no sea `@ceven.com` da cero filas. Es la misma información que la app
ya publicaba de rebote (`todos.creadoPor` guarda el nombre de quien cargó cada
tarea), ahora expuesta a propósito y en un solo lugar.

### `hecho` no se borró, y tiene un trigger

`estado` deja a `hecho` redundante. Borrarlo habría roto a los clientes que
todavía no recargaron: la app es una PWA con *stale-while-revalidate*, así que
después del deploy siguen habiendo navegadores mandando `PATCH {"hecho":true}`
sin saber que existe `estado`. Sin trigger, esa tarea quedaba tildada para uno y
en "To do" para todos los demás — la misma clase de divergencia silenciosa que
ya costó cara con el contador de cotizaciones.

El trigger `todos_sync_estado` deriva uno del otro: gana el campo que cambió, y
si cambian los dos gana `estado` (eso solo lo manda el cliente nuevo, que es el
único que distingue `doing`). `hecho` se puede dropear cuando no queden clientes
viejos, no antes.

Del mismo lado, el front **se degrada solo** si se deploya antes que la
migración: detecta por la respuesta del servidor que faltan las columnas o la
RPC, avisa una vez y sigue guardando lo que sí existe, en vez de perder el
cambio en silencio.

### Los dos arrastres

Conviven en la misma pantalla y hay que distinguirlos **mientras** se arrastra,
no al soltar: tarjeta→columna mueve, miembro→tarjeta delega.
`dataTransfer.getData()` devuelve vacío durante `dragover` —es una restricción
de la especificación, el contenido recién se lee al soltar—, así que cada
arrastre declara su propio **tipo MIME** y el `dragover` decide mirando
`dataTransfer.types`. Efecto secundario buscado: como cada objetivo llama a
`preventDefault()` solo para su tipo, la tarjeta anidada dentro de la columna no
compiten, aunque el evento burbujee de una a la otra.

**Todo lo que se hace arrastrando se puede hacer sin arrastrar.** En celular no
existe `dragstart`: la API de drag & drop de HTML5 no funciona con el dedo. El
detalle (tocar la tarjeta) mueve, delega, renombra y elimina; con el teclado,
`Enter` abre y `←`/`→` mueven de columna.

Dos detalles que costaron: el repintado **se posterga mientras haya un arrastre
en curso**, porque si el poll de 15 s rehace el DOM con algo en la mano el
navegador cancela el gesto sin avisar; y el modal de detalle **se repinta por
dentro** en vez de cerrarse y volver a abrirse, porque cada ciclo empujaba y
sacaba una entrada del historial (`cevenNav`) y el botón Atrás del celular
dejaba de coincidir con lo que se veía.

### El poll ya no pisa lo que acabás de hacer

Mover una tarjeta y que el repaso de los 15 s conteste con la foto anterior la
devolvía sola a su columna por un ciclo entero. Ahora cada cambio local marca su
id por 8 segundos y el merge lo respeta; pasada la ventana gana el servidor, que
es lo que hace que el tablero converja entre varias personas.

Y el id de una tarea dejó de ser `Date.now()` pelado: el POST usa
`resolution=merge-duplicates`, así que dos personas cargando algo en el mismo
milisegundo hacían que **la segunda pisara a la primera en silencio**. Ahora
lleva tres dígitos de ruido.

### La barra superior sin marca

`src/tareas/` no es una marca (no tiene `brand.js`, ni tema, ni pipeline) pero
tampoco es el shell: necesita chip propio y vuelta al panel. Se declara con
`window.CEVEN_PAGE = {label, icon}`. **No** es un `CEVEN_BRAND` de mentira a
propósito: eso arrastraría todo el contrato de marca —`theme`, `prefix`,
`pipeCols`, el botón de modo oscuro que acá no tiene a quién llamar— para usar
dos campos.

**Verificación**: estática (`check-globals`, que ahora incluye la página nueva, y
`check-precache`). **Sin navegador.**

---

## 03/08/2026 · Poly cotiza con lista de precios: 4 niveles por SKU

Módulos nuevos `src/shared/clientes.js` y `src/poly/js/tiers.js`. Scripts nuevos
`check-poly-catalogo.js` y `check-poly-tiers.js`. `APP_VERSION` 4.9 → 5.0.

### Lo que cambia de fondo

Hasta ahora **el catálogo de Poly no tenía precios**: `processRows()` guardaba un
`listPrice` de referencia y el comentario decía explícitamente *"el precio nunca
se auto-completa (se carga a mano por OPG)"*; `addToQuote()` creaba la línea con
`salePrice: ''`. El export nuevo del ERP trae **4 precios por SKU**, así que Poly
pasa a cotizar con lista.

### El archivo viene en formato largo

Una fila por **(SKU, ubicación, nivel de precio)**: 564 filas son **77 SKUs**
reales (141 combos × 4 niveles). Tres cosas verificadas sobre el archivo, que son
las que habilitan el plegado a un producto por SKU:

- **El precio no depende de la ubicación.** Los 40 SKUs que están en más de un
  depósito tienen el mismo precio en todos, así que el precio es función de
  (SKU, nivel) y la ubicación solo aporta stock.
- **El stock (`LocAvailable`) se suma entre depósitos, deduplicando por
  ubicación.** El archivo repite el mismo valor en las 4 filas de niveles de cada
  depósito: sumar sin deduplicar lo **cuadruplicaba**. Solo un SKU está hoy en
  dos depósitos (99T09AA: 9 + 1 = 10), pero el error habría sido silencioso.
- **`Programa fiscal` y `RUBRO` son consistentes** entre las filas de un SKU. Los
  dos se guardan y se muestran en el catálogo; el IVA **no entra en ningún
  cálculo** — Poly no tiene columna de IVA en la cotización.

Sin `LocAvailable` el stock queda **null, no 0**: "no lo tengo cargado" y "se me
agotó" no son lo mismo, y el catálogo los muestra distinto.

El importador conserva el camino viejo si el archivo **no** trae la columna
`Nivel de precio` (los tipo "LP y Stock"), y ya no borra los SKUs cargados a mano
al importar.

### Los dos selectores

Uno **global** en el encabezado de la cotización y uno **por línea** en la tabla.
Una línea tiene tres estados: sigue al global (`tier:''`), tiene nivel propio, o
es **MANUAL** (precio escrito a mano).

**Cambiar el global repricea SOLO las que lo siguen.** Las de nivel propio y las
MANUAL quedan intactas — si el global pisara todo, el selector de línea no
serviría para nada. Escribir un precio a mano marca la línea MANUAL
automáticamente: sin eso, el próximo cambio del global le pisaba el número recién
escrito. Y elegir en una línea el mismo nivel que el global la deja **siguiendo**
al global, no clavada en ese nivel.

**Cada opción del selector muestra su precio**, y esto no es cosmético: hay **16
SKUs donde el orden no se cumple**. `A4LZ8AA` tiene Tier 2 en 4.346 y Tier 1 en
3.983,85 — más caro el "2" que el "1". `77P41AA` tiene Negocios Especiales
(496,95) más caro que Tier 3 (485,24). Elegir "Tier 1" sin ver el número es
elegir a ciegas, así que **ningún código asume que los niveles estén ordenados**.

### El nivel se recuerda por cliente

Nace como **ficha de cliente**, no como un campo suelto: `shared/clientes.js`
guarda hoy solo el nivel, pero el próximo paso previsto es una tabla de clientes
con condiciones de pago, CUIT, etc., y agregar un campo tiene que ser agregar una
clave. La clave es el nombre **normalizado con `cevenNormClient()`** — el mismo
criterio con el que el pipeline agrupa—, así que "ACME S.A." y "acme s.a. "
comparten ficha. El campo Cliente ganó autocompletado, igual que OPG, para que un
typo no cree un cliente nuevo con su propio nivel.

Al elegir el cliente se propone su último nivel, **solo si el selector global
todavía está vacío**: si el usuario ya eligió uno a mano para esa cotización,
cambiárselo por atrás sería peor que no ayudar.

### Persistencia

`COLS` de Poly gana `'Nivel de precio'`, así que reabrir una cotización del
historial recupera con qué nivel se armó **cada línea**, incluidas las MANUAL. El
nivel global no se guarda aparte a propósito: se deduce del más frecuente entre
las líneas, y así no puede quedar desfasado de los precios realmente cotizados.

**Verificación**: `node scripts/check-poly-catalogo.js` corre el importador real
contra `ingresoPoly.xls` (18 casos, incluidos el stock ×4 y los precios fuera de
orden) y `node scripts/check-poly-tiers.js` la semántica de repriceo (20 casos).
**Sin navegador.**

---

## 03/08/2026 · Pipeline agrupado por cliente, y los números dejan de repetirse

Módulos nuevos `src/shared/quote-num.js` y `src/shared/pipeline-group.js`.
Scripts nuevos `check-quote-num.js` y `check-pipe-roundtrip.js`. Fases 3 a 8.

### Los números de cotización se repetían por tres caminos

1. **El contador se incrementaba en cada carga de página** (`state.js`), no al
   crear una cotización. Y como `sync.js` se carga **antes** que `state.js`, ese
   `setItem` dejaba la clave sucia **antes** del bootstrap; `mergeSettings()`
   saltea las claves sucias, así que **el contador local siempre le ganaba al del
   equipo y se lo imponía**. Un navegador con `localStorage` limpio arrancaba en
   `#0001` y bajaba a todos a 1. Ahora el número se **muestra** al cargar y se
   **reserva al guardar**.
2. **El poll escribía el valor del servidor sin comparar magnitud**, así que el
   contador podía **retroceder**. Ahora hay `monotonicKeys: ['cqc']` en
   `brand.js` y `sync.js` resuelve esas claves con `Math.max` —en el poll y en el
   bootstrap— en vez de pisar. **No se sacó `cqc` de `settingKeys`**: dejaría de
   propagarse y habría *más* colisiones, no menos.
3. **Un contador atrasado devolvía un número ya usado.** `cevenNextQNum()` no le
   cree solo al contador: devuelve `max(contador, mayor número que existe de
   verdad) + 1`, mirando historial, pipeline y archivo. Con eso se auto-repara.

Además: `copiarCotizacionHist()` hacía `db.push()` **sin filtrar** por el número
nuevo — era el único camino que metía dos cotizaciones distintas bajo el mismo
número en el mismo array (el historial las mostraba concatenadas en una tarjeta y
borrar una borraba las dos). Y `doSave(true)` **pisaba en silencio**: si dos
usuarios tomaban el mismo número, el segundo en guardar borraba la cotización del
primero. Ahora distingue los dos casos por el origen del número —
`editQuoteFromHistory()` marca cuál se abrió para editar— y ante una colisión
real guarda con el próximo libre y lo dice.

**Por qué no una sequence en Postgres**, que es lo que sugería `ARQUITECTURA.md`:
la app es una PWA que funciona offline y pedirle el número al servidor haría que
no se pueda cotizar sin conexión — que es justo donde quedan las colisiones
residuales. Si con esto siguen apareciendo, la forma correcta es *reserva
oportunista* (número del servidor con red, local sin ella, marcado como
provisional), que es una fase entera.

Todo esto tiene banco de pruebas: **`node scripts/check-quote-num.js`**, 23 casos
que corren el módulo real, incluida la función de merge monótono extraída de
`sync.js` (no una copia, que se desfasaría).

### La tabla se agrupa por cliente

Cliente → Proyecto → Artículos, en las dos marcas. El encabezado de cada cliente
trae **cuántos proyectos, el total y la distribución por estado** — el número que
antes había que sacar sumando filas a ojo.

Lo que **no** se unificó: `renderPipeline()`. Poly tiene 9 columnas planas y
Apple 14, con unidades por familia, margen ponderado, filas virtuales por
override de SKU y facturación parcial. Unificarlo sería el `if(brand)` que
`ARQUITECTURA.md` prohíbe. Lo que sí se comparte es la capa de agrupación, el
registro de nodos y el orden de los grupos, parametrizados con `pipeColCount` en
cada `brand.js` — el mismo patrón que ya usaba `pipeSortDescCols`.

**El direccionamiento por índice tuvo que irse** (solo en Poly; Apple ya
resolvía por id). `window._pipeRows` + `data-i` + `_pipeRowAt()` no sirven con
filas de grupo intercaladas. Pasar el id por un `data-*` tampoco: lo convierte en
string y `updatePipelineStatus()` compara con `===` contra el id numérico — se
rompería en silencio. Ahora por el DOM viaja una **clave opaca** y un registro
devuelve el **objeto original**.

Dos detalles de comportamiento: buscar un proyecto **abre solo** el grupo del
cliente (si no, se ve una fila colapsada sin evidencia de que adentro está lo que
se pidió), y eso es derivado del render — no se escribe en `_pipeExpanded`, así
que limpiar la búsqueda vuelve a plegar todo sin dejar residuo. Y el estado de
expansión **no** se persiste: se sincronizaría al equipo entero.

Como el Cliente dejó de ser columna, perdió su `<th>` ordenable: lo repone un
botón **"A–Z Clientes"** en la barra.

### El Excel exportaba todo, siempre

`buildPipelineWorkbook()` usaba `getPipeline()` entero, ignorando los filtros
activos y la vista de mes archivado: filtrar y tocar "⬇ Excel" bajaba igual el
pipeline completo. Ahora exporta lo que está en pantalla. En Poly, además, la
columna "Proyectos" traía un **número** (cuántas salas tenía el OPG) mientras la
tabla mostraba un **nombre** bajo el encabezado "Proyecto".

### Apple: Proyecto ya no es Observaciones

`doSave()` decía literalmente `var proyecto = ob` con el comentario "campo
unificado": las dos claves de `cquotes` guardaban el mismo texto, así que agrupar
por proyecto mostraba notas sueltas. Ahora son dos campos.

**Ojo con esto, que es el único punto del trabajo que puede mover precios**: el
marcador **FOB** (que pone la nacionalización en 0%) se escribe en Observaciones,
que **no** viaja al pipeline — se detectaba de rebote porque `proyecto` era ese
mismo texto. Al separarlos la detección se caía. Por eso la fila ahora guarda el
flag `esFOB`, con **columna propia en Supabase** para que sincronice;
`isCotizacionFOB()` sigue leyendo Observaciones, como siempre.

**Verificación**: estática, con cuatro chequeos (`check-globals`,
`check-precache`, `check-pipe-roundtrip`, `check-quote-num`). **Sin navegador.**

---

## 03/08/2026 · Poly: la fila del pipeline pasa a ser un PROYECTO

Migración `20260803120000_poly_pipeline_por_proyecto.sql`. Script nuevo
`scripts/check-pipe-roundtrip.js`. Fase 2 del trabajo del pipeline.

### El modelo no representaba el negocio

Una fila de Poly era un **OPG** con un array `salas[]` adentro, y `estado`,
`mesCierre` y `factura` vivían a nivel OPG. Pero el OPG es **informativo** —lo
asigna la marca cuando da un precio especial— y no es la unidad de seguimiento:
lo es el proyecto. De ahí salían los dos síntomas:

- **Cambiarle el estado a un proyecto se lo cambiaba a todos los del mismo OPG**,
  porque el estado no era del proyecto.
- **La misma cotización podía quedar en dos filas.** `addToPipeline()` buscaba la
  fila destino **solo por OPG**; el guard por `qNum` aplicaba únicamente a filas
  sin OPG. Cargar la #0071 con OPG "A" y volver a cargarla con OPG "B" la dejaba
  en las dos, con su monto contado dos veces en los KPIs y repetido en el Excel.
  Eso es lo que el usuario reportó como "cotizaciones con el mismo número".

Ahora **1 fila = 1 proyecto = 1 cotización**: `qNum` es la identidad de la fila,
el OPG es un campo más y cada proyecto lleva su propio estado, mes y factura.

### El rename, que esta vez sí tocó los datos

`sala`→`proyecto` en todos lados: el input `#sala`, el array `salas[]`, la clave
`'Sala'` de `cquotes` y la columna `salas` de Supabase (dropeada). Eso **revierte
a propósito** la decisión del 31/07, que renombró solo la UI justamente para no
migrar datos guardados. Se pudo porque **no hay datos productivos** y la decisión
explícita fue borrar los de prueba en vez de migrarlos. Se fue también el mapa
`XLS_HD` que traducía el encabezado del Excel, que existía solo por ese desfase.

**Lo que la migración SQL no alcanza**: el `localStorage` de cada navegador. Si
alguien abre la app con el `poly_cpipeline` viejo en disco, el bootstrap lo trata
como filas locales que el servidor no tiene y **las vuelve a subir**. Lo resuelve
un flag `poly_model_v2` en `src/poly/index.html` que corre **antes** de
`shared/sync.js` y con `localStorage` crudo — con `cevenLsSet()` las claves
quedarían marcadas como sucias y el flush las subiría igual.

### `padCols: {qNum: 4}` — la trampa que más caro salía

Poly guarda el número como `'0071'` y la columna es `bigint`. Sin declararlo,
`coerce()` devuelve `71`, `normPipe()` compara `'0071' !== 71`, la fila queda
marcada como cambiada **para siempre** y el poll re-renderiza la tabla cada 15 s
sin ningún error que lo explique. Es la misma trampa que ya estaba documentada en
`apple/brand.js`.

Como no hay tests y esto es invisible hasta que alguien nota que la tabla
parpadea, quedó un script: **`node scripts/check-pipe-roundtrip.js`** simula el
viaje de ida y vuelta a Supabase para las dos marcas y falla si alguna fila no
vuelve idéntica. Verificado con un control negativo: vaciando `padCols` el script
falla en 6 casos.

### Lo que se fue

`removeSalaFromPipeline()`, el merge intra-fila por `qNum`/nombre, `_normOpg()` y
la rama `rmsala` del delegado: existían solo por el modelo de OPG. La fila
expandida, que listaba las salas, ahora muestra **los artículos de la cotización
con sus precios** —el nivel que antes no se veía sin abrir el historial—, leídos
de `cquotes` por `qNum`. Si el total de los artículos no coincide con el monto de
la fila, se avisa: el monto es una foto del momento de agregar al pipeline y la
cotización pudo editarse después.

`getDB()` se parsea **una vez por render** y se pasa a las filas expandidas
(hace `JSON.parse` de varios MB y el poll redibuja cada 15 s), igual que ya hacía
Apple. Y el `id` de fila nueva pasó de `Date.now()` a `Date.now()*1000 + random`:
a secas colisionaba entre dos usuarios en el mismo milisegundo y la PK es
`(brand, id)`. **Tiene que quedar entero** — la columna es `bigint`, así que el
`Date.now()+Math.random()` de `catalog.js` no sirve acá.

Los KPIs quedaron **Clientes** (distintos, sin distinguir mayúsculas) y
**Proyectos**; antes eran "OPGs" —que contaba filas, incluidas las sin OPG— y
"Proyectos". La columna Proyecto ahora es ordenable: era un array y no tenía
sentido, ahora es texto.

**Verificación**: estática (`node --check`, `check-globals`, `check-precache`,
`check-pipe-roundtrip` en las dos marcas). **Sin navegador** — ver "Pendientes".

---

## 03/08/2026 · Pipeline: los estados en un solo lugar y los KPIs que mentían

Módulo nuevo `src/shared/pipeline-status.js`. `APP_VERSION` 4.8 → 4.9. Es la
**fase 1 de un trabajo más grande** en el pipeline (ver "Pendientes"): esta no
toca datos ni modelo, solo lo que se lee.

### La tabla de estados estaba escrita a mano en seis lugares

`poly/js/pipeline-view.js`, `apple/js/pipeline-view.js` (dos veces),
`apple/js/archive-view.js`, `apple/js/pipeline-detail.js` y `apple/js/target.js`
tenían cada uno su copia del orden del embudo y de los colores. Ya habían
divergido: **`Negociacion` se veía sin tilde** en las tablas y las pastillas, y
con tilde en los `<select>` del HTML — el mismo estado, dos nombres. Y el
archivo de Apple pintaba el estado con una tabla de **dos** entradas, así que
cualquier cosa que no fuera Facturado o Perdido salía gris.

Ahora hay una sola tabla, `CEVEN_ESTADOS`, con el valor guardado (`v`), la
etiqueta visible (`lbl`) y los tres juegos de color que la app usa (pastilla,
tinte de fila, tarjeta del dashboard). **`v` no se toca nunca**: es lo que está
en localStorage, en la columna `estado` de Supabase y en los Excel exportados.
Lo único que cambia es `lbl`.

De paso, el estado `Proyecto` se muestra como **"En proyecto"**. En Poly
"Proyecto" ya era el nombre de una columna y de un KPI, así que la pastilla
"Proyecto · 3" y el KPI "3 Proyectos" se leían como si tuvieran algo que ver.

### Los dos KPIs que estaban mal

**"Proyectado" incluía lo ya facturado** (Commit + Con OC + Autorizando +
Facturado), al lado de la tarjeta "Facturado": sumar las dos contaba la misma
plata dos veces. **No se cambió la fórmula** —el Target Anual sigue el mismo
criterio y moverla lo desalinearía— sino el rótulo: ahora dice **"Forecast del
mes"** y, en Poly, una sub-línea que aclara cuánto de eso ya está facturado.

**"Total pipeline" cambiaba de fórmula según el filtro sin cambiar de
etiqueta**, y con las pastillas Facturado + Perdido activas a la vez mostraba
**USD 0**. La condición era `st`, que solo se completa con **un** estado
elegido; con dos quedaba vacía y se restaban Facturado y Perdido de una suma que
ya solo tenía eso. Lo que se quería preguntar era "¿hay algún filtro de
estado?", que ahora es `hayFiltroEstado`. El mismo bug estaba en las dos marcas.
Poly además no tenía el `dash-total-lbl` que Apple usa para reetiquetar.

### El archivo mensual de Poly se contradecía

`dash-proy` mostraba **el mismo número** que `dash-facturado` bajo el rótulo
"Proyectado", y `dash-total` decía "USD X perdido" bajo el rótulo "TOTAL
PIPELINE". Ahora las tres tarjetas se reetiquetan para el mes archivado
(`Facturado en Ene 2026` / `Proyectos facturados` / `Perdido en Ene 2026`).

**Ojo con esto si se toca**: quien repinta una tarjeta tiene que restaurarla al
volver. `renderPipeline()` reescribe sus rótulos en **cada** pasada, no solo
cuando cambian — si no, volver de un mes archivado deja los rótulos del archivo
sobre los números del pipeline. Apple ya lo hacía (`pipeline-view.js`, "Restaurar
card negro"); Poly no lo necesitaba porque nunca cambiaba nada.

### Información que solo existía en un `title=`

En un celular no hay hover, así que todo esto era invisible: **el número de
factura** (dos filas con y sin factura se distinguían solo por el color del
botón — ahora la etiqueta dice `Fact. 0012`), la afordancia "clic para ver el
detalle" (ahora la celda dice `· 2 proyectos ▸`), y el `<select>` de meses
archivados, que no tenía más rótulo que su tooltip (ahora lleva "Vista"
adelante).

También: el estado vacío citaba un botón que no existe —decía *"Agregar a
Pipeline"* cuando el botón real dice *"Agregar al pipeline"*— y el `↩` prometía
deshacer "el último cambio de estado o fecha" cuando también deshace altas,
bajas y edición de factura.

### El aviso de archivado

Era `📦 N entrada(s) archivada(s)`: movía filas fuera de la vista sin decir a
dónde iban ni cómo verlas. Ahora nombra el mes y trae un botón **Ver** que lo
selecciona. **No ofrece "Deshacer" a propósito**: el archivado es automático y
vuelve a correr al entrar al pipeline, así que desarchivar sin mover el cierre
estimado se re-archivaría en el acto — para eso está "↩ Restaurar" en la vista
del mes, que sí mueve el mes.

**Verificación**: estática (`node --check`, `check-globals` sin colisiones,
`check-precache` 71 rutas). **Sin navegador todavía** — ver "Pendientes".

---

## 31/07/2026 · Color por marca, barra de acciones nueva y "Proyecto" en Poly

Módulo nuevo `src/shared/theme.js`. `APP_VERSION` 4.6 → 4.7.

### Cada cotizador tiene su color

El problema de fondo es el de siempre: Apple y Poly comparten hasta la última
hoja de estilos, sus datos **no se mezclan**, y cargar una cotización en el
cotizador equivocado es un error fácil y silencioso. El chip de la barra ya lo
decía con palabras; ahora lo dice con color, que se ve sin leer.

Los valores van en `CEVEN_BRAND.theme` —declarativo por marca, como el resto del
contrato— y `theme.js` los copia a `--acc` / `--acc-h` / `--acc-soft` /
`--acc-dk` en `:root`. Pinta el filete de la barra superior, la vista activa, el
botón Guardar, los links y el foco. `base.css` define los cuatro con el azul por
defecto, así que el shell —que no tiene marca— y cualquier página que no cargue
el módulo siguen andando.

**El acento acompaña al logo de la marca, sin ser necesariamente su color
exacto**: Apple violeta casi negro `#2d1b4e` (el logo es negro), Poly naranja
pizarra `#b35333` (el naranja del logo, `#ff3900`, bajado y desaturado: el puro
da 3,6:1 sobre blanco y como texto no se lee), HP azul `#0096d6`, el del logo
(reservado). El criterio original era el contrario —distinguirse entre marcas,
no imitar el logo, con Apple azul `#0071e3`, Poly violeta `#6d3fd4` y HP naranja
`#ff6b00`—, y se dio vuelta en 08/2026 al entrar los logos reales en las
tarjetas del shell y en el chip de la navbar: con el símbolo de la marca al
lado, un acento que no tenía nada que ver se leía como un error de impresión.
Las tarjetas del panel llevan el mismo acento, repetido a mano en el `<style>`
del shell porque ahí no hay ningún `brand.js`.

Dos cosas que el acento **no** arrastra, y por eso el cotizador de Apple sigue
teniendo azul por todos lados: `--cblue` (`#0071e3`), que es el azul *semántico*
—el estado "Cotizado", las flechas de orden, los chips— y no la marca; y los
`#0071e3` hardcodeados de `apple/css/cevencare.css` y de varios botones sueltos,
que nunca pasaron por `--acc`. Cambiar `theme` no los toca.

`theme.js` **no toca** el `<meta name="theme-color">` aunque sea lo obvio: ese
meta ya lo maneja `pwa.js`, que lo sincroniza con el modo oscuro en
`DOMContentLoaded`. Con dos dueños ganaba el último y el color de marca duraba
un parpadeo.

### La barra de acciones de la cotización

Eran ocho o nueve botones de ícono suelto, todos del mismo tamaño y sin
etiqueta: `＋ ⧉ 💾 +📊 ⬇️ ⬆️ 📄 🛡️`. Había que abrir el tooltip para saber
cuál era cuál, y "descargar backup completo" pesaba visualmente lo mismo que
"guardar". Ahora son dos filas:

- arriba, con ícono **y texto**, lo que se usa en cada cotización: **Guardar**
  (en el color de la marca), **Agregar al pipeline** (verde, porque suma al
  embudo) y **PDF**;
- abajo, apagadas, las ocasionales (Nueva, Copiar, y CevenCare en Apple);
- el backup pasó detrás de un `⋯`, porque no es una acción de esta cotización
  sino de todos los datos.

El menú es un `<details>` nativo: abre con click y con teclado sin una línea de
JS. Lo único que agrega `ui-core.js` es cerrarlo al hacer click afuera, al
elegir una opción o con Escape — eso `<details>` no lo hace. Ese Escape no choca
con `nav.js`, cuyo handler solo actúa si hay un modal registrado en su pila.

### Poly: "Sala / Ubicación" pasó a ser "Proyecto (cliente final)"

Cambió **solo lo que se lee en pantalla**: label, placeholder, buscadores,
KPI, encabezados de tabla, detalle por OPG, avisos, PDF e historial. Las claves
de datos siguen como estaban (`#sala`, `salas[]`, `.sala`, la columna `salas` de
Supabase y `'Sala'` dentro de `cquotes`): renombrarlas obligaba a migrar el
historial guardado, los backups JSON y la base, y no era eso lo que se pidió. El
único lugar donde se traduce el nombre para afuera es el encabezado del Excel,
con un mapa en `exportDB()`.

De paso, **la columna del pipeline ahora muestra el nombre**. Decía "2 salas": el
dato que importa —de qué proyecto se trata— quedaba escondido detrás de expandir
la fila. Ahora se lee el nombre y un `+N` cuando el OPG agrupa varios, con el
listado completo en el tooltip. Lo mismo en los meses archivados.

**Verificación**: estática (`node --check`, `check-precache` 67 rutas,
`check-globals` sin colisiones). Sin navegador.

---

## 31/07/2026 · Pipeline: el dashboard ya no desaparece, y el mes de cierre se elige

Módulo nuevo `src/shared/monthpicker.js`. `APP_VERSION` 4.5 → 4.6.

**Los carteles desaparecían con un filtro vacío**. `renderPipeline()` terminaba en
`if(filtered.length){ …pintar… } else { dash.style.display='none' }`, en las dos
marcas. Tocar un filtro sin resultados no daba "0": borraba el dashboard entero,
que es una respuesta ambigua —¿filtré de más, o se rompió algo?—. Ahora se pinta
siempre: todos los acumuladores ya arrancaban en 0, así que la misma pasada
sirve para el caso vacío y no hay una segunda rama que mantener. Las pastillas
por estado ya se dibujaban todas, incluso en 0, así que el resultado es coherente
con lo que la vista compacta venía haciendo.

De paso, dos cosas que colgaban de eso:
- El cartel de tabla vacía decía siempre *"Cargá una cotización y tocá Agregar a
  Pipeline"*. Con 40 filas y un filtro que no matchea ninguna, eso manda a buscar
  el problema donde no está: ahora distingue vacío-por-filtro de vacío-de-verdad.
- El re-render por `resize` preguntaba `if(dash.style.display !== 'none')`, que con
  el cambio sería siempre cierto. Peor: ese inline quedaba en `'block'` aunque el
  usuario se hubiera ido a otra vista, así que redimensionar la ventana
  re-renderizaba el pipeline desde el catálogo. Ahora pregunta si `#p-pipeline`
  está en pantalla, que es lo que se quería preguntar.

**El selector de mes de cierre**. Era un `<select>` de **61 opciones** (vacío + 12
meses × 5 años) generado por `generateMesYearOptions()`, uno por fila del
pipeline y otro por línea de SKU. Además de incómodo, tenía un bug real: el rango
arrancaba **siempre en el año actual**, así que una fila con cierre en un año
anterior no tenía `<option>` que la representara y el select se dibujaba en
"— Mes/Año —". En pantalla esa fila **no tenía fecha**; en los datos sí. Y ofrecía
cinco años para adelante, cuatro de los cuales no se usan nunca.

Ahora el campo es un botón que muestra el valor formateado (`Nov 2026`) venga del
año que venga, y al tocarlo abre una grilla de 12 meses con el año arriba y
flechas para moverse, más "Sin fecha" y "Este mes". Dos clicks para cualquier
fecha, y el mes en curso queda marcado.

**Por qué no `<input type="month">`**: es lo que el helper viejo evitaba —su
comentario decía "Safari-friendly: dos selects"— y sigue valiendo. Safari no lo
soporta y degrada a un campo de texto libre, que en una PWA que se usa desde
iPhone es peor que el select. La grilla propia se ve igual en todos lados.

El contrato con el resto de la app no cambió: el `<button>` lleva el valor en
`value` y dispara un `change` que burbujea, así que los tres listeners delegados
que ya existían (`data-pact`, `data-dact`, `data-act`) siguen funcionando sin
tocarlos. El popover va en `<body>` con `position:fixed` porque la tabla del
pipeline tiene `overflow-x:auto` y columnas sticky: cualquier cosa absoluta
adentro queda recortada.

**Verificación**: estática (`node --check`, `check-precache` 66 rutas,
`check-globals` sin colisiones). Sin navegador, otra vez.

---

## 31/07/2026 · Barra de navegación compartida + pasada de diseño

Módulo nuevo `src/shared/navbar.js`. `APP_VERSION` 4.4 → 4.5.

**El problema**: no había navegación. Se saltaba entre vistas con botones sueltos
repartidos por cada toolbar (📋 al historial y 🎯 al pipeline desde la cotización,
"← Volver" desde adentro), la cuenta vivía en una barra flotante abajo a la
derecha que **solo aparecía en la vista de cotización**, y —lo más riesgoso—
mirando la pantalla no había forma de saber en qué marca estabas. Apple y Poly se
ven casi iguales y sus datos **no se mezclan**: cargar una cotización en el
cotizador equivocado era un error fácil y silencioso.

**La solución**: una barra superior única para el shell y las dos marcas, con el
chip de marca a la izquierda (🍎 Ceven · Apple, click = volver al panel), un ítem
por vista en el medio y la cuenta a la derecha (dark mode, usuarios, avatar con
iniciales + nombre + rol, contraseña, salir).

**Declarativa, como el resto del contrato**: los ítems salen de
`CEVEN_BRAND.navItems`, así que `navbar.js` no tiene ni un `if` por marca. Poly
simplemente no declara `nac`. `alsoFor` resuelve las vistas sin ítem propio
(`addprod` marca Catálogo, `qnac` marca Cotización) y `needsPipeline` esconde el
ítem al rol lector, que no puede usarlo.

**Dos cosas que costaron entender**:
- Los tokens de color (`:root`) vivían en `dark.css`, que el shell **no carga**:
  la barra quedaba sin colores en el panel de marcas. Se movieron a `base.css` y
  en `dark.css` quedó solo lo de `body.dark`.
- `cevenUpdateAccountBar()` arrancaba con `if(!bar) return`. Al sacar la barra
  flotante de las tres páginas, ese `return` temprano se llevaba puestos los
  permisos que se aplicaban más abajo (`#btn-add-pipeline` para el rol lector).
  Quedó como `cevenSyncUserUI()`, sin nada obligatorio y con guarda por botón.

**De paso, la tipografía**: la pila era `-apple-system, BlinkMacSystemFont,
sans-serif`, que en Windows —donde trabaja el equipo— no matchea nada y caía en
Arial. Ahora arranca por la cara variable de cada sistema (Segoe UI Variable en
Win11, San Francisco en macOS) y hay una escala de tres roles (`.h2`/`.h3`/`.lbl`)
que reemplaza los `style="font-size:16px;font-weight:500"` repetidos en cada
título de vista. Sin webfonts a propósito: es una PWA offline-first y la CSP no
permite orígenes externos. Además: foco visible con el teclado, `prefers-reduced-
motion`, números tabulares en las columnas de plata, y las tarjetas de marca del
shell pasaron de `<div onclick>` a `<a href>` (se abren con el teclado y en
pestaña nueva).

**Verificación**: estática otra vez — `node --check`, `check-precache` (65 rutas)
y `check-globals` (sin colisiones). **Nadie abrió esto en un navegador**, y es
todo UI nueva. Ver "Pendientes".

---

## 31/07/2026 · Solo cuentas @ceven.com acceden a los datos

Migración `20260731090000_exigir_dominio_ceven.sql`.

**El requisito real del usuario**, dicho por él: lo único que importa es que
nadie sin cuenta Ceven llegue a los datos, ni siquiera como lector. Los roles
son secundarios.

**El problema**: después de la migración de roles, las policies de lectura
seguían siendo `using(true)` para cualquier `authenticated`. La única barrera
para no llegar a ser `authenticated` era la configuración de GoTrue —signup
público apagado, ningún OAuth habilitado—, que es config de dashboard: invisible
desde el repo y silenciosa si cambia. Prender "Sign in with Google" o los
signins anónimos habría bastado para que cualquiera con un Gmail leyera el
pipeline y el price list completos.

**La solución**: el dominio se exige **dentro de la policy**
(`public.ceven_is_staff()`), así la garantía no depende de ninguna casilla.
Se usa `split_part(email,'@',2) = 'ceven.com'` y no `LIKE '%@ceven.com'` para
que no haya ambigüedad con dominios parecidos; sin claim `email` (usuario
anónimo) da `false`.

Verificado contra datos reales: `@ceven.com` ve las 4/5/1 filas; un
`@gmail.com` **con `user_role: admin` en el token** ve 0 y no escribe ni borra;
`@notceven.com`, `x@ceven.com.evil.io` y un anónimo sin email, 0. Y `anon` (la
publishable key sola, sin sesión) ya estaba bloqueado en las tres tablas.

Si algún día hay que sumar otro dominio, es un solo lugar: el `in (...)` de
`ceven_is_staff()`.

---

## 31/07/2026 · RLS por rol y marca: los roles dejan de ser decorativos

Migración `20260730120000_rls_por_rol_y_marca.sql`, aplicada en dos pasos.

**El problema**: las tres tablas tenían una sola policy, `for all to authenticated
using(true) with check(true)`. Cualquier usuario logueado —incluido uno con rol
`lector`— podía borrar el pipeline entero o pisar el price list de toda la empresa
con un `curl` y su propio token legítimo. Los permisos de `shared/auth.js` eran
solo UI.

**Por qué no alcanzaba con `user_metadata`**: era la opción obvia
(`auth.jwt() -> 'user_metadata' ->> 'role'`), pero ese campo **lo edita el propio
usuario** con `PUT /auth/v1/user` — el mismo endpoint que la app ya usa para
cambiar la contraseña. Habría recreado del lado del servidor la misma escalada que
se acababa de cerrar en el cliente. Por eso el rol autoritativo vive en
`public.user_roles`, que solo escribe la service_role, y llega al JWT por un
Custom Access Token Hook.

**El orden importó**: la Parte A (tabla + hook + sembrado) es aditiva y no cambia
ningún permiso; la Parte B (las policies) es **fail-closed** — sin el claim
`user_role` todos son `lector`. Aplicar B antes de activar el hook deja la app en
solo lectura, así que se hizo A → activar el hook en el dashboard → verificar que
el claim llegue → B.

**Por qué el hook y no una subconsulta**: se puede hacer lo mismo sin hook, con
`exists (select 1 from user_roles where ...)` dentro de cada policy, y para la
escala actual (2 usuarios, 4 filas) habría sido más simple y con cambios de rol
instantáneos. Se eligió el claim porque no paga una subconsulta por fila evaluada
y escala mejor. El costo: bajarle el rol a alguien no surte efecto hasta que
refresque su token (~1 h) o se le cierre la sesión.

Verificado contra datos reales: un `lector` no escribe ni borra pero lee todo; un
`ventas` limitado a una marca no toca la otra; un token viejo sin el claim no
escribe. El linter de Supabase ya no reporta `rls_policy_always_true`.

> Trampa al verificar policies a mano: un `UPDATE` que la RLS filtra **no lanza
> error**, afecta 0 filas y punto. Hay que mirar el `row_count`, y contra una
> clave que exista de verdad — probar contra una fila inexistente da 0 filas
> igual y parece que la policy funcionó.

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

### 🔴 `pipeline."esFOB"` no existe en la base, y el cliente la escribe

Emitir Apple desde el multimarca da **400** y el pipeline de Apple no sincroniza
(falla en silencio, `console.warn` en `sync.js`). Diagnóstico completo en la
entrada del 12/08/2026. Se decidió **no tocar la base por ahora**: lo de Apple
va a cambiar.

Cuando se retome, dos cosas separadas:

1. `alter table public.pipeline add column if not exists "esFOB" boolean;`
   — aditivo, reversible. **No** aplicar el archivo del 03/08 entero: borra los
   datos reales de Poly.
2. Que un upsert de pipeline que falla repetidamente **llegue a la pantalla** en
   vez de quedar en la consola. Es lo que hizo que esto pasara nueve días sin
   que nadie lo notara.

### 🟡 Tareas: los tableros por equipo no se abrieron en un navegador

Las tres migraciones del tablero están aplicadas y verificadas contra la base
(05/08/2026): trigger, backfill, invariante `hecho ⇔ done ⇔ terminadaEn`,
policies de `equipos` y el linter de seguridad sin hallazgos nuevos.

Lo que falta es **mirarlo funcionando**:

- **Equipos**: crear uno, sumar y sacar gente con ⚙, mover una tarea de equipo
  desde el detalle, borrar un equipo con tareas adentro (tienen que ir a
  General, no borrarse), y confirmar que el tablero elegido se recuerda al
  recargar pero **no** se le cambia a otro usuario.
- **Archivado**: desplegar "N archivadas" en Done y ver las tarjetas con borde
  punteado; el ocultar y el conteo ya se probaron.
- **Comprobante** (`shared/comprobante.js`): nunca se abrió el documento. Falta
  ver el logo, la tabla, la fila TOTAL y que `window.print()` no salga en blanco.

Para probar en el navegador hay una receta que funciona, y una trampa: el JWT
falso hace que `sync.js` reintente el refresh y salte el `alert()` de sesión
expirada, que cuelga CDP. La salida es servir una **copia** de `src` con
`SUPABASE_URL` vacío (ahí `sync.js` se autodesactiva) y sembrar
`localStorage`. El tablero de tareas no sufre esto porque `todos.js` nunca
llama a `cevenRefreshToken()`.

### 🟡 Pipeline: verificar en un navegador (fases 1–8 hechas el 03/08/2026)

**Las ocho fases del plan están implementadas y ninguna se abrió en un navegador.**
Lo que hay que recorrer, en las dos marcas y en claro y oscuro:

- **Numeración**: abrir la app tres veces seguidas y confirmar que el número **no
  avanza**; guardar y confirmar que recién ahí avanza; poner el contador en 1 a
  mano en DevTools y verificar que el siguiente número sale por encima del máximo
  real; copiar una cotización del historial y ver que no duplica el número.
- **Agrupación**: abrir y cerrar clientes y proyectos, ordenar por cada columna,
  el botón "A–Z Clientes", buscar un proyecto (el grupo tiene que abrirse solo) y
  limpiar la búsqueda (tiene que volver a plegarse). **Dejar la vista expandida
  20 s**: el poll redibuja cada 15 s, así que cualquier estado que viva solo en el
  DOM se borra en silencio — es la prueba específica del esquema de expansión.
- **Archivo**: entrar a un mes y **volver**, que los rótulos de las tres tarjetas
  se restauren.
- **Excel**: exportar con filtros puestos y confirmar que baja solo lo filtrado.
- **Rol lector**: sin botones de edición.
- **FOB en Apple**: una cotización con "FOB" en Observaciones **tiene que seguir**
  nacionalizando a 0%. Es el único punto del trabajo que puede mover precios.

**La migración SQL está escrita pero NO aplicada**:
`supabase/migrations/20260803120000_poly_pipeline_por_proyecto.sql` borra los
datos de prueba de Poly, dropea `salas` y agrega la columna `esFOB`.

**Lo que este trabajo NO resuelve, y conviene que sea decisión y no olvido**:
`cquotes` viaja como blob entero con last-write-wins (`ARQUITECTURA.md`), así que
dos usuarios que guardan dentro de la misma ventana de 15 s se pisan el historial
completo — y eso también produce números reutilizados. Con la base vacía es el
momento más barato que va a ser nunca para migrarlo a tabla propia fila por fila,
pero exige generalizar `sync.js`, que hoy conoce exactamente dos formas.
Se decidió **no hacerlo ahora**.

### 🔴 Urgente — depende del usuario
- **No hay backup de los datos productivos**: viven SOLO en el `localStorage` del
  navegador del usuario, sin copia en la base. Exportar el backup JSON y, ya
  logueado, importarlo para sembrar Supabase.
- **Protección de contraseñas filtradas desactivada** (Authentication → Passwords).
  Es lo único que reporta hoy el linter de seguridad de Supabase.
- **Probar el alta de usuarios de punta a punta**: crear uno con rol `lector` desde
  el modal y verificar que aparezca en `user_roles` con ese rol. La función v2 se
  desplegó y se comprobó que rechaza llamadas sin token o con token inválido, pero
  el ciclo completo necesita el token del admin, o sea la app abierta.

### Técnicos
- **La fase 1 del pipeline (03/08) tampoco se abrió en un navegador.** Qué mirar:
  el Total con las pastillas **Facturado + Perdido activas a la vez** (era el caso
  que daba USD 0); entrar a un mes archivado y **volver**, que los rótulos de las
  tres tarjetas se restauren; que `Negociación` salga con tilde en tabla,
  pastillas y archivo, en las dos marcas; el toast de archivado con su botón
  **Ver**; y todo en modo oscuro (las clases `row-st-*` / `spill-*` matchean por
  clase, no por el style inline).
- **Nada de lo hecho el 28–31/07 se probó en un navegador**: la verificación fue
  estática (sintaxis, precache, globales duplicadas, y bancos de prueba en Node
  para sync y auth). Falta abrir las dos marcas y recorrer los flujos.
- **La barra de acciones nueva y el color de marca, tampoco** (31/07): que el
  menú ⋯ abra y cierre bien (afuera, Escape, al elegir), que "Agregar al
  pipeline" siga escondiéndose para el rol lector (`#btn-add-pipeline`), y que
  el acento se vea correcto en las dos marcas, en claro y en oscuro.
- **El picker de mes nunca se vio en pantalla** (31/07): abrir/cerrar, elegir con
  el popover cerca del borde de la ventana (tiene que darse vuelta hacia arriba),
  que el `change` llegue al pipeline y guarde, "Sin fecha", y que una fila con
  cierre de un año pasado se muestre con su mes y no vacía.
- **La barra superior nunca se vio en pantalla** (31/07): es UI enteramente nueva.
  Hay que mirar el ítem activo en cada vista y en las dos que no tienen ítem
  propio (`addprod`, `qnac`), que el chip de marca vuelva al panel, que el 🌙
  cambie de ícono, que el 👤 aparezca **solo** para el admin, que el rol lector no
  vea Pipeline, y cómo queda todo en modo oscuro y con la ventana angosta
  (por debajo de 820 px se esconden nombre y rol).
- **Verificar `nav.js` en un navegador real** (Atrás en el celular, Escape en cada
  modal). Nunca se probó de forma interactiva.
- Sacar del repo los tres archivos de datos commiteados el 24/07.
- La pastilla offline de `pwa.js`: la rama que depende de `navigator.onLine` sigue
  sin verificar (la de "push pendientes" sí está verificada).
- `shared/pwa.js` necesita `updateViaCache: 'none'` en el `register()`.
- El modal "👤 Usuarios" del cliente todavía no muestra el campo `sinRol` que
  ahora devuelve `list` (marca a un usuario sin fila en `user_roles`, que el hook
  trata como `lector`). Tampoco muestra el `avisoRol` de `update_profile`, que
  explica que el cambio se aplica recién al re-loguear.

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
