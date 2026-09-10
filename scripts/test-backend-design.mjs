import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = path.join(root, 'backend-design.html');

assert.ok(fs.existsSync(page), 'backend-design.html does not exist');
const html = fs.readFileSync(page, 'utf8');

const sourceDocuments = [
  '06-技术与开发/后端设计/README.md',
  '06-技术与开发/后端设计/01-总体架构.md',
  '06-技术与开发/后端设计/02-API通用规范.md',
  '06-技术与开发/后端设计/03-数据库设计.md',
  '06-技术与开发/后端设计/04-模块API清单.md',
  '06-技术与开发/后端设计/05-文件与异步任务.md',
  '06-技术与开发/后端设计/06-后端开发实施路线.md',
  '06-技术与开发/后端设计/2026-09-08-Node后端架构与API数据设计规格.md',
  '06-技术与开发/后端设计/2026-09-08-后端资料与公开页面实施计划.md',
];
for (const document of sourceDocuments) {
  assert.match(html, new RegExp(`href="${document}"`), `missing visible source-document link: ${document}`);
}

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
const databaseDesign = fs.readFileSync(path.join(root, '06-技术与开发/后端设计/03-数据库设计.md'), 'utf8');

function parseDatabaseTableContracts(markdown) {
  const headings = [...markdown.matchAll(/^### `([a-z][a-z0-9_]*)`\s*$/gm)];
  return new Map(headings.map((heading, index) => {
    const section = markdown.slice(heading.index, headings[index + 1]?.index ?? markdown.length);
    const rows = section.split(/\r?\n/).filter((line) => line.startsWith('|')).slice(2).map((line) =>
      line.slice(1, -1).split('|').map((cell) => cell.trim()));
    const fields = rows.map(([field, type, nullable, defaultValue, constraint, description]) => ({
      field: field.replaceAll('`', ''), type, nullable, defaultValue, constraint, description,
    }));
    const metadata = (label) => section.match(new RegExp(`${label}([^。]+)`))?.[1] ?? '';
    return [heading[1], {
      fields,
      primaryKey: fields.filter((field) => /\bPK\b/.test(field.constraint)).map((field) => field.field).join(', '),
      foreignKeys: fields.filter((field) => field.constraint.includes('FK →')).map((field) => `${field.field}: ${field.constraint}`).join('；') || '无',
      unique: metadata('唯一约束：'),
      indexes: metadata('索引：'),
      lifecycle: metadata('删除/保留：'),
    }];
  }));
}

const databaseContracts = parseDatabaseTableContracts(databaseDesign);
assert.equal(databaseContracts.size, 54, 'database source must provide one contract for every public table');
for (const table of tableCatalog) {
  const source = databaseContracts.get(table.name);
  assert.ok(source, `public table is absent from database source: ${table.name}`);
  for (const key of ['fields', 'primaryKey', 'foreignKeys', 'unique', 'indexes', 'lifecycle']) {
    assert.deepEqual(table[key], source[key], `public ${key} drifted from database source: ${table.name}`);
  }
  for (const key of ['unique', 'indexes', 'lifecycle']) {
    assert.notEqual(table[key], '无', `public ${key} must not use a fabricated placeholder: ${table.name}`);
  }
}
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

const excludedScope = html.match(/<section[^>]*id="excluded-scope"[\s\S]*?<\/section>/);
assert.ok(excludedScope, 'page must publish an explicit excluded-scope section');
for (const excluded of ['宠物', '好友关系', '公开作品可见性', '公开评论/回复', '拉黑', '举报']) {
  assert.match(excludedScope[0], new RegExp(excluded), `excluded-scope section must name ${excluded}`);
}
const executablePage = html.replace(excludedScope[0], '');
for (const excluded of ['宠物', '好友关系', '公开作品', '公开评论', '回复', '拉黑', '举报']) {
  assert.ok(!executablePage.includes(excluded), `excluded scope leaked outside its explanation: ${excluded}`);
}
for (const pattern of [
  /\/api\/v1\/(?:pets?|friends?|comments?|replies|blocks?|reports?)(?:[/{?"'])/i,
  /"name":"(?:pet|friend|public|comment|reply|block|report)[a-z_]*"/i,
  /"moduleName":"[^"\\]*(?:宠物|好友|公开评论|拉黑|举报)/,
  /(?:PUBLIC|FRIENDS|FRIEND|PET)\//,
]) assert.doesNotMatch(executablePage, pattern, `excluded capability leaked into executable catalog: ${pattern}`);

console.log(`PASS: 7 modules, ${apiCount} API entries, ${tableCount} table entries`);
