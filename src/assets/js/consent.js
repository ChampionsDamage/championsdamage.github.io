/* Lightweight consent + AdSense loader.
 * No cookies are set and no ad script is loaded unless:
 *   (a) an AdSense client id is configured (window.ADSENSE_CLIENT), and
 *   (b) the visitor explicitly accepts.
 * The choice is stored in localStorage (not a cookie).
 */
(function () {
  'use strict';
  var CLIENT = window.ADSENSE_CLIENT || '';
  var GA4 = window.GA4_ID || '';
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
  function loadGA4() {
    if (!GA4) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA4, { anonymize_ip: true });
  }
  function loadAll() { loadAds(); loadGA4(); }

  // Cookieless analytics (Cloudflare) loads via a <head> tag without consent.
  // Only AdSense / GA4 require a consent gate. Nothing to consent to → no banner.
  if (!CLIENT && !GA4) { if (banner) banner.remove(); return; }

  var choice = null;
  try { choice = localStorage.getItem(KEY); } catch (e) {}

  if (choice === 'accept') { loadAll(); return; }
  if (choice === 'reject') { if (banner) banner.remove(); return; }

  if (!banner) return;
  banner.hidden = false;
  var set = function (v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    banner.remove();
    if (v === 'accept') loadAll();
  };
  var a = document.getElementById('consentAccept');
  var r = document.getElementById('consentReject');
  if (a) a.addEventListener('click', function () { set('accept'); });
  if (r) r.addEventListener('click', function () { set('reject'); });
})();
