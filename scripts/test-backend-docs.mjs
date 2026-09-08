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
const expectedTables = [
  'users', 'user_sessions', 'sms_challenges', 'account_security_events',
  'account_deletion_requests', 'couples', 'couple_members', 'couple_invitations',
  'couple_dissolutions', 'records', 'diary_entries', 'photo_sets', 'photo_items',
  'tags', 'record_tags', 'record_responses', 'response_attachments',
  'important_moments', 'moment_record_links', 'anniversaries', 'shared_reminders',
  'time_capsules', 'time_capsule_items', 'character_profiles', 'creation_drafts',
  'creation_draft_sources', 'ai_jobs', 'ai_job_events', 'works', 'work_assets',
  'memory_books', 'memory_book_chapters', 'memory_book_pages',
  'memory_book_page_sources', 'memory_book_supplements', 'memory_book_reading_progress',
  'membership_plans', 'subscriptions', 'entitlement_grants', 'credit_wallets',
  'credit_ledger', 'user_settings', 'privacy_settings', 'notification_preferences',
  'notifications', 'notification_deliveries', 'files', 'file_upload_sessions',
  'file_variants', 'async_jobs', 'feedback_tickets', 'legal_documents',
  'app_releases', 'audit_logs',
];
const requiredDatabaseContracts = [
  '`records` 统一承载日记与照片集合',
  '限制每个有效关系最多两名',
  '解除关联不得直接级联删除共同内容',
  '余额只通过不可变流水变更',
  '文件删除经 `async_jobs` 异步任务',
];
const requiredTableFields = {
  couple_members: ['couple_id', 'user_id', 'slot', 'left_at'],
  records: ['owner_id', 'couple_id', 'record_type', 'visibility', 'version'],
  diary_entries: ['record_id'],
  photo_sets: ['record_id'],
  record_responses: ['record_id', 'couple_id', 'owner_id'],
  moment_record_links: ['moment_id', 'record_id'],
  creation_draft_sources: ['draft_id', 'source_type', 'source_id'],
  memory_book_page_sources: ['page_id', 'source_type', 'source_id'],
  credit_wallets: ['available_balance', 'reserved_balance'],
  credit_ledger: ['wallet_id', 'entry_type', 'amount', 'origin_entry_id'],
  files: ['object_key', 'status', 'delete_job_id'],
  async_jobs: ['execution_mode', 'status', 'idempotency_key_digest'],
};

function validateDatabase(text) {
  const headings = [...text.matchAll(/^### `([a-z][a-z0-9_]*)`\s*$/gm)];
  const tableNames = headings.map((match) => match[1]);
  for (const table of expectedTables) {
    if (!tableNames.includes(table)) throw new Error(`Missing backend table: ${table}`);
  }
  if (tableNames.length !== 54 || new Set(tableNames).size !== 54) {
    throw new Error('Database must contain exactly 54 unique table dictionaries');
  }
  if (tableNames.some((name) => !expectedTables.includes(name))) {
    throw new Error('Database contains an unplanned table');
  }
  const forbidden = /^(?:pet_|friend_|public_|comment_|reply_|block_|report_)|^(?:friends|comments|blocks|reports)$/;
  const requiredSections = [
    '## 1. 领域与关系', '## 2. ID、时间与金额', '## 3. 归属、可见性与冻结',
    '## 4. 约束、事务与 Prisma 映射', '## 5. 通用 source 引用',
    '## 6. 删除、保留与敏感信息', '## 7. 完整字段字典',
  ];
  for (const section of requiredSections) {
    if (!text.includes(section)) throw new Error(`Missing database section: ${section}`);
  }
  for (const contract of requiredDatabaseContracts) {
    if (!text.includes(contract)) throw new Error(`Missing database contract: ${contract}`);
  }
  if (/待定|按需增加|后续补充|稍后填写|\bTODO\b|\bTBD\b/.test(text)) {
    throw new Error('Database contains an unfinished placeholder');
  }
  if (/['`"](?:PUBLIC|FRIENDS|FRIEND|PET)['`"]/.test(text)) {
    throw new Error('Database defines an excluded visibility or source enum');
  }
  for (const [index, heading] of headings.entries()) {
    const table = heading[1];
    if (forbidden.test(table)) throw new Error(`Forbidden database table: ${table}`);
    const section = text.slice(heading.index, headings[index + 1]?.index ?? text.length);
    const rows = section.split(/\r?\n/).filter((line) => /^\|/.test(line));
    if (rows[0] !== '| 字段 | PostgreSQL 类型 | 空值 | 默认值 | 约束/外键 | 业务说明 |') {
      throw new Error(`Missing six-column field dictionary: ${table}`);
    }
    const fields = rows.slice(2).map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
    if (fields.length < 3) throw new Error(`Incomplete field dictionary: ${table}`);
    const names = new Set();
    for (const cells of fields) {
      if (cells.length !== 6 || cells.some((cell) => !cell)) {
        throw new Error(`Incomplete field row: ${table}: ${cells.join(' / ')}`);
      }
      const [name, type, nullable] = cells;
      if (!/^`[a-z][a-z0-9_]*`$/.test(name) || names.has(name)) {
        throw new Error(`Invalid or duplicated field: ${table}.${name}`);
      }
      names.add(name);
      if (forbidden.test(name.slice(1, -1))) throw new Error(`Forbidden database field: ${table}.${name}`);
      if (!/^(uuid|boolean|smallint|integer|bigint|date|time\(0\)|timestamptz\(3\)|text|jsonb|bytea|inet|varchar\([1-9]\d*\)|char\([1-9]\d*\))$/.test(type)) {
        throw new Error(`Undefined database field type: ${table}.${name}: ${type}`);
      }
      if (!['是', '否'].includes(nullable)) throw new Error(`Undefined nullability: ${table}.${name}`);
      if (['`visibility`', '`default_visibility`'].includes(name) && !/^PRIVATE\/COUPLE(?:；G1)?$/.test(cells[4])) {
        throw new Error(`Visibility must be the closed PRIVATE/COUPLE enum: ${table}.${name}`);
      }
      for (const fk of cells[4].matchAll(/FK → ([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*/g)) {
        if (!expectedTables.includes(fk[1])) throw new Error(`Unknown foreign-key target: ${table}.${name} → ${fk[1]}`);
      }
    }
    if (!fields.some((cells) => /\bPK\b/.test(cells[4]))) throw new Error(`Missing primary key: ${table}`);
    for (const label of ['唯一约束：', '检查约束：', '索引：', '删除/保留：', '敏感边界：']) {
      if (!new RegExp(`${label}\\S`).test(section)) throw new Error(`Missing ${label} ${table}`);
    }
    for (const field of requiredTableFields[table] ?? []) {
      if (!names.has(`\`${field}\``)) throw new Error(`Missing required field: ${table}.${field}`);
    }
  }
  if (!text.includes('| `source_type` | varchar(16) | 否 | — | RECORD/PHOTO_ITEM/MOMENT |') ||
      !text.includes('| `source_type` | varchar(16) | 否 | — | RECORD/PHOTO_ITEM/MOMENT/WORK |')) {
    throw new Error('Generic source references must use the closed non-pet source enums');
  }
  console.log('PASS: 54 unique database tables; six-column fields, constraints, indexes, lifecycle and scope');
}
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
if (args.some((arg) => !['--focus=architecture-api', '--focus=database'].includes(arg)) || args.length > 1) {
  throw new Error('Usage: node scripts/test-backend-docs.mjs [--focus=architecture-api|--focus=database]');
}
const selectedDocs = args[0] === '--focus=database' ? ['03-数据库设计.md'] : args.length ? Object.keys(requiredContent) : docs;
for (const name of selectedDocs) {
  const file = path.join(dir, name);
  if (name === '03-数据库设计.md') validateDatabase(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (!fs.existsSync(file)) throw new Error(`Missing backend doc: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  if (!/^# /m.test(text) || text.length < 200) throw new Error(`Incomplete backend doc: ${name}`);
  for (const required of requiredContent[name] ?? []) {
    if (!text.includes(required)) throw new Error(`Missing backend contract in ${name}: ${required}`);
  }
  console.log(`PASS: ${name} integrity and required content`);
}
console.log(`PASS: ${selectedDocs.length} backend documents are present and satisfy required content`);
