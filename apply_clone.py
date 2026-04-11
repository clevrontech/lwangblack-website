import fs
from pathlib import Path
import re

html_path = Path("brew_home.html")
html = html_path.read_text(encoding="utf-8")

# 1. Base Href and Assets
html = html.replace('<head>', '<head>\n    <base href="https://brewdistrict24.com/">\n    <link rel="stylesheet" type="text/css" href="http://localhost:8080/style.css"/>')
html = html.replace('</head>', '    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>\n    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js"></script>\n    <script src="http://localhost:8080/script.js"></script>\n</head>')

# 2. Logo
logo_svg = re.search(r'<div class="logo">.*?</div>', html, re.DOTALL)
if logo_svg:
    html = html.replace(logo_svg.group(0), '<div class="logo"><a href="/nl" title="Lwang Black"><span style="font-family: \'Teko\', sans-serif; font-size: 32px; font-weight: bold; color: inherit; letter-spacing: 2px;">LWANG BLACK</span></a></div>')

# 3. Hero Text
html = html.replace('Klassiek craft bier,', 'DIN को सुरुवात')
html = html.replace('gebrouwen zonder', 'एक कप MOTIVATION')
html = html.replace('flauwekul', 'बाट')
html = html.replace('Puur, eerlijk en verdomd lekker', 'PURE CLOVE + COFFEE FUSION')

# 4. Canvas replacement for sticky hero
canvas_block = '<canvas class="can" data-id="headerCan-1558037758"></canvas>'
html = html.replace(canvas_block, canvas_block + '\n</div><div class="model lwang-fixed-bottle-wrapper"><img id="gsap-hero-bottle" src="http://localhost:8080/images/logo-hero.png" alt="Lwang Black">')

# 5. Products slider texts
html = html.replace('Herfst Bok', '250g Lwang Black')
html = html.replace('IPA', '500g Lwang Black')
html = html.replace('Imperial stout', 'Gift Set')

# 6. About Section Texts
html = html.replace('Over BrewDistrict24', 'WHAT\'S INSIDE')
html = html.replace('Welkom in de wijk.', 'POWERED BY NATURE.')
html = html.replace('Dit is', 'Crafted from')
html = html.replace('de plek waar we samen', 'specialty-grade beans & hand-selected cloves')

# 7. Other random texts
html = html.replace('Bestellen', 'SHOP NOW')
html = html.replace('Onze bieren', 'Our Products')
html = html.replace('Over ons', 'About')
html = html.replace('Geniet van', 'CLOVE +')
html = html.replace('het moment', 'COFFEE FUSION')
html = html.replace('Geen 18', 'MADE IN')
html = html.replace('Geen alcohol', 'NEPAL')
html = html.replace('Brewdistrict 24 | Klassieke craft bieren, gebrouwen zonder onzin', 'Lwang Black | Premium Clove Infused Coffee')

Path("index.html").write_text(html, encoding="utf-8")
print("Successfully generated index.html")

