(function() {
  const STORAGE_KEY = 'faa_cookie_consent_v1';
  // GA4 Measurement ID for the Foundation AI Advisory property. Can still be
  // overridden per-page by setting window.FAA_GA_MEASUREMENT_ID before this
  // script loads (e.g., for a staging property), but defaults to production.
  const GA_MEASUREMENT_ID = window.FAA_GA_MEASUREMENT_ID || 'G-PRY2NSQLC5';

  function readConsent() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function writeConsent(consent) {
    const payload = {
      necessary: true,
      analytics: Boolean(consent.analytics),
      updatedAt: new Date().toISOString()
    };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* Consent still applies for this page when storage is blocked. */ }
    return payload;
  }

  function loadAnalytics(consent) {
    if (!consent || consent.analytics !== true || !GA_MEASUREMENT_ID) return;
    if (window.faaAnalyticsLoaded) return;
    window.faaAnalyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    document.head.appendChild(script);

    attachEventTracking();
  }

  // Lightweight click/submit tracking. Only attaches once gtag is loaded.
  // Captures: mailto clicks (email_click), outbound HTTP links
  // (outbound_link_click), primary CTA buttons (cta_click), subscribe form
  // submissions (subscribe_submit).
  function attachEventTracking() {
    if (window.faaEventsAttached) return;
    window.faaEventsAttached = true;

    const sendEvent = (name, params) => {
      try { window.gtag('event', name, params || {}); } catch (e) { /* swallow */ }
    };

    const isExternal = (url) => {
      try {
        const u = new URL(url, window.location.href);
        return u.host && u.host !== window.location.host && /^https?:$/.test(u.protocol);
      } catch { return false; }
    };

    document.addEventListener('click', (event) => {
      const a = event.target.closest('a');
      if (!a) {
        // Track .btn-primary clicks even when they aren't <a> tags (rare).
        const btn = event.target.closest('.btn-primary');
        if (btn) {
          sendEvent('cta_click', {
            link_text: (btn.textContent || '').trim().slice(0, 100),
            page_path: window.location.pathname,
            page_title: document.title,
            cta_location: btn.closest('section') ? (btn.closest('section').id || 'unknown') : 'unknown',
          });
        }
        return;
      }

      const href = a.getAttribute('href') || '';
      const choice = a.dataset.assessmentChoice || (href.startsWith('/assessment/') ? 'self' : '');
      if (choice) sendEvent(choice === 'self' ? 'assessment_start' : 'assessment_inquiry_click', {page_path: window.location.pathname, cta_location: a.closest('header') ? 'header' : (a.closest('section')?.id || 'footer')});
      const linkText = (a.textContent || '').trim().slice(0, 100);

      // Mailto -> email_click
      if (href.indexOf('mailto:') === 0) {
        sendEvent('email_click', {
          link_url: href.split(/[?#]/)[0],
          link_text: linkText,
          page_path: window.location.pathname,
          page_title: document.title,
        });
      }
      // External http(s) link -> outbound_link_click
      else if (isExternal(href)) {
        sendEvent('outbound_link_click', {
          link_url: href.split(/[?#]/)[0],
          link_text: linkText,
          page_path: window.location.pathname,
          page_title: document.title,
        });
      }

      // Primary CTA (Business Systems Assessment buttons, etc.) -> cta_click.
      // Sent in addition to email_click when the CTA is a mailto button —
      // gives a clean primary-conversion-intent count distinct from raw
      // mailto clicks elsewhere on the page.
      if (a.classList && (a.classList.contains('btn-primary') || a.classList.contains('hf-button'))) {
        sendEvent('cta_click', {
          link_text: linkText,
          link_url: href.split(/[?#]/)[0],
          page_path: window.location.pathname,
          page_title: document.title,
          cta_location: a.closest('section') ? (a.closest('section').id || 'unknown') : 'unknown',
        });
      }
    }, true);

    // Subscribe form submissions -> subscribe_submit
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (form && form.hasAttribute && form.hasAttribute('data-subscribe-form')) {
        sendEvent('subscribe_submit', {
          page_path: window.location.pathname,
          page_title: document.title,
        });
      }
    }, true);
  }

  function removeBanner(root) {
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  function buildBanner() {
    const root = document.createElement('section');
    root.className = 'cookie-consent';
    root.setAttribute('aria-label', 'Cookie consent');
    root.innerHTML = [
      '<div class="cookie-consent__copy">',
      '  <h2>We value your privacy &amp; do not sell your information.</h2>',
      '  <p>We use cookies to enhance your browsing experience and analyze our traffic. By clicking &lsquo;Accept All,&rsquo; you consent to our use of cookies. <a href="/cookie-policy/">Cookie Policy</a></p>',
      '</div>',
      '<div class="cookie-consent__actions">',
      '  <button type="button" class="cookie-consent__button cookie-consent__button--secondary" data-cookie-customize aria-label="Customize cookie preferences">Customize</button>',
      '  <button type="button" class="cookie-consent__button cookie-consent__button--primary" data-cookie-accept aria-label="Accept all cookies">Accept All</button>',
      '</div>'
    ].join('');
    return root;
  }

  function buildModal(initialConsent) {
    const modal = document.createElement('div');
    modal.className = 'cookie-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'cookie-modal-title');
    modal.innerHTML = [
      '<div class="cookie-modal__panel">',
      '  <div class="cookie-modal__header">',
      '    <div>',
      '      <p class="cookie-modal__eyebrow">Cookie Preferences</p>',
      '      <h2 id="cookie-modal-title">Control how FAA uses cookies.</h2>',
      '    </div>',
      '    <button type="button" class="cookie-modal__close" data-cookie-close aria-label="Close cookie preferences">&times;</button>',
      '  </div>',
      '  <p class="cookie-modal__intro">Necessary cookies keep the site working. Analytics cookies help us understand traffic patterns without selling your information.</p>',
      '  <div class="cookie-preference">',
      '    <div>',
      '      <h3>Necessary cookies</h3>',
      '      <p>Required for core site behavior and consent storage.</p>',
      '    </div>',
      '    <span class="cookie-preference__status">Always on</span>',
      '  </div>',
      '  <label class="cookie-preference cookie-preference--toggle">',
      '    <div>',
      '      <h3>Analytics cookies</h3>',
      '      <p>Allow FAA to analyze traffic and improve the browsing experience.</p>',
      '    </div>',
      '    <input type="checkbox" data-cookie-analytics />',
      '    <span class="cookie-toggle" aria-hidden="true"></span>',
      '  </label>',
      '  <div class="cookie-modal__actions">',
      '    <button type="button" class="cookie-consent__button cookie-consent__button--secondary" data-cookie-save>Save Preferences</button>',
      '    <button type="button" class="cookie-consent__button cookie-consent__button--primary" data-cookie-modal-accept>Accept All</button>',
      '  </div>',
      '</div>'
    ].join('');

    const analytics = modal.querySelector('[data-cookie-analytics]');
    analytics.checked = Boolean(initialConsent && initialConsent.analytics);
    return modal;
  }

  function openPreferences(banner) {
    const modal = buildModal(readConsent());
    const close = () => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      banner.querySelector('[data-cookie-customize]').focus();
    };
    const save = (analytics) => {
      const consent = writeConsent({ analytics });
      loadAnalytics(consent);
      removeBanner(banner);
      if (modal.parentNode) modal.parentNode.removeChild(modal);
    };

    modal.querySelector('[data-cookie-close]').addEventListener('click', close);
    modal.querySelector('[data-cookie-save]').addEventListener('click', () => {
      save(modal.querySelector('[data-cookie-analytics]').checked);
    });
    modal.querySelector('[data-cookie-modal-accept]').addEventListener('click', () => save(true));
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
    document.addEventListener('keydown', function onKeydown(event) {
      if (!modal.parentNode) {
        document.removeEventListener('keydown', onKeydown);
        return;
      }
      if (event.key === 'Escape') {
        document.removeEventListener('keydown', onKeydown);
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(modal.querySelectorAll('button, input, a[href]')).filter(el => !el.disabled);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    document.body.appendChild(modal);
    modal.querySelector('[data-cookie-save]').focus();
  }

  function init() {
    const consent = readConsent();
    if (consent) {
      loadAnalytics(consent);
      return;
    }

    const banner = buildBanner();
    banner.querySelector('[data-cookie-accept]').addEventListener('click', () => {
      const accepted = writeConsent({ analytics: true });
      loadAnalytics(accepted);
      removeBanner(banner);
    });
    banner.querySelector('[data-cookie-customize]').addEventListener('click', () => openPreferences(banner));
    document.body.appendChild(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

