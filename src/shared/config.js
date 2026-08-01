/* ============================================================
   CONFIGURACIÓN GLOBAL · Cotizadores Ceven (compartida por el
   shell y los cotizadores de todas las marcas)
   ------------------------------------------------------------
   SUPABASE_ANON_KEY es la publishable key: identifica el proyecto
   pero NO da acceso a los datos — las policies RLS exigen el JWT
   de un usuario logueado en cada request (ver apple/js/sync.js).

   Si ambos valores quedan vacíos la app corre 100% local
   (localStorage), sin ningún request; el login avisa que falta
   configurar la base. Esquema documentado en docs/BASE-DE-DATOS.md.
   ============================================================ */
var SUPABASE_URL      = 'https://iqewnebpdyctexavtpmt.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_Za9l64nzVBsaKHrSCgeu0w_x7Vhe7Aa';
var CEVEN_AUTH_FN_URL = SUPABASE_URL + '/functions/v1/admin-users';

/* Los usuarios deben ser emails del dominio @ceven.com (excluyente). */
var CEVEN_DOMAIN = 'ceven.com';
/* Solo este usuario puede crear usuarios y blanquear contraseñas. */
var CEVEN_ADMIN = 'admin@ceven.com';
var CEVEN_SESSION_KEY = 'ceven_auth_session';

/* Versión mostrada en el zócalo inferior de la app. Subirla reinstala el
   service worker (ver sw.js) — necesario cada vez que cambia la lista de
   archivos a precachear (ASSETS/DOCS), o el shell cacheado queda pegado. */
var APP_VERSION = '4.7';
