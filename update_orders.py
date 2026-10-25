#!/usr/bin/env python3
import json
import csv
import sys
import re

def update_orders_from_list(items_input, csv_output='mooncat_orders.csv'):
    """
    items_input can be a list of strings, e.g.:
    ['House of Hades', 'House of Hades', 'Merkitten', '2x Ghosts of Hecate']
    or a filepath to a text file containing names.
    """
    with open('mooncat_catalog.json', 'r', encoding='utf-8') as f:
        catalog = json.load(f)

    # If it's a file path
    if isinstance(items_input, str) and '\n' not in items_input:
        try:
            with open(items_input, 'r', encoding='utf-8') as f:
                lines = [line.strip() for line in f if line.strip()]
        except Exception:
            lines = [items_input]
    elif isinstance(items_input, str):
        lines = [line.strip() for line in items_input.split('\n') if line.strip()]
    else:
        lines = items_input

    order_counts = {}

    for line in lines:
        qty = 1
        clean = line.strip()
        prefix = re.match(r'^(\d+)\s*x\s*(.+)$', clean, re.IGNORECASE)
        suffix = re.match(r'^(.+?)\s*x\s*(\d+)$', clean, re.IGNORECASE) or re.match(r'^(.+?)\s*\((\d+)\)$', clean)
        if prefix:
            qty = int(prefix.group(1))
            clean = prefix.group(2).strip()
        elif suffix:
            clean = suffix.group(1).strip()
            qty = int(suffix.group(2))

        # Find matching item in catalog
        clean_lower = clean.lower()
        matched = None
        for item in catalog:
            if item['name'].lower() == clean_lower:
                matched = item
                break
        if not matched:
            for item in catalog:
                if clean_lower in item['name'].lower() or item['name'].lower() in clean_lower:
                    matched = item
                    break

        if matched:
            order_counts[matched['name']] = order_counts.get(matched['name'], {
                'item': matched,
                'count': 0
            })
            order_counts[matched['name']]['count'] += qty
        else:
            print(f"Warning: Could not match polish '{clean}' in Mooncat catalog.")

    # Sort alphabetically by name (Goal 2)
    sorted_names = sorted(order_counts.keys(), key=lambda x: x.lower())

    # Write to CSV
    # Columns: Name, Type (according to mooncat.com), Color Palette, Number Ordered
    with open(csv_output, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['Name', 'Type (mooncat.com)', 'Color Palette', 'Number Ordered', 'Status', 'Price'])
        for name in sorted_names:
            entry = order_counts[name]
            item = entry['item']
            writer.writerow([
                item['name'],
                item['type'],
                item['color'],
                entry['count'],
                item['status'],
                item['price']
            ])

    print(f"Successfully updated {csv_output} with {len(sorted_names)} unique ordered shades ({sum(e['count'] for e in order_counts.values())} total bottles).")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        update_orders_from_list(sys.argv[1])
    else:
        print("Usage: python3 update_orders.py 'list_of_polishes.txt' or pass color names")
