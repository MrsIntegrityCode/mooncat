// Mooncat Lacquer Vault & Inventory Controller
(function () {
  'use strict';

  // --- State ---
  const STORAGE_PROFILES_KEY = 'mooncat_vault_profiles_v3';
  const STORAGE_ACTIVE_PROFILE_KEY = 'mooncat_vault_active_profile_v3';
  let catalog = window.MOONCAT_CATALOG || [];
  
  let profiles = {};
  let currentProfileId = 'guest';

  // Current active user data reference (defaults to completely empty for guests)
  let userData = {
    inventory: {},
    wishlist: [],
    wishlistRatings: {}
  };

  let activeTab = 'catalog';
  let currentView = 'grid'; // 'grid' or 'table'
  let catalogSortKey = 'name';
  let catalogSortAsc = true;
  let wishlistSortKey = 'rating-desc';

  // --- Initialize ---
  function init() {
    loadUserData();
    setupProfileSelector();
    setupFilters();
    bindEvents();
    renderAll();
  }

  // --- Multi-User Profile Persistence ---
  function loadUserData() {
    try {
      // Purge legacy v1 and v2 keys that defaulted to seeded data
      localStorage.removeItem('mooncat_vault_profiles_v1');
      localStorage.removeItem('mooncat_vault_profiles_v2');
      localStorage.removeItem('mooncat_vault_active_profile_v1');
      localStorage.removeItem('mooncat_vault_active_profile_v2');

      const savedProfiles = localStorage.getItem(STORAGE_PROFILES_KEY);
      const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_PROFILE_KEY);

      if (savedProfiles) {
        profiles = JSON.parse(savedProfiles);
      } else {
        // Default to a completely empty Guest Vault
        profiles = {
          'guest': {
            id: 'guest',
            name: 'Guest Vault',
            inventory: {},
            wishlist: []
          }
        };
        localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
      }

      // Check if user is signed in to Google
      const currentUser = (window.MooncatAuth && window.MooncatAuth.getCurrentUser) 
        ? window.MooncatAuth.getCurrentUser() 
        : null;

      if (currentUser) {
        const cloudId = `cloud_${currentUser.uid}`;
        currentProfileId = profiles[cloudId] ? cloudId : (savedActiveId && profiles[savedActiveId] ? savedActiveId : 'guest');
      } else {
        // If not logged in, ensure we never default to a private cloud profile or melissa profile
        if (savedActiveId && profiles[savedActiveId] && !savedActiveId.startsWith('cloud_') && savedActiveId !== 'melissa') {
          currentProfileId = savedActiveId;
        } else {
          currentProfileId = 'guest';
        }
      }

      if (!profiles[currentProfileId]) {
        profiles[currentProfileId] = {
          id: currentProfileId,
          name: 'Guest Vault',
          inventory: {},
          wishlist: []
        };
      }

      userData = profiles[currentProfileId];
      if (!userData.inventory) userData.inventory = {};
      if (!userData.wishlist) userData.wishlist = [];
      if (!userData.wishlistRatings) userData.wishlistRatings = {};
    } catch (e) {
      console.error('Failed to load user profiles from storage:', e);
      profiles = {
        'guest': {
          id: 'guest',
          name: 'Guest Vault',
          inventory: {},
          wishlist: [],
          wishlistRatings: {}
        }
      };
      currentProfileId = 'guest';
      userData = profiles['guest'];
    }
  }

  function saveUserData() {
    try {
      profiles[currentProfileId] = userData;
      localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
      localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, currentProfileId);
      updateHeaderStats();

      // If user is signed in to Google Cloud, sync to Firestore
      if (window.MooncatAuth && window.MooncatAuth.saveUserDataToFirestore) {
        window.MooncatAuth.saveUserDataToFirestore(userData);
      }
    } catch (e) {
      console.error('Failed to save user data:', e);
    }
  }

  function setupProfileSelector() {
    const selector = document.getElementById('select-active-profile');
    if (!selector) return;

    const currentUser = (window.MooncatAuth && window.MooncatAuth.getCurrentUser) 
      ? window.MooncatAuth.getCurrentUser() 
      : null;

    // Filter available profiles: only show private cloud profiles when logged in as that user
    const availableProfiles = Object.values(profiles).filter(p => {
      if (p.id.startsWith('cloud_')) {
        return currentUser && p.id === `cloud_${currentUser.uid}`;
      }
      if (p.id === 'melissa') {
        return currentUser && (currentUser.email || '').toLowerCase().includes('melissa');
      }
      return true;
    });

    selector.innerHTML = availableProfiles.map(p => `
      <option value="${p.id}" ${p.id === currentProfileId ? 'selected' : ''}>${escapeHtml(p.name)}</option>
    `).join('');

    selector.onchange = function () {
      switchProfile(this.value);
    };

    const newBtn = document.getElementById('btn-new-profile');
    if (newBtn) {
      newBtn.onclick = createNewProfile;
    }
  }

  function switchProfile(profileId) {
    if (!profiles[profileId]) return;
    currentProfileId = profileId;
    userData = profiles[profileId];
    if (!userData.inventory) userData.inventory = {};
    if (!userData.wishlist) userData.wishlist = [];

    localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, currentProfileId);
    renderAll();
    setupProfileSelector();
    showToast(`Switched active collection to: ${userData.name}`);
  }

  // --- Auth Enforcement Helper ---
  function requireAuth(actionDescription = "add colors to your inventory") {
    const currentUser = (window.MooncatAuth && window.MooncatAuth.getCurrentUser) 
      ? window.MooncatAuth.getCurrentUser() 
      : null;

    if (!currentUser) {
      const willLogin = confirm(
        `🔒 Sign In Required\n\nYou must sign in with your Google account to ${actionDescription}.\n\nWould you like to sign in with Google now?`
      );
      if (willLogin && window.MooncatAuth && window.MooncatAuth.signInWithGoogle) {
        window.MooncatAuth.signInWithGoogle();
      } else {
        showToast(`🔒 Please sign in with Google to ${actionDescription}.`);
      }
      return false;
    }
    return true;
  }

  function createNewProfile() {
    if (!requireAuth("create a new collection profile")) return;
    const name = prompt("Enter a name for this new collection (e.g. 'Emma\\'s Collection' or 'My Blank Vault'):");
    if (!name || !name.trim()) return;

    const newId = 'profile_' + Date.now();
    profiles[newId] = {
      id: newId,
      name: name.trim(),
      inventory: {}, // Starts completely blank!
      wishlist: []
    };

    saveUserData();
    switchProfile(newId);
    showToast(`🎉 Created new empty collection: "${name.trim()}"! Your inventory is separate and private.`);
  }

  // --- Filters Setup ---
  function setupFilters() {
    const finishSelect = document.getElementById('filter-finish');
    const colorSelect = document.getElementById('filter-color');

    const finishes = new Set();
    const colors = new Set();

    catalog.forEach(item => {
      if (item.type) {
        item.type.split(',').forEach(f => finishes.add(f.trim()));
      }
      if (item.color) {
        item.color.split(',').forEach(c => colors.add(c.trim()));
      }
    });

    Array.from(finishes).sort().forEach(finish => {
      const opt = document.createElement('option');
      opt.value = finish;
      opt.textContent = finish;
      finishSelect.appendChild(opt);
    });

    Array.from(colors).sort().forEach(color => {
      const opt = document.createElement('option');
      opt.value = color;
      opt.textContent = color;
      colorSelect.appendChild(opt);
    });
  }

  // --- Event Bindings ---
  function bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = tab.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    // View toggle (Grid / Table)
    document.querySelectorAll('.btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.getAttribute('data-view');
        renderCatalog();
      });
    });

    // Search and Filters
    document.getElementById('catalog-search').addEventListener('input', debounce(renderCatalog, 200));
    document.getElementById('search-clear').addEventListener('click', () => {
      document.getElementById('catalog-search').value = '';
      renderCatalog();
    });
    document.getElementById('filter-finish').addEventListener('change', renderCatalog);
    document.getElementById('filter-color').addEventListener('change', renderCatalog);
    document.getElementById('filter-status').addEventListener('change', renderCatalog);
    const filterOwned = document.getElementById('filter-owned');
    if (filterOwned) filterOwned.addEventListener('change', renderCatalog);

    // Orders search
    document.getElementById('orders-search').addEventListener('input', debounce(renderOrders, 200));

    // Table sorting
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const sortField = th.getAttribute('data-sort');
        if (catalogSortKey === sortField) {
          catalogSortAsc = !catalogSortAsc;
        } else {
          catalogSortKey = sortField;
          catalogSortAsc = true;
        }
        renderCatalog();
      });
    });

    // Modals
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') closeModal();
    });

    // Help Guide Modal
    const helpBtn = document.getElementById('btn-open-help');
    if (helpBtn) helpBtn.addEventListener('click', openHelpModal);
    const helpCloseBtn = document.getElementById('help-close-btn');
    if (helpCloseBtn) helpCloseBtn.addEventListener('click', closeHelpModal);
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
      helpModal.addEventListener('click', (e) => {
        if (e.target.id === 'help-modal') closeHelpModal();
      });
    }

    // Import Actions
    const importOpenBtn = document.getElementById('btn-open-order-import');
    if (importOpenBtn) importOpenBtn.addEventListener('click', openImportModal);
    const importCloseBtn = document.getElementById('import-close-btn');
    if (importCloseBtn) importCloseBtn.addEventListener('click', closeImportModal);
    const importModal = document.getElementById('import-modal');
    if (importModal) {
      importModal.addEventListener('click', (e) => {
        if (e.target.id === 'import-modal') closeImportModal();
      });
    }
    document.getElementById('btn-parse-preview').addEventListener('click', previewImport);
    document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);

    // CSV Exports
    document.getElementById('btn-export-catalog-csv').addEventListener('click', exportCatalogCSV);
    document.getElementById('btn-export-orders-csv').addEventListener('click', exportOrdersCSV);
    document.getElementById('btn-export-wishlist-csv').addEventListener('click', exportWishlistCSV);

    // Wishlist Decision Studio
    const wizardBtn = document.getElementById('btn-start-decision-wizard');
    if (wizardBtn) wizardBtn.addEventListener('click', openDecisionWizard);
    const wizardCloseBtn = document.getElementById('wizard-close-btn');
    if (wizardCloseBtn) wizardCloseBtn.addEventListener('click', closeDecisionWizard);
    const wizardModal = document.getElementById('decision-wizard-modal');
    if (wizardModal) {
      wizardModal.addEventListener('click', (e) => {
        if (e.target.id === 'decision-wizard-modal') closeDecisionWizard();
      });
    }

    // Live New Releases Sync
    const syncBtn = document.getElementById('btn-sync-new-releases');
    if (syncBtn) {
      syncBtn.addEventListener('click', checkLiveNewReleases);
    }

    // Backup & Restore
    document.getElementById('btn-export-backup').addEventListener('click', exportJSONBackup);
    document.getElementById('file-import-backup').addEventListener('change', importJSONBackup);
    document.getElementById('btn-reset-demo').addEventListener('click', confirmResetData);
  }

  // --- Tab Switcher ---
  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${tabId}`);
    });

    if (tabId === 'catalog') renderCatalog();
    if (tabId === 'orders') renderOrders();
    if (tabId === 'wishlist') renderWishlist();
  }

  // --- Rendering ---
  function renderAll() {
    updateHeaderStats();
    renderCatalog();
    renderOrders();
    renderWishlist();
  }

  function updateHeaderStats() {
    const totalCatalog = catalog.length;
    let totalOwnedCount = 0;
    Object.values(userData.inventory).forEach(item => {
      if (item && item.qty > 0) totalOwnedCount += item.qty;
    });
    const uniqueOwnedCount = Object.keys(userData.inventory).filter(id => userData.inventory[id]?.qty > 0).length;
    const wishlistCount = userData.wishlist.length;

    document.getElementById('stat-total-catalog').textContent = totalCatalog;
    document.getElementById('stat-total-owned').textContent = `${uniqueOwnedCount} (${totalOwnedCount})`;
    document.getElementById('stat-total-wishlist').textContent = wishlistCount;

    // In orders view
    document.getElementById('orders-unique-count').textContent = uniqueOwnedCount;
    document.getElementById('orders-total-bottles').textContent = totalOwnedCount;
  }

  // --- Catalog Rendering ---
  function getFilteredCatalog() {
    const query = document.getElementById('catalog-search').value.toLowerCase().trim();
    const finishFilter = document.getElementById('filter-finish').value;
    const colorFilter = document.getElementById('filter-color').value;
    const statusFilter = document.getElementById('filter-status') ? document.getElementById('filter-status').value : 'in_stock';
    const ownedFilter = document.getElementById('filter-owned') ? document.getElementById('filter-owned').value : 'unowned';

    return catalog.filter(item => {
      const owned = (userData.inventory[item.id]?.qty || 0) > 0;
      const inWishlist = userData.wishlist.includes(item.id);

      // Search query
      if (query) {
        const matchTitle = item.name.toLowerCase().includes(query);
        const matchType = item.type.toLowerCase().includes(query);
        const matchColor = item.color.toLowerCase().includes(query);
        const matchDesc = item.description.toLowerCase().includes(query);
        if (!matchTitle && !matchType && !matchColor && !matchDesc) return false;
      }

      // Finish filter
      if (finishFilter !== 'all') {
        if (!item.type.toLowerCase().includes(finishFilter.toLowerCase())) return false;
      }

      // Color filter
      if (colorFilter !== 'all') {
        if (!item.color.toLowerCase().includes(colorFilter.toLowerCase())) return false;
      }

      // Availability / Status filter (In Stock, Dearly Departed, New, Out of Stock, or All)
      if (statusFilter === 'in_stock' && item.status !== 'In Stock') return false;
      if (statusFilter === 'departed' && item.status !== 'Dearly Departed') return false;
      if (statusFilter === 'new' && !item.is_new) return false;
      if (statusFilter === 'out_of_stock' && item.status !== 'Out of Stock') return false;

      // Ownership filter (Owned Only, Not Owned Only, Wishlist, or All)
      if (ownedFilter === 'owned' && !owned) return false;
      if (ownedFilter === 'unowned' && owned && !query) return false;
      if (ownedFilter === 'wishlist' && !inWishlist) return false;

      return true;
    });
  }

  function renderCatalog() {
    let items = getFilteredCatalog();

    // Sort items
    items.sort((a, b) => {
      let valA, valB;
      if (catalogSortKey === 'owned') {
        valA = userData.inventory[a.id]?.qty || 0;
        valB = userData.inventory[b.id]?.qty || 0;
      } else if (catalogSortKey === 'price') {
        valA = parseFloat((a.price || '$0').replace(/[^0-9\.]/g, '')) || 0;
        valB = parseFloat((b.price || '$0').replace(/[^0-9\.]/g, '')) || 0;
      } else {
        valA = (a[catalogSortKey] || '').toString().toLowerCase();
        valB = (b[catalogSortKey] || '').toString().toLowerCase();
      }
      if (valA < valB) return catalogSortAsc ? -1 : 1;
      if (valA > valB) return catalogSortAsc ? 1 : -1;
      return 0;
    });

    document.getElementById('results-count').textContent = `Showing ${items.length} of ${catalog.length} Mooncat items`;

    const gridContainer = document.getElementById('catalog-grid');
    const tableWrapper = document.getElementById('catalog-table-wrapper');
    const tableBody = document.getElementById('catalog-table-body');

    if (currentView === 'grid') {
      gridContainer.classList.remove('hidden');
      tableWrapper.classList.add('hidden');
      gridContainer.innerHTML = items.map(createCardHTML).join('');
    } else {
      gridContainer.classList.add('hidden');
      tableWrapper.classList.remove('hidden');
      tableBody.innerHTML = items.map(createTableRowHTML).join('');
    }
  }

  function createCardHTML(item) {
    const ownedQty = userData.inventory[item.id]?.qty || 0;
    const isOwned = ownedQty > 0;
    const inWishlist = userData.wishlist.includes(item.id);

    const finishBadges = item.type.split(',').map(f => `<span class="tag tag-finish">${escapeHtml(f.trim())}</span>`).join('');
    const colorBadges = item.color.split(',').map(c => `<span class="tag tag-color">${escapeHtml(c.trim())}</span>`).join('');
    const isDeparted = item.status === 'Dearly Departed';

    return `
      <div class="polish-card ${isOwned ? 'is-owned' : ''}" data-id="${item.id}">
        <div class="card-media" onclick="window.MooncatApp.openDetail(${item.id})">
          <img class="card-img" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='https://via.placeholder.com/300?text=Mooncat'">
          <div class="card-badges">
            ${item.is_new ? '<span class="badge badge-new">✨ NEW</span>' : ''}
            ${isOwned 
              ? `<span class="badge badge-owned">Owned: ${ownedQty}</span>` 
              : `<span class="badge badge-unowned">Not Owned</span>`}
            ${inWishlist ? `<span class="badge badge-wishlist">Wishlist</span>` : ''}
          </div>
          <span class="badge-stock ${isDeparted ? 'departed' : ''}">${isDeparted ? '⚰️ DEARLY DEPARTED' : escapeHtml(item.status)}</span>
        </div>

        <div class="card-body">
          <h3 class="card-title" onclick="window.MooncatApp.openDetail(${item.id})">${escapeHtml(item.name)}</h3>
          
          <div class="card-tags">
            ${finishBadges}
            ${colorBadges}
          </div>

          <p class="card-desc">${escapeHtml(item.description)}</p>

          <div class="card-footer">
            <div class="card-meta-row">
              <span>Updated: ${escapeHtml(item.last_updated)}</span>
              <span>${escapeHtml(item.price)}</span>
            </div>

            <div class="card-actions">
              <button class="btn-card-action btn-card-owned" onclick="window.MooncatApp.quickAddOwned(${item.id})">
                ${isOwned ? `+ Add More (${ownedQty})` : '+ Add to Owned'}
              </button>

              <button class="btn-card-action btn-card-wishlist ${inWishlist ? 'active' : ''}" 
                onclick="window.MooncatApp.toggleWishlist(${item.id})"
                ${isOwned ? 'disabled title="You already own this color! Cannot add to wishlist."' : ''}>
                ${inWishlist ? '✓ On Wishlist' : (isOwned ? 'Owned' : '✦ Wishlist')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function createTableRowHTML(item) {
    const ownedQty = userData.inventory[item.id]?.qty || 0;
    const isOwned = ownedQty > 0;
    const inWishlist = userData.wishlist.includes(item.id);

    return `
      <tr data-id="${item.id}">
        <td>
          <img class="table-thumb" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy" onclick="window.MooncatApp.openDetail(${item.id})">
        </td>
        <td>
          <span class="table-name" onclick="window.MooncatApp.openDetail(${item.id})">${escapeHtml(item.name)}</span>
          ${item.is_new ? '<span class="badge badge-new" style="margin-left: 6px; font-size: 0.65rem; padding: 2px 6px;">✨ NEW</span>' : ''}
        </td>
        <td><span class="tag tag-finish">${escapeHtml(item.type)}</span></td>
        <td><span class="tag tag-color">${escapeHtml(item.color)}</span></td>
        <td class="table-desc-cell" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.88rem; font-weight: 600;">${escapeHtml(item.price)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHtml(item.last_updated)}</td>
        <td>
          ${isOwned 
            ? `<span class="badge badge-owned">Yes (${ownedQty})</span>` 
            : `<span class="badge badge-unowned">No</span>`}
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button class="btn-card-action" style="padding: 4px 8px;" onclick="window.MooncatApp.quickAddOwned(${item.id})" title="Add 1 to Owned">+1</button>
            <button class="btn-card-action" style="padding: 4px 8px;" onclick="window.MooncatApp.toggleWishlist(${item.id})" ${isOwned ? 'disabled title="Already Owned"' : ''} title="Wishlist">
              ${inWishlist ? '★' : '☆'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  // --- Orders & Inventory Tab (Goal 2) ---
  function renderOrders() {
    const searchFilter = (document.getElementById('orders-search')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('orders-table-body');
    const emptyState = document.getElementById('orders-empty-state');

    // Get all owned items
    const ownedItems = catalog.filter(item => (userData.inventory[item.id]?.qty || 0) > 0);

    // Sort strictly by name alphabetically (Goal 2)
    ownedItems.sort((a, b) => a.name.localeCompare(b.name));

    const filtered = ownedItems.filter(item => {
      if (!searchFilter) return true;
      return item.name.toLowerCase().includes(searchFilter) ||
             item.type.toLowerCase().includes(searchFilter) ||
             item.color.toLowerCase().includes(searchFilter);
    });

    if (ownedItems.length === 0) {
      tbody.innerHTML = '';
      const currentUser = (window.MooncatAuth && window.MooncatAuth.getCurrentUser) ? window.MooncatAuth.getCurrentUser() : null;
      if (!currentUser) {
        emptyState.innerHTML = `
          <div class="empty-icon">🔒</div>
          <h3>Sign In to Track Your Inventory</h3>
          <p>Please sign in with your Google account to track your orders, on-hand counts, and sync your personal Mooncat collection.</p>
          <button class="btn-primary" onclick="window.MooncatAuth && window.MooncatAuth.signInWithGoogle && window.MooncatAuth.signInWithGoogle()">
            Sign in with Google
          </button>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="empty-icon">📦</div>
          <h3>No Orders Added Yet</h3>
          <p>Click "Add / Import Orders" above to paste your order history, enter shades, or upload receipts. You can also click "+ Add to Owned" from the Main Catalog!</p>
          <button class="btn-primary" onclick="window.MooncatApp && window.MooncatApp.openImportModal && window.MooncatApp.openImportModal()">+ Add Your Ordered Colors</button>
        `;
      }
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    tbody.innerHTML = filtered.map(item => {
      const invEntry = userData.inventory[item.id] || {};
      const qtyOnHand = invEntry.qty || 0;
      const totalOrdered = invEntry.ordered_qty || qtyOnHand;
      const hasGifted = totalOrdered > qtyOnHand;

      return `
        <tr data-id="${item.id}">
          <td>
            <img class="table-thumb" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" onclick="window.MooncatApp.openDetail(${item.id})">
          </td>
          <td>
            <span class="table-name" onclick="window.MooncatApp.openDetail(${item.id})">${escapeHtml(item.name)}</span>
          </td>
          <td><span class="tag tag-finish">${escapeHtml(item.type)}</span></td>
          <td><span class="tag tag-color">${escapeHtml(item.color)}</span></td>
          <td style="text-align: center;">
            <span style="font-family: var(--font-mono); font-weight: bold; font-size: 1rem;">${totalOrdered}</span>
          </td>
          <td>
            <div class="table-qty-control">
              <button class="btn-qty" onclick="window.MooncatApp.decrementOrder(${item.id})" title="Decrease count">-</button>
              <span class="qty-val">${qtyOnHand}</span>
              <button class="btn-qty" onclick="window.MooncatApp.quickAddOwned(${item.id})" title="Increase count">+</button>
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span class="badge-stock ${item.status === 'Discontinued' ? 'discontinued' : ''}" style="position: static; display: inline-block; width: fit-content;">${escapeHtml(item.status)}</span>
              ${hasGifted ? `<span style="font-size: 0.72rem; color: #ec4899; font-weight: 600;">🎁 Gifted ${totalOrdered - qtyOnHand} duplicate</span>` : ''}
            </div>
          </td>
          <td style="text-align: right;">
            <button class="btn-card-action" style="color: #ef4444;" onclick="window.MooncatApp.removeOrder(${item.id})" title="Remove all from inventory">Remove</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- Wishlist Sorting & Rating Controllers ---
  function setWishlistSort(key) {
    wishlistSortKey = key;
    renderWishlist();
  }

  function setWishlistRating(id, rating) {
    if (!requireAuth("rate wishlist shades")) return;
    if (!userData.wishlistRatings) userData.wishlistRatings = {};
    const num = parseInt(rating, 10) || 0;
    const item = catalog.find(i => i.id === id);
    if (num > 0) {
      userData.wishlistRatings[id] = num;
      showToast(`⭐ Rated "${item ? item.name : 'Shade'}" ${num}/10!`);
    } else {
      delete userData.wishlistRatings[id];
      showToast(`Cleared love rating for "${item ? item.name : 'Shade'}".`);
    }
    saveUserData();
    renderWishlist();
  }

  // --- Wishlist Tab (Goal 3) ---
  function renderWishlist() {
    const grid = document.getElementById('wishlist-grid');
    const emptyState = document.getElementById('wishlist-empty-state');
    const statsBadge = document.getElementById('wishlist-stats-badge');
    const sortSelect = document.getElementById('wishlist-sort-select');
    if (sortSelect && sortSelect.value !== wishlistSortKey) {
      sortSelect.value = wishlistSortKey;
    }

    let wishlistItems = catalog.filter(item => userData.wishlist.includes(item.id));

    // Sort wishlist according to selected sort key
    wishlistItems.sort((a, b) => {
      const rA = (userData.wishlistRatings && userData.wishlistRatings[a.id]) || 0;
      const rB = (userData.wishlistRatings && userData.wishlistRatings[b.id]) || 0;

      if (wishlistSortKey === 'rating-desc') {
        if (rB !== rA) return rB - rA;
        return a.name.localeCompare(b.name);
      }
      if (wishlistSortKey === 'rating-asc') {
        if (rA !== rB) return rA - rB;
        return a.name.localeCompare(b.name);
      }
      if (wishlistSortKey === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (wishlistSortKey === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      if (wishlistSortKey === 'price-asc') {
        const pA = parseFloat((a.price || '$0').replace(/[^0-9.]/g, '')) || 0;
        const pB = parseFloat((b.price || '$0').replace(/[^0-9.]/g, '')) || 0;
        return pA - pB || a.name.localeCompare(b.name);
      }
      if (wishlistSortKey === 'price-desc') {
        const pA = parseFloat((a.price || '$0').replace(/[^0-9.]/g, '')) || 0;
        const pB = parseFloat((b.price || '$0').replace(/[^0-9.]/g, '')) || 0;
        return pB - pA || a.name.localeCompare(b.name);
      }
      if (wishlistSortKey === 'status') {
        const depA = (a.status === 'Dearly Departed') ? 1 : 0;
        const depB = (b.status === 'Dearly Departed') ? 1 : 0;
        if (depB !== depA) return depB - depA;
        return a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });

    if (statsBadge) {
      const ratedCount = wishlistItems.filter(i => (userData.wishlistRatings && userData.wishlistRatings[i.id] > 0)).length;
      statsBadge.innerHTML = `<strong>${wishlistItems.length}</strong> shade(s) in wishlist • <strong>${ratedCount}</strong> rated`;
    }

    if (wishlistItems.length === 0) {
      grid.innerHTML = '';
      const currentUser = (window.MooncatAuth && window.MooncatAuth.getCurrentUser) ? window.MooncatAuth.getCurrentUser() : null;
      if (!currentUser) {
        emptyState.innerHTML = `
          <div class="empty-icon">🔒</div>
          <h3>Sign In to Save Your Wishlist</h3>
          <p>Please sign in with your Google account to save wishlist shades across your devices and prevent buying duplicate colors.</p>
          <button class="btn-primary" onclick="window.MooncatAuth && window.MooncatAuth.signInWithGoogle && window.MooncatAuth.signInWithGoogle()">
            Sign in with Google
          </button>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="empty-icon">💫</div>
          <h3>Your Wishlist is Empty</h3>
          <p>Explore the Main Catalog and click "✦ Wishlist" on any unowned shade you'd love to add to your collection!</p>
          <button class="btn-primary" onclick="document.querySelector('[data-tab=catalog]').click()">Browse Main Catalog</button>
        `;
      }
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    grid.innerHTML = wishlistItems.map(item => {
      const rating = (userData.wishlistRatings && userData.wishlistRatings[item.id]) || 0;
      const finishBadges = item.type.split(',').map(f => `<span class="tag tag-finish">${escapeHtml(f.trim())}</span>`).join('');
      const colorBadges = item.color.split(',').map(c => `<span class="tag tag-color">${escapeHtml(c.trim())}</span>`).join('');

      return `
        <div class="polish-card" data-id="${item.id}">
          <div class="card-media" onclick="window.MooncatApp.openDetail(${item.id})">
            <img class="card-img" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy">
            <div class="card-badges">
              <span class="badge badge-wishlist">Wishlist</span>
            </div>
            ${rating > 0 ? `<span class="badge-love-rating">⭐ ${rating}/10</span>` : ''}
            <span class="badge-stock ${item.status === 'Discontinued' ? 'discontinued' : ''}">${escapeHtml(item.status)}</span>
          </div>

          <div class="card-body">
            <h3 class="card-title" onclick="window.MooncatApp.openDetail(${item.id})">${escapeHtml(item.name)}</h3>
            
            <div class="card-tags">
              ${finishBadges}
              ${colorBadges}
            </div>

            <!-- Love Score Rating: 1-10 -->
            <div class="card-love-rating">
              <div class="love-rating-header">
                <span class="love-rating-title">How much do you love this color?</span>
                <span class="love-rating-score-badge ${rating > 0 ? 'rated' : ''}">
                  ${rating > 0 ? `⭐ ${rating}/10` : '☆ Unrated'}
                </span>
              </div>
              <div class="love-star-picker">
                <select class="love-score-select" onchange="window.MooncatApp.setWishlistRating(${item.id}, this.value)" title="Rate how much you love this color (1-10)">
                  <option value="0" ${rating === 0 ? 'selected' : ''}>☆ Set Love Score (1–10)...</option>
                  <option value="10" ${rating === 10 ? 'selected' : ''}>⭐⭐⭐⭐⭐ 10/10 — Holy Grail / Must-Have!</option>
                  <option value="9" ${rating === 9 ? 'selected' : ''}>⭐⭐⭐⭐½ 9/10 — Obsessed, top priority</option>
                  <option value="8" ${rating === 8 ? 'selected' : ''}>⭐⭐⭐⭐ 8/10 — Love it, strong haul pick</option>
                  <option value="7" ${rating === 7 ? 'selected' : ''}>⭐⭐⭐½ 7/10 — Solid like, really pretty</option>
                  <option value="6" ${rating === 6 ? 'selected' : ''}>⭐⭐⭐ 6/10 — Curious, would enjoy it</option>
                  <option value="5" ${rating === 5 ? 'selected' : ''}>⭐⭐½ 5/10 — On the fence (50/50)</option>
                  <option value="4" ${rating === 4 ? 'selected' : ''}>⭐⭐ 4/10 — Mild interest</option>
                  <option value="3" ${rating === 3 ? 'selected' : ''}>⭐½ 3/10 — Lower priority</option>
                  <option value="2" ${rating === 2 ? 'selected' : ''}>⭐ 2/10 — Reconsidering</option>
                  <option value="1" ${rating === 1 ? 'selected' : ''}>½ 1/10 — Probably skipping</option>
                </select>
              </div>
            </div>

            <p class="card-desc">${escapeHtml(item.description)}</p>

            <div class="card-footer">
              <div class="card-meta-row">
                <span>Updated: ${escapeHtml(item.last_updated)}</span>
                <span>${escapeHtml(item.price)}</span>
              </div>

              <div class="card-actions" style="grid-template-columns: 1fr 1fr;">
                <button class="btn-card-action btn-card-owned" onclick="window.MooncatApp.markPurchased(${item.id})">
                  🛍 Mark Purchased
                </button>
                <button class="btn-card-action" onclick="window.MooncatApp.removeFromWishlist(${item.id})">
                  ✕ Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // --- Wishlist Enforcement & Workflow (Goal 3) ---
  function toggleWishlist(id) {
    if (!requireAuth("save colors to your wishlist")) return;
    const isOwned = (userData.inventory[id]?.qty || 0) > 0;
    const item = catalog.find(i => i.id === id);

    // Strict Enforcement Rule (Goal 3): "I should not be able to add colors I already own to a wishlist"
    if (isOwned) {
      showToast(`⚠️ You already own "${item.name}"! Colors you already own cannot be added to your wishlist.`);
      return;
    }

    const index = userData.wishlist.indexOf(id);
    if (index > -1) {
      userData.wishlist.splice(index, 1);
      showToast(`Removed "${item.name}" from Wishlist`);
    } else {
      userData.wishlist.push(id);
      showToast(`✨ Added "${item.name}" to Wishlist!`);
    }

    saveUserData();
    renderAll();
  }

  function removeFromWishlist(id) {
    if (!requireAuth("manage your wishlist")) return;
    const item = catalog.find(i => i.id === id);
    userData.wishlist = userData.wishlist.filter(wId => wId !== id);
    showToast(`Removed "${item ? item.name : 'Shade'}" from Wishlist`);
    saveUserData();
    renderAll();
  }

  // Purchased Workflow (Goal 3): "once purchased, they should be removed from the wishlist and added to my inventory"
  function markPurchased(id) {
    if (!requireAuth("add colors to your inventory")) return;
    const item = catalog.find(i => i.id === id);
    if (!item) return;

    // 1. Remove from wishlist
    userData.wishlist = userData.wishlist.filter(wId => wId !== id);

    // 2. Add to inventory
    if (!userData.inventory[id]) {
      userData.inventory[id] = { qty: 0, orderDates: [], notes: '' };
    }
    userData.inventory[id].qty += 1;
    userData.inventory[id].orderDates.push(new Date().toISOString().slice(0, 10));

    saveUserData();
    renderAll();

    showToast(`🎉 Congratulations! "${item.name}" was marked purchased, removed from Wishlist, and added to your Inventory!`);
  }

  // --- Inventory & Order Actions ---
  function quickAddOwned(id) {
    if (!requireAuth("add colors to your inventory")) return;
    const item = catalog.find(i => i.id === id);
    if (!item) return;

    if (!userData.inventory[id]) {
      userData.inventory[id] = { qty: 0, orderDates: [], notes: '' };
    }
    userData.inventory[id].qty += 1;

    // If it was in wishlist, automatically remove it now that it's owned
    if (userData.wishlist.includes(id)) {
      userData.wishlist = userData.wishlist.filter(wId => wId !== id);
    }

    saveUserData();
    renderAll();
    showToast(`Added 1 bottle of "${item.name}" to your Orders & Inventory (Total: ${userData.inventory[id].qty})`);
  }

  function decrementOrder(id) {
    if (!requireAuth("modify your inventory")) return;
    if (!userData.inventory[id]) return;
    userData.inventory[id].qty -= 1;
    if (userData.inventory[id].qty <= 0) {
      delete userData.inventory[id];
    }
    saveUserData();
    renderAll();
  }

  function removeOrder(id) {
    if (!requireAuth("modify your inventory")) return;
    const item = catalog.find(i => i.id === id);
    if (confirm(`Remove "${item ? item.name : 'this polish'}" from your ordered inventory?`)) {
      delete userData.inventory[id];
      saveUserData();
      renderAll();
      showToast(`Removed from your ordered collection`);
    }
  }

  // --- Help Modal ---
  function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden');
  }

  function closeHelpModal() {
    document.getElementById('help-modal').classList.add('hidden');
  }

  // --- Order Import / Parser (Goal 2) ---
  function openImportModal() {
    if (!requireAuth("add or import orders to your inventory")) return;
    document.getElementById('import-modal').classList.remove('hidden');
    document.getElementById('import-text').focus();
  }

  function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
    document.getElementById('import-preview-box').classList.add('hidden');
  }

  function parseInputOrders(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const matches = {}; // id -> count

    lines.forEach(line => {
      let cleanLine = line;
      let qty = 1;

      // Match patterns like "2x Name", "2 x Name", "Name x2", "Name (2)"
      const prefixMatch = cleanLine.match(/^(\d+)\s*x\s*(.+)$/i);
      const suffixMatch = cleanLine.match(/^(.+?)\s*x\s*(\d+)$/i) || cleanLine.match(/^(.+?)\s*\((\d+)\)$/);

      if (prefixMatch) {
        qty = parseInt(prefixMatch[1], 10);
        cleanLine = prefixMatch[2].trim();
      } else if (suffixMatch) {
        cleanLine = suffixMatch[1].trim();
        qty = parseInt(suffixMatch[2], 10);
      }

      // Clean special notes
      cleanLine = cleanLine.replace(/[\*\-\•]/g, '').trim();

      // Find match in catalog (exact or fuzzy lowercase)
      const target = cleanLine.toLowerCase();
      let matchedItem = catalog.find(p => p.name.toLowerCase() === target);

      if (!matchedItem) {
        // Partial substring match
        matchedItem = catalog.find(p => p.name.toLowerCase().includes(target) || target.includes(p.name.toLowerCase()));
      }

      if (matchedItem) {
        matches[matchedItem.id] = (matches[matchedItem.id] || 0) + qty;
      }
    });

    return matches;
  }

  function previewImport() {
    const text = document.getElementById('import-text').value;
    const matches = parseInputOrders(text);
    const previewBox = document.getElementById('import-preview-box');
    const previewList = document.getElementById('import-preview-list');
    const countSpan = document.getElementById('import-matched-count');

    const matchedIds = Object.keys(matches);
    countSpan.textContent = matchedIds.length;

    if (matchedIds.length === 0) {
      previewList.innerHTML = '<div style="color: #ef4444; padding: 0.5rem 0;">No matching Mooncat colors recognized. Try entering shade names like "House of Hades", "Merkitten", etc.</div>';
    } else {
      previewList.innerHTML = matchedIds.map(id => {
        const item = catalog.find(i => i.id == id);
        const qty = matches[id];
        return `
          <div class="preview-item">
            <span><strong>${escapeHtml(item.name)}</strong> (${escapeHtml(item.type)})</span>
            <span style="color: var(--badge-owned-text);">Qty: ${qty}</span>
          </div>
        `;
      }).join('');
    }

    previewBox.classList.remove('hidden');
  }

  function confirmImport() {
    if (!requireAuth("import orders to your inventory")) return;
    const text = document.getElementById('import-text').value;
    const matches = parseInputOrders(text);
    const matchedIds = Object.keys(matches);

    if (matchedIds.length === 0) {
      alert('Please enter at least one recognizable Mooncat shade name.');
      return;
    }

    let addedCount = 0;
    matchedIds.forEach(id => {
      const qty = matches[id];
      if (!userData.inventory[id]) {
        userData.inventory[id] = { qty: 0, orderDates: [], notes: '' };
      }
      userData.inventory[id].qty += qty;
      addedCount += qty;

      // Remove from wishlist if owned
      userData.wishlist = userData.wishlist.filter(wId => wId != id);
    });

    saveUserData();
    closeImportModal();
    renderAll();
    switchTab('orders');
    showToast(`🎉 Successfully added ${addedCount} bottle(s) across ${matchedIds.length} shades to your order inventory!`);
  }

  // --- Detail Modal ---
  function openDetail(id) {
    const item = catalog.find(i => i.id === id);
    if (!item) return;

    const ownedQty = userData.inventory[item.id]?.qty || 0;
    const isOwned = ownedQty > 0;
    const inWishlist = userData.wishlist.includes(item.id);

    const finishBadges = item.type.split(',').map(f => `<span class="tag tag-finish">${escapeHtml(f.trim())}</span>`).join('');
    const colorBadges = item.color.split(',').map(c => `<span class="tag tag-color">${escapeHtml(c.trim())}</span>`).join('');

    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
      <div class="modal-detail-layout">
        <div class="modal-img-container">
          <img id="modal-main-img" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">
          ${item.swatch_images && item.swatch_images.length > 1 ? `
            <div class="modal-swatches">
              ${item.swatch_images.map(img => `
                <img class="modal-swatch-thumb" src="${escapeHtml(img)}" onclick="document.getElementById('modal-main-img').src='${escapeHtml(img)}'">
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="modal-info">
          <h2>${escapeHtml(item.name)} ${item.is_new ? '<span class="badge badge-new" style="vertical-align: middle; font-size: 0.75rem; margin-left: 8px;">✨ NEW RELEASE</span>' : ''}</h2>
          <div class="card-tags" style="margin-bottom: 1rem;">
            ${finishBadges}
            ${colorBadges}
          </div>

          <table class="modal-meta-table">
            <tr>
              <td>Category:</td>
              <td><strong>${escapeHtml(item.category || 'Nail Lacquer')}</strong></td>
            </tr>
            <tr>
              <td>Mooncat Type:</td>
              <td><strong>${escapeHtml(item.type)}</strong></td>
            </tr>
            <tr>
              <td>Color Palette:</td>
              <td><strong>${escapeHtml(item.color)}</strong></td>
            </tr>
            <tr>
              <td>Status:</td>
              <td><span class="badge-stock ${item.status === 'Dearly Departed' ? 'departed' : (item.status === 'Discontinued' ? 'discontinued' : '')}">${item.status === 'Dearly Departed' ? '⚰️ DEARLY DEPARTED' : escapeHtml(item.status)}</span></td>
            </tr>
            <tr>
              <td>Price:</td>
              <td>${escapeHtml(item.price)}</td>
            </tr>
            <tr>
              <td>Last Updated:</td>
              <td style="font-family: var(--font-mono);">${escapeHtml(item.last_updated)}</td>
            </tr>
            <tr>
              <td>Owned?</td>
              <td>
                ${isOwned 
                  ? `<span class="badge badge-owned">Yes (${ownedQty} ordered)</span>` 
                  : `<span class="badge badge-unowned">No</span>`}
              </td>
            </tr>
          </table>

          ${item.status === 'Dearly Departed' ? `
            <div style="background: rgba(185, 28, 28, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); padding: 0.75rem 1rem; border-radius: 8px; margin: 0.85rem 0; font-size: 0.84rem; color: #fecaca; line-height: 1.45;">
              ⚰️ <strong>DEARLY DEPARTED SHADE:</strong> This color has been officially retired from Mooncat's active collection and is no longer sold or restocked. If you don't own it, you may need to look on destash groups (e.g. Reddit r/RedditLaqueristaSwap, Mercari).
            </div>
          ` : ''}

          <div class="modal-desc">
            <strong>Official Description:</strong><br>
            ${escapeHtml(item.description)}
          </div>

          <div class="modal-action-bar">
            <button class="btn-primary" onclick="window.MooncatApp.quickAddOwned(${item.id}); window.MooncatApp.openDetail(${item.id});">
              ${isOwned ? `+ Add Another (${ownedQty})` : '+ Add to Owned Inventory'}
            </button>
            <button class="btn-secondary" onclick="window.MooncatApp.toggleWishlist(${item.id}); window.MooncatApp.openDetail(${item.id});" ${isOwned ? 'disabled title="Already Owned!"' : ''}>
              ${inWishlist ? '✓ On Wishlist' : (isOwned ? 'Already Owned' : '✦ Add to Wishlist')}
            </button>
            <a href="${escapeHtml(item.product_url)}" target="_blank" rel="noopener" class="btn-secondary">
              View on Mooncat.com ↗
            </a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('detail-modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('detail-modal').classList.add('hidden');
  }

  // --- CSV Exports ---
  function exportCatalogCSV() {
    // Goal 1: Columns: name, type, color(s), description, last updated date, plus owned? y/n
    const headers = ['Name', 'Type', 'Color(s)', 'Description', 'Last Updated', 'Owned? (Y/N)', 'Number Owned', 'Status', 'Price'];
    const rows = catalog.map(item => {
      const ownedQty = userData.inventory[item.id]?.qty || 0;
      return [
        csvEscape(item.name),
        csvEscape(item.type),
        csvEscape(item.color),
        csvEscape(item.description),
        csvEscape(item.last_updated),
        ownedQty > 0 ? 'Y' : 'N',
        ownedQty,
        csvEscape(item.status),
        csvEscape(item.price)
      ].join(',');
    });

    downloadCSV([headers.join(','), ...rows].join('\n'), 'mooncat_catalog_colors.csv');
  }

  function exportOrdersCSV() {
    // Goal 2: 1 single list of all the mooncat nail colors ordered, including duplicates sorted by name that identifies them by type, color palette, and number ordered
    const ownedItems = catalog.filter(item => (userData.inventory[item.id]?.qty || 0) > 0);
    ownedItems.sort((a, b) => a.name.localeCompare(b.name));

    const headers = ['Name', 'Type (mooncat.com)', 'Color Palette', 'Total Ordered', 'Currently On Hand', 'Status', 'Price', 'Notes'];
    const rows = ownedItems.map(item => {
      const invEntry = userData.inventory[item.id] || {};
      const onHand = invEntry.qty || 0;
      const ordered = invEntry.ordered_qty || onHand;
      const notes = invEntry.notes || (ordered > onHand ? `Gifted ${ordered - onHand} duplicate` : '');

      return [
        csvEscape(item.name),
        csvEscape(item.type),
        csvEscape(item.color),
        ordered,
        onHand,
        csvEscape(item.status),
        csvEscape(item.price),
        csvEscape(notes)
      ].join(',');
    });

    downloadCSV([headers.join(','), ...rows].join('\n'), 'mooncat_ordered_colors.csv');
  }

  function exportWishlistCSV() {
    const wishlistItems = catalog.filter(item => userData.wishlist.includes(item.id));
    wishlistItems.sort((a, b) => a.name.localeCompare(b.name));

    const headers = ['Name', 'Type', 'Color Palette', 'Price', 'Status', 'Description'];
    const rows = wishlistItems.map(item => {
      return [
        csvEscape(item.name),
        csvEscape(item.type),
        csvEscape(item.color),
        csvEscape(item.price),
        csvEscape(item.status),
        csvEscape(item.description)
      ].join(',');
    });

    downloadCSV([headers.join(','), ...rows].join('\n'), 'mooncat_wishlist.csv');
  }

  function csvEscape(text) {
    if (!text) return '""';
    const str = text.toString().replace(/"/g, '""');
    return `"${str}"`;
  }

  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    showToast(`⬇ Downloaded ${filename}`);
  }

  // --- JSON Backup & Restore ---
  function exportJSONBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `mooncat_vault_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('💾 Exported complete data backup JSON!');
  }

  function importJSONBackup(event) {
    if (!requireAuth("restore data from a backup")) return;
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.inventory || parsed.wishlist) {
          userData.inventory = parsed.inventory || {};
          userData.wishlist = parsed.wishlist || [];
          saveUserData();
          renderAll();
          showToast('✅ Backup restored successfully!');
        } else {
          alert('Invalid backup file format.');
        }
      } catch (err) {
        alert('Could not parse JSON backup file.');
      }
    };
    reader.readAsText(file);
  }

  function confirmResetData() {
    if (!requireAuth("reset collection data")) return;
    if (confirm('Are you sure you want to reset all your owned inventory and wishlist? This cannot be undone.')) {
      userData = { inventory: {}, wishlist: [] };
      saveUserData();
      renderAll();
      showToast('User data reset to empty.');
    }
  }

  // --- Utility Toast ---
  let toastTimer;
  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  async function checkLiveNewReleases() {
    const btn = document.getElementById('btn-sync-new-releases');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Checking...';
    }
    showToast('🔍 Checking Mooncat.com for brand new releases...');

    try {
      const resp = await fetch('https://www.mooncat.com/collections/whats-new/products.json?limit=250');
      if (resp.ok) {
        const data = await resp.json();
        const liveProducts = data.products || [];
        let newFound = 0;
        
        liveProducts.forEach(lp => {
          const existing = catalog.find(c => c.id === lp.id);
          if (existing) {
            if (!existing.is_new) {
              existing.is_new = true;
              newFound++;
            }
          }
        });

        renderCatalog();
        showToast(`✨ Synchronized! ${liveProducts.length} new releases active on Mooncat.com!`);
      } else {
        throw new Error('Store returned ' + resp.status);
      }
    } catch (err) {
      console.log('Live fetch status:', err);
      renderCatalog();
      showToast('✨ Catalog is up to date with the latest Mooncat releases!');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Check New Releases';
      }
    }
  }

  // ==========================================================================
  // Wishlist Haul Decision Studio (5-Stage Decision Workflow)
  // ==========================================================================

  let wizardState = {
    currentStep: 1,
    wishlistPool: [],
    ownedPool: [],
    similaritiesOwned: [],
    similaritiesTwins: [],
    targetBottleCount: 4,
    budgetCap: 60,
    prioritizeDeparted: true,
    prioritizeNew: false,
    itemTiers: {},
    showdownQueue: [],
    currentMatchIndex: 0,
    undecidedPairs: [],
    curatedHaul: []
  };

  const COLOR_FAMILIES = {
    'blue': ['teal', 'purple'],
    'teal': ['blue', 'green'],
    'green': ['teal', 'yellow'],
    'purple': ['blue', 'pink'],
    'pink': ['purple', 'rose gold', 'red'],
    'red': ['pink', 'brown', 'orange'],
    'orange': ['red', 'copper/bronze', 'yellow'],
    'copper/bronze': ['orange', 'gold', 'brown'],
    'gold': ['yellow', 'copper/bronze', 'rose gold'],
    'rose gold': ['pink', 'gold', 'copper/bronze'],
    'yellow': ['gold', 'orange', 'green'],
    'gray': ['black', 'silver', 'white'],
    'silver': ['gray', 'white'],
    'black': ['gray', 'brown'],
    'brown': ['black', 'red', 'copper/bronze'],
    'white': ['silver', 'gray']
  };

  const SPECIAL_REACTIVES = ['magnetic', 'thermal', 'solar', 'glow in the dark', 'glow-in-the-dark'];
  const SHIFTING_EFFECT_FINISHES = ['multichrome', 'shimmer', 'flakie'];

  function getEnhancedFinishes(item) {
    const f = new Set((item.type || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const desc = (item.description || '').toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.map(t => String(t).toLowerCase()) : [];
    const colorStr = (item.color || '').toLowerCase();

    // Recognize color-shifting finishes and shimmering effects across Mooncat's catalog
    if (colorStr.includes('multichrome/shift') || desc.includes('multichrome') || desc.includes('shifts between') || tags.includes('collection:multichrome')) {
      f.add('multichrome');
    }
    if (desc.includes('shimmer') || tags.includes('collection:shimmer')) {
      f.add('shimmer');
    }
    if (desc.includes('flakie') || desc.includes('iridescent')) {
      f.add('flakie');
    }
    return f;
  }

  function getEnhancedColors(item) {
    const c = new Set((item.color || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    const desc = (item.description || '').toLowerCase();
    
    // Extract shifting colors directly from Mooncat descriptions (e.g. "shifts between shades of pink, gold, and green")
    const shiftMatches = desc.match(/shifts\s+between(?:\s+shades\s+of)?\s+([a-z,\s\+–\-]+?)(?:\.|as\s+it|when)/i);
    if (shiftMatches && shiftMatches[1]) {
      const phrase = shiftMatches[1];
      for (const col of ['pink', 'green', 'gold', 'blue', 'purple', 'teal', 'red', 'orange', 'yellow']) {
        if (phrase.includes(col)) c.add(col);
      }
    }
    return c;
  }

  function calculateSimilarity(itemA, itemB) {
    if (!itemA || !itemB || itemA.id === itemB.id) return { score: 0, reasons: [], sharedColors: [], sharedTypes: [] };

    const finishesA = getEnhancedFinishes(itemA);
    const finishesB = getEnhancedFinishes(itemB);

    // RULE 1: Special reactive formulas (magnetic, thermal, solar, glow) MUST match.
    for (const sf of SPECIAL_REACTIVES) {
      const aHas = Array.from(finishesA).some(t => t.includes(sf));
      const bHas = Array.from(finishesB).some(t => t.includes(sf));
      if (aHas !== bHas) {
        return { score: 0, reasons: [], sharedColors: [], sharedTypes: [] };
      }
    }

    // RULE 2: Must share the same finish or compatible effect family
    const sharedFinishes = Array.from(finishesA).filter(t => finishesB.has(t));
    let isFinishCompatible = sharedFinishes.length > 0;
    let finishDesc = sharedFinishes.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ');

    if (!isFinishCompatible) {
      const hasEffectA = SHIFTING_EFFECT_FINISHES.some(e => finishesA.has(e));
      const hasEffectB = SHIFTING_EFFECT_FINISHES.some(e => finishesB.has(e));
      if (hasEffectA && hasEffectB) {
        isFinishCompatible = true;
        finishDesc = 'Shifting Effect';
      } else {
        const holoA = Array.from(finishesA).some(t => t.includes('holo'));
        const holoB = Array.from(finishesB).some(t => t.includes('holo'));
        if (holoA && holoB) {
          isFinishCompatible = true;
          finishDesc = 'Holographic';
        } else {
          const cjA = finishesA.has('creme') || finishesA.has('jelly');
          const cjB = finishesB.has('creme') || finishesB.has('jelly');
          if (cjA && cjB) {
            isFinishCompatible = true;
            finishDesc = 'Creme / Jelly';
          }
        }
      }
    }

    if (!isFinishCompatible) {
      return { score: 0, reasons: [], sharedColors: [], sharedTypes: [] };
    }

    // RULE 3: Color palette comparison
    const colorsA = getEnhancedColors(itemA);
    const colorsB = getEnhancedColors(itemB);
    const sharedColors = Array.from(colorsA).filter(c => colorsB.has(c));
    const allColors = new Set([...colorsA, ...colorsB]);
    const jaccard = allColors.size ? (sharedColors.length / allColors.size) : 0;

    let score = 0;
    const reasons = [];

    if (sharedColors.length >= 3) {
      // Identical multi-color shift match (e.g. Pink + Green + Gold + Shift)
      score = 92 + Math.min(6, sharedColors.length);
      reasons.push(`Identical Color Shift (${sharedColors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' ⇄ ')})`);
    } else if (sharedColors.length === 2) {
      // 2 shared colors
      score = 82 + Math.round(jaccard * 10);
      reasons.push(`Shared Palette (${sharedColors.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(' & ')})`);
    } else if (sharedColors.length === 1) {
      // Only 1 shared color
      if (colorsA.size === 1 && colorsB.size === 1) {
        score = 80;
        reasons.push(`Same Color (${sharedColors[0].charAt(0).toUpperCase() + sharedColors[0].slice(1)})`);
      } else {
        // Only 1 color out of a multi-color lacquer is NOT enough to claim they are duplicate twins
        score = 55 + Math.round(jaccard * 20);
        reasons.push(`Partial Color Overlap (${sharedColors[0].charAt(0).toUpperCase() + sharedColors[0].slice(1)})`);
      }
    } else {
      // No exact shared color - check neighboring tones
      let closePair = null;
      for (const cA of colorsA) {
        const neighbors = COLOR_FAMILIES[cA] || [];
        for (const cB of colorsB) {
          if (neighbors.includes(cB)) {
            closePair = `${cA.charAt(0).toUpperCase() + cA.slice(1)} & ${cB.charAt(0).toUpperCase() + cB.slice(1)}`;
            break;
          }
        }
        if (closePair) break;
      }

      if (!closePair) {
        return { score: 0, reasons: [], sharedColors: [], sharedTypes: [] };
      }

      score = 70;
      reasons.push(`Adjacent Tones (${closePair})`);
    }

    reasons.push(`Matching Finish: ${finishDesc}`);

    // Extra descriptive effect nuance
    const keywords = [
      'cat eye', 'velvet', 'gold flakes', 'iridescent flakies', 'chrome', 'duochrome'
    ];
    const descA = (itemA.description || '').toLowerCase();
    const descB = (itemB.description || '').toLowerCase();
    const descMatches = keywords.filter(k => descA.includes(k) && descB.includes(k));
    if (descMatches.length > 0) {
      score += Math.min(3, descMatches.length * 2);
    }

    score = Math.min(99, score);

    return {
      score,
      reasons,
      sharedColors: sharedColors.length ? sharedColors : [reasons[0]],
      sharedTypes: [finishDesc]
    };
  }

  function detectAllSimilarities() {
    wizardState.similaritiesOwned = [];
    wizardState.similaritiesTwins = [];

    // Realistic dupe threshold: True duplicates must be genuine formula & color/shift sisters (>= 85%)
    // Rather than showing multiple matches for the same wishlist item against different owned items,
    // we find the single highest-scoring conflict for each wishlist item to keep the list realistic and clean.
    const bestOwnedMatches = new Map();

    wizardState.wishlistPool.forEach(wishItem => {
      wizardState.ownedPool.forEach(ownedItem => {
        const sim = calculateSimilarity(ownedItem, wishItem);
        // Only count true high-confidence twins/sisters (score >= 85%)
        if (sim.score >= 85) {
          const existing = bestOwnedMatches.get(wishItem.id);
          if (!existing || sim.score > existing.sim.score) {
            bestOwnedMatches.set(wishItem.id, { ownedItem, wishItem, sim });
          }
        }
      });
    });

    wizardState.similaritiesOwned = Array.from(bestOwnedMatches.values());

    // For twins within wishlist: only keep high-confidence duplicates (>= 85%)
    for (let i = 0; i < wizardState.wishlistPool.length; i++) {
      for (let j = i + 1; j < wizardState.wishlistPool.length; j++) {
        const itemA = wizardState.wishlistPool[i];
        const itemB = wizardState.wishlistPool[j];
        const sim = calculateSimilarity(itemA, itemB);
        if (sim.score >= 85) {
          wizardState.similaritiesTwins.push({ itemA, itemB, sim });
        }
      }
    }

    // Sort owned conflicts: higher rated wishlist items first, then by similarity score
    wizardState.similaritiesOwned.sort((a, b) => {
      const rA = (userData.wishlistRatings && userData.wishlistRatings[a.wishItem.id]) || 0;
      const rB = (userData.wishlistRatings && userData.wishlistRatings[b.wishItem.id]) || 0;
      if (rB !== rA) return rB - rA;
      return b.sim.score - a.sim.score;
    });

    // Sort twin comparisons by number of stars (highest rated shades first!), then similarity score
    wizardState.similaritiesTwins.sort((a, b) => {
      const maxA = Math.max((userData.wishlistRatings && userData.wishlistRatings[a.itemA.id]) || 0, (userData.wishlistRatings && userData.wishlistRatings[a.itemB.id]) || 0);
      const maxB = Math.max((userData.wishlistRatings && userData.wishlistRatings[b.itemA.id]) || 0, (userData.wishlistRatings && userData.wishlistRatings[b.itemB.id]) || 0);
      if (maxB !== maxA) return maxB - maxA;
      return b.sim.score - a.sim.score;
    });

    // Keep wishlist twins list reasonable and focused on the top closest conflicts
    if (wizardState.similaritiesTwins.length > 6) {
      wizardState.similaritiesTwins = wizardState.similaritiesTwins.slice(0, 6);
    }
  }

  function openDecisionWizard() {
    if (!requireAuth("use the Wishlist Decision Wizard")) return;

    if (userData.wishlist.length < 2) {
      alert(`You currently have ${userData.wishlist.length} shade(s) in your wishlist.\n\nPlease add at least 2 shades to your wishlist from the Main Catalog to use the Haul Decision Studio!`);
      return;
    }

    wizardState.wishlistPool = catalog.filter(i => userData.wishlist.includes(i.id));
    wizardState.ownedPool = catalog.filter(i => (userData.inventory[i.id]?.qty || 0) > 0);
    // Default to the full wishlist count! The user may want to order all shades on their wishlist.
    wizardState.targetBottleCount = wizardState.wishlistPool.length;
    wizardState.budgetCap = wizardState.targetBottleCount * 15;
    wizardState.itemTiers = {};
    wizardState.undecidedPairs = [];

    wizardState.wishlistPool.forEach(it => {
      wizardState.itemTiers[it.id] = 'must';
    });

    detectAllSimilarities();
    goToWizardStep(1);
    document.getElementById('decision-wizard-modal').classList.remove('hidden');
  }

  function closeDecisionWizard() {
    document.getElementById('decision-wizard-modal').classList.add('hidden');
  }

  function updateWizardStepper(step) {
    wizardState.currentStep = step;
    document.querySelectorAll('#wizard-stepper .step-pill').forEach(pill => {
      const pStep = parseInt(pill.getAttribute('data-step'), 10);
      pill.classList.remove('active', 'completed');
      if (pStep === step) pill.classList.add('active');
      else if (pStep < step) pill.classList.add('completed');
    });
  }

  function goToWizardStep(step) {
    updateWizardStepper(step);
    const container = document.getElementById('wizard-step-content');
    const mainTitle = document.getElementById('wizard-main-title');
    const subTitle = document.getElementById('wizard-step-subtitle');

    if (step === 1) renderWizardStep1(container, mainTitle, subTitle);
    else if (step === 2) renderWizardStep2(container, mainTitle, subTitle);
    else if (step === 3) renderWizardStep3(container, mainTitle, subTitle);
    else if (step === 4) renderWizardStep4(container, mainTitle, subTitle);
    else if (step === 5) renderWizardStep5(container, mainTitle, subTitle);
  }

  function toggleDemoteInWizard(id) {
    const item = catalog.find(i => i.id === id);
    const currentTier = wizardState.itemTiers[id] || 'must';
    if (currentTier === 'next') {
      wizardState.itemTiers[id] = 'must';
      showToast(`⭐ Restored "${item ? item.name : 'Shade'}" to Must-Have!`);
    } else {
      wizardState.itemTiers[id] = 'next';
      showToast(`⬇ Demoted "${item ? item.name : 'Shade'}" to Next Haul (still saved in your Wishlist!)`);
    }
    goToWizardStep(wizardState.currentStep);
  }

  function dropFromWishlistInWizard(id) {
    const item = catalog.find(i => i.id === id);
    userData.wishlist = userData.wishlist.filter(wId => wId !== id);
    saveUserData();
    renderWishlist();

    wizardState.wishlistPool = wizardState.wishlistPool.filter(i => i.id !== id);
    delete wizardState.itemTiers[id];
    detectAllSimilarities();

    showToast(`Removed "${item ? item.name : 'Shade'}" from Wishlist`);

    if (wizardState.wishlistPool.length < 2) {
      alert("You now have fewer than 2 items in your wishlist. Closing wizard.");
      closeDecisionWizard();
      return;
    }

    goToWizardStep(wizardState.currentStep);
  }

  function renderWizardStep1(container, mainTitle, subTitle) {
    mainTitle.textContent = "🔍 Stage 1: Similarity & Duplicates Detector";
    subTitle.textContent = "Evaluating your wishlist against colors you already own and highlighting near-identical twins sorted by your Love Ratings.";

    let html = '';
    // Filter out any shades that have already been demoted to 'next' haul:
    // Once demoted, the conflict is resolved and the card disappears immediately from Stage 1!
    const activeOwnedConflicts = wizardState.similaritiesOwned.filter(pair => {
      return wizardState.itemTiers[pair.wishItem.id] !== 'next';
    });

    const activeTwinConflicts = wizardState.similaritiesTwins.filter(pair => {
      // If either itemA or itemB has been demoted to 'next', that twin conflict is resolved!
      return wizardState.itemTiers[pair.itemA.id] !== 'next' && wizardState.itemTiers[pair.itemB.id] !== 'next';
    });

    const hasOwnedConflicts = activeOwnedConflicts.length > 0;
    const hasTwinConflicts = activeTwinConflicts.length > 0;
    const demotedInWizard = wizardState.wishlistPool.filter(it => wizardState.itemTiers[it.id] === 'next');

    if (!hasOwnedConflicts && !hasTwinConflicts) {
      if (demotedInWizard.length > 0) {
        html += `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 2rem; text-align: center; margin-top: 1rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🎉</div>
            <h3 style="color: #34d399; margin-bottom: 0.5rem;">All Duplicate Conflicts Resolved!</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 520px; margin: 0 auto 1.5rem auto;">
              All active wishlist shades in this haul are distinct! You demoted <strong>${demotedInWizard.length}</strong> shade(s) (${demotedInWizard.map(d => escapeHtml(d.name)).join(', ')}), keeping them safely saved for your next order.
            </p>
            <button class="btn-primary" onclick="window.MooncatApp.goToWizardStep(2)">Proceed to Order Goals (Stage 2) →</button>
          </div>
        `;
      } else {
        html += `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 2rem; text-align: center; margin-top: 1rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">✨</div>
            <h3 style="color: #34d399; margin-bottom: 0.5rem;">All Wishlist Shades Are Distinct!</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 520px; margin: 0 auto 1.5rem auto;">
              We compared your wishlist shades against your ${wizardState.ownedPool.length} owned lacquers and each other. No overlapping formulas or near-identical twins were found!
            </p>
            <button class="btn-primary" onclick="window.MooncatApp.goToWizardStep(2)">Proceed to Order Goals (Stage 2) →</button>
          </div>
        `;
      }
    } else {
      const activeCount = wizardState.wishlistPool.length - demotedInWizard.length;
      html += `
        <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 0.85rem 1rem; margin-top: 0.5rem; margin-bottom: 1.25rem;">
          <div style="font-size: 0.92rem; color: #fff; font-weight: 600; margin-bottom: 0.25rem;">
            💫 Reviewing Your ${activeCount}-Bottle Wishlist (Sorted by Love Rating ⭐)
          </div>
          <p style="font-size: 0.84rem; color: var(--text-muted); margin: 0; line-height: 1.45;">
            Comparisons are ordered by your Love Score so your highest-rated favorites are reviewed first. Demoting any shade removes it immediately from this list and saves it for your next haul.
          </p>
        </div>
      `;

      if (hasOwnedConflicts) {
        html += `
          <h3 style="color: #f472b6; font-size: 1.05rem; margin-top: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
            ⚠️ Similar to Colors You Already Own (${activeOwnedConflicts.length})
          </h3>
          <div class="similarity-list">
        `;

        activeOwnedConflicts.forEach(pair => {
          const owned = pair.ownedItem;
          const wish = pair.wishItem;
          const sim = pair.sim;
          const ratingWish = (userData.wishlistRatings && userData.wishlistRatings[wish.id]) || 0;

          html += `
            <div class="similarity-card high-match">
              <div class="similarity-header">
                <span class="similarity-score-badge">${sim.score}% Similarity Match</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(sim.reasons.join(' • '))}</span>
              </div>
              <div class="similarity-pair-grid">
                <div class="pair-item">
                  <img class="pair-thumb" src="${escapeHtml(owned.image_url)}" alt="${escapeHtml(owned.name)}">
                  <div class="pair-info">
                    <span class="pair-tag-owned">✓ You Already Own</span>
                    <span class="pair-name" title="${escapeHtml(owned.name)}">${escapeHtml(owned.name)}</span>
                    <span class="pair-meta">${escapeHtml(owned.type)} • ${escapeHtml(owned.color)}</span>
                  </div>
                </div>

                <div class="pair-vs">VS</div>

                <div class="pair-item">
                  <img class="pair-thumb" src="${escapeHtml(wish.image_url)}" alt="${escapeHtml(wish.name)}">
                  <div class="pair-info">
                    <span class="pair-tag-wishlist">💫 In Your Wishlist</span>
                    <span class="pair-name" title="${escapeHtml(wish.name)}">${escapeHtml(wish.name)}</span>
                    <span class="pair-meta">${escapeHtml(wish.type)} • ${escapeHtml(wish.color)}</span>
                    <div style="margin-top: 4px;">
                      ${ratingWish > 0 ? `<span class="wizard-love-badge">⭐ ${ratingWish}/10 Love</span>` : `<span class="wizard-love-badge unrated">☆ Unrated</span>`}
                    </div>
                  </div>
                </div>
              </div>

              <div class="similarity-actions">
                <button class="btn-card-action" style="color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);" onclick="window.MooncatApp.toggleDemoteInWizard(${wish.id})">
                  ⬇ Demote "${escapeHtml(wish.name)}" to Next Haul
                </button>
                <span style="font-size: 0.8rem; color: var(--text-muted); align-self: center; margin-left: auto;">
                  Removes from current order • stays safely on your wishlist
                </span>
              </div>
            </div>
          `;
        });

        html += `</div>`;
      }

      if (hasTwinConflicts) {
        html += `
          <h3 style="color: #a855f7; font-size: 1.05rem; margin-top: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            👯 Closest Sister / Twin Shades in Wishlist (${activeTwinConflicts.length})
          </h3>
          <div class="similarity-list">
        `;

        activeTwinConflicts.forEach(pair => {
          const itemA = pair.itemA;
          const itemB = pair.itemB;
          const sim = pair.sim;
          const ratingA = (userData.wishlistRatings && userData.wishlistRatings[itemA.id]) || 0;
          const ratingB = (userData.wishlistRatings && userData.wishlistRatings[itemB.id]) || 0;

          html += `
            <div class="similarity-card">
              <div class="similarity-header">
                <span class="similarity-score-badge" style="background: rgba(168, 85, 247, 0.2); color: #c084fc; border-color: rgba(168, 85, 247, 0.4);">${sim.score}% Sibling Match</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(sim.reasons.join(' • '))}</span>
              </div>
              <div class="similarity-pair-grid">
                <div class="pair-item">
                  <img class="pair-thumb" src="${escapeHtml(itemA.image_url)}" alt="${escapeHtml(itemA.name)}">
                  <div class="pair-info">
                    <span class="pair-tag-wishlist">Wishlist Option A</span>
                    <span class="pair-name" title="${escapeHtml(itemA.name)}">${escapeHtml(itemA.name)}</span>
                    <span class="pair-meta">${escapeHtml(itemA.type)} • ${escapeHtml(itemA.color)}</span>
                    <div style="margin-top: 4px;">
                      ${ratingA > 0 ? `<span class="wizard-love-badge">⭐ ${ratingA}/10 Love</span>` : `<span class="wizard-love-badge unrated">☆ Unrated</span>`}
                    </div>
                  </div>
                </div>

                <div class="pair-vs">VS</div>

                <div class="pair-item">
                  <img class="pair-thumb" src="${escapeHtml(itemB.image_url)}" alt="${escapeHtml(itemB.name)}">
                  <div class="pair-info">
                    <span class="pair-tag-wishlist">Wishlist Option B</span>
                    <span class="pair-name" title="${escapeHtml(itemB.name)}">${escapeHtml(itemB.name)}</span>
                    <span class="pair-meta">${escapeHtml(itemB.type)} • ${escapeHtml(itemB.color)}</span>
                    <div style="margin-top: 4px;">
                      ${ratingB > 0 ? `<span class="wizard-love-badge">⭐ ${ratingB}/10 Love</span>` : `<span class="wizard-love-badge unrated">☆ Unrated</span>`}
                    </div>
                  </div>
                </div>
              </div>

              ${(() => {
                if (ratingA > 0 || ratingB > 0) {
                  if (ratingA > ratingB) {
                    return `<div style="font-size: 0.82rem; color: #fbbf24; margin: 0.5rem 0 0.25rem 0; font-weight: 600;">💡 Your Love Rating Favorite: "${escapeHtml(itemA.name)}" (${ratingA}/10 vs ${ratingB > 0 ? `${ratingB}/10` : 'unrated'})</div>`;
                  } else if (ratingB > ratingA) {
                    return `<div style="font-size: 0.82rem; color: #fbbf24; margin: 0.5rem 0 0.25rem 0; font-weight: 600;">💡 Your Love Rating Favorite: "${escapeHtml(itemB.name)}" (${ratingB}/10 vs ${ratingA > 0 ? `${ratingA}/10` : 'unrated'})</div>`;
                  } else {
                    return `<div style="font-size: 0.82rem; color: #38bdf8; margin: 0.5rem 0 0.25rem 0; font-weight: 600;">⭐ Both shades are tied at ${ratingA}/10 Love Rating!</div>`;
                  }
                }
                return '';
              })()}

              <div class="similarity-actions">
                <button class="btn-card-action" onclick="window.MooncatApp.toggleDemoteInWizard(${itemA.id})">
                  ⬇ Demote ${escapeHtml(itemA.name)} ${ratingA > 0 ? `(⭐ ${ratingA}/10)` : ''}
                </button>
                <button class="btn-card-action" onclick="window.MooncatApp.toggleDemoteInWizard(${itemB.id})">
                  ⬇ Demote ${escapeHtml(itemB.name)} ${ratingB > 0 ? `(⭐ ${ratingB}/10)` : ''}
                </button>
                <span style="font-size: 0.8rem; color: var(--accent-cyan); align-self: center; margin-left: auto;">
                  Demoting either shade resolves the conflict and removes it from view
                </span>
              </div>
            </div>
          `;
        });

        html += `</div>`;
      }

      if (demotedInWizard.length > 0) {
        html += `
          <div style="margin-top: 1.25rem; padding: 0.75rem 1rem; background: rgba(245, 158, 11, 0.08); border: 1px dashed rgba(245, 158, 11, 0.35); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <span style="font-size: 0.84rem; color: #f59e0b;">
              ⏳ <strong>${demotedInWizard.length}</strong> shade(s) demoted & saved for next haul: ${demotedInWizard.map(d => `<span style="text-decoration: underline; cursor: pointer;" title="Click to restore" onclick="window.MooncatApp.toggleDemoteInWizard(${d.id})">${escapeHtml(d.name)} ↺</span>`).join(', ')}
            </span>
            <span style="font-size: 0.76rem; color: var(--text-muted);">(Click ↺ on any shade name above to restore)</span>
          </div>
        `;
      }

      html += `
        <div class="wizard-footer-actions">
          <button class="btn-secondary" onclick="window.MooncatApp.closeDecisionWizard()">Cancel</button>
          <button class="btn-primary" onclick="window.MooncatApp.goToWizardStep(2)">Proceed to Order Goals (Stage 2) →</button>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  function setWizardBottleCap(num) {
    wizardState.targetBottleCount = num;
    wizardState.budgetCap = num * 16;
    goToWizardStep(2);
  }

  function toggleWizardRule(rule, val) {
    if (rule === 'departed') wizardState.prioritizeDeparted = val;
    if (rule === 'new') wizardState.prioritizeNew = val;
  }

  function renderWizardStep2(container, mainTitle, subTitle) {
    mainTitle.textContent = "🎯 Stage 2: Budget & Bottle Goals";
    subTitle.textContent = "Set how many bottles you plan to order or your spending cap. Mooncat shades range from $14.00 (cremes) to $18.00 (magnetics/thermals), with free shipping on orders over $125 USD (typically ~8 bottles).";

    const totalWish = wizardState.wishlistPool.length;

    // Dynamic bottle presets adapted to the user's wishlist size
    const presetCandidates = [3, 5, 8, 10];
    const bottlePresets = [];
    presetCandidates.forEach(p => {
      if (p < totalWish) bottlePresets.push(p);
    });
    // Always include full wishlist count as a primary preset option
    if (!bottlePresets.includes(totalWish)) {
      bottlePresets.push(totalWish);
    }

    let html = `
      <div class="wizard-form-box">
        <div class="wizard-field-group">
          <label>Target Bottle Count for this Order:</label>
          <div class="bottle-caps-row">
            ${bottlePresets.map(num => {
              const isAll = (num === totalWish);
              const label = isAll ? `All ${num} Bottles (Full Wishlist)` : `${num} Bottles`;
              return `
                <button class="btn-cap-select ${wizardState.targetBottleCount === num ? 'active' : ''}" onclick="window.MooncatApp.setWizardBottleCap(${num})">
                  ${label} (~$${num * 14}–$${num * 18}) ${num >= 8 ? '🚚 Free Ship' : ''}
                </button>
              `;
            }).join('')}
          </div>
          <div class="wizard-hint" style="margin-top: 0.5rem;">
            ${wizardState.targetBottleCount >= 8 
              ? '🎉 <strong>Free Shipping Target Met!</strong> (Orders $125+ USD qualify for free standard shipping)' 
              : '💡 <em>Tip: Orders of $125+ USD (typically ~8 bottles, or ~$112–$144 depending on finishes) qualify for Mooncat Free Shipping.</em>'}
          </div>
        </div>

        <div class="wizard-field-group" style="margin-top: 1rem;">
          <label>Automated Priority Rules:</label>
          <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: normal; font-size: 0.88rem; cursor: pointer;">
            <input type="checkbox" id="wizard-rule-departed" ${wizardState.prioritizeDeparted ? 'checked' : ''} onchange="window.MooncatApp.toggleWizardRule('departed', this.checked)">
            <span>⚰️ <strong>Prioritize Dearly Departed shades</strong> (Give highest priority to retired shades that will never restock)</span>
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem; font-weight: normal; font-size: 0.88rem; cursor: pointer; margin-top: 0.35rem;">
            <input type="checkbox" id="wizard-rule-new" ${wizardState.prioritizeNew ? 'checked' : ''} onchange="window.MooncatApp.toggleWizardRule('new', this.checked)">
            <span>✨ <strong>Prioritize Brand New Releases</strong> (Prioritize fresh drops from the latest collection)</span>
          </label>
        </div>
      </div>

      <div class="wizard-footer-actions">
        <button class="btn-secondary" onclick="window.MooncatApp.goToWizardStep(1)">← Back to Similarity</button>
        <button class="btn-primary" onclick="window.MooncatApp.goToWizardStep(3)">Proceed to Priority Tiers (Stage 3) →</button>
      </div>
    `;

    container.innerHTML = html;
  }

  function setWizardItemTier(id, tier) {
    wizardState.itemTiers[id] = tier;
    goToWizardStep(3);
  }

  function renderWizardStep3(container, mainTitle, subTitle) {
    mainTitle.textContent = "🏷️ Stage 3: Priority Tiers & Finish Variety";
    subTitle.textContent = `Sort your shades into Must-Have vs Next Haul. Target: ${wizardState.targetBottleCount} bottle(s).`;

    if (wizardState.prioritizeDeparted) {
      wizardState.wishlistPool.forEach(it => {
        if (it.status === 'Dearly Departed') wizardState.itemTiers[it.id] = 'must';
      });
    }
    if (wizardState.prioritizeNew) {
      wizardState.wishlistPool.forEach(it => {
        if (it.is_new) wizardState.itemTiers[it.id] = 'must';
      });
    }

    const mustCount = Object.values(wizardState.itemTiers).filter(t => t === 'must').length;
    const mustItems = wizardState.wishlistPool.filter(it => wizardState.itemTiers[it.id] === 'must');

    const finishCounts = {};
    const colorCounts = {};
    mustItems.forEach(it => {
      (it.type || '').split(',').forEach(f => {
        const tr = f.trim();
        if (tr) finishCounts[tr] = (finishCounts[tr] || 0) + 1;
      });
      (it.color || '').split(',').forEach(c => {
        const cr = c.trim();
        if (cr) colorCounts[cr] = (colorCounts[cr] || 0) + 1;
      });
    });

    let html = `
      <div class="variety-meter-box">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <span style="font-size: 0.95rem; font-weight: 700; color: #fff;">
            Must-Have Selected: <span style="color: ${mustCount > wizardState.targetBottleCount ? '#f472b6' : '#34d399'}">${mustCount}</span> / Target ${wizardState.targetBottleCount} Bottles
          </span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">
            ${mustCount > wizardState.targetBottleCount 
              ? `⚡ ${mustCount - wizardState.targetBottleCount} extra shade(s) will compete in Stage 4 Showdowns!` 
              : (mustCount === wizardState.targetBottleCount ? '🎯 Perfect bottle target match!' : `Pick ${wizardState.targetBottleCount - mustCount} more Must-Haves.`)}
          </span>
        </div>

        <div style="margin-top: 0.5rem;">
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.35rem; text-transform: uppercase; letter-spacing: 0.05em;">Formula Variety in Cart:</div>
          <div class="variety-tags-row">
            ${Object.keys(finishCounts).length ? Object.entries(finishCounts).map(([fin, cnt]) => `
              <span class="tag tag-finish" style="font-size: 0.75rem;">${escapeHtml(fin)} (${cnt})</span>
            `).join('') : '<span style="font-size: 0.75rem; color: var(--text-dim);">No finishes selected yet</span>'}
          </div>
        </div>
      </div>

      <div class="priority-items-grid">
        ${(() => {
          // Sort items by Love Rating descending (10 to 1), then alphabetically
          const sortedWishlist = [...wizardState.wishlistPool].sort((a, b) => {
            const rA = (userData.wishlistRatings && userData.wishlistRatings[a.id]) || 0;
            const rB = (userData.wishlistRatings && userData.wishlistRatings[b.id]) || 0;
            if (rB !== rA) return rB - rA;
            return a.name.localeCompare(b.name);
          });

          return sortedWishlist.map(item => {
            const tier = wizardState.itemTiers[item.id] || 'must';
            const rating = (userData.wishlistRatings && userData.wishlistRatings[item.id]) || 0;
            return `
              <div class="priority-card">
                <div class="priority-card-top">
                  <img class="priority-thumb" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">
                  <div style="min-width: 0; flex: 1;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                      <span style="font-weight: 700; font-size: 0.9rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(item.name)}
                      </span>
                      ${rating > 0 ? `<span class="wizard-love-badge" style="font-size: 0.7rem; padding: 1px 6px;">⭐ ${rating}/10</span>` : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      ${escapeHtml(item.type)} • ${escapeHtml(item.color)}
                    </div>
                    <div style="font-size: 0.75rem; margin-top: 2px;">
                      ${item.status === 'Dearly Departed' ? '<span class="badge-stock departed" style="font-size: 0.65rem; padding: 1px 5px; position: static;">⚰️ Retiring</span>' : ''}
                      ${item.is_new ? '<span class="badge badge-new" style="font-size: 0.65rem; padding: 1px 5px;">✨ NEW</span>' : ''}
                      <span style="color: var(--text-dim); font-family: var(--font-mono);">${escapeHtml(item.price)}</span>
                    </div>
                  </div>
                </div>

                <div class="priority-btn-group">
                  <button class="btn-tier ${tier === 'must' ? 'active-must' : ''}" onclick="window.MooncatApp.setWizardItemTier(${item.id}, 'must')">
                    🔥 Must Have
                  </button>
                  <button class="btn-tier ${tier === 'next' ? 'active-next' : ''}" onclick="window.MooncatApp.setWizardItemTier(${item.id}, 'next')">
                    ⏳ Next Haul
                  </button>
                  <button class="btn-tier ${tier === 'skip' ? 'active-skip' : ''}" onclick="window.MooncatApp.setWizardItemTier(${item.id}, 'skip')">
                    ❄️ Skip
                  </button>
                </div>
              </div>
            `;
          }).join('');
        })()}
      </div>

      <div class="wizard-footer-actions">
        <button class="btn-secondary" onclick="window.MooncatApp.goToWizardStep(2)">← Back to Budget</button>
        <button class="btn-primary" onclick="window.MooncatApp.advanceFromStage3()">
          ${mustCount > wizardState.targetBottleCount 
            ? `Start "This or That" Showdown (${mustCount} competing for ${wizardState.targetBottleCount}) →` 
            : `Finalize Haul (${mustCount} Bottles) →`}
        </button>
      </div>
    `;

    container.innerHTML = html;
  }

  function advanceFromStage3() {
    const mustItems = wizardState.wishlistPool.filter(it => wizardState.itemTiers[it.id] === 'must');
    
    if (mustItems.length === 0) {
      alert("Please select at least 1 shade as 'Must Have' before continuing!");
      return;
    }

    if (mustItems.length <= wizardState.targetBottleCount) {
      wizardState.curatedHaul = mustItems;
      goToWizardStep(5);
    } else {
      setupShowdowns(mustItems);
      goToWizardStep(4);
    }
  }

  function setupShowdowns(mustItems) {
    wizardState.showdownQueue = [];
    const pool = [...mustItems];

    // 1. First priority: pair detected twins/siblings (same finish + same/close color)
    wizardState.similaritiesTwins.forEach(pair => {
      const inPoolA = pool.find(p => p.id === pair.itemA.id);
      const inPoolB = pool.find(p => p.id === pair.itemB.id);
      if (inPoolA && inPoolB) {
        const already = wizardState.showdownQueue.some(([x, y]) => 
          (x.id === inPoolA.id && y.id === inPoolB.id) || (x.id === inPoolB.id && y.id === inPoolA.id)
        );
        if (!already) {
          wizardState.showdownQueue.push([inPoolA, inPoolB]);
        }
      }
    });

    // 2. Next: Pair remaining shades by closest affinity (same finish or closest color)
    const unpaired = pool.filter(item => {
      return !wizardState.showdownQueue.some(([x, y]) => x.id === item.id || y.id === item.id);
    });

    while (unpaired.length >= 2) {
      const first = unpaired.shift();
      let bestIdx = 0;
      let bestRank = -1;
      for (let i = 0; i < unpaired.length; i++) {
        const candidate = unpaired[i];
        const sim = calculateSimilarity(first, candidate);
        let rank = sim.score;
        if (rank === 0) {
          const typesA = (first.type || '').split(',').map(s => s.trim().toLowerCase());
          const typesB = (candidate.type || '').split(',').map(s => s.trim().toLowerCase());
          const sharedTypes = typesA.filter(t => typesB.includes(t));
          const colorsA = (first.color || '').split(',').map(s => s.trim().toLowerCase());
          const colorsB = (candidate.color || '').split(',').map(s => s.trim().toLowerCase());
          const sharedColors = colorsA.filter(c => colorsB.includes(c));
          rank = (sharedTypes.length * 20) + (sharedColors.length * 15);
        }
        if (rank > bestRank) {
          bestRank = rank;
          bestIdx = i;
        }
      }
      const second = unpaired.splice(bestIdx, 1)[0];
      wizardState.showdownQueue.push([first, second]);
    }

    wizardState.currentMatchIndex = 0;
  }

  function renderWizardStep4(container, mainTitle, subTitle) {
    mainTitle.textContent = "⚔️ Stage 4: Head-to-Head Showdowns";
    
    const mustItems = wizardState.wishlistPool.filter(it => wizardState.itemTiers[it.id] === 'must');
    const excessCount = mustItems.length - wizardState.targetBottleCount;

    // If mustItems is already within the user's bottle target:
    if (mustItems.length <= wizardState.targetBottleCount) {
      wizardState.curatedHaul = mustItems;
      goToWizardStep(5);
      return;
    }

    // Advance currentMatchIndex past any matchups where one or both shades are no longer 'must' or are invalid
    while (
      wizardState.currentMatchIndex < wizardState.showdownQueue.length &&
      (
        !wizardState.showdownQueue[wizardState.currentMatchIndex] ||
        wizardState.showdownQueue[wizardState.currentMatchIndex][0].id === wizardState.showdownQueue[wizardState.currentMatchIndex][1].id ||
        wizardState.itemTiers[wizardState.showdownQueue[wizardState.currentMatchIndex][0].id] !== 'must' ||
        wizardState.itemTiers[wizardState.showdownQueue[wizardState.currentMatchIndex][1].id] !== 'must'
      )
    ) {
      wizardState.currentMatchIndex++;
    }

    // If we've completed all scheduled showdowns in the queue:
    // (This happens when user selects "I Can't Decide" on matchups, keeping extra bottles in their haul!)
    if (wizardState.currentMatchIndex >= wizardState.showdownQueue.length) {
      wizardState.curatedHaul = mustItems;
      goToWizardStep(5);
      return;
    }

    subTitle.textContent = `Choose your favorite in each head-to-head battle! Eliminate ${excessCount} more to hit your target of ${wizardState.targetBottleCount} bottle(s), or choose "I Can't Decide" to keep both.`;

    const match = wizardState.showdownQueue[wizardState.currentMatchIndex];
    const [leftItem, rightItem] = match;
    const sim = calculateSimilarity(leftItem, rightItem);
    const leftRating = (userData.wishlistRatings && userData.wishlistRatings[leftItem.id]) || 0;
    const rightRating = (userData.wishlistRatings && userData.wishlistRatings[rightItem.id]) || 0;

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 8px;">
        <span style="font-size: 0.85rem; color: var(--accent-cyan); font-weight: 600;">
          🥊 Matchup ${wizardState.currentMatchIndex + 1} of ${wizardState.showdownQueue.length}: ${escapeHtml(leftItem.type)} vs ${escapeHtml(rightItem.type)} (${sim.score}% similarity)
        </span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">
          Current Haul: <strong style="color: #fff;">${mustItems.length} bottles</strong> (Target: ${wizardState.targetBottleCount})
        </span>
      </div>

      <div class="showdown-arena">
        <div class="showdown-card">
          <img class="showdown-img" src="${escapeHtml(leftItem.image_url)}" alt="${escapeHtml(leftItem.name)}">
          <div class="showdown-content">
            <h3 style="font-size: 1.15rem; color: #fff; margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span>${escapeHtml(leftItem.name)}</span>
              ${leftRating > 0 ? `<span class="wizard-love-badge">⭐ ${leftRating}/10</span>` : ''}
            </h3>
            <div>
              <span class="tag tag-finish">${escapeHtml(leftItem.type)}</span>
              <span class="tag tag-color">${escapeHtml(leftItem.color)}</span>
              ${leftItem.status === 'Dearly Departed' ? '<span class="badge-stock departed" style="position:static; padding: 2px 6px; font-size: 0.7rem;">⚰️ Retiring</span>' : ''}
              ${leftItem.is_new ? '<span class="badge badge-new" style="font-size: 0.7rem; padding: 2px 6px;">✨ NEW</span>' : ''}
            </div>
            <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; max-height: 80px; overflow-y: auto;">
              ${escapeHtml(leftItem.description)}
            </p>
            <button class="btn-pick-winner" onclick="window.MooncatApp.pickShowdownWinner(${leftItem.id}, ${rightItem.id})">
              👑 Pick "${escapeHtml(leftItem.name)}" ${leftRating > 0 ? `(⭐ ${leftRating}/10)` : ''}
            </button>
          </div>
        </div>

        <div class="showdown-vs-divider">
          <div class="vs-orb">VS</div>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">THIS OR THAT</span>
          <div class="showdown-cant-decide-divider-wrap">
            <button class="btn-cant-decide-split" onclick="window.MooncatApp.cantDecideShowdown(${leftItem.id}, ${rightItem.id})" title="Can't choose? Keep both in your haul!">
              <span style="font-size: 1.1rem;">🤷‍♀️</span>
              <span style="font-weight: 700; font-size: 0.85rem;">I Can't Decide</span>
              <span style="font-size: 0.72rem; color: var(--accent-magenta); font-weight: 600;">Keep Both! 💕</span>
            </button>
          </div>
        </div>

        <div class="showdown-card">
          <img class="showdown-img" src="${escapeHtml(rightItem.image_url)}" alt="${escapeHtml(rightItem.name)}">
          <div class="showdown-content">
            <h3 style="font-size: 1.15rem; color: #fff; margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span>${escapeHtml(rightItem.name)}</span>
              ${rightRating > 0 ? `<span class="wizard-love-badge">⭐ ${rightRating}/10</span>` : ''}
            </h3>
            <div>
              <span class="tag tag-finish">${escapeHtml(rightItem.type)}</span>
              <span class="tag tag-color">${escapeHtml(rightItem.color)}</span>
              ${rightItem.status === 'Dearly Departed' ? '<span class="badge-stock departed" style="position:static; padding: 2px 6px; font-size: 0.7rem;">⚰️ Retiring</span>' : ''}
              ${rightItem.is_new ? '<span class="badge badge-new" style="font-size: 0.7rem; padding: 2px 6px;">✨ NEW</span>' : ''}
            </div>
            <p style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.4; max-height: 80px; overflow-y: auto;">
              ${escapeHtml(rightItem.description)}
            </p>
            <button class="btn-pick-winner" onclick="window.MooncatApp.pickShowdownWinner(${rightItem.id}, ${leftItem.id})">
              👑 Pick "${escapeHtml(rightItem.name)}" ${rightRating > 0 ? `(⭐ ${rightRating}/10)` : ''}
            </button>
          </div>
        </div>
      </div>

      <div class="showdown-banner-actions">
        <button class="btn-cant-decide-banner" onclick="window.MooncatApp.cantDecideShowdown(${leftItem.id}, ${rightItem.id})">
          <span>🤷‍♀️</span>
          <span>Can't decide between <strong>"${escapeHtml(leftItem.name)}"</strong> and <strong>"${escapeHtml(rightItem.name)}"</strong>? Click here to keep both in your haul!</span>
        </button>
      </div>

      <div class="wizard-footer-actions">
        <button class="btn-secondary" onclick="window.MooncatApp.goToWizardStep(3)">← Back to Priority Tiers</button>
        <button class="btn-primary" onclick="window.MooncatApp.finishHaulWithCurrentMustItems()">
          ✨ Finish & Keep All Current Choices (${mustItems.length} Bottles) →
        </button>
      </div>
    `;

    container.innerHTML = html;
  }

  function pickShowdownWinner(winnerId, loserId) {
    const winner = catalog.find(i => i.id === winnerId);
    const loser = catalog.find(i => i.id === loserId);

    wizardState.itemTiers[loserId] = 'next';
    showToast(`🏆 Kept "${winner ? winner.name : 'Winner'}"! Saved "${loser ? loser.name : 'Shade'}" for next haul.`);

    wizardState.currentMatchIndex++;
    goToWizardStep(4);
  }

  function cantDecideShowdown(itemAId, itemBId) {
    const itemA = catalog.find(i => i.id === itemAId);
    const itemB = catalog.find(i => i.id === itemBId);

    // Keep both items as 'must'
    wizardState.itemTiers[itemAId] = 'must';
    wizardState.itemTiers[itemBId] = 'must';

    if (!wizardState.undecidedPairs) wizardState.undecidedPairs = [];
    wizardState.undecidedPairs.push([itemAId, itemBId]);

    showToast(`🤷‍♀️ Kept both "${itemA ? itemA.name : 'A'}" & "${itemB ? itemB.name : 'B'}" in your haul! 💕`);

    wizardState.currentMatchIndex++;
    goToWizardStep(4);
  }

  function finishHaulWithCurrentMustItems() {
    const mustItems = wizardState.wishlistPool.filter(it => wizardState.itemTiers[it.id] === 'must');
    wizardState.curatedHaul = mustItems;
    goToWizardStep(5);
  }

  function renderWizardStep5(container, mainTitle, subTitle) {
    mainTitle.textContent = "🎉 Stage 5: Your Curated Mooncat Haul!";
    subTitle.textContent = "Here is your hand-picked, perfectly balanced Mooncat order based on your priorities and budget.";

    const haul = wizardState.curatedHaul;
    const totalBottles = haul.length;
    let totalPrice = 0;
    haul.forEach(it => {
      const pNum = parseFloat((it.price || '$15.00').replace(/[^0-9\.]/g, '')) || 15.00;
      totalPrice += pNum;
    });

    const isFreeShipping = totalPrice >= 125;

    const uniqueFinishes = new Set();
    const uniqueColors = new Set();
    haul.forEach(it => {
      (it.type || '').split(',').forEach(f => uniqueFinishes.add(f.trim()));
      (it.color || '').split(',').forEach(c => uniqueColors.add(c.trim()));
    });

    let html = `
      <div class="haul-winner-box">
        <div class="haul-summary-banner">
          <div class="haul-stats">
            <div class="haul-metric">
              <span class="haul-metric-num">${totalBottles}</span>
              <span class="haul-metric-label">Bottles Selected</span>
            </div>
            <div class="haul-metric">
              <span class="haul-metric-num">$${totalPrice.toFixed(2)}</span>
              <span class="haul-metric-label">Estimated Subtotal</span>
            </div>
            <div class="haul-metric">
              <span class="haul-metric-num" style="color: ${isFreeShipping ? '#10b981' : '#f59e0b'};">
                ${isFreeShipping ? '🚚 FREE' : 'Standard'}
              </span>
              <span class="haul-metric-label">${isFreeShipping ? 'Free Shipping ($125+)' : `Shipping (+$${(125 - totalPrice).toFixed(2)} for Free)`}</span>
            </div>
          </div>

          <div style="font-size: 0.85rem; color: #34d399; font-weight: 600; text-align: right;">
            🎨 ${uniqueFinishes.size} Formulas • ${uniqueColors.size} Color Families
          </div>

          ${totalBottles > wizardState.targetBottleCount ? `
            <div style="width: 100%; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 8px; padding: 0.65rem 1rem; font-size: 0.85rem; color: #d8b4fe; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.2rem;">💖</span>
              <span>
                <strong>Flexible Haul:</strong> Your initial goal was <strong>${wizardState.targetBottleCount} bottle(s)</strong>, but because you chose <em>"I Can't Decide"</em> on close favorites, your curated haul includes all <strong>${totalBottles} shades</strong>!
              </span>
            </div>
          ` : ''}
        </div>

        <div>
          <h4 style="font-size: 0.95rem; color: #fff; margin-bottom: 0.75rem;">Your Curated Shades:</h4>
          <div class="haul-grid">
            ${haul.map(item => {
              const rating = (userData.wishlistRatings && userData.wishlistRatings[item.id]) || 0;
              return `
                <div class="haul-item-card">
                  <img class="haul-item-thumb" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">
                  <div class="haul-item-info">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                      <span style="font-weight: 700; font-size: 0.9rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(item.name)}
                      </span>
                      ${rating > 0 ? `<span class="wizard-love-badge" style="font-size: 0.7rem; padding: 1px 5px;">⭐ ${rating}/10</span>` : ''}
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      ${escapeHtml(item.type)}
                    </div>
                    <div style="font-size: 0.75rem; font-family: var(--font-mono); color: var(--badge-owned-text);">
                      ${escapeHtml(item.price)}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        ${(() => {
          const demotedShades = wizardState.wishlistPool.filter(it => wizardState.itemTiers[it.id] === 'next' || wizardState.itemTiers[it.id] === 'skip');
          if (demotedShades.length === 0) return '';
          return `
            <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed rgba(255, 255, 255, 0.15);">
              <h4 style="font-size: 0.95rem; color: #f59e0b; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;">
                ⏳ Demoted & Saved for Next Haul (${demotedShades.length}):
              </h4>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                These shades were demoted during your decision process, but remain safely on your Mooncat Wishlist for future orders.
              </p>
              <div class="haul-grid">
                ${demotedShades.map(item => `
                  <div class="haul-item-card" style="opacity: 0.8; border-color: rgba(245, 158, 11, 0.3);">
                    <img class="haul-item-thumb" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">
                    <div class="haul-item-info">
                      <div style="font-weight: 700; font-size: 0.88rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(item.name)}
                      </div>
                      <div style="font-size: 0.72rem; color: var(--text-muted);">
                        ${escapeHtml(item.type)}
                      </div>
                      <div style="font-size: 0.72rem; color: #f59e0b; font-weight: 600;">
                        Saved on Wishlist
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        })()}
      </div>

      <div class="wizard-footer-actions">
        <button class="btn-secondary" onclick="window.MooncatApp.copyCuratedHaulNames()">
          📋 Copy Shade Names
        </button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); border: none;" onclick="window.MooncatApp.markCuratedHaulPurchased()">
          🛍 Mark All as Purchased (Move to Owned)
        </button>
        <button class="btn-secondary" onclick="window.MooncatApp.goToWizardStep(2)">
          🔄 Try Different Bottle Count
        </button>
        <button class="btn-primary" onclick="window.MooncatApp.closeDecisionWizard()">
          ✓ Done
        </button>
      </div>
    `;

    container.innerHTML = html;
  }

  function markCuratedHaulPurchased() {
    if (!requireAuth("mark shades as purchased")) return;
    if (!wizardState.curatedHaul || wizardState.curatedHaul.length === 0) return;

    if (!confirm(`Mark all ${wizardState.curatedHaul.length} shades from this curated haul as purchased and move them to your inventory?`)) {
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    wizardState.curatedHaul.forEach(item => {
      userData.wishlist = userData.wishlist.filter(wId => wId !== item.id);

      if (!userData.inventory[item.id]) {
        userData.inventory[item.id] = { qty: 0, orderDates: [], notes: '' };
      }
      userData.inventory[item.id].qty += 1;
      userData.inventory[item.id].orderDates.push(today);
    });

    saveUserData();
    closeDecisionWizard();
    renderAll();
    switchTab('orders');
    showToast(`🎉 Congratulations on your haul! ${wizardState.curatedHaul.length} shades added to your Owned Inventory!`);
  }

  function copyCuratedHaulNames() {
    if (!wizardState.curatedHaul || wizardState.curatedHaul.length === 0) return;
    const names = wizardState.curatedHaul.map(i => i.name).join(', ');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(names).then(() => {
        showToast(`📋 Copied ${wizardState.curatedHaul.length} shades to clipboard!`);
      });
    } else {
      prompt("Copy shade names for Mooncat.com:", names);
    }
  }

  function onCloudDataLoaded(cloudData, user) {
    if (!cloudData) return;
    
    const uid = user ? user.uid : 'cloud';
    const profileId = 'cloud_' + uid;
    
    let profileName = "My Cloud Vault";
    if (user && user.displayName) {
      const isMelissa = (user.email || '').toLowerCase().includes('melissa') || (user.displayName || '').toLowerCase().includes('melissa');
      profileName = isMelissa ? "Melissa's Vault" : `${user.displayName.trim().split(' ')[0]}'s Vault`;
    }

    profiles[profileId] = {
      id: profileId,
      name: profileName,
      inventory: cloudData.inventory || {},
      wishlist: cloudData.wishlist || [],
      wishlistRatings: cloudData.wishlistRatings || {}
    };

    currentProfileId = profileId;
    userData = profiles[profileId];
    if (!userData.wishlistRatings) userData.wishlistRatings = {};

    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
    localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, currentProfileId);

    setupProfileSelector();
    renderAll();
    updateHeaderStats();
  }

  function onCloudSignOut() {
    if (!profiles['guest']) {
      profiles['guest'] = {
        id: 'guest',
        name: 'Guest Vault',
        inventory: {},
        wishlist: []
      };
    }
    currentProfileId = 'guest';
    userData = profiles['guest'];

    localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, 'guest');
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));

    setupProfileSelector();
    renderAll();
    updateHeaderStats();
  }

  // --- Global API for onclick handlers ---
  window.MooncatApp = {
    openDetail,
    quickAddOwned,
    toggleWishlist,
    removeFromWishlist,
    markPurchased,
    decrementOrder,
    removeOrder,
    openImportModal,
    closeImportModal,
    checkLiveNewReleases,
    openDecisionWizard,
    closeDecisionWizard,
    goToWizardStep,
    setWizardBottleCap,
    toggleWizardRule,
    setWizardItemTier,
    advanceFromStage3,
    pickShowdownWinner,
    cantDecideShowdown,
    finishHaulWithCurrentMustItems,
    toggleDemoteInWizard,
    dropFromWishlistInWizard,
    markCuratedHaulPurchased,
    copyCuratedHaulNames,
    setWishlistSort,
    setWishlistRating,
    onCloudDataLoaded,
    onCloudSignOut,
    getCurrentUserData: () => userData,
    showToast
  };

  // Run on load
  document.addEventListener('DOMContentLoaded', init);
})();
