(function() {
  const triggers = document.querySelectorAll('.utilnav-link[data-mega]');
  const menus = document.querySelectorAll('.mega-menu');
  const header = document.getElementById('site-header');
  if (!header) return;

  // Target the RIGHT-side container specifically (a <div>), not the
  // logo's <a> wrapper which shares the same class. Without the tag
  // restriction, querySelector returns the first match — the logo
  // anchor — and the hamburger ends up wrongly nested inside the
  // logo link. The tag-prefixed selector locks onto the right-side
  // div that holds the Client Workspace link, the mobile CTA, and
  // the desktop Business Systems Assessment button.
  const ctaWrap = header.querySelector('.container-faa > div.flex.items-center.shrink-0');
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
    // Mobile menu is intentionally flat (no nested collapse) so every
    // destination is one tap away on small screens. Methodology and
    // AI Training are each labeled with an eyebrow heading so visitors
    // understand the sub-items belong together — but they remain
    // direct links to each individual page.
    panel.innerHTML = [
      '<a href="/">Home</a>',
      '<div class="mobile-menu-section">',
      '  <span class="mobile-menu-label">Methodology</span>',
      '  <a href="/methodology/">View Methodology Overview</a>',
      '  <a href="/foundation/">Data Curation &amp; Governance</a>',
      '  <a href="/operations/">Workflow Optimization</a>',
      '  <a href="/agentic-ai/">AI Design &amp; Implementation</a>',
      '</div>',
      '<div class="mobile-menu-section">',
      '  <span class="mobile-menu-label">AI Training</span>',
      '  <a href="/ai-training-workforce-development/">View AI Training Overview</a>',
      '  <a href="/ai-training-workforce-development/#ai-bootcamp">AI Training Bootcamp</a>',
      '  <a href="/ai-training-workforce-development/#workforce-development">AI Workforce Development</a>',
      '</div>',
      '<a href="/industries/">Where We Work</a>',
      '<div class="mobile-menu-section">',
      '  <span class="mobile-menu-label">AI Perspectives</span>',
      '  <a href="/insights/">All AI Perspectives</a>',
      '  <a href="/ai-frontiers/">AI Frontiers</a>',
      '  <a href="/insights/#foundations-series">Foundations Series</a>',
      '  <a href="/insights/#subscribe">Subscribe</a>',
      '</div>',
      '<a href="/about/">About</a>',
      '<a href="/client-workspace/" class="mobile-menu-workspace">',
      '  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 1 1 5 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      '  <span>Client Workspace</span>',
      '</a>',
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
      const subject = encodeURIComponent('Subscribe to FAA AI Advisory');
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
      // If the trigger is an anchor with a real href, let the
      // click navigate to the topic landing page. Hover/focus is
      // already handling dropdown open/close, so we don't need
      // the legacy click-toggle behavior on links.
      const href = trigger.tagName === 'A' ? trigger.getAttribute('href') : null;
      if (href && href !== '#') return; // allow default navigation
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


/* =============================================================
   Business Systems Assessment dropdown
   Progressive enhancement: upgrades the existing header CTA
   links into a two-option dropdown. The original <a> links in
   the HTML remain as the no-JS fallback. Applied consistently
   to the desktop button, the compact mobile CTA, and the
   mobile slide-out menu link on every page.
   ============================================================= */
(function() {
  var SELF_ASSESSMENT_HREF = "/assessment/?utm_source=site_nav";
  var INQUIRY_HREF = "mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry";
  var caretSvg = '<svg class="assessment-dd__caret" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>';

  var idSeq = 0;

  // Build a dropdown element that replaces a single CTA anchor.
  // triggerLabel is the visible button text; triggerClass carries
  // the visual styling of the element being replaced so the
  // dropdown looks identical to the original button/CTA.
  function buildDropdown(triggerLabel, triggerClass, wrapClass) {
    idSeq += 1;
    var menuId = 'assessment-menu-' + idSeq;

    var wrap = document.createElement('div');
    wrap.className = 'assessment-dd' + (wrapClass ? ' ' + wrapClass : '');
    wrap.setAttribute('data-assessment-dd', '');

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = triggerClass + ' assessment-dd__trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', menuId);
    trigger.innerHTML = triggerLabel + caretSvg;

    var menu = document.createElement('div');
    menu.className = 'assessment-dd__menu';
    menu.id = menuId;
    menu.setAttribute('role', 'menu');

    var selfLink = document.createElement('a');
    selfLink.href = SELF_ASSESSMENT_HREF;
    selfLink.className = 'assessment-dd__item';
    selfLink.setAttribute('role', 'menuitem');
    selfLink.textContent = 'Foundations Self-Assessment';

    var inquiryLink = document.createElement('a');
    inquiryLink.href = INQUIRY_HREF;
    inquiryLink.className = 'assessment-dd__item';
    inquiryLink.setAttribute('role', 'menuitem');
    inquiryLink.textContent = 'Business Systems Assessment Inquiry';

    menu.appendChild(selfLink);
    menu.appendChild(inquiryLink);
    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    wireDropdown(wrap, trigger, menu);
    return wrap;
  }

  function wireDropdown(wrap, trigger, menu) {
    var open = false;
    var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
    var closeTimer = null;

    function setOpen(next) {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      open = Boolean(next);
      wrap.setAttribute('data-open', open ? 'true' : 'false');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function scheduleClose() {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(function() { setOpen(false); }, 140);
    }

    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(!open);
    });
    wrap.addEventListener('mouseenter', function() {
      if (hoverCapable.matches) setOpen(true);
    });
    wrap.addEventListener('mouseleave', function() {
      if (hoverCapable.matches) scheduleClose();
    });
    menu.addEventListener('click', function(e) { e.stopPropagation(); });
    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') setOpen(false);
    });
    // Close on selection so the menu does not linger after navigating.
    menu.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() { setOpen(false); });
    });
  }

  function enhanceHeader() {
    var header = document.getElementById('site-header');
    if (!header) return;

    // 1. Desktop primary button -> dropdown.
    var desktopBtn = header.querySelector('a.btn.btn-primary');
    if (desktopBtn && !desktopBtn.closest('[data-assessment-dd]')) {
      var dd = buildDropdown('Business Systems Assessment', 'btn btn-primary', 'hidden sm:inline-flex assessment-dd--desktop');
      desktopBtn.parentNode.replaceChild(dd, desktopBtn);
    }

    // 2. Compact mobile CTA -> dropdown. Some pages are missing this
    //    link entirely; inject it so all three variants exist on every
    //    page (normalization).
    var ctaWrap = header.querySelector('.container-faa > div.flex.items-center.shrink-0');
    var compact = header.querySelector('a.mobile-header-cta');
    if (compact && !compact.closest('[data-assessment-dd]')) {
      var ddC = buildDropdown('Assessment', 'mobile-header-cta', 'assessment-dd--compact');
      compact.parentNode.replaceChild(ddC, compact);
    } else if (!compact && ctaWrap && !ctaWrap.querySelector('.assessment-dd--compact')) {
      var ddC2 = buildDropdown('Assessment', 'mobile-header-cta', 'assessment-dd--compact');
      // Insert before the desktop dropdown (which sits last) to match
      // the source order used on the other pages.
      var desktopDd = ctaWrap.querySelector('.assessment-dd--desktop');
      if (desktopDd) ctaWrap.insertBefore(ddC2, desktopDd);
      else ctaWrap.appendChild(ddC2);
    }

    // 3. Mobile slide-out menu link -> two stacked links. The slide-out
    //    menu is a flat list, so a nested dropdown there is awkward; two
    //    labeled links is the consistent, tap-friendly equivalent.
    var mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      var menuCta = mobileMenu.querySelector('a.mobile-menu-cta');
      if (menuCta && !menuCta.parentNode.hasAttribute('data-assessment-mobile')) {
        var group = document.createElement('div');
        group.setAttribute('data-assessment-mobile', '');

        var selfA = document.createElement('a');
        selfA.href = SELF_ASSESSMENT_HREF;
        selfA.className = 'mobile-menu-cta';
        selfA.textContent = 'Foundations Self-Assessment';

        var inqA = document.createElement('a');
        inqA.href = INQUIRY_HREF;
        inqA.className = 'mobile-menu-cta mobile-menu-cta--secondary';
        inqA.textContent = 'Business Systems Assessment Inquiry';

        group.appendChild(selfA);
        group.appendChild(inqA);
        menuCta.parentNode.replaceChild(group, menuCta);

        // Keep the existing "close menu on link tap" behavior.
        group.querySelectorAll('a').forEach(function(a) {
          a.addEventListener('click', function() {
            var panel = document.getElementById('mobile-menu');
            var toggle = document.querySelector('[data-mobile-menu-toggle]');
            if (panel) { panel.hidden = true; panel.setAttribute('data-open', 'false'); }
            if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open site navigation'); }
          });
        });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceHeader);
  } else {
    enhanceHeader();
  }
})();
