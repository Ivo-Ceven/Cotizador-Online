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

/* Datos del emisor que encabezan el comprobante imprimible
   (shared/comprobante.js). Cambiarlos acá los cambia en las dos marcas.

   No van en la base ni en el modal de Ajustes porque no cambian nunca; si algún
   día hay que editarlos sin tocar código, el lugar es `app_settings`, junto al
   logo.

   Los campos vacíos NO se imprimen: el documento omite el renglón entero en vez
   de mostrar un rótulo sin dato. Completar `contacto` cuando se defina cuál va
   (teléfono, mail de ventas, o los dos). */
var CEVEN_EMISOR = {
  razonSocial: 'Ceven S.A',
  domicilio:   'Manuel Garcia 352',
  contacto:    '',
  cuit:        '30-69669295-1'
};

/* Los usuarios deben ser emails del dominio @ceven.com (excluyente). */
var CEVEN_DOMAIN = 'ceven.com';
/* Solo este usuario puede crear usuarios y blanquear contraseñas. */
var CEVEN_ADMIN = 'admin@ceven.com';
var CEVEN_SESSION_KEY = 'ceven_auth_session';

/* Versión mostrada en el zócalo inferior de la app. Subirla reinstala el
   service worker (ver sw.js) — necesario cada vez que cambia la lista de
   archivos a precachear (ASSETS/DOCS), o el shell cacheado queda pegado. */
var APP_VERSION = '5.2';
