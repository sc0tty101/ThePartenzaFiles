(() => {
  let entries = [];
  let editingId = null;
  let deletingId = null;
  let currentRating = 3;

  async function init() {
    const res = await fetch('/api/session');
    const { authenticated } = await res.json();

    const configRes = await fetch('/api/config');
    const config = await configRes.json();

    // Check if first time (placeholder hash) by attempting a known-bad login
    // Actually just check via setup endpoint behavior
    if (!authenticated) {
      // Try to determine if setup is needed
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

    await loadEntries();
    attachAdminEvents();
  }

  async function loadEntries() {
    const res = await fetch('/api/entries');
    entries = await res.json();
    renderAdminList();
  }

  function renderAdminList() {
    const list = document.getElementById('admin-entry-list');
    document.getElementById('entry-count').textContent = entries.length;

    if (entries.length === 0) {
      list.innerHTML = '<p style="color:var(--text-dim);padding:2rem 0;font-size:0.9rem;">No entries yet. Add your first one.</p>';
      return;
    }

    const sorted = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = sorted.map(e => `
      <div class="admin-entry" data-id="${e.id}">
        <div class="admin-entry-info">
          <div class="admin-entry-title">${escHtml(e.title)}</div>
          <div class="admin-entry-meta">${e.type} &middot; ${'★'.repeat(e.rating)} &middot; ${(e.tags || []).join(', ') || 'no tags'}</div>
        </div>
        <div class="admin-entry-actions">
          <button class="btn-sm edit-btn" data-id="${e.id}">Edit</button>
          <button class="btn-sm btn-sm--danger delete-btn" data-id="${e.id}">Delete</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    list.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
    });
  }

  function setStars(rating) {
    currentRating = rating;
    document.getElementById('entry-rating').value = rating;
    document.querySelectorAll('.star').forEach(s => {
      s.classList.toggle('filled', parseInt(s.dataset.value) <= rating);
    });
  }

  function openNewModal() {
    editingId = null;
    document.getElementById('modal-title').textContent = 'New entry';
    document.getElementById('entry-id').value = '';
    document.getElementById('entry-form').reset();
    setStars(3);
    clearLocation();
    document.getElementById('entry-error').textContent = '';
    document.getElementById('entry-modal').style.display = 'flex';
    document.getElementById('entry-title').focus();
  }

  function openEditModal(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    document.getElementById('modal-title').textContent = 'Edit entry';
    document.getElementById('entry-id').value = entry.id;
    document.getElementById('entry-title').value = entry.title;
    document.getElementById('entry-url').value = entry.url;
    document.getElementById('entry-type').value = entry.type;
    document.getElementById('entry-tags').value = (entry.tags || []).join(', ');
    document.getElementById('entry-review').value = entry.review || '';
    setStars(entry.rating || 3);
    if (entry.location_name && entry.lat != null) {
      setLocation(entry.location_name, entry.lat, entry.lng);
    } else {
      clearLocation();
    }
    document.getElementById('entry-error').textContent = '';
    document.getElementById('entry-modal').style.display = 'flex';
    document.getElementById('entry-title').focus();
  }

  function setLocation(name, lat, lng) {
    document.getElementById('entry-location-name').value = name;
    document.getElementById('entry-lat').value = lat;
    document.getElementById('entry-lng').value = lng;
    document.getElementById('entry-location-search').value = '';
    document.getElementById('location-results').style.display = 'none';
    document.getElementById('location-selected-name').textContent = name;
    document.getElementById('location-selected').style.display = 'flex';
  }

  function clearLocation() {
    document.getElementById('entry-location-name').value = '';
    document.getElementById('entry-lat').value = '';
    document.getElementById('entry-lng').value = '';
    document.getElementById('entry-location-search').value = '';
    document.getElementById('location-results').style.display = 'none';
    document.getElementById('location-selected').style.display = 'none';
  }

  async function geocodeSearch() {
    const query = document.getElementById('entry-location-search').value.trim();
    if (!query) return;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const results = await res.json();
    const list = document.getElementById('location-results');
    if (results.length === 0) {
      list.innerHTML = '<li class="location-result-none">No results found</li>';
    } else {
      list.innerHTML = results.map((r, i) =>
        `<li class="location-result-item" data-idx="${i}">${escHtml(r.display_name)}</li>`
      ).join('');
      list.querySelectorAll('.location-result-item').forEach((el, i) => {
        el.addEventListener('click', () => {
          setLocation(results[i].display_name, parseFloat(results[i].lat), parseFloat(results[i].lon));
        });
      });
    }
    list.style.display = 'block';
    // Store results for click handlers
    list._results = results;
  }

  function closeModal() {
    document.getElementById('entry-modal').style.display = 'none';
  }

  function openDeleteModal(id) {
    deletingId = id;
    const entry = entries.find(e => e.id === id);
    document.getElementById('delete-confirm-title').textContent =
      `"${entry ? entry.title : ''}" will be permanently removed.`;
    document.getElementById('delete-modal').style.display = 'flex';
  }

  function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
    deletingId = null;
  }

  async function saveEntry(data) {
    const url = editingId ? `/api/entries/${editingId}` : '/api/entries';
    const method = editingId ? 'PUT' : 'POST';
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

  async function deleteEntry() {
    if (!deletingId) return;
    await fetch(`/api/entries/${deletingId}`, { method: 'DELETE' });
    closeDeleteModal();
    await loadEntries();
  }

  function attachAdminEvents() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
      });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    });

    // New entry
    document.getElementById('new-entry-btn').addEventListener('click', openNewModal);

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('modal-overlay').addEventListener('click', closeModal);

    // Delete modal
    document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-overlay').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-confirm').addEventListener('click', deleteEntry);

    // Star input
    document.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => setStars(parseInt(star.dataset.value)));
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.value);
        document.querySelectorAll('.star').forEach(s => {
          s.classList.toggle('filled', parseInt(s.dataset.value) <= val);
        });
      });
    });
    document.getElementById('star-input').addEventListener('mouseleave', () => {
      setStars(currentRating);
    });

    // Location search
    document.getElementById('location-search-btn').addEventListener('click', geocodeSearch);
    document.getElementById('entry-location-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); geocodeSearch(); }
    });
    document.getElementById('location-clear-btn').addEventListener('click', clearLocation);

    // Close location results when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('#entry-location-search') && !e.target.closest('#location-results') && !e.target.closest('#location-search-btn')) {
        document.getElementById('location-results').style.display = 'none';
      }
    });

    // Entry form submit
    document.getElementById('entry-form').addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        title: document.getElementById('entry-title').value.trim(),
        url: document.getElementById('entry-url').value.trim(),
        type: document.getElementById('entry-type').value,
        tags: document.getElementById('entry-tags').value,
        review: document.getElementById('entry-review').value.trim(),
        rating: document.getElementById('entry-rating').value,
        location_name: document.getElementById('entry-location-name').value || null,
        lat: document.getElementById('entry-lat').value || null,
        lng: document.getElementById('entry-lng').value || null
      };
      const ok = await saveEntry(data);
      if (ok) {
        closeModal();
        await loadEntries();
      }
    });

    // Site info form
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

    // Change password form
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

    // Import file picker
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
        resultEl.textContent = `Imported ${json.inserted} entr${json.inserted === 1 ? 'y' : 'ies'}${json.skipped ? `, ${json.skipped} skipped` : ''}.`;
        setTimeout(() => resultEl.textContent = '', 4000);
        await loadEntries();
      }
    });

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeModal();
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
