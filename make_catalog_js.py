import json

with open('mooncat_catalog.json', 'r', encoding='utf-8') as f:
    catalog = json.load(f)

with open('catalog_data.js', 'w', encoding='utf-8') as f:
    f.write('window.MOONCAT_CATALOG = ')
    json.dump(catalog, f, ensure_ascii=False)
    f.write(';\n')

print("Created catalog_data.js successfully.")
