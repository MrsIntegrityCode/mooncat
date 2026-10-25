import urllib.request
import ssl
import json
import re
import html
import csv
from datetime import datetime

print("Fetching products from Mooncat...")
ctx = ssl._create_unverified_context()
products = []
page = 1
while True:
    url = f"https://www.mooncat.com/products.json?limit=250&page={page}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    with urllib.request.urlopen(req, context=ctx) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        batch = data.get("products", [])
        if not batch:
            break
        products.extend(batch)
        print(f"Page {page}: {len(batch)} items loaded.")
        if len(batch) < 250:
            break
        page += 1

print(f"Total raw items fetched: {len(products)}")

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

catalog = []

for p in products:
    p_type = p.get('product_type', '')
    title = p.get('title', '').strip()
    tags = [t.lower().strip() for t in p.get('tags', [])]
    handle = p.get('handle', '')
    
    # Exclude non-nail products
    if p_type in ['Decorative Stickers', 'Baggu Bag', 'Gift Cards', 'Free Gift', 'Cuticle Pushers']:
        continue
    if any(tag in ['merch', 'stickers', 'apparel', 'bag'] for tag in tags):
        continue

    # Body description cleaning
    raw_body = p.get('body_html') or ''
    # Remove HTML tags
    clean_desc = html.unescape(re.sub(r'<[^>]+>', ' ', raw_body))
    clean_desc = ' '.join(clean_desc.split()).strip()

    # Image
    images = p.get('images', [])
    image_url = images[0].get('src') if images else ''
    swatch_images = [img.get('src') for img in images[:4]]

    # Variants info
    variants = p.get('variants', [{}])
    price = variants[0].get('price', '')
    available = variants[0].get('available', False)

    # Date
    updated_raw = p.get('updated_at', '')
    if updated_raw:
        try:
            # Parse ISO date
            dt = datetime.fromisoformat(updated_raw.replace('Z', '+00:00'))
            updated_date = dt.strftime('%Y-%m-%d')
        except Exception:
            updated_date = updated_raw[:10]
    else:
        updated_date = ''

    # Check category: Polish, Set, or Care/Tool
    is_set = 'set' in tags or 'collection-set' in tags or ('set' in title.lower() and 'offset' not in title.lower())
    is_care = any(care in title.lower() for care in ['base coat', 'top coat', 'primer', 'elixir', 'oil', 'treatment', 'lacquer remover', 'thinner']) or 'nail care' in tags or p_type == 'Nail Tools'

    category = 'Set' if is_set else ('Care & Tools' if is_care else 'Nail Lacquer')

    # Detect Finishes / Types
    finishes_found = set()
    for t in tags:
        if t.startswith('finish:'):
            val = t.replace('finish:', '').strip()
            finishes_found.add(val.replace('-', ' ').title())
        elif t in [f.replace(' ', '-') for f in KNOWN_FINISHES]:
            finishes_found.add(t.replace('-', ' ').title())

    # Detect Colors
    colors_found = set()
    for t in tags:
        if t.startswith('color:'):
            val = t.replace('color:', '').strip()
            colors_found.add(val.replace('-', ' ').title())

    # Text corpus for fallback
    corpus = f"{title} {clean_desc}".lower()

    if not finishes_found and category == 'Nail Lacquer':
        for f in KNOWN_FINISHES:
            pattern = r'\b' + re.escape(f) + r'\b'
            if re.search(pattern, corpus):
                finishes_found.add(f.replace('crème', 'creme').title())

    if not colors_found and category == 'Nail Lacquer':
        for col_name, keywords in COLOR_KEYWORDS.items():
            for kw in keywords:
                if re.search(r'\b' + re.escape(kw) + r'\b', corpus):
                    colors_found.add(col_name)
                    break

    # If still empty for care products
    if is_care and not finishes_found:
        if 'top coat' in title.lower():
            finishes_found.add('Top Coat')
        elif 'base coat' in title.lower():
            finishes_found.add('Base Coat')
        elif 'primer' in title.lower():
            finishes_found.add('Primer')
        elif 'elixir' in title.lower() or 'oil' in title.lower():
            finishes_found.add('Nail Care')

    type_str = ', '.join(sorted(list(finishes_found))) if finishes_found else ('Set' if is_set else 'Special Effect')
    color_str = ', '.join(sorted(list(colors_found))) if colors_found else ('Multi' if is_set else 'Special')

    is_discontinued = 'status:discontinued' in tags or 'collection:dearly-departed' in tags or 'status:no-restock' in tags

    catalog.append({
        'id': p.get('id'),
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
        'tags': p.get('tags', [])
    })

# Sort catalog alphabetically by Name
catalog.sort(key=lambda x: x['name'].lower())

print(f"Processed {len(catalog)} catalog items (Nail Lacquers, Sets, and Care).")

# Save as JSON
with open('mooncat_catalog.json', 'w', encoding='utf-8') as f:
    json.dump(catalog, f, indent=2, ensure_ascii=False)
print("Saved mooncat_catalog.json")

# Save as CSV with the requested columns: name, type, color(s), description, plus last updated and extras
csv_fields = ['Name', 'Type', 'Color(s)', 'Description', 'Last Updated', 'Category', 'Status', 'Price', 'Image URL', 'Product URL']
with open('mooncat_catalog.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=csv_fields)
    writer.writeheader()
    for item in catalog:
        writer.writerow({
            'Name': item['name'],
            'Type': item['type'],
            'Color(s)': item['color'],
            'Description': item['description'],
            'Last Updated': item['last_updated'],
            'Category': item['category'],
            'Status': item['status'],
            'Price': item['price'],
            'Image URL': item['image_url'],
            'Product URL': item['product_url']
        })
print("Saved mooncat_catalog.csv")
