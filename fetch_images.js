const fs = require('fs');
async function getImages() {
  const url = 'https://www.lwangblack.co/products.json?limit=250';
  const res = await fetch(url);
  const data = await res.json();
  let result = {};
  data.products.forEach(p => {
    if (p.title.toLowerCase().includes('t-shirt') || p.title.toLowerCase().includes('combo') || p.title.toLowerCase().includes('press')) {
      result[p.title] = {
        images: p.images.map(i => i.src),
        variants: p.variants.map(v => ({ title: v.title, image: v.featured_image ? v.featured_image.src : null }))
      };
    }
  });
  fs.writeFileSync('C:\\Users\\Rishaaav\\.gemini\\antigravity\\images.json', JSON.stringify(result, null, 2));
}
getImages();

