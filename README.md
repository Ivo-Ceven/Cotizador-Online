# Cotizador Online · Ceven

Aplicación web para armar cotizaciones de productos Apple (Mac, iPhone, iPad, accesorios y servicios), con gestión de pipeline de ventas, historial, garantías extendidas **CevenCare**, exportación a PDF/Excel y target anual de facturación.

Es una app **100% estática** (HTML + CSS + JavaScript vanilla, sin build ni framework). Los datos viven en `localStorage` del navegador y se sincronizan entre usuarios a través de **Supabase** (auth + 2 tablas + 1 Edge Function).

> ⚠️ **Estado actual de la base de datos**: la base Supabase anterior fue **descartada**. La app quedó desconectada de ella a propósito: `src/js/config.js` tiene los valores vacíos y, mientras estén así, la app corre 100% local (sin login funcional y sin sincronización). Cuando se cree la base nueva, seguir [docs/BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md) y completar `src/js/config.js`.

## Estructura del proyecto

```
Cotizador Online/
├── README.md                  ← este archivo
├── docs/
│   ├── ARQUITECTURA.md        ← cómo está organizado el código y por qué
│   └── BASE-DE-DATOS.md       ← esquema requerido para la base Supabase NUEVA
├── src/                       ← la aplicación reestructurada (usar esta)
│   ├── index.html             ← markup del cotizador (SPA de 7 "páginas")
│   ├── cevencare.html         ← cotizador de garantías CevenCare (iframe/popup)
│   ├── css/
│   │   ├── base.css           ← estilos base (modo claro)
│   │   ├── dark.css           ← tokens de color + overrides de modo oscuro
│   │   └── cevencare.css      ← estilos de CevenCare
│   └── js/                    ← 24 módulos (ver docs/ARQUITECTURA.md)
│       ├── config.js          ← ⚠️ ÚNICO lugar con credenciales de Supabase
│       ├── auth.js            ← login, sesión, roles, gestión de usuarios
│       ├── sync.js            ← sincronización localStorage ⇄ Supabase
│       ├── state.js … target.js  ← lógica de la app (orden de carga importa)
│       └── cevencare.js       ← lógica de CevenCare
```

> La carpeta legacy `Cotizador Online/` (los 2 HTML monolíticos originales) fue **eliminada** una vez completada y verificada la migración a `src/`.

## Cómo correr la app

No hay build. Opciones:

1. **Servidor local** (recomendado — el iframe de CevenCare funciona igual que en producción):
   ```
   cd src
   python -m http.server 8000
   # abrir http://localhost:8000
   ```
2. **Doble click** en `src/index.html` (protocolo `file://`) — también funciona; si el iframe de CevenCare no carga, la app cae automáticamente a abrirlo en un popup.

Dependencias externas (CDN, requieren internet): SheetJS (`xlsx`) para Excel, `html2canvas` + `jsPDF` para PDF.

## Configurar la base nueva

1. Crear el proyecto en Supabase y aplicar el esquema de [docs/BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md) (tablas `pipeline` y `app_settings`, Edge Function `admin-users`, usuario `admin@ceven.com`).
2. Completar en `src/js/config.js`:
   ```js
   var SUPABASE_URL      = 'https://TU-PROYECTO.supabase.co';
   var SUPABASE_ANON_KEY = 'TU_PUBLISHABLE_KEY';
   ```
3. Listo — el login y la sincronización se activan solos al recargar.

## Datos y backups

Todo el estado local vive en `localStorage` (claves `c*`: `cquotes`, `cpipeline`, `cpl`, `cnac`, etc. — inventario completo en docs/ARQUITECTURA.md). La app tiene 3 niveles de backup propios:

- **Snapshot automático** en `localStorage`/`sessionStorage` + chequeo de recuperación al arrancar.
- **Backup manual** completo a archivo JSON (botones ⬇️/⬆️ de la pantalla principal).
- **Backup automático a carpeta** (Chrome/Edge): Excel del pipeline + JSON completo cada vez que se entra al pipeline.

## Versión

`APP_VERSION` se define en `src/js/config.js` (actualmente `4.0`) y se muestra en el zócalo inferior.
