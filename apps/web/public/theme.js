/* global document, localStorage, matchMedia */
/*
 * Applies the theme before the first paint (spec 011): the stored choice wins,
 * otherwise the system preference decides. Loaded as a plain script in <head>
 * because the Content-Security-Policy allows no inline script. The app reads
 * the result from `data-theme`; see `src/theme/theme.ts`.
 */
(function applyTheme() {
  var theme = null;
  try {
    theme = localStorage.getItem('kritzel.theme');
  } catch {
    // Storage is blocked: the system preference decides.
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
