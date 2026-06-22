/* Lightweight consent + AdSense loader.
 * No cookies are set and no ad script is loaded unless:
 *   (a) an AdSense client id is configured (window.ADSENSE_CLIENT), and
 *   (b) the visitor explicitly accepts.
 * The choice is stored in localStorage (not a cookie).
 */
(function () {
  'use strict';
  var CLIENT = window.ADSENSE_CLIENT || '';
  var banner = document.getElementById('consent');
  var KEY = 'cd_consent';

  function loadAds() {
    if (!CLIENT) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(CLIENT);
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  // Nothing to consent to if ads aren't configured → stay cookie-free, no banner.
  if (!CLIENT) { if (banner) banner.remove(); return; }

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}

  if (choice === 'accept') { loadAds(); return; }
  if (choice === 'reject') { if (banner) banner.remove(); return; }

  if (!banner) return;
  banner.hidden = false;
  var set = function (v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    banner.remove();
    if (v === 'accept') loadAds();
  };
  var a = document.getElementById('consentAccept');
  var r = document.getElementById('consentReject');
  if (a) a.addEventListener('click', function () { set('accept'); });
  if (r) r.addEventListener('click', function () { set('reject'); });
})();
