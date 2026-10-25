import json
import csv

with open('mooncat_catalog.json', 'r') as f:
    catalog = json.load(f)

with open('initial_orders.json', 'r') as f:
    data = json.load(f)

# Find IDs of Sand Viper and A Most Destructive Melody
sand_viper_id = None
melody_id = None
for p in catalog:
    if p['name'].lower() == 'sand viper':
        sand_viper_id = str(p['id'])
    elif p['name'].lower() == 'a most destructive melody':
        melody_id = str(p['id'])

print("Sand Viper ID:", sand_viper_id)
print("Melody ID:", melody_id)

# Update inventory on hand vs ordered
# For data['inventory'], set qty on hand = 1, and add a note about gifted duplicate
if sand_viper_id in data['inventory']:
    data['inventory'][sand_viper_id]['ordered_qty'] = 2
    data['inventory'][sand_viper_id]['qty'] = 1
    data['inventory'][sand_viper_id]['notes'] = 'Ordered 2x; 1 gifted away, 1 currently on hand'

if melody_id in data['inventory']:
    data['inventory'][melody_id]['ordered_qty'] = 2
    data['inventory'][melody_id]['qty'] = 1
    data['inventory'][melody_id]['notes'] = 'Ordered 2x; 1 gifted away, 1 currently on hand'

for k, v in data['inventory'].items():
    if 'ordered_qty' not in v:
        v['ordered_qty'] = v['qty']

# Save initial_orders.json
with open('initial_orders.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

# Update mooncat_orders.csv
# Columns: Name, Type (according to mooncat.com), Color Palette, Number Ordered, Currently On Hand, Status, Notes
with open('mooncat_orders.csv', 'r', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

updated_rows = []
for r in rows:
    name = r['Name']
    num_ordered = int(r['Number Ordered'])
    on_hand = 1
    notes = r.get('Order History', '')
    if name.lower() in ['sand viper', 'a most destructive melody']:
        notes += " (Gifted 1 duplicate)"
    updated_rows.append({
        'Name': name,
        'Type (according to mooncat.com)': r['Type (according to mooncat.com)'],
        'Color Palette': r['Color Palette'],
        'Number Ordered': num_ordered,
        'Currently On Hand': on_hand,
        'Status': r['Status'],
        'Price': r['Price'],
        'Order History / Notes': notes
    })

with open('mooncat_orders.csv', 'w', encoding='utf-8', newline='') as f:
    fields = ['Name', 'Type (according to mooncat.com)', 'Color Palette', 'Number Ordered', 'Currently On Hand', 'Status', 'Price', 'Order History / Notes']
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(updated_rows)

print("Updated mooncat_orders.csv with Currently On Hand column.")

# Update mooncat_colors_catalog.csv
with open('mooncat_colors_catalog.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Type', 'Color(s)', 'Description', 'Last Updated', 'Owned? (Y/N)', 'On Hand Qty', 'Total Ordered'])
    for it in catalog:
        cid = str(it['id'])
        entry = data['inventory'].get(cid)
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
            total_ordered
        ])

print("Updated mooncat_colors_catalog.csv with On Hand and Ordered counts.")

# Update catalog_data.js
with open('catalog_data.js', 'w', encoding='utf-8') as f:
    f.write('window.MOONCAT_CATALOG = ')
    json.dump(catalog, f, ensure_ascii=False)
    f.write(';\n\nwindow.INITIAL_USER_DATA = ')
    json.dump(data, f, ensure_ascii=False)
    f.write(';\n')

print("Updated catalog_data.js successfully.")
