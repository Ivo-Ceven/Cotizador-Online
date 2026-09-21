# Cotizadores Ceven

Plataforma de cotizadores multi-marca de Ceven. Hoy tiene cuatro cotizadores completos — **Apple** (Mac, iPhone, iPad, accesorios y servicios, con garantías extendidas **CevenCare**, nacionalización y target anual), **Poly**, **Legamaster** y **Huawei** —, todos con pipeline de ventas, historial y exportación a PDF/Excel. **HP** todavía aparece como “Próximamente” en el panel.

Del mismo panel salen dos páginas que **cruzan** las marcas en vez de ser una de ellas: el **cotizador multimarca** (`src/multi/`), que arma un pedido con SKUs de varias marcas y lo emite como una cotización real de cada una, y el **tablero de tareas** del equipo (`src/tareas/`). Aparte, `src/portal/` es un autoservicio para clientes-canal, con cuentas separadas de las del staff.

Es una app **100% estática** (HTML + CSS + JavaScript vanilla, sin build ni framework). Los datos viven en `localStorage` del navegador y se sincronizan entre usuarios a través de **Supabase** (auth + 2 tablas + 1 Edge Function). El acceso a los datos requiere usuario logueado: las policies RLS de la base rechazan cualquier request sin el JWT de un usuario autenticado.

## Estructura del proyecto

```
Cotizador Online/
├── README.md                  ← este archivo
├── vercel.json                ← deploy estático de src/ en Vercel
├── docs/
│   ├── ARQUITECTURA.md        ← cómo está organizado el código y por qué
│   └── BASE-DE-DATOS.md       ← esquema de la base Supabase
└── src/
    ├── index.html             ← SHELL: login + panel selector de marcas + gestión de usuarios
    ├── shared/
    │   ├── config.js          ← ⚠️ ÚNICO lugar con URL/key de Supabase (compartido por todas las marcas)
    │   └── auth.js            ← login, sesión, roles, gestión de usuarios (compartido)
    ├── vendor/                ← libs auto-hospedadas: xlsx, html2canvas, jsPDF (+autotable)
    ├── apple/                 ← cotizador Apple completo
    │   ├── index.html         ← SPA de 7 "páginas" (exige sesión; sin sesión vuelve al shell)
    │   ├── brand.js           ← ⚠️ el contrato de marca: TODO lo que distingue a este cotizador
    │   ├── cevencare.html     ← cotizador de garantías CevenCare (iframe/popup)
    │   ├── css/               ← cevencare.css (base.css y dark.css son compartidos)
    │   └── js/                ← 22 módulos (ver docs/ARQUITECTURA.md; el orden de carga importa)
    ├── poly/                  ← cotizador Poly (+ REGI: el Deal Registration de HP)
    ├── legamaster/            ← cotizador Legamaster
    ├── huawei/                ← cotizador Huawei
    ├── multi/                 ← cotizador multimarca (emite a cada marca)
    ├── portal/                ← autoservicio para clientes-canal
    ├── tareas/                ← tablero de tareas del equipo
    └── icons/brands/          ← el logo de cada marca (shell + chip de la barra)
```

Para agregar una marca nueva, la receta completa está en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — sección “Multi-marca: cómo enchufar una marca nueva”. En resumen: se copia la marca **cuyo modelo de negocio se parezca más** (Apple si tiene margen y nacionalización; Poly si cotiza por nivel de catálogo) y lo que la distingue se declara en su `brand.js`. Los módulos de `src/shared/` **no** se copian ni se tocan: leen ese contrato.

## Cómo correr la app

No hay build:

```
cd src
python -m http.server 8000
# abrir http://localhost:8000  →  login  →  panel de marcas  →  Apple
```

También funciona por `file://` (doble click en `src/index.html`), aunque el flujo recomendado es servirla por HTTP. No requiere internet para las libs (viven en `src/vendor/`); sí para login y sincronización.

## Contribuir

Después de clonar, activar el hook de pre-commit que bloquea subir archivos de
datos de trabajo (price lists, cotizaciones) por error:

```
git config core.hooksPath .githooks
```

## Deploy (Vercel)

`vercel.json` sirve `src/` como sitio estático con headers de seguridad. Deploy: `npx vercel deploy` (preview) o `npx vercel deploy --prod`, o vía integración GitHub → Vercel.

## Base de datos y seguridad

- Proyecto Supabase: `iqewnebpdyctexavtpmt`. Esquema y policies en [docs/BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md).
- Tablas `pipeline` y `app_settings` con columna `brand`: los datos de cada marca están separados; los usuarios son compartidos.
- RLS: solo usuarios autenticados leen/escriben (la publishable key sola recibe 401). La sync manda el `access_token` del usuario en cada request.
- Gestión de usuarios: Edge Function `admin-users` (solo `admin@ceven.com`, validado server-side).

## Datos y backups

Todo el estado local vive en `localStorage` (claves `c*`: `cquotes`, `cpipeline`, `cpl`, `cnac`, etc. — inventario completo en docs/ARQUITECTURA.md). La app tiene 3 niveles de backup propios:

- **Snapshot automático** en `localStorage`/`sessionStorage` + chequeo de recuperación al arrancar.
- **Backup manual** completo a archivo JSON (botones ⬇️/⬆️ de la pantalla principal).
- **Backup automático a carpeta** (Chrome/Edge): Excel del pipeline + JSON completo cada vez que se entra al pipeline.

## Versión

`APP_VERSION` se define en `src/shared/config.js` y se muestra en el zócalo inferior. **Hay que subirla en cada deploy**: le da el nombre al caché del service worker, así que sin tocarla la versión nueva no le llega a quien ya tiene la app abierta.
