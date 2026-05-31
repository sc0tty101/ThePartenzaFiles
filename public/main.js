(() => {
  let allEntries = [];
  let activeType = 'all';
  let activeTag = null;
  let searchQuery = '';
  let sortOrder = 'newest';

  async function init() {
    const [configRes, entriesRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/entries')
    ]);
    const config = await configRes.json();
    const entries = await entriesRes.json();

    document.getElementById('site-title').textContent = config.siteTitle;
    document.getElementById('site-tagline').textContent = config.siteTagline;
    document.title = config.siteTitle;
    allEntries = entries;

    buildTagCloud();
    render();
    attachControls();
  }

  function buildTagCloud() {
    const tagCounts = {};
    allEntries.forEach(e => {
      (e.tags || []).forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const cloud = document.getElementById('tag-cloud');
    cloud.innerHTML = '';
    sorted.forEach(([tag]) => {
      const btn = document.createElement('button');
      btn.className = 'tag-pill';
      btn.textContent = tag;
      btn.addEventListener('click', () => toggleTag(tag, btn));
      cloud.appendChild(btn);
    });
  }

  function toggleTag(tag, btn) {
    if (activeTag === tag) {
      activeTag = null;
      btn.classList.remove('active');
    } else {
      activeTag = tag;
      document.querySelectorAll('.tag-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    render();
  }

  function starsHtml(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += i <= rating ? '<span>&#9733;</span>' : '<span class="empty-star">&#9733;</span>';
    }
    return html;
  }

  function filteredEntries() {
    let list = [...allEntries];

    if (activeType !== 'all') list = list.filter(e => e.type === activeType);
    if (activeTag) list = list.filter(e => (e.tags || []).includes(activeTag));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.review || '').toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortOrder === 'rating-high') return b.rating - a.rating;
      if (sortOrder === 'rating-low') return a.rating - b.rating;
      return 0;
    });

    return list;
  }

  function render() {
    const list = filteredEntries();
    const container = document.getElementById('entries');
    const empty = document.getElementById('empty');
    const countEl = document.getElementById('results-count');

    countEl.textContent = list.length === allEntries.length
      ? `${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}`
      : `${list.length} of ${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}`;

    if (list.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    container.innerHTML = list.map(e => `
      <article class="entry-card">
        <div class="entry-type-col">
          <span class="type-badge type-badge--${e.type}">${e.type}</span>
        </div>
        <div class="entry-body">
          <div class="entry-header">
            <h2 class="entry-title"><a href="${escHtml(e.url)}" target="_blank" rel="noopener">${escHtml(e.title)}</a></h2>
            <div class="entry-stars">${starsHtml(e.rating)}</div>
          </div>
          ${e.review ? `<p class="entry-review">${escHtml(e.review)}</p>` : ''}
          ${(e.tags || []).length ? `
            <div class="entry-tags">
              ${e.tags.map(t => `<button class="entry-tag" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}
            </div>` : ''}
        </div>
      </article>
    `).join('');

    container.querySelectorAll('.entry-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const cloudBtn = [...document.querySelectorAll('.tag-pill')]
          .find(b => b.textContent === tag);
        toggleTag(tag, cloudBtn || btn);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function attachControls() {
    document.getElementById('search').addEventListener('input', e => {
      searchQuery = e.target.value.trim();
      render();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeType = btn.dataset.type;
        render();
      });
    });

    document.getElementById('sort').addEventListener('change', e => {
      sortOrder = e.target.value;
      render();
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  init();
})();
