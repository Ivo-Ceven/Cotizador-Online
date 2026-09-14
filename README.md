# Cotizadores Ceven

Plataforma de cotizadores multi-marca de Ceven. Hoy incluye el cotizador **Apple** (Mac, iPhone, iPad, accesorios y servicios) con pipeline de ventas, historial, garantías extendidas **CevenCare**, exportación a PDF/Excel y target anual; los cotizadores **Poly** y **HP** están planificados y aparecen como "Próximamente" en el panel.

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
    └── apple/                 ← cotizador Apple completo
        ├── index.html         ← SPA de 7 "páginas" (exige sesión; sin sesión vuelve al shell)
        ├── cevencare.html     ← cotizador de garantías CevenCare (iframe/popup)
        ├── css/               ← base.css, dark.css, cevencare.css
        └── js/                ← 22 módulos (ver docs/ARQUITECTURA.md; el orden de carga importa)
```

Para agregar una marca nueva (cuando esté su catálogo): copiar `src/apple/` como plantilla, cambiar `BRAND` en su `sync.js`, prefijar sus claves de localStorage (`poly_*`) y activar la tarjeta en el shell. Receta completa en docs/ARQUITECTURA.md.

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

`APP_VERSION` se define en `src/shared/config.js` (actualmente `4.0`) y se muestra en el zócalo inferior.
