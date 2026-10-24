(function() {
  const triggers = document.querySelectorAll('.utilnav-link[data-mega]');
  const menus = document.querySelectorAll('.mega-menu');
  const header = document.getElementById('site-header');
  if (!header) return;
  const editorial = document.body.classList.contains('homepage-redesign');

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
    // Native disclosures keep the menu compact and keyboard-accessible.
    // The methodology starts open to preserve the three-step sequence.
    panel.innerHTML = [
      '<p class="mobile-menu-eyebrow">Explore Foundation</p>',
      '<a href="/" class="mobile-menu-direct">Home<span aria-hidden="true">&rarr;</span></a>',
      '<details class="mobile-menu-group" open>',
      '  <summary>Methodology</summary>',
      '  <div class="mobile-menu-links">',
      '  <a href="/methodology/" class="mobile-menu-overview">View methodology overview<span aria-hidden="true">&rarr;</span></a>',
      '  <a href="/foundation/"><span class="mobile-menu-step" aria-hidden="true">01</span><span>Data Curation &amp; Governance</span></a>',
      '  <a href="/operations/"><span class="mobile-menu-step" aria-hidden="true">02</span><span>Workflow Optimization</span></a>',
      '  <a href="/agentic-ai/"><span class="mobile-menu-step" aria-hidden="true">03</span><span>AI Design &amp; Implementation</span></a>',
      '  </div>',
      '</details>',
      '<details class="mobile-menu-group mobile-menu-group--training">',
      '  <summary>AI Training</summary>',
      '  <div class="mobile-menu-links">',
      '  <a href="/ai-training-workforce-development/" class="mobile-menu-overview">View AI Training overview</a>',
      '  <a href="/ai-training-workforce-development/#ai-bootcamp">AI Training Bootcamp</a>',
      '  <a href="/ai-training-workforce-development/#workforce-development">AI Workforce Development</a>',
      '  </div>',
      '</details>',
      '<a href="/industries/" class="mobile-menu-direct">Where We Work<span aria-hidden="true">&rarr;</span></a>',
      '<details class="mobile-menu-group mobile-menu-group--perspectives">',
      '  <summary>AI Perspectives</summary>',
      '  <div class="mobile-menu-links">',
      '  <a href="/insights/" class="mobile-menu-overview">All AI Perspectives</a>',
      '  <a href="/ai-frontiers/">AI Frontiers</a>',
      '  <a href="/insights/#foundations-series">Foundations Series</a>',
      '  <a href="/insights/#subscribe">Subscribe</a>',
      '  </div>',
      '</details>',
      '<a href="/about/" class="mobile-menu-direct">About<span aria-hidden="true">&rarr;</span></a>',
      '<a href="/client-workspace/" class="mobile-menu-workspace">',
      '  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.2" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 1 1 5 0v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      '  <span>Client Workspace</span>',
      '</a>',
      '<a href="mailto:blueprint@foundationaiadvisory.com?subject=Business%20Systems%20Assessment%20Inquiry" class="mobile-menu-cta">Business Systems Assessment</a>',
      '<p class="mobile-menu-footer">Business First. AI Applied.</p>'
    ].join('');
    if (editorial) {
      panel.querySelectorAll('.mobile-menu-step').forEach((step, i) => step.textContent = String(i + 1));
      panel.querySelector('a[href="/industries/"]').firstChild.textContent = 'Industries';
      panel.querySelector('.mobile-menu-group--perspectives summary').textContent = 'Perspectives';
    }
    header.appendChild(panel);

    let isMobileMenuOpen = false;
    let mobileCloseTimer = null;
    const hoverCapableCompact = window.matchMedia('(hover: hover) and (pointer: fine) and (max-width: 1279px)');

    function clearMobileCloseTimer() {
      if (!mobileCloseTimer) return;
      clearTimeout(mobileCloseTimer);
      mobileCloseTimer = null;
    }

    function positionMobilePanel() {
      panel.style.setProperty('--navigation-top', Math.max(0, header.getBoundingClientRect().bottom) + 'px');
    }
    window.addEventListener('resize', () => { if (isMobileMenuOpen) positionMobilePanel(); });
    window.addEventListener('scroll', () => { if (isMobileMenuOpen) positionMobilePanel(); }, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', positionMobilePanel);
    function setMobileOpen(open) {
      clearMobileCloseTimer();
      isMobileMenuOpen = Boolean(open);
      if (isMobileMenuOpen) document.dispatchEvent(new CustomEvent('faa:navigation-open', { detail: 'mobile' }));
      if (isMobileMenuOpen) positionMobilePanel();
      panel.hidden = !isMobileMenuOpen;
      panel.setAttribute('data-open', isMobileMenuOpen ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', isMobileMenuOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', isMobileMenuOpen ? 'Close site navigation' : 'Open site navigation');
    }
    document.addEventListener('faa:navigation-open', (e) => {
      if (e.detail !== 'mobile') setMobileOpen(false);
    });

    function isInsideMobileMenu(target) {
      return target && (toggle.contains(target) || panel.contains(target));
    }

    function scheduleMobileClose(e) {
      if (!hoverCapableCompact.matches || document.body.classList.contains('homepage-redesign')) return;
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
      if (hoverCapableCompact.matches && !document.body.classList.contains('homepage-redesign')) setMobileOpen(true);
    });
    toggle.addEventListener('pointerleave', scheduleMobileClose);
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.addEventListener('pointerenter', clearMobileCloseTimer);
    panel.addEventListener('pointerleave', scheduleMobileClose);
    // Delegate so assessment links added by the enhancement below close
    // the same state as the original links, including on a second visit.
    panel.addEventListener('click', (e) => {
      if (e.target.closest('a')) setMobileOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        const returnFocus = panel.contains(document.activeElement);
        setMobileOpen(false);
        if (returnFocus) toggle.focus();
      }
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
    document.dispatchEvent(new CustomEvent('faa:navigation-open', { detail: 'mega' }));
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
    if (!editorial) {
      trigger.addEventListener('mouseenter', () => openMenu(id));
      trigger.addEventListener('focus', () => openMenu(id));
    }
    trigger.addEventListener('keydown', (e) => {
      if (editorial && e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu(id);
        document.getElementById('mega-' + id).querySelector('a').focus();
      }
    });
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
    menu.addEventListener('mouseleave', () => { if (!editorial) closeMenu(false); });
  });
  triggers.forEach(t => t.addEventListener('mouseleave', () => { if (!editorial) closeMenu(false); }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId) {
      const trigger = document.querySelector('.utilnav-link[data-mega="' + openId + '"]');
      const returnFocus = editorial && document.getElementById('mega-' + openId).contains(document.activeElement);
      closeMenu(true);
      if (returnFocus) trigger.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!header.contains(e.target)) closeMenu(true);
  });
  if (editorial) {
    header.addEventListener('focusout', () => setTimeout(() => {
      if (!header.contains(document.activeElement)) closeMenu(true);
    }, 0));
    window.addEventListener('resize', () => { if (window.innerWidth < 1280) closeMenu(true); });
  }
  document.querySelectorAll('.mega-link, .editorial-nav-panel a').forEach(link => {
    link.addEventListener('click', () => closeMenu(true));
  });
  document.addEventListener('faa:navigation-open', (e) => {
    if (e.detail !== 'mega') closeMenu(true);
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
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', menuId);
    trigger.innerHTML = triggerLabel + caretSvg;

    var menu = document.createElement('nav');
    menu.className = 'assessment-dd__menu';
    menu.id = menuId;
    menu.hidden = true;
    menu.setAttribute('aria-label', 'Choose your assessment');
    menu.innerHTML = '<p class="assessment-dd__eyebrow">Assessments</p><h2 class="assessment-dd__heading">Where would you like to start?</h2>';

    var checklist = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="8" y="6" width="19" height="23" rx="2"/><path d="M13 6V3h9v3M12 14l2 2 4-4M12 22l2 2 4-4M21 14h2M21 22h2"/></svg>';
    var conversation = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M18 22a10 10 0 1 0-11-2l-2 7 7-3a10 10 0 0 0 6-2Z"/><path d="M20 13a9 9 0 0 1 7 14l2 4-6-2a9 9 0 0 1-10-5"/></svg>';
    var arrow = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    var chevron = '<svg class="assessment-dd__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

    var selfLink = document.createElement('a');
    selfLink.href = SELF_ASSESSMENT_HREF;
    selfLink.className = 'assessment-dd__item assessment-dd__item--self';
    selfLink.innerHTML = '<span class="assessment-dd__icon">' + checklist + '</span><span class="assessment-dd__copy"><span class="assessment-dd__title">Foundation’s AI Self-Assessment</span><span class="assessment-dd__description">Explore your AI readiness.</span><span class="assessment-dd__action">Start self-assessment ' + arrow + '</span></span>' + chevron;

    var inquiryLink = document.createElement('a');
    inquiryLink.href = INQUIRY_HREF;
    inquiryLink.className = 'assessment-dd__item assessment-dd__item--inquiry';
    inquiryLink.innerHTML = '<span class="assessment-dd__icon">' + conversation + '</span><span class="assessment-dd__copy"><span class="assessment-dd__title">Business Systems Assessment</span><span class="assessment-dd__description">Discuss your business with FAA.</span><span class="assessment-dd__action">Start an inquiry ' + arrow + '</span></span>' + chevron;

    menu.appendChild(selfLink);
    menu.appendChild(inquiryLink);
    wrap.appendChild(trigger);
    var backdrop = document.createElement('div');
    backdrop.className = 'assessment-dd__backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    wrap.appendChild(backdrop);
    wrap.appendChild(menu);

    wireDropdown(wrap, trigger, menu, backdrop);
    return wrap;
  }

  function wireDropdown(wrap, trigger, menu, backdrop) {
    var open = false;
    var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
    // The editorial homepage uses one assessment control at every width.
    // Keep click/tap deterministic; hover must not open immediately before click.
    var allowHover = !document.body.classList.contains('homepage-redesign');
    var closeTimer = null;
    var header = document.getElementById('site-header');

    function positionPanel() {
      if (!open || !header) return;
      menu.style.setProperty('--assessment-top', Math.max(0, header.getBoundingClientRect().bottom) + 'px');
      backdrop.style.setProperty('--assessment-top', Math.max(0, header.getBoundingClientRect().bottom) + 'px');
    }

    function setOpen(next) {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      open = Boolean(next);
      if (open) document.dispatchEvent(new CustomEvent('faa:navigation-open', { detail: menu.id }));
      menu.hidden = !open;
      backdrop.hidden = !open;
      wrap.setAttribute('data-open', open ? 'true' : 'false');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
      positionPanel();
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
      if (allowHover && hoverCapable.matches) setOpen(true);
    });
    wrap.addEventListener('mouseleave', function() {
      if (allowHover && hoverCapable.matches) scheduleClose();
    });
    menu.addEventListener('click', function(e) { e.stopPropagation(); });
    backdrop.addEventListener('click', function() { setOpen(false); });
    document.addEventListener('faa:navigation-open', function(e) {
      if (e.detail !== menu.id) setOpen(false);
    });
    trigger.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        menu.querySelector('a').focus();
      }
    });
    wrap.addEventListener('focusout', function() {
      setTimeout(function() {
        if (open && !wrap.contains(document.activeElement)) setOpen(false);
      }, 0);
    });
    window.addEventListener('scroll', positionPanel, { passive: true });
    window.addEventListener('resize', function() { setOpen(false); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', positionPanel);
    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && open) {
        var returnFocus = menu.contains(document.activeElement);
        setOpen(false);
        if (returnFocus) trigger.focus();
      }
    });
    // Close on selection so the menu does not linger after navigating.
    menu.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function() { setOpen(false); });
    });
  }

  function enhanceHeader() {
    var header = document.getElementById('site-header');
    if (!header) return;

    // Pre-rendered links stay crawlable; enhance their controls in place.
    header.querySelectorAll('[data-prebuilt-assessment]').forEach(function(wrap) {
      wireDropdown(wrap, wrap.querySelector('button'), wrap.querySelector('nav'), wrap.querySelector('.assessment-dd__backdrop'));
    });

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

    // 3. Preserve both assessment destinations as stacked links.
    var mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) {
      var menuCta = mobileMenu.querySelector('a.mobile-menu-cta');
      if (menuCta && !menuCta.parentNode.hasAttribute('data-assessment-mobile')) {
        var group = document.createElement('div');
        group.setAttribute('data-assessment-mobile', '');

        var selfA = document.createElement('a');
        selfA.href = SELF_ASSESSMENT_HREF;
        selfA.className = 'mobile-menu-cta';
        selfA.textContent = 'Foundation’s - AI Self-Assessment';

        var inqA = document.createElement('a');
        inqA.href = INQUIRY_HREF;
        inqA.className = 'mobile-menu-cta mobile-menu-cta--secondary';
        inqA.textContent = 'Business Systems Assessment Inquiry';

        group.appendChild(selfA);
        group.appendChild(inqA);
        menuCta.parentNode.replaceChild(group, menuCta);

        // The mobile panel's delegated link handler owns close state.
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceHeader);
  } else {
    enhanceHeader();
  }
})();




