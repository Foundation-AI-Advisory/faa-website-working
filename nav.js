(function() {
  const triggers = document.querySelectorAll('.utilnav-link[data-mega]');
  const menus = document.querySelectorAll('.mega-menu');
  const header = document.getElementById('site-header');
  if (!header) return;

  const ctaWrap = header.querySelector('.container-faa > .flex.items-center.shrink-0');
  if (ctaWrap && !header.querySelector('[data-mobile-menu-toggle]')) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mobile-menu-toggle';
    toggle.setAttribute('aria-label', 'Open site navigation');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'mobile-menu');
    toggle.setAttribute('data-mobile-menu-toggle', '');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    ctaWrap.appendChild(toggle);

    const panel = document.createElement('nav');
    panel.id = 'mobile-menu';
    panel.className = 'mobile-menu-panel';
    panel.setAttribute('aria-label', 'Mobile');
    panel.hidden = true;
    panel.innerHTML = [
      '<a href="foundation.html">Data Curation &amp; Governance</a>',
      '<a href="operations.html">Workflow Optimization</a>',
      '<a href="agentic-ai.html">AI Design &amp; Implementation</a>',
      '<a href="industries.html">Where We Work</a>',
      '<a href="insights.html">Insights</a>',
      '<a href="about.html">About</a>',
      '<a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="mobile-menu-cta">Business Systems Assessment</a>'
    ].join('');
    header.appendChild(panel);

    let isMobileMenuOpen = false;
    let mobileCloseTimer = null;
    const hoverCapableCompact = window.matchMedia('(hover: hover) and (pointer: fine) and (max-width: 1279px)');

    function clearMobileCloseTimer() {
      if (!mobileCloseTimer) return;
      clearTimeout(mobileCloseTimer);
      mobileCloseTimer = null;
    }

    function setMobileOpen(open) {
      clearMobileCloseTimer();
      isMobileMenuOpen = Boolean(open);
      panel.hidden = !isMobileMenuOpen;
      panel.setAttribute('data-open', isMobileMenuOpen ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', isMobileMenuOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', isMobileMenuOpen ? 'Close site navigation' : 'Open site navigation');
    }

    function isInsideMobileMenu(target) {
      return target && (toggle.contains(target) || panel.contains(target));
    }

    function scheduleMobileClose(e) {
      if (!hoverCapableCompact.matches) return;
      const nextTarget = e.relatedTarget;
      if (isInsideMobileMenu(nextTarget)) return;
      clearMobileCloseTimer();
      mobileCloseTimer = setTimeout(() => setMobileOpen(false), 130);
    }

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMobileOpen(!isMobileMenuOpen);
    });
    toggle.addEventListener('pointerenter', () => {
      if (hoverCapableCompact.matches) setMobileOpen(true);
    });
    toggle.addEventListener('pointerleave', scheduleMobileClose);
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.addEventListener('pointerenter', clearMobileCloseTimer);
    panel.addEventListener('pointerleave', scheduleMobileClose);
    panel.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMobileOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setMobileOpen(false);
    });
    document.addEventListener('click', (e) => {
      if (!isInsideMobileMenu(e.target)) setMobileOpen(false);
    });
    if (hoverCapableCompact.addEventListener) {
      hoverCapableCompact.addEventListener('change', () => setMobileOpen(false));
    } else if (hoverCapableCompact.addListener) {
      hoverCapableCompact.addListener(() => setMobileOpen(false));
    }
  }

  document.querySelectorAll('form[data-subscribe-form]').forEach(form => {
    const input = form.querySelector('input[type="email"]');
    if (!input) return;
    let status = form.querySelector('[data-subscribe-status]');
    if (!status) {
      status = document.createElement('p');
      status.setAttribute('data-subscribe-status', '');
      status.setAttribute('aria-live', 'polite');
      status.className = 'subscribe-status';
      form.insertAdjacentElement('afterend', status);
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.checkValidity()) {
        input.reportValidity();
        return;
      }
      const email = input.value.trim();
      const subject = encodeURIComponent('Subscribe to FAA Insights');
      const body = encodeURIComponent('Please add ' + email + ' to the FAA insights list.');
      status.textContent = 'Thanks. Your email client will open so we can add you to the list.';
      window.location.href = 'mailto:blueprint@foundationaiadvisory.com?subject=' + subject + '&body=' + body;
    });
  });

  if (!triggers.length || !menus.length) return;

  let openId = null;
  let closeTimer = null;

  function openMenu(id) {
    clearTimeout(closeTimer);
    if (openId === id) return;
    closeMenu(true);
    openId = id;
    const menu = document.getElementById('mega-' + id);
    const trigger = document.querySelector('.utilnav-link[data-mega="' + id + '"]');
    if (menu) menu.setAttribute('data-open', 'true');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }
  function closeMenu(immediate) {
    const doClose = () => {
      menus.forEach(m => m.removeAttribute('data-open'));
      triggers.forEach(t => t.setAttribute('aria-expanded', 'false'));
      openId = null;
    };
    if (immediate) { doClose(); return; }
    clearTimeout(closeTimer);
    closeTimer = setTimeout(doClose, 140);
  }

  triggers.forEach(trigger => {
    const id = trigger.getAttribute('data-mega');
    trigger.addEventListener('mouseenter', () => openMenu(id));
    trigger.addEventListener('focus', () => openMenu(id));
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      if (openId === id) closeMenu(true); else openMenu(id);
    });
  });
  menus.forEach(menu => {
    menu.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    menu.addEventListener('mouseleave', () => closeMenu(false));
  });
  triggers.forEach(t => t.addEventListener('mouseleave', () => closeMenu(false)));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu(true);
  });
  document.addEventListener('click', (e) => {
    if (!header.contains(e.target)) closeMenu(true);
  });
  document.querySelectorAll('.mega-link').forEach(link => {
    link.addEventListener('click', () => closeMenu(true));
  });
})();
