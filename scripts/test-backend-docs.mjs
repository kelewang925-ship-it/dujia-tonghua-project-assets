import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = [
  'README.md',
  '01-总体架构.md',
  '02-API通用规范.md',
  '03-数据库设计.md',
  '04-模块API清单.md',
  '05-文件与异步任务.md',
  '06-后端开发实施路线.md',
];
const dir = path.join(root, '06-技术与开发', '后端设计');
for (const name of docs) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing backend doc: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  if (!/^# /m.test(text) || text.length < 200) throw new Error(`Incomplete backend doc: ${name}`);
}
console.log(`PASS: ${docs.length} backend documents are present`);
