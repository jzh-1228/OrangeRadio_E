try {
  if (localStorage.getItem('orangesea-startup-fast-skip-v1') === '1') {
    document.documentElement.classList.add('startup-fast-skip-preload');
  }
  document.documentElement.classList.add(localStorage.getItem('orangesea-diy-player-mode-v1') === '1' ? 'diy-mode-preload' : 'simple-mode-preload');
  var filmRadioPreload = localStorage.getItem('orangesea-film-radio-v1') === '1';
  if (filmRadioPreload) {
    document.documentElement.classList.add('film-radio-preload');
  }
} catch (e) {
  document.documentElement.classList.add('simple-mode-preload');
}
