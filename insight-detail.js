(function () {
  const allowedSlugs = new Set([
    'why-applied-ai-fails-without-clean-data',
    'mid-market-data-inventory-you-dont-have',
    'master-data-quality-silent-killer-ai-projects',
    'designing-for-human-in-the-loop-before-you-design-for-ai',
    'data-governance-non-enterprise-teams',
    'where-agents-earn-their-keep',
    'mid-market-case-for-platform-agnostic',
    'automating-a-broken-process-scales-the-problem',
    'how-work-actually-gets-done-vs-how-its-documented'
  ]);

  const imageAlt = {
    'why-applied-ai-fails-without-clean-data': 'Professional reviewing fragmented reports and data sources in a dark office environment',
    'mid-market-data-inventory-you-dont-have': 'Business records and system documents arranged for operational data inventory review',
    'master-data-quality-silent-killer-ai-projects': 'Overhead view of system maps, reports, and notes used to assess master data quality',
    'data-governance-non-enterprise-teams': 'Infographic explaining lightweight data governance for non-enterprise teams',
    'where-agents-earn-their-keep': 'Abstract visualization of unstructured data flowing through filtering gates into an ordered grid output.',
    'mid-market-case-for-platform-agnostic': 'Abstract visualization of complex data flowing through layered architecture panels into a structured tiered stack.',
    'automating-a-broken-process-scales-the-problem': 'Abstract visualization of data flows curving across structured operating platforms, representing workflow optimization',
    'how-work-actually-gets-done-vs-how-its-documented': 'Two professionals mapping decision workflows and process logic across structured diagrams and documents'
  };

  const params = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/\/insights\/([^/]+)\/?$/);
  const slug = params.get('slug') || (pathMatch ? pathMatch[1].replace(/\.html$/, '') : '');
  const body = document.querySelector('[data-insight-body]');

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseFrontMatter(markdown) {
    const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { meta: {}, content: markdown };
    const meta = {};
    match[1].split('\n').forEach((line) => {
      const item = line.match(/^([^:]+):\s*"(.*)"\s*$/) || line.match(/^([^:]+):\s*(.*)\s*$/);
      if (item) meta[item[1].trim()] = item[2].trim();
    });
    return { meta, content: match[2].trim() };
  }

  function renderInline(value) {
    return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function setMeta(name, content) {
    if (!content) return;
    let tag = document.querySelector('meta[name="' + name + '"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  }

  function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const html = [];
    let list = [];
    let orderedList = [];

    function flushList() {
      if (!list.length) return;
      html.push('<ul>' + list.map((item) => '<li>' + renderInline(item) + '</li>').join('') + '</ul>');
      list = [];
    }

    function flushOrderedList() {
      if (!orderedList.length) return;
      html.push('<ol>' + orderedList.map((item) => '<li>' + renderInline(item) + '</li>').join('') + '</ol>');
      orderedList = [];
    }

    lines.forEach((line) => {
      if (line.startsWith('- ')) {
        flushOrderedList();
        list.push(line.slice(2));
        return;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        flushList();
        orderedList.push(orderedMatch[1]);
        return;
      }

      flushList();
      flushOrderedList();

      if (!line.trim()) return;
      if (line.startsWith('### ')) {
        html.push('<h3>' + renderInline(line.slice(4)) + '</h3>');
        return;
      }
      if (line.startsWith('## ')) {
        html.push('<h2>' + renderInline(line.slice(3)) + '</h2>');
        return;
      }
      html.push('<p>' + renderInline(line) + '</p>');
    });

    flushList();
    flushOrderedList();
    return html.join('\n');
  }

  // Path prefix is '../' when this loader runs inside /insights/<slug>.html,
  // and '' when it runs at the root (insight.html?slug=...). Frontmatter and
  // fetch paths are stored relative to project root and normalized via this.
  const inSubfolder = /\/insights\/[^/]+\.html?$/.test(window.location.pathname);
  const pathPrefix = inSubfolder ? '../' : '';
  function resolveAsset(p) {
    if (!p) return p;
    if (/^https?:\/\//i.test(p) || p.startsWith('mailto:') || p.startsWith('data:')) return p;
    const cleaned = String(p).replace(/^(\.\.\/|\.\/|\/)+/, '');
    return pathPrefix + cleaned;
  }

  async function loadInsight() {
    if (!allowedSlugs.has(slug)) {
      if (body) body.innerHTML = '<p>Insight not found.</p>';
      return;
    }

    const response = await fetch(pathPrefix + 'content/insights/' + slug + '.md');
    if (!response.ok) {
      if (body) body.innerHTML = '<p>Insight not found.</p>';
      return;
    }

    const markdown = await response.text();
    const parsed = parseFrontMatter(markdown);
    document.title = parsed.meta.title + ' | Foundation AI Advisory';
    setMeta('description', parsed.meta.metaDescription || parsed.meta.excerpt || '');
    setMeta('author', parsed.meta.author || '');

    document.querySelector('[data-insight-title]').textContent = parsed.meta.title || '';
    document.querySelector('[data-insight-excerpt]').textContent = parsed.meta.deck || parsed.meta.excerpt || '';
    document.querySelector('[data-insight-category]').textContent = parsed.meta.eyebrow || parsed.meta.category || '';
    document.querySelector('[data-insight-format]').textContent = parsed.meta.format || '';
    const pillar = document.querySelector('[data-insight-pillar]');
    if (pillar && parsed.meta.pillar) {
      pillar.textContent = parsed.meta.pillar;
      pillar.hidden = false;
    } else if (pillar) {
      pillar.hidden = true;
    }

    const image = document.querySelector('[data-insight-image]');
    const imageWrap = image ? image.closest('.insight-detail-image') : null;
    if (parsed.meta.image) {
      image.src = resolveAsset(parsed.meta.image);
      image.alt = imageAlt[slug] || parsed.meta.title || '';
      if (imageWrap) imageWrap.hidden = false;
    } else if (imageWrap) {
      imageWrap.hidden = true;
    }

    const audioType = parsed.meta.audio && parsed.meta.audio.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
    const audio = parsed.meta.audio
      ? '<div class="insight-audio"><audio controls><source src="' + escapeHtml(resolveAsset(parsed.meta.audio)) + '" type="' + audioType + '"></audio></div>'
      : '';
    const contentImage = parsed.meta.contentImage
      ? '<figure class="insight-content-image"><img src="' + escapeHtml(resolveAsset(parsed.meta.contentImage)) + '" alt="' + escapeHtml(parsed.meta.contentImageAlt || '') + '"><figcaption>' + escapeHtml(parsed.meta.contentImageCaption || '') + '</figcaption></figure>'
      : '';
    const cta = parsed.meta.ctaLabel
      ? '<div class="insight-article-cta"><a href="' + escapeHtml(parsed.meta.ctaHref || 'contact.html#contact-options') + '" class="btn btn-primary">' + escapeHtml(parsed.meta.ctaLabel) + '</a></div>'
      : '';
    body.innerHTML = audio + contentImage + renderMarkdown(parsed.content) + cta;
  }

  loadInsight().catch(() => {
    if (body) body.innerHTML = '<p>Insight not found.</p>';
  });
})();
