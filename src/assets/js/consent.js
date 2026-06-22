/* Cookie consent (GDPR/ePrivacy) with Google Consent Mode v2.
 * GA4 is loaded in <head> with consent defaulting to DENIED (no cookies, cookieless
 * modeled pings only). This script flips consent to GRANTED when the visitor accepts,
 * and keeps it DENIED on reject. AdSense (if configured) is only injected on accept.
 * The choice is stored in localStorage and can be changed via the footer link.
 */
(function () {
  'use strict';
  var CLIENT = window.ADSENSE_CLIENT || '';
  var GA4 = window.GA4_ID || '';
  var banner = document.getElementById('consent');
  var manage = document.getElementById('cookieSettings');
  var KEY = 'cd_consent';

  function grantConsent() {
    if (window.gtag) {
      window.gtag('consent', 'update', {
        ad_storage: 'granted', ad_user_data: 'granted',
        ad_personalization: 'granted', analytics_storage: 'granted'
      });
    }
  }
  function loadAds() {
    if (!CLIENT) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(CLIENT);
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }
  function accept() { grantConsent(); loadAds(); }

  function getChoice() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function show() { if (banner) banner.hidden = false; }
  function hide() { if (banner) banner.hidden = true; }

  // "Manage cookies" footer link → re-open the banner to change/withdraw consent.
  if (manage) manage.addEventListener('click', function (e) { e.preventDefault(); show(); });

  // Nothing configured → no banner.
  if (!CLIENT && !GA4) { hide(); if (manage) manage.style.display = 'none'; return; }

  var aBtn = document.getElementById('consentAccept');
  var rBtn = document.getElementById('consentReject');
  if (aBtn) aBtn.addEventListener('click', function () { setChoice('accept'); hide(); accept(); });
  if (rBtn) rBtn.addEventListener('click', function () { setChoice('reject'); hide(); });

  var choice = getChoice();
  if (choice === 'accept') { hide(); accept(); }      // returning visitor who accepted
  else if (choice === 'reject') { hide(); }           // stays denied (cookieless)
  else { show(); }                                    // first visit → ask
})();
