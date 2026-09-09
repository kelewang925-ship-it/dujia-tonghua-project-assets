import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
if (!/href="backend-design\.html"/.test(html)) {
  throw new Error('Backend design entry is missing');
}

const links = [...html.matchAll(/<a(?=[^>]*href="#gallery")(?=[^>]*data-gallery-jump="(\d{2})")[^>]*>/g)]
  .map((match) => match[1]);
const expected = ['01', '02', '03', '04', '05', '06', '07', '08'];

if (JSON.stringify(links) !== JSON.stringify(expected)) {
  throw new Error(`Expected gallery jump links ${expected.join(',')}, got ${links.join(',')}`);
}

if (!/querySelectorAll\('\[data-gallery-jump\]'\)/.test(html)) {
  throw new Error('Gallery jump listener registration is missing');
}

if (!/setGalleryFilter\(link\.dataset\.galleryJump\)/.test(html)) {
  throw new Error('Gallery jump does not apply the requested module filter');
}

if (/href="新模块分布\//.test(html)) {
  throw new Error('A public page still links to an unpublished local directory');
}

console.log('PASS: all 8 module links jump to and filter the gallery');
