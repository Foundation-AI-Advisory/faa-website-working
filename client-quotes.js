(() => {
    const root = document.getElementById('faa-client-quotes');
    if (!root) return;
    root.querySelectorAll('.fq-toggle').forEach(button => {
      button.addEventListener('click', () => {
        const card = button.closest('.fq-story');
        const content = root.querySelector('#' + button.getAttribute('aria-controls'));
        const expanding = button.getAttribute('aria-expanded') !== 'true';
        content.querySelector('.fq-excerpt').hidden = expanding;
        content.querySelector('.fq-full').hidden = !expanding;
        button.setAttribute('aria-expanded', String(expanding));
        button.setAttribute('aria-label', expanding ? 'Show less of ' + button.dataset.person + '’s quote' : 'Read ' + button.dataset.person + '’s full quote');
        button.querySelector('.fq-toggle-label').textContent = expanding ? 'Show less' : 'Read ' + button.dataset.person + '’s full quote';
        button.querySelector('.fq-toggle-icon').textContent = expanding ? '−' : '+';
        card.classList.toggle('fq-expanded', expanding);
      });
    });
  })();
