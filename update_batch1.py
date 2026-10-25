import json
import csv

with open('mooncat_catalog.json', 'r') as f:
    catalog = json.load(f)

orders_batch_1 = [
    ('Ghosts Of Hecate', 1),
    ('Sand Viper', 1),
    ('Hell is Other People', 1),
    ('Pearl Clutcher', 1),
    ('The Doppelganger', 1),
    ('Nocturne', 1),
    ('Pangea', 1),
    ('Dragon Scales', 1),
    ('The Avatar State', 1),
    ('Nyarrian Nights', 1),
    ('Moondust', 1),
    ('Emo for Life', 1),
    ('Millennia', 1),
    ('Long-Lasting Essentials Duo', 1),
    ('404: Soul Not Found', 1),
    ('Nail Elixir', 1),
    ('Sand Viper', 1), # Duplicate
    ('Heart on a Platter', 1),
    ('Werewolf\'s Bane', 1),
    ('Port 6666', 1),
    ('Lovebomb', 1),
    ('Black Widow', 1),
    ('Illusionist', 1),
    ('A Most Destructive Melody', 1),
    ('Bloodbender', 1),
    ('Curiosity\'s Trap', 1)
]

matched = {}
for name, qty in orders_batch_1:
    found = None
    for p in catalog:
        if p['name'].lower() == name.lower():
            found = p
            break
    if found:
        cid = found['id']
        if cid not in matched:
            matched[cid] = {'item': found, 'qty': 0}
        matched[cid]['qty'] += qty

sorted_items = sorted(matched.values(), key=lambda x: x['item']['name'].lower())

with open('mooncat_orders.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Type (according to mooncat.com)', 'Color Palette', 'Number Ordered', 'Status', 'Price'])
    for entry in sorted_items:
        it = entry['item']
        writer.writerow([
            it['name'],
            it['type'],
            it['color'],
            entry['qty'],
            it['status'],
            it['price']
        ])

print("Updated mooncat_orders.csv with batch 1!")

# Also generate a seed JSON for app.js
seed_inventory = {}
for cid, entry in matched.items():
    seed_inventory[str(cid)] = {
        'qty': entry['qty'],
        'orderDates': ['2026-08-25'],
        'notes': 'From Mooncat receipts'
    }

with open('initial_orders.json', 'w', encoding='utf-8') as f:
    json.dump({'inventory': seed_inventory, 'wishlist': []}, f, indent=2)

print("Saved initial_orders.json")
