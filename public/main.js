(() => {
  let allIncidents = [];
  let allEntries = [];
  let incidentsById = {};
  let activeType = 'all';
  let activeTag = null;
  let searchQuery = '';
  let sortOrder = 'newest';
  let currentView = 'list';
  let groupBy = 'incident';
  let map = null;
  let markers = [];
  let entryTypes = [];

  async function init() {
    const slug = new URLSearchParams(window.location.search).get('incident');

    const [configRes, incidentsRes, entriesRes, typesRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/incidents'),
      fetch('/api/entries'),
      fetch('/api/entry-types')
    ]);
    const config = await configRes.json();
    allIncidents = await incidentsRes.json();
    allEntries = await entriesRes.json();
    entryTypes = await typesRes.json();
    incidentsById = {};
    allIncidents.forEach(i => { incidentsById[i.id] = i; });

    document.getElementById('site-title').textContent = config.siteTitle;
    document.getElementById('site-tagline').textContent = config.siteTagline;
    document.title = config.siteTitle;

    if (slug) {
      showDetailView(slug);
    } else {
      showBrowseView();
    }
  }

  function showBrowseView() {
    document.getElementById('browse-view').style.display = 'block';
    document.getElementById('detail-view').style.display = 'none';
    buildFilters();
    buildTagCloud();
    render();
    attachControls();
  }

  function buildFilters() {
    const wrap = document.getElementById('filters');
    wrap.innerHTML = '';
    ['all', ...entryTypes].forEach(type => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (type === activeType ? ' active' : '');
      btn.dataset.type = type;
      btn.textContent = type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1);
      wrap.appendChild(btn);
    });
  }

  async function showDetailView(slug) {
    document.getElementById('browse-view').style.display = 'none';
    document.getElementById('detail-view').style.display = 'block';

    const res = await fetch(`/api/incidents/by-slug/${encodeURIComponent(slug)}`);
    if (!res.ok) {
      document.getElementById('detail-content').innerHTML =
        '<div class="empty-state"><p>Incident not found.</p>' +
        '<p><a href="/" class="back-arrow">&larr; Back to all incidents</a></p></div>';
      return;
    }
    const incident = await res.json();
    renderDetailView(incident);
  }

  function renderDetailView(incident) {
    const content = document.getElementById('detail-content');

    content.innerHTML = `
      ${incident.image_url ? `
        <div class="incident-banner" style="background-image:url('${escHtml(incident.image_url)}')">
          <div class="incident-banner-overlay">
            <h2 class="incident-banner-title">${escHtml(incident.title)}${incident.is_fictional ? ' <span class="fictional-badge fictional-badge--light">Fictional</span>' : ''}</h2>
            <div class="incident-banner-meta">
              ${incident.date ? `<span>${escHtml(incident.date)}</span>` : ''}
              ${incident.date && incident.location_name ? '<span class="meta-sep">&middot;</span>' : ''}
              ${incident.location_name ? `<span>${escHtml(incident.location_name)}</span>` : ''}
            </div>
          </div>
        </div>` : ''}
      <div class="incident-detail-header${incident.image_url ? ' incident-detail-header--has-banner' : ''}">
        ${!incident.image_url ? `<h2 class="incident-detail-title">${escHtml(incident.title)}${incident.is_fictional ? ' <span class="fictional-badge">Fictional</span>' : ''}</h2>` : ''}
        ${!incident.image_url ? `
        <div class="incident-detail-meta">
          ${incident.date ? `<span>${escHtml(incident.date)}</span>` : ''}
          ${incident.date && incident.location_name ? '<span class="meta-sep">&middot;</span>' : ''}
          ${incident.location_name ? `<span>${escHtml(incident.location_name)}</span>` : ''}
        </div>` : ''}
        ${incident.description ? `<p class="incident-detail-desc">${escHtml(incident.description)}</p>` : ''}
        ${(incident.tags || []).length ? `
          <div class="incident-detail-tags">
            ${incident.tags.map(t => `<a class="entry-tag" href="/?tag=${encodeURIComponent(t)}">${escHtml(t)}</a>`).join('')}
          </div>` : ''}
      </div>

      <div class="detail-entries-section">
        <h3 class="detail-entries-heading">${(incident.entries || []).length} entr${(incident.entries || []).length === 1 ? 'y' : 'ies'}</h3>
        ${!incident.entries || incident.entries.length === 0
          ? '<p class="empty-state" style="padding:2rem 0">No entries linked to this incident yet.</p>'
          : `<div class="entries-grid">${incident.entries.map(e => entryCardHtml(e, false)).join('')}</div>`
        }
      </div>
    `;
  }

  function buildTagCloud() {
    const tagCounts = {};
    allIncidents.forEach(i => {
      (i.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });
    allEntries.filter(e => !e.incident_id).forEach(e => {
      (e.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });
    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const cloud = document.getElementById('tag-cloud');
    cloud.innerHTML = '';

    const preselect = new URLSearchParams(window.location.search).get('tag');

    sorted.forEach(([tag]) => {
      const btn = document.createElement('button');
      btn.className = 'tag-pill';
      btn.textContent = tag;
      if (tag === preselect) {
        activeTag = tag;
        btn.classList.add('active');
      }
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

  function filteredIncidents() {
    let list = [...allIncidents];

    if (activeType !== 'all') {
      list = list.filter(i => (i.entry_types || []).includes(activeType));
    }
    if (activeTag) {
      list = list.filter(i => (i.tags || []).includes(activeTag));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (i.location_name || '').toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortOrder === 'most-entries') return (b.entry_count || 0) - (a.entry_count || 0);
      return 0;
    });
    return list;
  }

  function standaloneEntries() {
    let list = allEntries.filter(e => !e.incident_id);
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
    return list;
  }

  function allFilteredEntries() {
    let list = [...allEntries];
    if (activeType !== 'all') list = list.filter(e => e.type === activeType);
    if (activeTag) list = list.filter(e => (e.tags || []).includes(activeTag));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => {
        const incident = e.incident_id ? incidentsById[e.incident_id] : null;
        return e.title.toLowerCase().includes(q) ||
          (e.review || '').toLowerCase().includes(q) ||
          (e.tags || []).some(t => t.toLowerCase().includes(q)) ||
          (incident ? incident.title.toLowerCase().includes(q) : false);
      });
    }
    list.sort((a, b) => {
      if (sortOrder === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return list;
  }

  function render() {
    const countEl = document.getElementById('results-count');

    if (currentView === 'map') {
      const incidents = filteredIncidents();
      const total = allIncidents.length;
      countEl.textContent = incidents.length === total
        ? `${total} incident${total === 1 ? '' : 's'}`
        : `${incidents.length} of ${total} incident${total === 1 ? '' : 's'}`;
      renderMap(incidents);
      return;
    }

    document.getElementById('incident-grouped').style.display = groupBy === 'type' ? 'none' : 'block';
    document.getElementById('type-grouped').style.display = groupBy === 'type' ? 'block' : 'none';

    if (groupBy === 'type') {
      const entries = allFilteredEntries();
      const total = allEntries.length;
      countEl.textContent = entries.length === total
        ? `${total} entr${total === 1 ? 'y' : 'ies'}`
        : `${entries.length} of ${total} entr${total === 1 ? 'y' : 'ies'}`;
      renderByType(entries);
    } else {
      const incidents = filteredIncidents();
      const standalone = standaloneEntries();
      const total = allIncidents.length;
      countEl.textContent = incidents.length === total
        ? `${total} incident${total === 1 ? '' : 's'}`
        : `${incidents.length} of ${total} incident${total === 1 ? '' : 's'}`;
      renderList(incidents, standalone);
    }
  }

  function attachTagButtons(root) {
    const tagButtons = [
      ...root.querySelectorAll('.incident-card-tag'),
      ...root.querySelectorAll('.entry-tag')
    ];
    tagButtons.forEach(btn => {
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        const tag = btn.dataset.tag;
        const cloudBtn = [...document.querySelectorAll('.tag-pill')].find(b => b.textContent === tag);
        toggleTag(tag, cloudBtn || btn);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function renderList(incidents, standalone) {
    const root = document.getElementById('incident-grouped');
    const grid = document.getElementById('incidents-grid');
    const emptyEl = document.getElementById('empty');
    const standaloneSection = document.getElementById('standalone-section');

    if (incidents.length === 0 && standalone.length === 0) {
      grid.innerHTML = '';
      standaloneSection.style.display = 'none';
      document.getElementById('empty-message').textContent = 'No incidents found.';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    grid.innerHTML = incidents.map(i => incidentCardHtml(i)).join('');

    if (standalone.length > 0) {
      standaloneSection.style.display = 'block';
      document.getElementById('standalone-entries').innerHTML =
        standalone.map(e => entryCardHtml(e, true)).join('');
    } else {
      standaloneSection.style.display = 'none';
    }

    attachTagButtons(root);
  }

  function renderByType(entries) {
    const container = document.getElementById('type-grouped');
    const emptyEl = document.getElementById('empty');

    if (entries.length === 0) {
      container.innerHTML = '';
      document.getElementById('empty-message').textContent = 'No entries found.';
      emptyEl.style.display = 'block';
      return;
    }
    emptyEl.style.display = 'none';

    const groups = {};
    entries.forEach(e => {
      (groups[e.type] = groups[e.type] || []).push(e);
    });

    const order = entryTypes.filter(t => groups[t]);
    Object.keys(groups).forEach(t => { if (!order.includes(t)) order.push(t); });

    container.innerHTML = order.map(type => `
      <div class="type-group">
        <div class="standalone-separator">${escHtml(type.charAt(0).toUpperCase() + type.slice(1))} <span class="type-group-count">(${groups[type].length})</span></div>
        <div class="entries-grid">${groups[type].map(e => entryCardHtml(e, true, true)).join('')}</div>
      </div>
    `).join('');

    attachTagButtons(container);
  }

  function incidentCardHtml(incident) {
    const entryCount = incident.entry_count || 0;
    const types = incident.entry_types || [];

    const typeBadges = types.map(t =>
      `<span class="type-badge type-badge--${t}">${t}</span>`
    ).join('');

    const tagPills = (incident.tags || []).map(t =>
      `<button class="incident-card-tag" data-tag="${escHtml(t)}">${escHtml(t)}</button>`
    ).join('');

    return `
      <article class="incident-card${incident.image_url ? ' incident-card--has-image' : ''}${incident.is_fictional ? ' incident-card--fictional' : ''}">
        ${incident.image_url ? `
          <a href="?incident=${escHtml(incident.slug)}" class="incident-card-thumb" style="background-image:url('${escHtml(incident.image_url)}')" aria-hidden="true"></a>
        ` : ''}
        <div class="incident-card-body">
          <div class="incident-card-header">
            <h2 class="incident-card-title">
              <a href="?incident=${escHtml(incident.slug)}">${escHtml(incident.title)}</a>
              ${incident.is_fictional ? '<span class="fictional-badge">Fictional</span>' : ''}
            </h2>
            <div class="incident-entry-count">
              ${typeBadges}
              <span class="entry-count-num">${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}</span>
            </div>
          </div>
          <div class="incident-card-meta">
            ${incident.date ? `<span>${escHtml(incident.date)}</span>` : ''}
            ${incident.date && incident.location_name ? '<span class="meta-sep">&middot;</span>' : ''}
            ${incident.location_name ? `<span>${escHtml(incident.location_name)}</span>` : ''}
          </div>
          ${incident.description ? `<p class="incident-card-desc">${escHtml(incident.description)}</p>` : ''}
          ${(incident.tags || []).length ? `<div class="incident-card-tags">${tagPills}</div>` : ''}
        </div>
      </article>
    `;
  }

  function entryCardHtml(e, showLocation, showIncidentLink) {
    const incident = showIncidentLink && e.incident_id ? incidentsById[e.incident_id] : null;
    return `
      <article class="entry-card">
        <div class="entry-type-col">
          <span class="type-badge type-badge--${e.type}">${e.type}</span>
        </div>
        <div class="entry-body">
          <div class="entry-header">
            <h2 class="entry-title"><a href="${escHtml(e.url)}" target="_blank" rel="noopener">${escHtml(e.title)}</a></h2>
            <div class="entry-stars">${starsHtml(e.rating)}</div>
          </div>
          ${incident ? `<a class="entry-incident-link" href="?incident=${escHtml(incident.slug)}">${escHtml(incident.title)}</a>` : ''}
          ${e.review ? `<p class="entry-review">${escHtml(e.review)}</p>` : ''}
          <div class="entry-footer">
            ${showLocation && e.location_name ? `<span class="entry-location">&#9679; ${escHtml(e.location_name)}</span>` : ''}
            ${(e.tags || []).length ? `
              <div class="entry-tags">
                ${e.tags.map(t => `<a class="entry-tag" data-tag="${escHtml(t)}" href="/?tag=${encodeURIComponent(t)}">${escHtml(t)}</a>`).join('')}
              </div>` : ''}
          </div>
        </div>
      </article>
    `;
  }

  function starsHtml(rating) {
    if (rating == null) return '<span class="unrated-label">Unrated</span>';
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += i <= rating ? '<span>&#9733;</span>' : '<span class="empty-star">&#9733;</span>';
    }
    return html;
  }

  function renderMap(incidents) {
    const withLocation = incidents.filter(i => i.lat != null && i.lng != null);
    const noLocMsg = document.getElementById('map-no-location');

    if (!map) {
      map = L.map('map', { zoomControl: true }).setView([20, 0], 2);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19
      }).addTo(map);
    }

    markers.forEach(m => m.remove());
    markers = [];

    if (withLocation.length === 0) {
      noLocMsg.style.display = 'block';
      return;
    }
    noLocMsg.style.display = 'none';

    withLocation.forEach(incident => {
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-pin" style="background:var(--accent);box-shadow:0 0 0 3px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const entryCount = incident.entry_count || 0;
      const popup = L.popup({ className: 'map-popup' }).setContent(`
        <div class="popup-inner">
          <a href="?incident=${escHtml(incident.slug)}" class="popup-title">${escHtml(incident.title)}</a>
          ${incident.date ? `<div class="popup-location">${escHtml(incident.date)}</div>` : ''}
          <div class="popup-location">${entryCount} entr${entryCount === 1 ? 'y' : 'ies'}</div>
        </div>
      `);

      const marker = L.marker([incident.lat, incident.lng], { icon }).addTo(map).bindPopup(popup);
      markers.push(marker);
    });

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    }
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.getElementById('view-list').style.display = view === 'list' ? 'block' : 'none';
    document.getElementById('view-map').style.display = view === 'map' ? 'block' : 'none';
    document.getElementById('group-toggle').style.display = view === 'map' ? 'none' : 'flex';

    if (view === 'map' && map) {
      setTimeout(() => map.invalidateSize(), 50);
    }
    render();
  }

  function switchGroupBy(group) {
    groupBy = group;
    document.querySelectorAll('[data-group]').forEach(b => b.classList.toggle('active', b.dataset.group === group));
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

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    document.querySelectorAll('[data-group]').forEach(btn => {
      btn.addEventListener('click', () => switchGroupBy(btn.dataset.group));
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  init().catch(err => {
    console.error('Failed to load:', err);
    document.querySelector('main').innerHTML =
      '<div class="empty-state"><p>Failed to load the archive. Please check your connection and refresh the page.</p></div>';
  });
})();
