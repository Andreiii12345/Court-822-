/* Mobile navigation only: existing tab handlers remain authoritative. */
(() => {
  const toggle = document.getElementById('ownerMobileToggle');
  const sidebar = document.querySelector('.owner-sidebar');
  if (!toggle || !sidebar) return;
  const close = () => {
    sidebar.classList.remove('mobile-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☰ Menu';
  };
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('mobile-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '✕ Close menu' : '☰ Menu';
  });
  sidebar.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', () => {
      close();
      if (matchMedia('(max-width: 900px)').matches) {
        document.querySelector('.owner-mobile-bar')?.scrollIntoView({behavior:'smooth',block:'start'});
      }
    });
  });
  matchMedia('(min-width: 901px)').addEventListener('change', close);
})();
