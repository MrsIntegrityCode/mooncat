// Mooncat Lacquer Vault & Inventory Controller
(function () {
  'use strict';

  // --- State ---
  const STORAGE_PROFILES_KEY = 'mooncat_vault_profiles_v2';
  const STORAGE_ACTIVE_PROFILE_KEY = 'mooncat_vault_active_profile_v2';
  let catalog = window.MOONCAT_CATALOG || [];
  
  let profiles = {};
  let currentProfileId = 'melissa';

  // Current active user data reference
  let userData = {
    inventory: {},
    wishlist: []
  };

  let activeTab = 'catalog';
  let currentView = 'grid'; // 'grid' or 'table'
  let catalogSortKey = 'name';
  let catalogSortAsc = true;

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
      const savedProfiles = localStorage.getItem(STORAGE_PROFILES_KEY);
      const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_PROFILE_KEY);

      if (savedProfiles) {
        profiles = JSON.parse(savedProfiles);
      } else {
        // Initialize with Melissa's Vault profile
        const seedInv = (window.INITIAL_USER_DATA && window.INITIAL_USER_DATA.inventory) ? window.INITIAL_USER_DATA.inventory : {};
        profiles = {
          'melissa': {
            id: 'melissa',
            name: "Melissa's Vault",
            inventory: seedInv,
            wishlist: []
          }
        };
        localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
      }

      currentProfileId = (savedActiveId && profiles[savedActiveId]) ? savedActiveId : Object.keys(profiles)[0];
      userData = profiles[currentProfileId];

      if (!userData.inventory) userData.inventory = {};
      if (!userData.wishlist) userData.wishlist = [];
    } catch (e) {
      console.error('Failed to load user profiles from storage:', e);
    }
  }

  function saveUserData() {
    try {
      profiles[currentProfileId] = userData;
      localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles));
      localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, currentProfileId);
      updateHeaderStats();
    } catch (e) {
      console.error('Failed to save user data:', e);
    }
  }

  function setupProfileSelector() {
    const selector = document.getElementById('select-active-profile');
    if (!selector) return;

    selector.innerHTML = Object.values(profiles).map(p => `
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

  function createNewProfile() {
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

    document.getElementById('btn-open-order-import').addEventListener('click', openImportModal);
    document.getElementById('import-close-btn').addEventListener('click', closeImportModal);
    document.getElementById('import-modal').addEventListener('click', (e) => {
      if (e.target.id === 'import-modal') closeImportModal();
    });

    // Import Actions
    document.getElementById('btn-parse-preview').addEventListener('click', previewImport);
    document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);

    // CSV Exports
    document.getElementById('btn-export-catalog-csv').addEventListener('click', exportCatalogCSV);
    document.getElementById('btn-export-orders-csv').addEventListener('click', exportOrdersCSV);
    document.getElementById('btn-export-wishlist-csv').addEventListener('click', exportWishlistCSV);

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
    const statusFilter = document.getElementById('filter-status').value;

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

      // Status filter
      if (statusFilter === 'owned' && !owned) return false;
      if (statusFilter === 'unowned' && owned) return false;
      if (statusFilter === 'wishlist' && !inWishlist) return false;
      if (statusFilter === 'new' && !item.is_new) return false;
      if (statusFilter === 'departed' && item.status !== 'Dearly Departed') return false;
      if (statusFilter === 'in_stock' && item.status !== 'In Stock') return false;

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

  // --- Wishlist Tab (Goal 3) ---
  function renderWishlist() {
    const grid = document.getElementById('wishlist-grid');
    const emptyState = document.getElementById('wishlist-empty-state');

    const wishlistItems = catalog.filter(item => userData.wishlist.includes(item.id));

    // Sort alphabetically by name
    wishlistItems.sort((a, b) => a.name.localeCompare(b.name));

    if (wishlistItems.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    grid.innerHTML = wishlistItems.map(item => {
      const finishBadges = item.type.split(',').map(f => `<span class="tag tag-finish">${escapeHtml(f.trim())}</span>`).join('');
      const colorBadges = item.color.split(',').map(c => `<span class="tag tag-color">${escapeHtml(c.trim())}</span>`).join('');

      return `
        <div class="polish-card" data-id="${item.id}">
          <div class="card-media" onclick="window.MooncatApp.openDetail(${item.id})">
            <img class="card-img" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy">
            <div class="card-badges">
              <span class="badge badge-wishlist">Wishlist</span>
            </div>
            <span class="badge-stock ${item.status === 'Discontinued' ? 'discontinued' : ''}">${escapeHtml(item.status)}</span>
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
    const item = catalog.find(i => i.id === id);
    userData.wishlist = userData.wishlist.filter(wId => wId !== id);
    showToast(`Removed "${item ? item.name : 'Shade'}" from Wishlist`);
    saveUserData();
    renderAll();
  }

  // Purchased Workflow (Goal 3): "once purchased, they should be removed from the wishlist and added to my inventory"
  function markPurchased(id) {
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
    if (!userData.inventory[id]) return;
    userData.inventory[id].qty -= 1;
    if (userData.inventory[id].qty <= 0) {
      delete userData.inventory[id];
    }
    saveUserData();
    renderAll();
  }

  function removeOrder(id) {
    const item = catalog.find(i => i.id === id);
    if (confirm(`Remove "${item ? item.name : 'this polish'}" from your ordered inventory?`)) {
      delete userData.inventory[id];
      saveUserData();
      renderAll();
      showToast(`Removed from your ordered collection`);
    }
  }

  // --- Order Import / Parser (Goal 2) ---
  function openImportModal() {
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

  // --- Global API for onclick handlers ---
  window.MooncatApp = {
    openDetail,
    quickAddOwned,
    toggleWishlist,
    removeFromWishlist,
    markPurchased,
    decrementOrder,
    removeOrder,
    checkLiveNewReleases
  };

  // Run on load
  document.addEventListener('DOMContentLoaded', init);
})();
