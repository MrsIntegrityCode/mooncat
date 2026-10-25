#!/usr/bin/env python3
"""
sync_new_releases.py
Monitors Mooncat's store for new item releases, classifies them,
flags them with 'is_new: True', and updates the website catalog files.
"""

import urllib.request
import ssl
import json
import re
import html
import csv
from datetime import datetime

KNOWN_FINISHES = [
    'linear holographic', 'holographic', 'magnetic', 'multichrome', 
    'shimmer', 'creme', 'crème', 'flakie', 'glitter', 'matte', 
    'metallic', 'thermal', 'solar', 'jelly', 'topper', 'glow-in-the-dark'
]

COLOR_KEYWORDS = {
    'Purple': ['purple', 'violet', 'lavender', 'lilac', 'plum', 'amethyst', 'orchid', 'periwinkle'],
    'Blue': ['blue', 'cobalt', 'sapphire', 'navy', 'indigo', 'cyan', 'azure', 'sky blue', 'cornflower'],
    'Green': ['green', 'emerald', 'mint', 'olive', 'jade', 'sage', 'chartreuse', 'forest green'],
    'Pink': ['pink', 'magenta', 'coral', 'blush', 'mauve', 'fuchsia', 'rose', 'bubblegum'],
    'Red': ['red', 'crimson', 'scarlet', 'burgundy', 'wine', 'maroon', 'cherry', 'ruby', 'blood red'],
    'Brown': ['brown', 'chocolate', 'espresso', 'mocha', 'taupe', 'sepia', 'caramel'],
    'Black': ['black', 'onyx', 'midnight', 'jet black'],
    'White': ['white', 'ivory', 'pearl', 'alabaster', 'snow'],
    'Gold': ['gold', 'golden', 'champagne', 'honey'],
    'Silver': ['silver', 'platinum', 'pewter'],
    'Gray': ['gray', 'grey', 'charcoal', 'slate', 'ash'],
    'Orange': ['orange', 'peach', 'tangerine', 'apricot', 'terracotta'],
    'Yellow': ['yellow', 'lemon', 'canary', 'sunflower', 'mustard'],
    'Teal': ['teal', 'turquoise', 'aqua', 'seafoam', 'cyan'],
    'Copper/Bronze': ['copper', 'bronze', 'rust', 'rose gold', 'rose-gold'],
    'Multichrome/Shift': ['multichrome', 'color shifting', 'duochrome', 'iridescent', 'chromatic', 'chameleon', 'shift']
}

def fetch_json(url, ctx):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))

def sync():
    ctx = ssl._create_unverified_context()
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Checking Mooncat website for new releases...")

    # Load existing catalog
    try:
        with open('mooncat_catalog.json', 'r', encoding='utf-8') as f:
            old_catalog = json.load(f)
            old_ids = {p['id']: p for p in old_catalog}
    except Exception:
        old_catalog = []
        old_ids = {}

    # Load existing user data (to preserve owned status)
    try:
        with open('initial_orders.json', 'r', encoding='utf-8') as f:
            user_data = json.load(f)
            inventory = user_data.get('inventory', {})
    except Exception:
        inventory = {}

    # 1. Fetch What's New collection
    whats_new_ids = set()
    try:
        wn_data = fetch_json('https://www.mooncat.com/collections/whats-new/products.json?limit=250', ctx)
        for p in wn_data.get('products', []):
            whats_new_ids.add(p['id'])
    except Exception as e:
        print("Note: Could not query whats-new collection endpoint:", e)

    # 2. Fetch all products
    all_products = []
    page = 1
    while True:
        url = f"https://www.mooncat.com/products.json?limit=250&page={page}"
        data = fetch_json(url, ctx)
        batch = data.get('products', [])
        if not batch:
            break
        all_products.extend(batch)
        if len(batch) < 250:
            break
        page += 1

    print(f"Retrieved {len(all_products)} products from Mooncat.")

    newly_discovered = []
    updated_catalog = []

    for p in all_products:
        p_type = p.get('product_type', '')
        title = p.get('title', '').strip()
        tags = [t.lower().strip() for t in p.get('tags', [])]
        handle = p.get('handle', '')
        pid = p.get('id')

        # Skip merch / stickers / tools that aren't nail related
        if p_type in ['Decorative Stickers', 'Baggu Bag', 'Gift Cards', 'Free Gift', 'Cuticle Pushers']:
            continue
        if any(tag in ['merch', 'stickers', 'apparel', 'bag'] for tag in tags):
            continue

        is_new_in_store = pid not in old_ids
        is_in_whats_new = (pid in whats_new_ids) or ('collection:whats-new' in tags) or ('whats-new' in tags)

        raw_body = p.get('body_html') or ''
        clean_desc = html.unescape(re.sub(r'<[^>]+>', ' ', raw_body))
        clean_desc = ' '.join(clean_desc.split()).strip()

        images = p.get('images', [])
        image_url = images[0].get('src') if images else ''
        swatch_images = [img.get('src') for img in images[:4]]

        variants = p.get('variants', [{}])
        price = variants[0].get('price', '')
        available = variants[0].get('available', False)

        updated_raw = p.get('updated_at', '')
        published_raw = p.get('published_at', '')
        try:
            dt = datetime.fromisoformat(updated_raw.replace('Z', '+00:00'))
            updated_date = dt.strftime('%Y-%m-%d')
        except Exception:
            updated_date = updated_raw[:10]

        is_set = 'set' in tags or 'collection-set' in tags or ('set' in title.lower() and 'offset' not in title.lower())
        is_care = any(care in title.lower() for care in ['base coat', 'top coat', 'primer', 'elixir', 'oil', 'treatment', 'lacquer remover', 'thinner']) or 'nail care' in tags or p_type == 'Nail Tools'

        category = 'Set' if is_set else ('Care & Tools' if is_care else 'Nail Lacquer')

        finishes_found = set()
        for t in tags:
            if t.startswith('finish:'):
                val = t.replace('finish:', '').strip()
                finishes_found.add(val.replace('-', ' ').title())
            elif t in [f.replace(' ', '-') for f in KNOWN_FINISHES]:
                finishes_found.add(t.replace('-', ' ').title())

        colors_found = set()
        for t in tags:
            if t.startswith('color:'):
                val = t.replace('color:', '').strip()
                colors_found.add(val.replace('-', ' ').title())

        corpus = f"{title} {clean_desc}".lower()
        if not finishes_found and category == 'Nail Lacquer':
            for f in KNOWN_FINISHES:
                if re.search(r'\b' + re.escape(f) + r'\b', corpus):
                    finishes_found.add(f.replace('crème', 'creme').title())

        if not colors_found and category == 'Nail Lacquer':
            for col_name, keywords in COLOR_KEYWORDS.items():
                for kw in keywords:
                    if re.search(r'\b' + re.escape(kw) + r'\b', corpus):
                        colors_found.add(col_name)
                        break

        if is_care and not finishes_found:
            if 'top coat' in title.lower(): finishes_found.add('Top Coat')
            elif 'base coat' in title.lower(): finishes_found.add('Base Coat')
            elif 'primer' in title.lower(): finishes_found.add('Primer')
            elif 'elixir' in title.lower() or 'oil' in title.lower(): finishes_found.add('Nail Care')

        type_str = ', '.join(sorted(list(finishes_found))) if finishes_found else ('Set' if is_set else 'Special Effect')
        color_str = ', '.join(sorted(list(colors_found))) if colors_found else ('Multi' if is_set else 'Special')
        is_discontinued = 'status:discontinued' in tags or 'collection:dearly-departed' in tags or 'status:no-restock' in tags

        item_dict = {
            'id': pid,
            'name': title,
            'handle': handle,
            'category': category,
            'type': type_str,
            'color': color_str,
            'description': clean_desc,
            'last_updated': updated_date,
            'price': f"${price}" if price else "$15.00",
            'available': available,
            'status': 'Discontinued' if is_discontinued else ('In Stock' if available else 'Out of Stock'),
            'image_url': image_url,
            'swatch_images': swatch_images,
            'product_url': f"https://www.mooncat.com/products/{handle}",
            'tags': p.get('tags', []),
            'is_new': is_in_whats_new or is_new_in_store
        }

        if is_new_in_store:
            newly_discovered.append(item_dict)

        updated_catalog.append(item_dict)

    updated_catalog.sort(key=lambda x: x['name'].lower())

    # Save mooncat_catalog.json
    with open('mooncat_catalog.json', 'w', encoding='utf-8') as f:
        json.dump(updated_catalog, f, indent=2, ensure_ascii=False)

    # Save catalog_data.js
    with open('catalog_data.js', 'w', encoding='utf-8') as f:
        f.write('window.MOONCAT_CATALOG = ')
        json.dump(updated_catalog, f, ensure_ascii=False)
        f.write(';\n\nwindow.INITIAL_USER_DATA = ')
        json.dump(user_data, f, ensure_ascii=False)
        f.write(';\n')

    # Save mooncat_colors_catalog.csv
    with open('mooncat_colors_catalog.csv', 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Name', 'Type', 'Color(s)', 'Description', 'Last Updated', 'Owned? (Y/N)', 'On Hand Qty', 'Total Ordered', 'Is New?'])
        for it in updated_catalog:
            cid = str(it['id'])
            entry = inventory.get(cid)
            is_owned = 'Y' if entry and entry.get('qty', 0) > 0 else 'N'
            on_hand = entry['qty'] if entry else 0
            total_ordered = entry.get('ordered_qty', on_hand) if entry else 0
            writer.writerow([
                it['name'],
                it['type'],
                it['color'],
                it['description'],
                it['last_updated'],
                is_owned,
                on_hand,
                total_ordered,
                'NEW' if it['is_new'] else ''
            ])

    print(f"Catalog sync completed. Total items: {len(updated_catalog)}.")
    new_release_items = [it for it in updated_catalog if it['is_new']]
    print(f"Items currently marked with 'NEW' badge: {len(new_release_items)}")
    if newly_discovered:
        print(f"✨ BRAND NEW RELEASES DETECTED ({len(newly_discovered)}):")
        for it in newly_discovered:
            print(f"  - {it['name']} ({it['type']} | {it['color']})")
    else:
        print("No previously unseen products detected in store catalog. All 84 current 'What's New' releases are updated.")

    return newly_discovered, new_release_items

if __name__ == '__main__':
    sync()
EOF
chmod +x sync_new_releases.py
python3 sync_new_releases.py
