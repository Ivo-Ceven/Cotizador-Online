/* ============================================================
   CONFIGURACIÓN GLOBAL · Cotizador Ceven
   ------------------------------------------------------------
   ⚠️  BASE DE DATOS NUEVA PENDIENTE DE CONFIGURAR
   La base Supabase anterior fue descartada y quedó desconectada.
   Cuando esté creada la nueva, completar estos dos valores:

     SUPABASE_URL      → ej: 'https://xxxxxxxxxxxx.supabase.co'
     SUPABASE_ANON_KEY → la publishable/anon key del proyecto

   Mientras estén vacíos:
     - La capa de sincronización (js/sync.js) queda desactivada y
       la app trabaja 100% local (localStorage), sin ningún request.
     - El login (js/auth.js) avisa que falta configurar la base.

   El esquema que necesita la base nueva (tablas pipeline y
   app_settings + Edge Function admin-users) está documentado en
   docs/BASE-DE-DATOS.md.
   ============================================================ */
var SUPABASE_URL      = '';
var SUPABASE_ANON_KEY = '';
var CEVEN_AUTH_FN_URL = SUPABASE_URL + '/functions/v1/admin-users';

/* Los usuarios deben ser emails del dominio @ceven.com (excluyente). */
var CEVEN_DOMAIN = 'ceven.com';
/* Solo este usuario puede crear usuarios y blanquear contraseñas. */
var CEVEN_ADMIN = 'admin@ceven.com';
var CEVEN_SESSION_KEY = 'ceven_auth_session';

/* Versión mostrada en el zócalo inferior de la app. */
var APP_VERSION = '4.0';
