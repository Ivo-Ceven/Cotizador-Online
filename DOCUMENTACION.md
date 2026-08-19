# Cotizador Ceven — Documentación técnica y funcional

> Documento de contexto para consumo por modelos de lenguaje.
> Versión de la app documentada: **4.1**
> Archivo principal: `index.html` (~466 KB, single-file)
> Última actualización del documento: 2026-08-18

---

## 1. Visión general de la aplicación

### 1.1 Propósito

Herramienta interna de **Ceven S.A.** (Apple Business Partner / Authorized Service Provider, Argentina y Uruguay) para:

1. **Armar cotizaciones** de productos Apple a partir de una price list importada, con cálculo de margen, nacionalización e impuestos.
2. **Generar PDF** de la cotización para el cliente final.
3. **Gestionar el pipeline comercial**: seguimiento de cada cotización por estado, mes estimado de cierre, unidades por familia de producto y monto.
4. **Medir cumplimiento** contra un objetivo anual de facturación.

Usuarios: equipo comercial reducido (3 ejecutivos + admin). No es un producto multi-tenant.

### 1.2 Arquitectura de alto nivel

```
┌──────────────────────────────────────────────────────────┐
│  index.html  (single-file: HTML + CSS + JS vanilla)      │
│                                                          │
│  ┌────────────┐   lee/escribe    ┌────────────────────┐  │
│  │  UI / DOM  │ ───────────────► │  localStorage      │  │
│  └────────────┘                  │  (fuente inmediata)│  │
│                                  └─────────┬──────────┘  │
│                                            │             │
│                        Storage.prototype.setItem         │
│                        interceptado (debounce 350 ms)    │
│                                            ▼             │
│                                  ┌────────────────────┐  │
│                                  │  Capa de sync      │  │
│                                  └─────────┬──────────┘  │
└────────────────────────────────────────────┼─────────────┘
                                             │ REST
                          ┌──────────────────▼───────────────────┐
                          │  Supabase (PostgREST)                │
                          │  · tabla  pipeline                   │
                          │  · tabla  app_settings (key/value)   │
                          │  · secuencia quote_number_seq + RPC  │
                          │  · Auth + Edge Function admin-users  │
                          └──────────────────────────────────────┘
```

**Modelo de datos híbrido:** `localStorage` es la fuente de lectura inmediata (la UI nunca espera a la red). La capa de sincronización empuja los cambios a Supabase con *debounce* y hace *polling* cada 15 s para traer cambios de otros usuarios.

### 1.3 Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Front-end | HTML + CSS + JavaScript **vanilla** (ES5) | Sin framework, sin build step, sin bundler |
| Persistencia local | `localStorage` | ~1,4 MB en uso; límite típico 5 MB |
| Backend | **Supabase** (PostgreSQL + PostgREST) | Acceso vía clave `anon` publishable |
| Autenticación | Supabase Auth + Edge Function `admin-users` | La `service_role` key nunca se expone al cliente |
| Hosting | **Netlify** (sitio estático) | Deploy por subida de carpeta |
| Librerías externas (CDN) | `xlsx` 0.18.5, `html2canvas` 1.4.1, `jspdf` 2.5.1 | Import/export Excel y generación de PDF |
| Archivo satélite | `CevenCareV2.html` | Cotizador de garantías; se embebe por `<iframe>` y se lee por `fetch` |

**Restricción operativa:** la clave `anon` **no puede ejecutar DDL**. Cualquier columna o tabla nueva requiere que un humano corra el SQL en el panel de Supabase.

### 1.4 Estructura de páginas

La app es una SPA por conmutación de `<div class="pg">`; `goTo(n)` activa la clase `on`.

| id | Sección | Rol |
|---|---|---|
| `p-quote` | Cotización | Pantalla principal: armado de la cotización |
| `p-catalog` | Agregar productos | Price list, búsqueda y selección de SKUs |
| `p-addprod` | Alta/edición de artículo | Producto manual y creación de categorías |
| `p-nac` | Nacionalización | % de nacionalización por modelo |
| `p-qnac` | Nac. por cotización | Overrides de nacionalización de la cotización activa |
| `p-history` | Historial | Cotizaciones guardadas |
| `p-pipeline` | Pipeline | Seguimiento comercial y dashboards |

---

## 2. Funcionalidades

### 2.1 Autenticación y roles

- Login con email del dominio `@ceven.com` (excluyente) contra Supabase Auth.
- Sesión persistente opcional ("Mantener sesión iniciada"), con refresh de token programado.
- Alta/baja/blanqueo de usuarios vía Edge Function `admin-users`; solo `admin@ceven.com` puede invocarla (validado server-side).

| Rol | Permisos |
|---|---|
| `admin` | Sin restricciones. |
| `ventas` | Ve todo; solo **modifica** cotizaciones y filas del pipeline cuyo campo *Ejecutivo* coincide con su nombre. |
| `lector` | No modifica nada ya guardado ni el pipeline; sí puede armar y guardar una cotización nueva. |

`cevenMyRole()` devuelve `lector` como *fail-safe* si no hay sesión válida. Consecuencia observable: el botón **Agregar al Pipeline** se oculta sin sesión.

### 2.2 Price list y catálogo (`p-catalog`)

- **Importación completa** desde Excel/CSV (`handlePL`): reemplaza el catálogo.
- **Actualización de precios** (`handlePriceUpdate`): actualiza SKUs coincidentes, agrega nuevos y **conserva los productos manuales**.
- Búsqueda por texto y **pegado masivo de SKUs** (separados por enter, tab o coma).
- Filtros por *Model* y *País*.
- Limpieza de catálogo: eliminar SKUs con sufijo `LL/A` (EE.UU./Canadá) o `E/A` (sin tocar `LE/A` ni `BE/A`, que son países reales).
- Controles compactos en la barra: **Margen %**, **% Nacionalización** y **Moneda** (USD/ARS + tipo de cambio).

### 2.3 Alta de artículo y categorías (`p-addprod`)

- Alta/edición de productos manuales (SKU, descripción, precio, Model, País).
- Flag **"Precio ya nacionalizado"**: si está activo, no se suma el % de nacionalización al cotizar.
- **Creación de categorías (Model) nuevas** con tres atributos:
  1. Nombre
  2. IVA/Impuestos (ej. `21%`, `10.5% + 21%`)
  3. **Familia** — en qué columna del pipeline suma: `acc` | `mac` | `iphone` | `ipad` | `serv`
- Edición posterior de categorías creadas a mano (renombrar, cambiar IVA, cambiar familia), con fusión si el nombre nuevo ya existe.

### 2.4 Cotización (`p-quote`)

- Campos: Cliente, Ejecutivo, Mes estimado de cierre, Estado, Observaciones/Proyecto.
- Tabla de ítems con edición en línea: cantidad, margen %, precio de venta.
- Tabla separada de **garantías** (CevenCare).
- **Cotización con Alternativas** (toggle): habilita un checkbox por línea para elegir qué líneas suman al pipeline. Ver §3.3.
- Condiciones comerciales: validez de la propuesta, condición de pago, entrega.
- Acciones: Nueva, Copiar, Historial, Guardar, PDF, Agregar al Pipeline, y menú `···` (CevenCare, modo oscuro, backup).

#### Cálculo de precio de venta

```
costo_base        = precio del price list
nacionalizado     = costo_base × (1 + %NAC/100)      [si el producto no viene ya nacionalizado]
precio_venta      = nacionalizado / (1 − margen/100)
```

El %NAC sale de `nacRates` (por Model), con posibilidad de **override por cotización** (`quoteNacOverrides`, pantalla `p-qnac`).

### 2.5 Garantías — CevenCare

- `CevenCareV2.html` se abre embebido en un `<iframe>` (fallback a popup).
- Comunicación por `postMessage` con tipo `cevencare-add-warranty`.
- Dos flujos de alta: presupuesto completo (carrito) o **agregado directo** desde la búsqueda simple.
- **Auto-sugerencia**: al cargar un producto Mac se ofrecen automáticamente las garantías GL y CC de 3 años. Los precios se leen **en vivo** desde `CevenCareV2.html` por `fetch` + parseo de `DATA_NUEVO` / `DATA_CF`, con caché en `cwarranty_pricing_cache`.

> **Limitación conocida:** con protocolo `file://` el navegador bloquea `fetch` entre archivos locales, por lo que el auto-agregado de garantías **no funciona** al abrir el HTML directo. Sí funciona servido por HTTP (Netlify o servidor local).

### 2.6 Historial (`p-history`)

- Listado de todas las cotizaciones guardadas, agrupadas por número.
- Filtros: cliente, ejecutivo, rango de fechas.
- Acciones por cotización: editar, copiar (crea una nueva), eliminar, exportar PDF de las seleccionadas.
- Exportación a Excel de toda la base.

### 2.7 Pipeline (`p-pipeline`)

Núcleo de seguimiento comercial. Cada entrada corresponde a una cotización.

**Columnas de la tabla:** Alta · Modificado · Ejec. (iniciales) · Cliente · Proyecto (editable) · Cierre est. · Estado · Macs · iPhone · iPad · Serv. · Acc. · Margen · Monto · Acciones.

**Estados:** `Proyecto` → `Cotizado` → `Negociacion` → `Commit` → `Con OC` → `Autorizando` → `Facturado` | `Perdido`.

Funcionalidades:

- **Edición en línea** del estado, mes de cierre y proyecto directamente en la fila.
- **Motivo de pérdida obligatorio**: al pasar a `Perdido` se abre un modal con motivo (`Presupuesto del cliente` | `Precio` | `Decisión del cliente` | `Sin Novedades`) y detalle libre. Se guarda en `perdidoMotivo` y se muestra como ícono 💬 con tooltip.
- **Detalle por SKU** desplegable: estado, mes de cierre, OV y facturación parcial **por línea**.
- **Facturación parcial**: una línea puede facturarse en parte; el resto queda en otro estado y se separa en una fila virtual.
- **Filas virtuales**: si una cotización tiene estados o meses distintos por SKU, se explota en sub-filas agrupadas por (estado, mes).
- **Alerta de estancadas**: cotizaciones abiertas sin movimiento (umbrales de 30 y 60 días).
- **Deshacer** el último cambio de estado o fecha.
- **Archivo mensual**: las entradas Facturadas/Perdidas de meses pasados se archivan automáticamente y se consultan por el selector de mes.
- **Backup automático** a una carpeta local elegida por el usuario (File System Access API).
- Exportación del pipeline a Excel.

### 2.8 Target Anual

- Objetivo anual de facturación configurable por año.
- Comparación mes a mes contra lo facturado real (pipeline activo + archivo).
- **Ajustes manuales** por mes (`ctarget_manual`) para sumar ventas fuera del pipeline.

### 2.9 Análisis por SKU

Dashboard que agrega, por SKU: unidades totales, desglose por estado y clientes asociados.

### 2.10 Backup y restauración

- **Backup completo** (`.json`): cotizaciones, pipeline, archivo, price list, NAC, logo, contador.
- **Restauración** con validación de firma (`_app: 'CevenCotizador'`) y confirmación mostrando cuántos registros se van a sobrescribir.
- Snapshots automáticos en IndexedDB y backup periódico a carpeta local.

---

## 3. Fundamento de decisiones de diseño

### 3.1 Single-file HTML sin build step

**Decisión:** toda la app vive en `index.html`.

**Motivo:** el despliegue es "arrastrar una carpeta a Netlify". No hay CI, ni Node, ni pipeline de build en el equipo. Un único archivo elimina toda una clase de errores de despliegue (assets faltantes, rutas rotas, versiones desalineadas).

**Costo asumido:** archivo grande y sin modularidad. Se compensa con comentarios de bloque y nombres de función descriptivos.

### 3.2 localStorage como fuente primaria + sync diferida

**Decisión:** la UI lee y escribe siempre en `localStorage`; la sincronización con Supabase es asíncrona y transparente.

**Motivo:** el equipo cotiza en vivo frente al cliente. Una UI que espera round-trips de red es inaceptable. Además da tolerancia a cortes de conectividad.

**Mecanismo:** se intercepta `Storage.prototype.setItem`; los cambios en claves sincronizadas disparan un `flush` con *debounce* de 350 ms. Un `poll` cada 15 s trae cambios remotos y compara por firma antes de pisar.

**Riesgo conocido y no resuelto:** `cquotes` (~400 KB, todas las cotizaciones) viaja como **un único valor** dentro de `app_settings`, con resolución *last-write-wins*. Si dos usuarios guardan cotizaciones distintas dentro de la misma ventana de sincronización, una puede pisar a la otra por completo. **Mitigación pendiente:** migrar cotizaciones a su propia tabla.

### 3.3 Modelo de "Cotización con Alternativas"

**Problema de negocio:** para un mismo negocio se cotizan varias opciones (ej. 3 configuraciones de Mac para 1 unidad real). Si todas suman al pipeline, el forecast se infla.

**Decisión:** un toggle por cotización habilita un checkbox por línea. La línea destildada **sigue apareciendo en el PDF** (el cliente ve todas las opciones) pero **no suma al pipeline**.

**Reglas de resolución** (`lineCountsForPipeline`):

1. Si la línea tiene un valor explícito de `pipeInclude`, ese valor **manda siempre**.
2. Si no lo tiene, y es una garantía vinculada a un producto excluido (`_fromProduct`), se excluye por herencia.
3. En cualquier otro caso, cuenta.

El orden importa: la exclusión heredada nunca puede pisar una decisión explícita del usuario.

**Default al activar el toggle:** cuando existen garantías GL y CC del mismo equipo, se preselecciona la de menor precio (en la práctica, la GL).

### 3.4 Centralización de la categorización por familia

**Problema detectado:** la heurística que decide si un producto es Mac/iPhone/iPad/Acc estaba **duplicada en 8 lugares** (alta al pipeline, recálculo, filas virtuales, archivado, borrado de línea, target anual y dos dashboards). Corregir uno y olvidar los otros producía totales que no cerraban.

**Decisión:** una única función `familiaDe(desc, lob)`.

**Orden de precedencia:**

```
1. Familia asignada a mano a la categoría (CUSTOM_MODELS)   ← gana siempre
2. Heurística por descripción (regex iphone / ipad / mac)
3. Lookup exacto por Model (MODEL_CATEGORY)
4. Fallback: 'acc'
```

**Por qué la asignación manual va primero:** un "Vidrio Templado Compatible Con iPad 11" contiene la palabra *iPad* y la heurística lo contaba como **una unidad de iPad**. Si el usuario declaró que la categoría *Templados* es Accesorios, esa declaración es evidencia más fuerte que una coincidencia de texto.

**Compatibilidad:** las categorías creadas antes de esta función quedaron guardadas como `true` (sin familia) y siguen usando la heurística, para no alterar cifras históricas en silencio. Requieren asignación manual explícita.

### 3.5 Recálculo vs. valores congelados

`recalcPipelineUnits()` recorre las líneas guardadas en cada render y recalcula **unidades** siempre. El **monto** se recalcula solo cuando hay unidades archivadas (facturación parcial) o cuando la cotización tiene alternativas descartadas.

**Motivo:** el monto de alta refleja la cotización al momento de cargarla. Recalcularlo siempre haría que editar un precio viejo modifique retroactivamente el histórico.

**Consecuencia:** cualquier lógica de exclusión o categorización debe aplicarse **tanto en el alta como en el recálculo**, o el siguiente render revierte el cambio.

### 3.6 Numeración de cotizaciones atómica

**Problema:** el número salía de un contador local (`cqc`) sincronizado con *last-write-wins*. Dos usuarios simultáneos podían tomar el mismo número.

**Decisión:** tres capas.

1. **Secuencia PostgreSQL** (`quote_number_seq`) expuesta como RPC `next_quote_number()`. Atómica por definición.
2. **Fallback local**: máximo real entre cotizaciones, pipeline y archivo, +1. No un contador ciego.
3. **Red de seguridad al guardar**: si el número ya fue tomado por otro y llegó por sync, la cotización se corre al siguiente libre sin pisar la ajena.

**Decisión deliberada:** la carga de página **no** consume un valor de la secuencia. Si lo hiciera, cada refresh de cada usuario inflaría los números, que son visibles para el cliente. El servidor se consulta solo al crear una cotización de forma explícita.

### 3.7 Fecha de alta inmutable y sincronización desde Guardar

**Problema:** al actualizar una entrada existente se construía una entrada nueva con la fecha de hoy; se preservaban el `id` y los overrides por SKU, pero no `fecha`/`fechaISO`. La fecha de alta se reseteaba.

**Decisión:**

- `computeQuotePipeFields()` calcula solo los campos derivados de la cotización.
- `applyPipeFields()` los vuelca sobre la entrada existente **sin tocar la identidad** (`id`, `fecha`, `fechaISO`, overrides por SKU, unidades archivadas).
- Si la cotización ya está en el pipeline, **Guardar la actualiza sola** y el botón *Agregar al Pipeline* queda deshabilitado.

**Motivo UX:** eliminar el doble camino (Guardar vs. Agregar) que dejaba el pipeline desincronizado con la cotización.

### 3.8 Degradación elegante ante columnas faltantes

Como la clave `anon` no puede crear columnas, la capa de sync detecta que una columna declarada localmente no existe en Supabase (por ausencia en `select=*` o por error `PGRST204`), la **excluye del payload** y **conserva el valor local** en cada poll.

**Efecto:** una funcionalidad nueva anda en el navegador del usuario aunque la migración SQL todavía no se haya corrido; simplemente no se comparte entre dispositivos hasta entonces.

### 3.9 Uniformidad de claves en los upserts

`pickPipe()` emite **todas** las columnas, con `null` donde no hay valor, en lugar de omitir las vacías.

**Motivo:** PostgREST rechaza un lote completo con `PGRST102 "All object keys must match"` si las filas no comparten el mismo conjunto de claves. Omitir claves vacías rompía silenciosamente los push masivos (el *seed* posterior a una restauración de backup).

### 3.10 Separación entre PDF y pipeline

Dos agrupaciones distintas y deliberadamente independientes:

| Contexto | Función | Criterio |
|---|---|---|
| PDF al cliente | `getProductFamily()` | Familias comerciales granulares (MacBook Pro 14, iMac…). Las categorías creadas a mano se agrupan como **"Otros"**. |
| Pipeline | `familiaDe()` | 5 buckets operativos: Mac, iPhone, iPad, Servicios, Accesorios. |

**Motivo:** el cliente lee una propuesta comercial; el equipo mide volumen por línea de negocio. Son audiencias y granularidades distintas.

### 3.11 Sistema visual "Liquid Glass"

Lenguaje visual de estilo Apple compartido con las demás herramientas internas: superficies translúcidas con `backdrop-filter`, sombras de dos capas, radios generosos, badges tintados (fondo suave + texto saturado, nunca relleno sólido), tipografía SF Pro.

**Modo oscuro:** por *toggle manual* (no `prefers-color-scheme`), porque el equipo alterna según la iluminación del showroom. Todo el CSS se apoya en variables (`--c0`, `--ct1`, `--glass-fill`…) redefinidas bajo `body.dark`, de modo que los componentes nuevos se re-tematizan solos.

### 3.12 Jerarquía de la barra de acciones

**Problema:** las barras crecieron por acumulación hasta tener 11 botones circulares idénticos; guardar pesaba visualmente lo mismo que exportar un backup.

**Decisión:** cuatro niveles por frecuencia e intención.

| Nivel | Tratamiento | Contenido |
|---|---|---|
| Contexto | Selector segmentado | Cotización ⇄ Pipeline |
| Primaria | Botón azul sólido, uno por pantalla | Agregar al Pipeline / Nueva cotización |
| Secundaria | Glass con etiqueta | Guardar, PDF, Excel |
| Cluster | Grupo segmentado | Acciones de la misma familia |
| Overflow | Menú `···` | Uso poco frecuente: backup, modo oscuro, deshacer |

---

## 4. Métricas y KPIs

### 4.1 Métricas por entrada del pipeline

| Campo | Cálculo |
|---|---|
| `qMac`, `qIph`, `qIpad`, `qServ`, `qAcc` | Suma de cantidades de las líneas que cuentan, agrupadas por `familiaDe()`. Las garantías siempre suman a `qServ`. |
| `montoMac`, `montoIph`, … | Ídem, sumando `precio_unitario × cantidad`. |
| `monto` | Σ (precio_venta × cantidad) de productos + garantías que cuentan. |
| `margenPond` | **Margen ponderado por monto**, solo sobre productos (las garantías no llevan margen). |

```
margenPond = Σ(margen_línea × monto_línea) / Σ(monto_línea)
```

> Se pondera por monto y no por unidades: una Mac de USD 4.000 al 16 % pesa más sobre la rentabilidad real que un accesorio de USD 30 al 40 %.

### 4.2 KPIs del dashboard

| KPI | Definición |
|---|---|
| **Subtítulo de barra** | `N cotizaciones · USD total · MgPd X%` del conjunto filtrado. |
| **Macs / iPhone / iPad / Servicios / Accesorios** | Unidades y monto por familia, **excluyendo** Facturado y Perdido (es pipeline *abierto*). |
| **Facturado** | Σ monto de entradas en estado `Facturado`, con su margen ponderado y desglose de unidades. |
| **Proyectado** | Σ monto de `Facturado` + `Autorizando` + `Con OC` + `Commit`. Es el forecast de cierre probable. |
| **Total pipeline** | Σ monto de todo lo abierto (excluye Facturado y Perdido). |
| **Por estado** | Para cada uno de los 8 estados: cantidad de cotizaciones, monto y margen ponderado. |

Constante de referencia:

```javascript
PIPE_PROYECTADO_STATUSES = ['Facturado','Autorizando','Con OC','Commit'];
```

### 4.3 Alerta de cotizaciones estancadas

Días sin movimiento sobre `fechaMod`. Los estados cerrados (`Facturado`, `Perdido`) **nunca** se marcan: no hay acción pendiente.

| Umbral | Nivel | Indicador |
|---|---|---|
| ≥ 30 días | Aviso | Chip naranja |
| ≥ 60 días | Alerta | Chip rojo |

```javascript
PIPE_STALE_AVISO  = 30;
PIPE_STALE_ALERTA = 60;
```

> Umbrales calibrados sobre datos reales del pipeline (mediana 23 días, percentil 75 en 40). Un corte en 15 días marcaba dos tercios de la cartera y se volvía ruido.

### 4.4 Target Anual

| Métrica | Cálculo |
|---|---|
| Objetivo anual | Valor configurado por el usuario para el año. |
| Facturado real | Σ monto de entradas `Facturado` del año, combinando **pipeline activo + archivo mensual**. |
| Ajuste manual | Monto y unidades cargados a mano por mes, para ventas fuera del pipeline. |
| Cumplimiento | `(facturado + ajustes) / objetivo`. |

### 4.5 Estado de Orden de Venta (OV)

Por entrada, comparando links de OV cargados contra el total de líneas: `none` | `partial` | `full`.

### 4.6 Fechas de seguimiento

| Campo | Semántica |
|---|---|
| `fecha` / `fechaISO` | **Alta**: cuándo entró al pipeline. Inmutable. |
| `fechaMod` | **Última modificación**. Se estampa automáticamente al detectar un cambio real. |

Implementación: `savePipeline()` compara una firma por entrada (`pipeRowSignature`, que excluye `fechaMod` para no retroalimentarse) contra el estado previo y solo estampa las que efectivamente cambiaron. Un guardado sin cambios no altera la fecha ni genera escrituras redundantes a Supabase.

---

## 5. Componentes visuales y dashboard

### 5.1 Sistema de diseño — tokens

```css
/* Claro */
--c0:#eef0f4;  --c1:#fff;     --ch:#f5f5f7;  --c3:#ebebed;
--ct1:#1d1d1f; --ct2:#6e6e73; --ct3:#aeaeb2;
--cblue:#0071e3; --cgreen:#34c759; --cred:#d70015; --corg:#ff9f0a;
--glass-fill: linear-gradient(160deg, rgba(255,255,255,.8), rgba(255,255,255,.4) 45%, rgba(255,255,255,.62));
--glass-border: rgba(255,255,255,.6);
--glass-shadow: 0 12px 34px rgba(30,41,59,.12), inset 0 1px 0 rgba(255,255,255,.85), ...;
--radius-lg: 16px;
```

`body.dark` redefine el mismo conjunto. Regla de implementación: **ningún color se escribe literal en un componente**; siempre por variable, para que el modo oscuro no requiera overrides adicionales.

### 5.2 Barra de acciones (`.tb`)

Sticky, translúcida con `backdrop-filter: blur(22px) saturate(160%)`.

| Clase | Componente |
|---|---|
| `.appseg` | Selector segmentado Cotización ⇄ Pipeline |
| `.tb-title` | Título de pantalla + subtítulo dinámico |
| `.segc` | Cluster de acciones agrupadas |
| `.btnp` / `.btns` | Botón primario (azul sólido) / secundario (glass) |
| `.kbw` / `.kbm` / `.kbi` | Menú overflow `···` |
| `.tb-ctl` | Control compacto embebido (margen, moneda) |

Comportamiento: los menús se cierran entre sí, con click fuera o con `Escape`.

### 5.3 Tarjetas KPI (bento)

Siete tarjetas en una fila:

- **Cinco neutras** (Macs, iPhone, iPad, Servicios, Accesorios): fondo glass. Clickeables — filtran el pipeline por familia.
- **Facturado**: verde sólido (`#17a589`).
- **Proyectado**: verde oscuro (`#0a7d52`).

Cada tarjeta muestra: etiqueta (uppercase, tracking amplio), número grande (`font-weight:750`, `tabular-nums`) y monto/margen secundario.

La tarjeta activa se marca con `.kpi-active` (anillo azul) mediante `classList.toggle`, no por estilo inline, para no colisionar con las reglas `!important` del fondo glass.

> Cotizaciones y Total pipeline **no tienen tarjeta**: ese dato vive en el subtítulo de la barra. Se eliminaron por redundancia, lo que además permitió que las siete restantes entren en una sola fila.

### 5.4 Filas de filtros

1. **Cierre estimado** — pastillas por mes. Solo se ofrecen meses **actuales o futuros**; los vencidos se archivan y se consultan por el selector de histórico.
2. **Top clientes** — los 3–5 clientes con más cotizaciones; se recortan dinámicamente para no romper la línea.
3. **Por estado** — pastilla por estado con conteo, monto y margen; junto al rótulo van *Ver por mes* y *⚠ Estancadas*.
4. **Filtros de texto** — cliente/proyecto, ejecutivo, familia, estado (cuatro columnas de igual ancho).

### 5.5 Tabla del pipeline

`table-layout: fixed` con `<colgroup>` de anchos explícitos (15 columnas).

- **Tinte de fila por estado**: verde para Facturado/Con OC/Autorizando, ámbar para Commit, rojo suave para Perdido.
- **Ejecutivo por iniciales** (`Fer Castro` → `FC`), nombre completo en tooltip, para liberar ancho.
- **Columna Modificado** con chip de días cuando la cotización está estancada.
- **Proyecto editable en línea** (`contenteditable`); al salir del campo se guarda en el pipeline y en la cotización.
- **Fila de detalle** desplegable con la tabla por SKU.
- **Badge `parcial`** cuando parte de la cotización ya fue facturada en un mes anterior.

### 5.6 Detalle por SKU

Tabla anidada sobre fondo `#fafafa` con: SKU, descripción, cierre estimado, estado, cantidad, precio unitario, margen, subtotal, OV y acciones.

- Las garantías se distinguen con badge `GARANTÍA` y fondo cálido.
- Las filas de resto de una facturación parcial llevan badge `RESTANTE`.
- En cotizaciones con alternativas se listan **solo las líneas que cuentan**; el encabezado informa cuántos opcionales quedaron fuera.

### 5.7 Modales y overlays

| Componente | Uso |
|---|---|
| Modal de motivo de pérdida | Desplegable de motivo + detalle libre; cancelar revierte el selector sin tocar datos. |
| Modal CevenCare | `<iframe>` a pantalla casi completa. |
| Modal Target Anual | Configuración de objetivo y tabla mes a mes. |
| Modal Análisis por SKU | Agregación por SKU expandible. |
| Diálogo de garantías Mac | Elección Cliente Final / Canal al detectar Macs. |
| Toast | Píldora oscura inferior centrada, siempre oscura en ambos temas. |

### 5.8 Convenciones de indicadores

| Señal | Significado |
|---|---|
| Badge tintado (fondo suave + texto saturado) | Estado |
| Chip gris plano | Metadato neutro |
| Chip naranja / rojo en Modificado | Días sin movimiento (30 / 60) |
| Ícono 💬 | Motivo de pérdida registrado (tooltip) |
| Botón OV verde / rojo | Orden de venta cargada / pendiente |
| Badge `parcial` | Facturación parcial |

---

## Apéndice A — Modelo de datos

### A.1 Claves de `localStorage`

| Clave | Contenido | ¿Sincroniza? |
|---|---|---|
| `cquotes` | Todas las líneas de todas las cotizaciones (array plano) | Sí (blob en `app_settings`) |
| `cpipeline` | Entradas del pipeline | Sí (tabla `pipeline`) |
| `carchive` | Entradas archivadas por mes (`{'YYYY-MM': [...]}`) | Sí |
| `cpl` | Price list | Sí |
| `cnac` | % de nacionalización por modelo | Sí |
| `civa` | IVA por categoría | No |
| `ccustommodels` | Categorías creadas a mano → familia | No |
| `ctarget`, `ctarget_manual` | Objetivo anual y ajustes manuales | Sí |
| `cqc` | Contador de cotizaciones | Sí |
| `clogo`, `clogo_dark` | Logos | Sí |
| `cdark` | Preferencia de tema | No |
| `cwarranty_pricing_cache` | Caché de precios de garantías | No |

### A.2 Estructura de una línea de `cquotes`

| Campo | Descripción |
|---|---|
| `N° Cotización` | Identificador, string con ceros (`"0603"`) |
| `Tipo` | `producto` \| `garantia` \| `meta_nac` |
| `Cliente`, `Proyecto`, `Ejecutivo`, `Observaciones`, `Mes Cierre` | Cabecera (repetida en cada línea) |
| `SKU`, `Descripción`, `Cantidad`, `P. Venta Unitario`, `Total`, `Margen %` | Datos de línea |
| `_lob`, `_base`, `_nac`, `_taxes`, `_nacIncluded` | Metadatos de cálculo |
| `_estado` | Estado de la cotización |
| `_hasAlt`, `_pipeInclude` | Alternativas |
| `_wdata` | JSON completo de la garantía (incluye `pipeInclude` y `_fromProduct`) |

### A.3 Estructura de una entrada de `cpipeline`

Identidad (inmutable): `id`, `fecha`, `fechaISO`, `qNum`
Derivados de la cotización: `cliente`, `proyecto`, `ejecutivo`, `mesCierre`, `estado`, `qMac`…`qAcc`, `montoMac`…`montoServ`, `monto`, `margenPond`, `moneda`
Seguimiento: `fechaMod`, `perdidoMotivo`, `ovLink`
Overrides por línea (jsonb, clave `"SKU|índice"`): `skuStatus`, `skuMesCierre`, `skuPartialQty`, `skuPartialRemSt`, `skuPartialRemMes`, `skuArchivedQty`, `skuOvLinks`

---

## Apéndice B — Migraciones SQL aplicadas

```sql
-- Fecha de última modificación
alter table public.pipeline add column if not exists "fechaMod" text;

-- Links de OV por línea
alter table public.pipeline add column if not exists "skuOvLinks" jsonb;

-- Motivo de pérdida
alter table public.pipeline add column if not exists "perdidoMotivo" jsonb;

-- Limpieza de columnas obsoletas
alter table public.pipeline drop column if exists "qOtros";
alter table public.pipeline drop column if exists "montoOtros";

-- Numeración atómica de cotizaciones
create sequence if not exists public.quote_number_seq;
select setval('public.quote_number_seq', 590);

create or replace function public.next_quote_number()
returns bigint language sql security definer
set search_path = public
as $$ select nextval('public.quote_number_seq') $$;

grant execute on function public.next_quote_number() to anon, authenticated;
```

---

## Apéndice C — Advertencias para futuras modificaciones

1. **La categorización vive en un solo lugar.** Cualquier cambio de familia va en `familiaDe()`. No reintroducir la heurística inline.

2. **Toda lógica de agregación debe aplicarse en el alta *y* en el recálculo.** `recalcPipelineUnits()` corre en cada render y revierte silenciosamente lo que solo se haya hecho en `addToPipeline()`.

3. **Columnas nuevas del pipeline requieren SQL manual.** Agregarlas a `PIPE_COLS` (y a `OBJ_COLS` si son jsonb). El mecanismo de degradación evita que la sync se caiga mientras tanto.

4. **`pickPipe()` debe emitir todas las claves.** Omitir las vacías rompe los upserts por lote (`PGRST102`).

5. **Los campos jsonb se limpian enviando `null` explícito**, no omitiéndolos: PostgREST conserva el valor previo si la clave no viaja.

6. **La identidad de una entrada del pipeline es intocable.** `id`, `fecha`, `fechaISO` y los overrides por SKU se preservan al actualizar. Borrar `skuArchivedQty` provoca doble conteo de unidades ya facturadas.

7. **El PDF nunca filtra por `pipeInclude`.** Muestra siempre todas las líneas, incluidas las alternativas descartadas.

8. **Elementos con comportamiento acoplado al JS:**
   - `.dark-btn` recibe `textContent` (solo debe contener el ícono).
   - `#pipe-backup-btn` recibe `textContent` y `onclick` completos.
   - `#pipe-undo-btn` usa `disabled` (debe ser un `<button>` real).
   - `#msl` (slider de margen) es leído por `syncMarginFromInput()` aunque esté oculto.

9. **`file://` rompe funcionalidad.** El auto-agregado de garantías necesita HTTP. Para pruebas locales: `python3 -m http.server`.

10. **Verificar la versión publicada.** `APP_VERSION` se muestra en el pie. Si no coincide con la esperada, el deploy no llegó.
