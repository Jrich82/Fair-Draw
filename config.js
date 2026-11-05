/*
 * App config — the ONE place to change the product's display name or version.
 *   NAME     shown in the page title, header logo, footer, winner card, share sheet
 *            and (via `npm run sync`) the PWA manifest.
 *   VERSION  bump on any release; the service-worker cache key derives from it.
 * Loaded by index.html, sw.js (importScripts) and the Node scripts.
 */
(function (root) {
  var APP = {
    NAME: 'Fair-Draw',
    SHORT_NAME: 'Fair-Draw',
    TAGLINE: 'provably fair winner picker',
    VERSION: '1.2.1',
    SITE: 'https://jrich82.github.io/Fair-Draw/'
  };
  if (typeof module === 'object' && module.exports) module.exports = APP;
  else root.APP_CONFIG = APP;
})(typeof self !== 'undefined' ? self : this);
