/* Keep existing section links usable when their content is in a disclosure. */
(() => {
  if (!document.body.classList.contains('bsa-simple')) return;
  const reveal = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!id) return;
    const target = document.getElementById(id);
    if (!target || !document.getElementById('main-content').contains(target)) return;
    for (let node = target; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS') node.open = true;
    }
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
  };
  window.addEventListener('hashchange', reveal);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && link.hash === location.hash) reveal();
  });
  reveal();
})();
