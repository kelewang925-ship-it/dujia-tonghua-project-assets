import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(root, 'backend-design.html');

assert.ok(fs.existsSync(page), 'backend-design.html does not exist');
const html = fs.readFileSync(page, 'utf8');

for (const selector of [
  'data-api-item', 'data-table-item', 'data-module-filter', 'data-method-filter', 'data-search', 'data-stage',
]) assert.match(html, new RegExp(selector), `missing ${selector}`);

const moduleIds = [...html.matchAll(/data-module-filter="(\d+)"/g)].map((match) => match[1]);
assert.deepEqual(moduleIds, ['01', '02', '03', '04', '05', '06', '08'], 'must expose seven product modules');

const apiCount = Number(html.match(/data-api-total="(\d+)"/)?.[1]);
const tableCount = Number(html.match(/data-table-total="(\d+)"/)?.[1]);
assert.equal(apiCount, 151, 'must declare all 151 APIs');
assert.equal(tableCount, 54, 'must declare all 54 database tables');
assert.equal((html.match(/"path":"/g) ?? []).length, 151, 'must statically include every API path');
assert.equal((html.match(/"fields":\[/g) ?? []).length, 54, 'must statically include every table field dictionary');
assert.match(html, /renderApiCard[\s\S]*data-api-item/, 'API cards must be rendered with stable identifiers');
assert.match(html, /renderTableCard[\s\S]*data-table-item/, 'table cards must be rendered with stable identifiers');
assert.match(html, /API_CATALOG/, 'must statically include the API catalog');
assert.match(html, /TABLE_CATALOG/, 'must statically include the table catalog');
assert.match(html, /auth[\s\S]*permission[\s\S]*input[\s\S]*output[\s\S]*errors[\s\S]*tables/, 'API details must expose the complete contract');
assert.match(html, /domain[\s\S]*fields[\s\S]*primaryKey[\s\S]*foreignKeys[\s\S]*unique[\s\S]*indexes[\s\S]*lifecycle/, 'table details must expose database metadata');
assert.match(html, /aria-pressed/, 'filters must expose their pressed state');
assert.match(html, /aria-expanded[\s\S]*aria-controls/, 'disclosures must expose their state and controlled content');
assert.match(html, /location\.hash[\s\S]*hashchange/, 'deep links must use URL hashes');
assert.match(html, /prefers-reduced-motion/, 'motion must respect reduced-motion preferences');

for (const excluded of ['宠物', '好友', '公开评论', '拉黑', '举报', '/pets']) {
  assert.ok(!html.includes(excluded), `excluded scope leaked into page: ${excluded}`);
}

console.log(`PASS: 7 modules, ${apiCount} API entries, ${tableCount} table entries`);
