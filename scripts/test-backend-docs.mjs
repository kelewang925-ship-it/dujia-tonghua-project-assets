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
const requiredContent = {
  '01-总体架构.md': ['NestJS API', 'Worker', 'PostgreSQL', 'Redis', 'BullMQ', 'S3'],
  '02-API通用规范.md': [
    '/api/v1', 'Idempotency-Key', 'nextCursor', 'requestId', 'version', 'PRIVATE', 'COUPLE',
    'AUTH_REQUIRED', 'TOKEN_EXPIRED', 'INVALID_CREDENTIALS', 'SMS_CODE_INVALID',
    'RATE_LIMITED', 'COUPLE_REQUIRED', 'COUPLE_ACCESS_DENIED', 'RESOURCE_NOT_FOUND',
    'RESOURCE_VERSION_CONFLICT', 'PRIVATE_RESOURCE', 'IDEMPOTENCY_CONFLICT',
    'VALIDATION_FAILED', 'QUOTA_EXCEEDED', 'INSUFFICIENT_CREDITS',
    'FILE_ACCESS_DENIED', 'JOB_FAILED', 'INTERNAL_ERROR',
  ],
};
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--focus=architecture-api') || args.length > 1) {
  throw new Error('Usage: node scripts/test-backend-docs.mjs [--focus=architecture-api]');
}
const selectedDocs = args.length ? Object.keys(requiredContent) : docs;
for (const name of selectedDocs) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing backend doc: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  if (!/^# /m.test(text) || text.length < 200) throw new Error(`Incomplete backend doc: ${name}`);
  for (const required of requiredContent[name] ?? []) {
    if (!text.includes(required)) throw new Error(`Missing backend contract in ${name}: ${required}`);
  }
  console.log(`PASS: ${name} integrity and required content`);
}
console.log(`PASS: ${selectedDocs.length} backend documents are present and satisfy required content`);
