import json
import csv

with open('mooncat_catalog.json', 'r', encoding='utf-8') as f:
    catalog = json.load(f)

# 1. Exact columns requested: Name, Type, Color(s), Description, Last Updated
with open('mooncat_colors_catalog.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Type', 'Color(s)', 'Description', 'Last Updated'])
    for item in catalog:
        writer.writerow([
            item['name'],
            item['type'],
            item['color'],
            item['description'],
            item['last_updated']
        ])

print("Created mooncat_colors_catalog.csv with exact requested columns.")

# 2. Orders CSV template / starter
with open('mooncat_orders.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Name', 'Type', 'Color Palette', 'Number Ordered', 'Order Notes'])

print("Created mooncat_orders.csv starter.")
