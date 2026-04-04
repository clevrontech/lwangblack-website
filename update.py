import os
import glob
import re

html_files = glob.glob('*.html')
new_fonts = '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />'

count = 0
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    updated_content = re.sub(
        r'<link href="https://fonts\.googleapis\.com/css2\?family=EB\+Garamond[^>]+rel="stylesheet" \/>',
        new_fonts,
        content
    )
    
    if updated_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        count += 1

print(f"Updated {count} files.")
