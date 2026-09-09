import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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
assert.match(html, /renderTableCard[\s\S]*buildTableSearchText\(table\)/, 'table cards must use the explicit field-aware search text');
assert.doesNotMatch(html, /Object\.values\(table\)\.flat\(\)\.join/, 'table search must not coerce field objects to object strings');
assert.match(html, /API_CATALOG/, 'must statically include the API catalog');
assert.match(html, /TABLE_CATALOG/, 'must statically include the table catalog');
assert.match(html, /auth[\s\S]*permission[\s\S]*input[\s\S]*output[\s\S]*errors[\s\S]*tables/, 'API details must expose the complete contract');
assert.match(html, /domain[\s\S]*fields[\s\S]*primaryKey[\s\S]*foreignKeys[\s\S]*unique[\s\S]*indexes[\s\S]*lifecycle/, 'table details must expose database metadata');
assert.match(html, /aria-pressed/, 'filters must expose their pressed state');
assert.match(html, /aria-expanded[\s\S]*aria-controls/, 'disclosures must expose their state and controlled content');
assert.match(html, /location\.hash[\s\S]*hashchange/, 'deep links must use URL hashes');
assert.match(html, /prefers-reduced-motion/, 'motion must respect reduced-motion preferences');

function extractCatalog(name) {
  const match = html.match(new RegExp(`const ${name} = (.*);`));
  assert.ok(match, `missing ${name}`);
  return JSON.parse(match[1]);
}

function loadViewerLogic() {
  const match = html.match(/\/\* PURE_VIEWER_LOGIC_START \*\/([\s\S]*?)\/\* PURE_VIEWER_LOGIC_END \*\//);
  assert.ok(match, 'viewer must expose executable pure filtering logic for regression tests');
  const context = {};
  context.globalThis = context;
  vm.runInNewContext(match[1], context);
  return context.BACKEND_DESIGN_TEST_HOOKS;
}

const apiCatalog = extractCatalog('API_CATALOG');
const tableCatalog = extractCatalog('TABLE_CATALOG');
const users = tableCatalog.find((table) => table.name === 'users');
assert.ok(users, 'users table fixture must exist');
const legacyTableSearchText = Object.values(users).flat().join(' ');
assert.equal(legacyTableSearchText.includes('phone_ciphertext'), false, 'regression fixture must prove the previous object flattening lost field text');

const viewer = loadViewerLogic();
assert.equal(viewer.buildTableSearchText(users).includes('phone_ciphertext'), true, 'field-name search must retain every field entry');
const combined = viewer.filterCatalog(apiCatalog, { module: '03', method: 'GET', query: 'records' }, 'api');
assert.ok(combined.length > 0, 'combined module/method/keyword filter must retain matching APIs');
assert.ok(combined.every((api) => api.module === '03' && api.method === 'GET' && viewer.buildApiSearchText(api).toLocaleLowerCase().includes('records')), 'combined filter must apply all three constraints');
assert.deepEqual(JSON.parse(JSON.stringify(viewer.clearFilterState())), { module: '', method: '', query: '' }, 'clear must restore every filter dimension');
assert.deepEqual(JSON.parse(JSON.stringify(viewer.nextDisclosureState(false))), { expanded: true, hidden: false, icon: '−' }, 'collapsed card must expose expanded aria state when opened');
assert.deepEqual(JSON.parse(JSON.stringify(viewer.nextDisclosureState(true))), { expanded: false, hidden: true, icon: '+' }, 'expanded card must expose collapsed aria state when closed');
assert.equal(viewer.parseHashTarget('#api-0'), 'api-0', 'API hash must resolve to a stable card id');
assert.equal(viewer.parseHashTarget('#table-53'), 'table-53', 'table hash must resolve to a stable card id');
assert.equal(viewer.parseHashTarget('#not-a-card'), '', 'unknown hashes must not target arbitrary nodes');

for (const excluded of ['宠物', '好友', '公开评论', '拉黑', '举报', '/pets']) {
  assert.ok(!html.includes(excluded), `excluded scope leaked into page: ${excluded}`);
}

console.log(`PASS: 7 modules, ${apiCount} API entries, ${tableCount} table entries`);
