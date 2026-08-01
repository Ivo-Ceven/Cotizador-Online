/* ============================================================================
   THEME  ·  el color de la marca
   ----------------------------------------------------------------------------
   Apple y Poly comparten hasta la última hoja de estilos, y sus datos NO se
   mezclan: una cotización cargada en el cotizador equivocado es un error fácil
   y silencioso. El chip de la barra superior ya lo dice con palabras; esto lo
   dice con color, que se ve de reojo y sin leer.

   Los valores viven en `CEVEN_BRAND.theme` (declarativo por marca, igual que
   el resto del contrato) y acá solo se copian a variables CSS del :root:

     --acc       acento: filete de la navbar, vista activa, Guardar, links, foco
     --acc-h     el mismo, un paso más oscuro, para :hover
     --acc-soft  fondo tenue del mismo tono
     --acc-dk    variante para modo oscuro (dark.css hace --acc: var(--acc-dk))

   base.css define los cuatro con el azul por defecto, así que el shell —que no
   tiene marca— y cualquier página que no cargue este módulo siguen andando.

   Va TEMPRANO, antes del markup: si corriera después, la primera pintura
   saldría con el azul del default y el color correcto entraría de golpe.
   ============================================================================ */
(function(){
  var t = (window.CEVEN_BRAND || {}).theme;
  if(!t) return;                       // el shell: se queda con el default

  var r = document.documentElement.style;
  if(t.accent) r.setProperty('--acc', t.accent);
  if(t.hover)  r.setProperty('--acc-h', t.hover);
  if(t.soft)   r.setProperty('--acc-soft', t.soft);
  if(t.dk)     r.setProperty('--acc-dk', t.dk);

  /* El <meta name="theme-color"> NO se toca acá a propósito: lo maneja
     shared/pwa.js, que lo sincroniza con el modo oscuro. Si los dos escribieran
     el mismo meta ganaría el último en correr —pwa.js, que arranca en
     DOMContentLoaded— y el color de marca duraría un parpadeo. */
})();
