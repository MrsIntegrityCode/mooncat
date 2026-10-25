# ✦ Mooncat Lacquer Vault & Inventory Manager ✦

A complete, beautiful inventory management and wishlist web application tailored specifically for **Mooncat** nail polishes, powered by live data synchronized directly from `mooncat.com`.

---

## 📁 Included Files

| File | Purpose |
|---|---|
| [`index.html`](file:///Users/melissaruth/Documents/Mooncat/index.html) | Main web application (responsive for phone, tablet, and desktop) |
| [`style.css`](file:///Users/melissaruth/Documents/Mooncat/style.css) | Custom Mooncat-inspired dark cosmic theme & responsive styles |
| [`app.js`](file:///Users/melissaruth/Documents/Mooncat/app.js) | Full client application logic, filtering, wishlist rules, and CSV exports |
| [`catalog_data.js`](file:///Users/melissaruth/Documents/Mooncat/catalog_data.js) | Standalone catalog bundle for instant offline/local viewing |
| [`sync_new_releases.py`](file:///Users/melissaruth/Documents/Mooncat/sync_new_releases.py) | **New Release Monitor**: checks Mooncat live, adds new shades, and tags with `✨ NEW` |
| [`.github/workflows/daily_sync.yml`](file:///Users/melissaruth/Documents/Mooncat/.github/workflows/daily_sync.yml) | **Automated Cloud Sync**: runs daily on GitHub for 100% hands-free release tracking |
| [`mooncat_colors_catalog.csv`](file:///Users/melissaruth/Documents/Mooncat/mooncat_colors_catalog.csv) | **Goal 1 Catalog Spreadsheet** with exact columns: `Name`, `Type`, `Color(s)`, `Description`, `Last Updated` |
| [`mooncat_orders.csv`](file:///Users/melissaruth/Documents/Mooncat/mooncat_orders.csv) | **Goal 2 Orders Spreadsheet** listing ordered colors, official types, palettes, and count ordered (including duplicates) |
| [`mooncat_catalog.json`](file:///Users/melissaruth/Documents/Mooncat/mooncat_catalog.json) | Complete structured JSON database of all 304 Mooncat items |
| [`update_orders.py`](file:///Users/melissaruth/Documents/Mooncat/update_orders.py) | Python CLI script to update `mooncat_orders.csv` from any text list or receipt |

---

## 🌟 How the App Addresses Your Goals

1. **Complete Mooncat Color Catalog**
   - Contains all **304** Mooncat polishes, treatments, and sets directly extracted from official store records.
   - Includes official **Last Updated Dates**, **Types** (Holographic, Shimmer, Magnetic, Crème, Flakie, Multichrome, etc.), **Color Palettes**, and official **Descriptions**.
   - Available as both a live web interface and a standalone [`mooncat_colors_catalog.csv`](file:///Users/melissaruth/Documents/Mooncat/mooncat_colors_catalog.csv).

2. **Single Ordered List with Duplicates & Official Types**
   - The **"My Orders & Inventory"** tab gives you a single unified list of all shades you have ordered, strictly sorted alphabetically by name.
   - Identifies each shade by its official Mooncat **Type**, **Color Palette**, and **Number Ordered** (with quick `+` and `-` buttons to adjust quantities or log duplicate orders).
   - Includes a **Smart Order Importer**: paste your order receipt, order email, or a list of polish names (e.g. `2x House of Hades`), and it matches them to the official catalog automatically.

3. **Smart Wishlist Rules**
   - **Ownership Restriction**: You cannot add colors you already own to your wishlist. If you attempt to add an owned color, it prevents it and alerts you.
   - **Purchase Workflow**: When you click **"Mark Purchased"** on a wishlist item, it is automatically removed from your wishlist, added to your ordered inventory (`+1`), and the main catalog updates immediately to "Owned".

4. **Owned? (Y/N) Identification on Main Catalog**
   - Both the Card View and Table View prominently display whether you own each lacquer (`Owned: Yes (Qty)` / `Not Owned`).
   - You can filter the entire catalog with one click to see only shades you own, only shades you don't own, or only shades on your wishlist.

5. **Pictures Included**
   - Both high-resolution bottle shots and nail swatches are embedded into the cards, table view, and detailed inspection modal.

6. **Online Hosting (Access from Any Device)**
   - See the guide below to put it online for free in under 2 minutes so you can access it on your phone while shopping!

---

## 🚀 How to Run Locally

Simply double-click [`index.html`](file:///Users/melissaruth/Documents/Mooncat/index.html) in your Finder to open it in Safari, Chrome, or any browser. No web server installation required!

---

## 🌐 How to Host Online for Free (Access from Any Device)

### Option A: GitHub Pages (Recommended — Permanent & Free)
1. Go to [github.com](https://github.com) and create a free new repository named `mooncat-vault`.
2. Upload the files from this folder (`index.html`, `style.css`, `app.js`, `catalog_data.js`).
3. Click **Settings** > **Pages** > select **Deploy from branch: main**.
4. GitHub will give you a public URL (e.g., `https://yourusername.github.io/mooncat-vault`) that you can open on your phone or save as a bookmark / Home Screen icon!

### Option B: Netlify Drop (Instant Drag & Drop — No Git Required)
1. Open [app.netlify.com/drop](https://app.netlify.com/drop) in your browser.
2. Drag and drop the `/Users/melissaruth/Documents/Mooncat` folder onto the browser window.
3. You will immediately get a live `https://something.netlify.app` web link.

---

## 🔄 Syncing Your Collection Across Devices

- Click the **☁️ Sync & Online Access** tab in the app.
- Click **"Export All Data (JSON)"** to download your personal collection backup.
- On your phone or secondary device, tap **"Import Backup"** to restore your orders and wishlist instantly.
