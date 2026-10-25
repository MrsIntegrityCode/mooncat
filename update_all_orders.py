import json
import csv
import unicodedata

def normalize(text):
    text = unicodedata.normalize('NFKD', text)
    return text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').strip().lower()

with open('mooncat_catalog.json', 'r') as f:
    catalog = json.load(f)

all_orders = [
    # Order 1 (Image 1, batch 1)
    ('Ghosts Of Hecate', 1, 'Order 1'),
    ('Sand Viper', 1, 'Order 1'),
    ('Hell is Other People', 1, 'Order 1'),
    ('Pearl Clutcher', 1, 'Order 1'),
    ('The Doppelganger', 1, 'Order 1'),
    
    # Order 2 (MC381501799, Aug 25, 2026)
    ('Nocturne', 1, 'MC381501799 - Aug 25, 2026'),
    ('Pangea', 1, 'MC381501799 - Aug 25, 2026'),
    ('Dragon Scales', 1, 'MC381501799 - Aug 25, 2026'),
    ('The Avatar State', 1, 'MC381501799 - Aug 25, 2026'),
    ('Nyarrian Nights', 1, 'MC381501799 - Aug 25, 2026'),
    
    # Order 3 (MC381369738, Apr 27, 2026)
    ('Moondust', 1, 'MC381369738 - Apr 27, 2026'),
    ('Emo for Life', 1, 'MC381369738 - Apr 27, 2026'),
    ('Millennia', 1, 'MC381369738 - Apr 27, 2026'),
    ('Long-Lasting Essentials Duo', 1, 'MC381369738 - Apr 27, 2026'),
    ('404: Soul Not Found', 1, 'MC381369738 - Apr 27, 2026'),
    
    # Order 4 (MC381424394, Jun 03, 2026)
    ('Nail Elixir', 1, 'MC381424394 - Jun 03, 2026'),
    ('Sand Viper', 1, 'MC381424394 - Jun 03, 2026'), # DUPLICATE
    ('Heart on a Platter', 1, 'MC381424394 - Jun 03, 2026'),
    ('Werewolf\'s Bane', 1, 'MC381424394 - Jun 03, 2026'),
    ('Port 6666', 1, 'MC381424394 - Jun 03, 2026'),
    
    # Order 5 (Jun 09, 2026)
    ('Lovebomb', 1, 'Order - Jun 09, 2026'),
    ('Black Widow', 1, 'Order - Jun 09, 2026'),
    ('Illusionist', 1, 'Order - Jun 09, 2026'),
    ('A Most Destructive Melody', 1, 'Order - Jun 09, 2026'),
    ('Bloodbender', 1, 'Order - Jun 09, 2026'),
    ('Curiosity\'s Trap', 1, 'Order - Jun 09, 2026'),
    ('Taipan Venom', 1, 'Order - Jun 09, 2026'),
    ('Pandora\'s Box', 1, 'Order - Jun 09, 2026'),
    
    # Order 6 (MC381473985, Jul 20, 2026)
    ('Your Heart\'s A Black Hole', 1, 'MC381473985 - Jul 20, 2026'),
    ('Jewel Beetle', 1, 'MC381473985 - Jul 20, 2026'),
    ('A Most Destructive Melody', 1, 'MC381473985 - Jul 20, 2026'), # DUPLICATE
    ('Boa Constrictor', 1, 'MC381473985 - Jul 20, 2026')
]

matched = {}
for name, qty, order_ref in all_orders:
    target = normalize(name)
    found = None
    for p in catalog:
        if normalize(p['name']) == target:
            found = p
            break
    if not found:
        for p in catalog:
            if target in normalize(p['name']) or normalize(p['name']) in target:
                found = p
                break

    if found:
        cid = found['id']
        if cid not in matched:
            matched[cid] = {'item': found, 'qty': 0, 'orders': []}
        matched[cid]['qty'] += qty
        matched[cid]['orders'].append(order_ref)
    else:
        print("ERROR: Unmatched:", name)

sorted_entries = sorted(matched.values(), key=lambda x: x['item']['name'].lower())

print(f"Total matched unique shades: {len(sorted_entries)}")
print(f"Total ordered items count: {sum(e['qty'] for e in sorted_entries)}")

# 1. Update mooncat_orders.csv (Goal 2)
# Columns: Name, Type (according to mooncat.com), Color Palette, Number Ordered, Status, Price, Orders
with open('mooncat_orders.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Type (according to mooncat.com)', 'Color Palette', 'Number Ordered', 'Status', 'Price', 'Order History'])
    for entry in sorted_entries:
        it = entry['item']
        writer.writerow([
            it['name'],
            it['type'],
            it['color'],
            entry['qty'],
            it['status'],
            it['price'],
            '; '.join(entry['orders'])
        ])
print("Updated mooncat_orders.csv")

# 2. Update mooncat_colors_catalog.csv with Owned? (Y/N) column (Goal 1 & 4)
with open('mooncat_colors_catalog.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Type', 'Color(s)', 'Description', 'Last Updated', 'Owned? (Y/N)', 'Number Ordered'])
    for it in catalog:
        entry = matched.get(it['id'])
        is_owned = 'Y' if entry else 'N'
        qty = entry['qty'] if entry else 0
        writer.writerow([
            it['name'],
            it['type'],
            it['color'],
            it['description'],
            it['last_updated'],
            is_owned,
            qty
        ])
print("Updated mooncat_colors_catalog.csv")

# 3. Update catalog_data.js with new INITIAL_USER_DATA
inventory_data = {}
for cid, entry in matched.items():
    inventory_data[str(cid)] = {
        'qty': entry['qty'],
        'orderDates': entry['orders'],
        'notes': '; '.join(entry['orders'])
    }

user_data = {
    'inventory': inventory_data,
    'wishlist': []
}

with open('initial_orders.json', 'w', encoding='utf-8') as f:
    json.dump(user_data, f, indent=2)

with open('catalog_data.js', 'w', encoding='utf-8') as f:
    f.write('window.MOONCAT_CATALOG = ')
    json.dump(catalog, f, ensure_ascii=False)
    f.write(';\n\nwindow.INITIAL_USER_DATA = ')
    json.dump(user_data, f, ensure_ascii=False)
    f.write(';\n')

print("Regenerated catalog_data.js with full initial user data")
