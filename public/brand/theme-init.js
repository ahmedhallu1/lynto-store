/* Runs before first paint: applies the saved theme without changing the requested language URL. */
(function () {
  try {
    var d = document.documentElement;
    var t = localStorage.getItem('lynto_theme');
    if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
    var light = t === 'light' || (t !== 'dark' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', light ? '#f4f7fc' : '#061326');

    // Language is chosen explicitly through stable / and /en URLs.
    // Do not redirect a shared product URL based on device language or bot detection.
  } catch (e) { /* storage blocked: keep defaults */ }
})();
