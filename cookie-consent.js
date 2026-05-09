(function() {
  const STORAGE_KEY = 'faa_cookie_consent_v1';
  const GA_MEASUREMENT_ID = window.FAA_GA_MEASUREMENT_ID || '';

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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
      '  <p>We use cookies to enhance your browsing experience and analyze our traffic. By clicking &lsquo;Accept All,&rsquo; you consent to our use of cookies. <a href="/cookie-policy.html">Cookie Policy</a></p>',
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
    if (consent && consent.analytics === true) {
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
