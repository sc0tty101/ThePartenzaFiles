(() => {
  let allEntries = [];
  let activeType = 'all';
  let activeTag = null;
  let searchQuery = '';
  let sortOrder = 'newest';
  let currentView = 'list';
  let map = null;
  let markers = [];

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
      (e.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
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
        (e.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (e.location_name || '').toLowerCase().includes(q)
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
    const countEl = document.getElementById('results-count');
    countEl.textContent = list.length === allEntries.length
      ? `${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}`
      : `${list.length} of ${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'}`;

    if (currentView === 'list') renderList(list);
    else renderMap(list);
  }

  function renderList(list) {
    const container = document.getElementById('entries');
    const empty = document.getElementById('empty');

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
          <div class="entry-footer">
            ${e.location_name ? `<span class="entry-location">&#9679; ${escHtml(e.location_name)}</span>` : ''}
            ${(e.tags || []).length ? `
              <div class="entry-tags">
                ${e.tags.map(t => `<button class="entry-tag" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}
              </div>` : ''}
          </div>
        </div>
      </article>
    `).join('');

    container.querySelectorAll('.entry-tag').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const cloudBtn = [...document.querySelectorAll('.tag-pill')].find(b => b.textContent === tag);
        toggleTag(tag, cloudBtn || btn);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function renderMap(list) {
    const withLocation = list.filter(e => e.lat != null && e.lng != null);
    const noLocMsg = document.getElementById('map-no-location');

    if (!map) {
      map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
      }).addTo(map);
    }

    // Clear existing markers
    markers.forEach(m => m.remove());
    markers = [];

    if (withLocation.length === 0) {
      noLocMsg.style.display = 'block';
      return;
    }
    noLocMsg.style.display = 'none';

    const typeColors = { video: '#7ab0ff', article: '#7dcf8f', podcast: '#c98fff', book: '#ffb55a' };

    withLocation.forEach(e => {
      const color = typeColors[e.type] || '#aaa';
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-pin" style="background:${color};box-shadow:0 0 0 3px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const stars = '★'.repeat(e.rating) + '☆'.repeat(5 - e.rating);
      const popup = L.popup({ className: 'map-popup' }).setContent(`
        <div class="popup-inner">
          <span class="popup-type popup-type--${e.type}">${e.type}</span>
          <a href="${escHtml(e.url)}" target="_blank" rel="noopener" class="popup-title">${escHtml(e.title)}</a>
          <div class="popup-stars">${stars}</div>
          <div class="popup-location">${escHtml(e.location_name)}</div>
        </div>
      `);

      const marker = L.marker([e.lat, e.lng], { icon }).addTo(map).bindPopup(popup);
      markers.push(marker);
    });

    // Fit map to markers
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    }
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('view-list').style.display = view === 'list' ? 'block' : 'none';
    document.getElementById('view-map').style.display = view === 'map' ? 'block' : 'none';

    if (view === 'map' && map) {
      setTimeout(() => map.invalidateSize(), 50);
    }
    render();
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

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
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
