/* Cookie consent + tag loader (GDPR/ePrivacy-friendly).
 * - No analytics/ads cookies are set or scripts loaded before consent.
 * - Accept and Reject are equally available; the site works either way.
 * - The choice is stored in localStorage (not a cookie) and can be changed
 *   any time via the footer "manage cookies" link (#cookieSettings).
 * - GA4 is loaded with anonymized IP, only after Accept.
 */
(function () {
  'use strict';
  var CLIENT = window.ADSENSE_CLIENT || '';
  var GA4 = window.GA4_ID || '';
  var banner = document.getElementById('consent');
  var manage = document.getElementById('cookieSettings');
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
    if (!GA4 || window.__ga4Loaded) return;
    window.__ga4Loaded = true;
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

  function getChoice() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function show() { if (banner) banner.hidden = false; }
  function hide() { if (banner) banner.hidden = true; }

  // "Manage cookies" footer link → re-open the banner to change/withdraw consent.
  if (manage) {
    manage.addEventListener('click', function (e) { e.preventDefault(); show(); });
  }

  // Nothing to consent to → no banner, no manage link.
  if (!CLIENT && !GA4) { hide(); if (manage) manage.style.display = 'none'; return; }

  var accept = document.getElementById('consentAccept');
  var reject = document.getElementById('consentReject');
  if (accept) accept.addEventListener('click', function () { setChoice('accept'); hide(); loadAll(); });
  if (reject) reject.addEventListener('click', function () { setChoice('reject'); hide(); });

  var choice = getChoice();
  if (choice === 'accept') { hide(); loadAll(); }
  else if (choice === 'reject') { hide(); }
  else { show(); }
})();
