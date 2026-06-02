(() => {
  let entries = [];
  let incidents = [];
  let editingEntryId = null;
  let editingIncidentId = null;
  let deletingId = null;
  let deletingType = null;
  let currentRating = 3;

  async function init() {
    const res = await fetch('/api/session');
    const { authenticated } = await res.json();
    const configRes = await fetch('/api/config');
    const config = await configRes.json();

    if (!authenticated) {
      const probe = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: '' })
      });
      const probeData = await probe.json();
      if (probe.status === 400 && probeData.error === 'Already set up') {
        showLogin();
      } else {
        showSetup();
      }
    } else {
      showAdmin(config);
    }
  }

  function showSetup() {
    document.getElementById('setup-screen').style.display = 'flex';
    document.getElementById('setup-form').addEventListener('submit', async e => {
      e.preventDefault();
      const password = document.getElementById('setup-password').value;
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        document.getElementById('setup-screen').style.display = 'none';
        const configRes = await fetch('/api/config');
        showAdmin(await configRes.json());
      } else {
        const { error } = await res.json();
        document.getElementById('setup-error').textContent = error;
      }
    });
  }

  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const password = document.getElementById('login-password').value;
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        document.getElementById('login-screen').style.display = 'none';
        const configRes = await fetch('/api/config');
        showAdmin(await configRes.json());
      } else {
        document.getElementById('login-error').textContent = 'Incorrect password.';
      }
    });
  }

  async function showAdmin(config) {
    document.getElementById('admin-panel').style.display = 'block';
    document.getElementById('settings-title').value = config.siteTitle || '';
    document.getElementById('settings-tagline').value = config.siteTagline || '';

    await Promise.all([loadIncidents(), loadEntries()]); renderAdminEntryList();
    attachAdminEvents();
  }

  async function loadIncidents() {
    const res = await fetch('/api/incidents');
    incidents = await res.json();
    renderAdminIncidentList();
    populateIncidentDropdown();
  }

  async function loadEntries() {
    const res = await fetch('/api/entries');
    entries = await res.json();
  }

  function renderAdminIncidentList() {
    const list = document.getElementById('admin-incident-list');
    document.getElementById('incident-count').textContent = incidents.length;

    if (incidents.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);padding:2rem 0;font-size:0.9rem;">No incidents yet. Add your first one.</p>';
      return;
    }

    const sorted = [...incidents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = sorted.map(i => `
      <div class="admin-entry" data-id="${i.id}">
        <div class="admin-entry-info">
          <div class="admin-entry-title">${escHtml(i.title)}</div>
          <div class="admin-entry-meta">${i.date || 'No date'} &middot; ${(i.entry_count || 0)} entr${i.entry_count === 1 ? 'y' : 'ies'} &middot; ${(i.tags || []).join(', ') || 'no tags'}</div>
        </div>
        <div class="admin-entry-actions">
          <button class="btn-sm edit-incident-btn" data-id="${i.id}">Edit</button>
          <button class="btn-sm btn-sm--danger delete-incident-btn" data-id="${i.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-incident-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditIncidentModal(btn.dataset.id));
    });
    list.querySelectorAll('.delete-incident-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'incident'));
    });
  }

  function renderAdminEntryList(filterText) {
    const list = document.getElementById('admin-entry-list');
    document.getElementById('entry-count').textContent = entries.length;

    if (incidents.length === 0 && entries.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);padding:2rem 0;font-size:0.9rem;">No entries yet. Add your first one.</p>';
      return;
    }

    const q = (filterText || '').toLowerCase().trim();

    const sortedIncidents = [...incidents].sort((a, b) => a.title.localeCompare(b.title));
    const entriesByIncident = {};
    entries.forEach(e => {
      const key = e.incident_id || '__standalone__';
      if (!entriesByIncident[key]) entriesByIncident[key] = [];
      entriesByIncident[key].push(e);
    });

    function entryRowHtml(e) {
      return `
        <div class="admin-entry admin-entry--nested" data-id="${e.id}">
          <div class="admin-entry-info">
            <div class="admin-entry-title">${escHtml(e.title)}</div>
            <div class="admin-entry-meta">
              <span class="entry-type-chip entry-type-chip--${e.type}">${e.type}</span>
              ${e.rating != null ? `<span style="color:var(--gold)">${'★'.repeat(e.rating)}</span><span style="color:var(--text-dim)">${'★'.repeat(5 - e.rating)}</span>` : '<span style="color:var(--text-dim);font-style:italic">Unrated</span>'}
              ${(e.tags || []).length ? `&middot; ${escHtml((e.tags || []).join(', '))}` : ''}
            </div>
          </div>
          <div class="admin-entry-actions">
            <button class="btn-sm edit-btn" data-id="${e.id}">Edit</button>
            <button class="btn-sm btn-sm--danger delete-btn" data-id="${e.id}">Delete</button>
          </div>
        </div>`;
    }

    function incidentGroupHtml(incident) {
      const incEntries = entriesByIncident[incident.id] || [];
      const matchesFilter = !q || incident.title.toLowerCase().includes(q);
      if (!matchesFilter) return '';
      const openAttr = (incEntries.length > 0 || !q) ? 'open' : '';
      return `
        <details class="entry-group" ${openAttr} data-incident-id="${incident.id}">
          <summary class="entry-group-summary">
            <span class="entry-group-title">${escHtml(incident.title)}</span>
            <span class="entry-group-count">${incEntries.length} entr${incEntries.length === 1 ? 'y' : 'ies'}</span>
            <button type="button" class="btn-sm add-entry-to-incident-btn" data-incident-id="${incident.id}" data-incident-title="${escHtml(incident.title)}">+ Add entry</button>
          </summary>
          <div class="entry-group-body">
            ${incEntries.length === 0
              ? '<p class="entry-group-empty">No entries yet.</p>'
              : incEntries.map(entryRowHtml).join('')}
          </div>
        </details>`;
    }

    const incidentGroups = sortedIncidents.map(incidentGroupHtml).join('');
    const standalone = entriesByIncident['__standalone__'] || [];
    const standaloneVisible = !q;

    const standaloneHtml = standaloneVisible ? `
      <details class="entry-group entry-group--standalone" ${standalone.length > 0 ? 'open' : ''}>
        <summary class="entry-group-summary">
          <span class="entry-group-title">Standalone entries</span>
          <span class="entry-group-count">${standalone.length} entr${standalone.length === 1 ? 'y' : 'ies'}</span>
          <button type="button" class="btn-sm add-entry-to-incident-btn" data-incident-id="" data-incident-title="">+ Add entry</button>
        </summary>
        <div class="entry-group-body">
          ${standalone.length === 0
            ? '<p class="entry-group-empty">No standalone entries.</p>'
            : standalone.map(entryRowHtml).join('')}
        </div>
      </details>` : '';

    list.innerHTML = incidentGroups + standaloneHtml;

    list.querySelectorAll('.add-entry-to-incident-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        openNewEntryModal(btn.dataset.incidentId || null);
      });
    });
    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditEntryModal(btn.dataset.id));
    });
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, 'entry'));
    });
  }

  function populateIncidentDropdown() {
    const select = document.getElementById('entry-incident');
    const currentVal = select.value;
    select.innerHTML = '<option value="">— None —</option>';
    [...incidents].sort((a, b) => a.title.localeCompare(b.title)).forEach(i => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = i.title;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function openNewIncidentModal() {
    editingIncidentId = null;
    document.getElementById('incident-modal-title').textContent = 'New incident';
    document.getElementById('incident-id').value = '';
    document.getElementById('incident-form').reset();
    document.getElementById('incident-slug').dataset.manuallyEdited = '';
    clearIncidentLocation();
    setImagePreview('');
    document.getElementById('incident-error').textContent = '';
    document.getElementById('incident-modal').style.display = 'flex';
    document.getElementById('incident-title').focus();
  }

  function setImagePreview(url) {
    const preview = document.getElementById('incident-image-preview');
    const img = document.getElementById('incident-image-preview-img');
    if (url) {
      img.src = url;
      preview.style.display = 'block';
    } else {
      img.src = '';
      preview.style.display = 'none';
    }
  }

  function openEditIncidentModal(id) {
    const incident = incidents.find(i => i.id === id);
    if (!incident) return;
    editingIncidentId = id;
    document.getElementById('incident-modal-title').textContent = 'Edit incident';
    document.getElementById('incident-id').value = incident.id;
    document.getElementById('incident-title').value = incident.title;
    document.getElementById('incident-slug').value = incident.slug;
    document.getElementById('incident-slug').dataset.manuallyEdited = '1';
    document.getElementById('incident-date').value = incident.date || '';
    document.getElementById('incident-tags').value = (incident.tags || []).join(', ');
    document.getElementById('incident-description').value = incident.description || '';
    if (incident.location_name && incident.lat != null) {
      setIncidentLocation(incident.location_name, incident.lat, incident.lng);
    } else {
      clearIncidentLocation();
    }
    const imgUrl = incident.image_url || '';
    document.getElementById('incident-image-url').value = imgUrl;
    setImagePreview(imgUrl);
    document.getElementById('incident-is-fictional').checked = !!incident.is_fictional;
    document.getElementById('incident-error').textContent = '';
    document.getElementById('incident-modal').style.display = 'flex';
    document.getElementById('incident-title').focus();
  }

  function closeIncidentModal() {
    document.getElementById('incident-modal').style.display = 'none';
  }

  function setIncidentLocation(name, lat, lng) {
    document.getElementById('incident-location-name').value = name;
    document.getElementById('incident-lat').value = lat;
    document.getElementById('incident-lng').value = lng;
    document.getElementById('incident-location-search').value = '';
    document.getElementById('incident-location-results').style.display = 'none';
    document.getElementById('incident-location-selected-name').textContent = name;
    document.getElementById('incident-location-selected').style.display = 'flex';
  }

  function clearIncidentLocation() {
    document.getElementById('incident-location-name').value = '';
    document.getElementById('incident-lat').value = '';
    document.getElementById('incident-lng').value = '';
    document.getElementById('incident-location-search').value = '';
    document.getElementById('incident-location-results').style.display = 'none';
    document.getElementById('incident-location-selected').style.display = 'none';
  }

  async function geocodeSearch(searchInputId, resultsId, setLocationFn) {
    const query = document.getElementById(searchInputId).value.trim();
    if (!query) return;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const results = await res.json();
    const list = document.getElementById(resultsId);
    if (results.length === 0) {
      list.innerHTML = '<li class="location-result-none">No results found</li>';
    } else {
      list.innerHTML = results.map((r, i) =>
        `<li class="location-result-item" data-idx="${i}">${escHtml(r.display_name)}</li>`
      ).join('');
      list.querySelectorAll('.location-result-item').forEach((el, i) => {
        el.addEventListener('click', () => {
          setLocationFn(results[i].display_name, parseFloat(results[i].lat), parseFloat(results[i].lon));
        });
      });
    }
    list.style.display = 'block';
  }

  function setStars(rating) {
    currentRating = rating;
    document.getElementById('entry-rating').value = rating != null ? rating : '';
    const unratedLabel = document.getElementById('star-unrated-label');
    if (unratedLabel) unratedLabel.style.display = rating == null ? 'inline' : 'none';
    document.querySelectorAll('.star').forEach(s => {
      s.classList.toggle('filled', rating != null && parseInt(s.dataset.value) <= rating);
    });
  }

  function buildEntryTagCloud() {
    const tagSet = new Set();
    incidents.forEach(i => (i.tags || []).forEach(t => tagSet.add(t)));
    entries.forEach(e => (e.tags || []).forEach(t => tagSet.add(t)));
    const sorted = [...tagSet].sort();
    const cloud = document.getElementById('entry-tag-cloud');
    if (!cloud) return;
    cloud.innerHTML = sorted.map(t =>
      `<button type="button" class="modal-tag-pill" data-tag="${escHtml(t)}">${escHtml(t)}</button>`
    ).join('');
    cloud.querySelectorAll('.modal-tag-pill').forEach(btn => {
      btn.addEventListener('click', () => toggleEntryTag(btn.dataset.tag, btn));
    });
  }

  function syncTagCloudToInput() {
    const current = getEntryTags();
    document.querySelectorAll('#entry-tag-cloud .modal-tag-pill').forEach(btn => {
      btn.classList.toggle('active', current.includes(btn.dataset.tag));
    });
  }

  function getEntryTags() {
    return document.getElementById('entry-tags').value
      .split(',').map(t => t.trim()).filter(Boolean);
  }

  function toggleEntryTag(tag, btn) {
    let tags = getEntryTags();
    if (tags.includes(tag)) {
      tags = tags.filter(t => t !== tag);
      btn.classList.remove('active');
    } else {
      tags.push(tag);
      btn.classList.add('active');
    }
    document.getElementById('entry-tags').value = tags.join(', ');
  }

  function openNewEntryModal(incidentId) {
    editingEntryId = null;
    document.getElementById('modal-title').textContent = 'New entry';
    document.getElementById('entry-id').value = '';
    document.getElementById('entry-form').reset();
    setStars(null);
    document.getElementById('entry-incident').value = incidentId || '';
    document.getElementById('entry-error').textContent = '';
    buildEntryTagCloud();
    syncTagCloudToInput();
    document.getElementById('entry-modal').style.display = 'flex';
    document.getElementById('entry-title').focus();
  }

  function openEditEntryModal(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    editingEntryId = id;
    document.getElementById('modal-title').textContent = 'Edit entry';
    document.getElementById('entry-id').value = entry.id;
    document.getElementById('entry-title').value = entry.title;
    document.getElementById('entry-url').value = entry.url;
    document.getElementById('entry-type').value = entry.type;
    document.getElementById('entry-tags').value = (entry.tags || []).join(', ');
    document.getElementById('entry-review').value = entry.review || '';
    document.getElementById('entry-incident').value = entry.incident_id || '';
    setStars(entry.rating != null ? entry.rating : null);
    document.getElementById('entry-error').textContent = '';
    buildEntryTagCloud();
    syncTagCloudToInput();
    document.getElementById('entry-modal').style.display = 'flex';
    document.getElementById('entry-title').focus();
  }

  function closeEntryModal() {
    document.getElementById('entry-modal').style.display = 'none';
  }

  function openDeleteModal(id, type) {
    deletingId = id;
    deletingType = type;
    let name = '';
    if (type === 'incident') {
      const inc = incidents.find(i => i.id === id);
      name = inc ? inc.title : '';
      document.getElementById('delete-modal-heading').textContent = 'Delete incident?';
    } else {
      const entry = entries.find(e => e.id === id);
      name = entry ? entry.title : '';
      document.getElementById('delete-modal-heading').textContent = 'Delete entry?';
    }
    document.getElementById('delete-confirm-title').textContent =
      `"${name}" will be permanently removed.`;
    document.getElementById('delete-modal').style.display = 'flex';
  }

  function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    deletingId = null;
    deletingType = null;
  }

  async function saveIncident(data) {
    const url = editingIncidentId ? `/api/incidents/${editingIncidentId}` : '/api/incidents';
    const method = editingIncidentId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const { error } = await res.json();
      document.getElementById('incident-error').textContent = error || 'Save failed.';
      return false;
    }
    return true;
  }

  async function saveEntry(data) {
    const url = editingEntryId ? `/api/entries/${editingEntryId}` : '/api/entries';
    const method = editingEntryId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const { error } = await res.json();
      document.getElementById('entry-error').textContent = error || 'Save failed.';
      return false;
    }
    return true;
  }

  async function deleteItem() {
    if (!deletingId) return;
    const endpoint = deletingType === 'incident'
      ? `/api/incidents/${deletingId}`
      : `/api/entries/${deletingId}`;
    await fetch(endpoint, { method: 'DELETE' });
    closeDeleteModal();
    await Promise.all([loadIncidents(), loadEntries()]); renderAdminEntryList();
  }

  function attachAdminEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
      });
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    });

    document.getElementById('new-incident-btn').addEventListener('click', openNewIncidentModal);
    document.getElementById('incident-modal-close').addEventListener('click', closeIncidentModal);
    document.getElementById('incident-cancel-btn').addEventListener('click', closeIncidentModal);
    document.getElementById('incident-modal-overlay').addEventListener('click', closeIncidentModal);

    document.getElementById('incident-title').addEventListener('input', e => {
      const slugField = document.getElementById('incident-slug');
      if (!slugField.dataset.manuallyEdited) {
        slugField.value = slugify(e.target.value);
      }
    });
    document.getElementById('incident-slug').addEventListener('input', function() {
      this.dataset.manuallyEdited = '1';
    });

    document.getElementById('incident-location-search-btn').addEventListener('click', () => {
      geocodeSearch('incident-location-search', 'incident-location-results', setIncidentLocation);
    });
    document.getElementById('incident-location-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); geocodeSearch('incident-location-search', 'incident-location-results', setIncidentLocation); }
    });
    document.getElementById('incident-location-clear-btn').addEventListener('click', clearIncidentLocation);

    document.getElementById('incident-image-url').addEventListener('input', e => {
      setImagePreview(e.target.value.trim());
    });

    document.getElementById('incident-form').addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        title: document.getElementById('incident-title').value.trim(),
        slug: document.getElementById('incident-slug').value.trim(),
        date: document.getElementById('incident-date').value.trim() || null,
        tags: document.getElementById('incident-tags').value,
        description: document.getElementById('incident-description').value.trim(),
        location_name: document.getElementById('incident-location-name').value || null,
        lat: document.getElementById('incident-lat').value || null,
        lng: document.getElementById('incident-lng').value || null,
        image_url: document.getElementById('incident-image-url').value.trim() || null,
        is_fictional: document.getElementById('incident-is-fictional').checked
      };
      const ok = await saveIncident(data);
      if (ok) {
        closeIncidentModal();
        document.getElementById('incident-slug').dataset.manuallyEdited = '';
        await Promise.all([loadIncidents(), loadEntries()]); renderAdminEntryList();
      }
    });

    document.getElementById('new-entry-btn').addEventListener('click', () => openNewEntryModal(null));
    document.getElementById('entry-tags').addEventListener('input', syncTagCloudToInput);
    document.getElementById('entries-search').addEventListener('input', e => {
      renderAdminEntryList(e.target.value);
    });
    document.getElementById('modal-close').addEventListener('click', closeEntryModal);
    document.getElementById('cancel-btn').addEventListener('click', closeEntryModal);
    document.getElementById('modal-overlay').addEventListener('click', closeEntryModal);

    document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-overlay').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-confirm').addEventListener('click', deleteItem);

    document.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.value);
        setStars(currentRating === val ? null : val);
      });
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value);
        document.querySelectorAll('.star').forEach(s => {
          s.classList.toggle('filled', parseInt(s.dataset.value) <= val);
        });
        const unratedLabel = document.getElementById('star-unrated-label');
        if (unratedLabel) unratedLabel.style.display = 'none';
      });
    });
    document.getElementById('star-input').addEventListener('mouseleave', () => {
      setStars(currentRating);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#incident-location-search') && !e.target.closest('#incident-location-results') && !e.target.closest('#incident-location-search-btn')) {
        document.getElementById('incident-location-results').style.display = 'none';
      }
    });

    document.getElementById('entry-form').addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        title: document.getElementById('entry-title').value.trim(),
        url: document.getElementById('entry-url').value.trim(),
        type: document.getElementById('entry-type').value,
        tags: document.getElementById('entry-tags').value,
        review: document.getElementById('entry-review').value.trim(),
        rating: document.getElementById('entry-rating').value,
        incident_id: document.getElementById('entry-incident').value || null
      };
      const ok = await saveEntry(data);
      if (ok) {
        closeEntryModal();
        await Promise.all([loadIncidents(), loadEntries()]); renderAdminEntryList();
      }
    });

    document.getElementById('site-info-form').addEventListener('submit', async e => {
      e.preventDefault();
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteTitle: document.getElementById('settings-title').value,
          siteTagline: document.getElementById('settings-tagline').value
        })
      });
      const msg = document.getElementById('site-info-saved');
      msg.textContent = 'Saved';
      setTimeout(() => msg.textContent = '', 2500);
    });

    document.getElementById('change-password-form').addEventListener('submit', async e => {
      e.preventDefault();
      const newPassword = document.getElementById('new-password').value;
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        document.getElementById('new-password').value = '';
        const msg = document.getElementById('password-saved');
        msg.textContent = 'Password updated';
        setTimeout(() => msg.textContent = '', 2500);
      } else {
        const { error } = await res.json();
        document.getElementById('password-error').textContent = error;
      }
    });

    document.getElementById('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const errorEl = document.getElementById('import-error');
      const resultEl = document.getElementById('import-result');
      errorEl.textContent = '';
      resultEl.textContent = '';

      let data;
      try {
        data = JSON.parse(await file.text());
      } catch {
        errorEl.textContent = 'Invalid JSON file.';
        e.target.value = '';
        return;
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      e.target.value = '';

      if (!res.ok) {
        errorEl.textContent = json.error || 'Import failed.';
      } else {
        resultEl.textContent = `Imported ${json.inserted} record${json.inserted === 1 ? '' : 's'}${json.skipped ? `, ${json.skipped} skipped` : ''}.`;
        setTimeout(() => resultEl.textContent = '', 4000);
        await Promise.all([loadIncidents(), loadEntries()]); renderAdminEntryList();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeIncidentModal();
        closeEntryModal();
        closeDeleteModal();
      }
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
