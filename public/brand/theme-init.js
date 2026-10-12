/* Runs before first paint: applies the saved theme and picks the language from the device on a first visit. */
(function () {
  try {
    var d = document.documentElement;
    var t = localStorage.getItem('lynto_theme');
    if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
    var light = t === 'light' || (t !== 'dark' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', light ? '#f4f7fc' : '#061326');

    // Language: Arabic is the default. Visitors whose device is not set to Arabic and who never chose a language are sent to /en once.
    var p = location.pathname;
    var skip = /^\/(en(\/|$)|admin|api|media)/.test(p);
    var chosen = localStorage.getItem('lynto_lang');
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ar'];
    var first = String(langs[0] || 'ar').toLowerCase();
    var bot = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse/i.test(navigator.userAgent);
    if (!skip && !chosen && !bot && first.indexOf('ar') !== 0) {
      location.replace('/en' + (p === '/' ? '' : p) + location.search + location.hash);
    }
  } catch (e) { /* storage blocked: keep defaults */ }
})();
