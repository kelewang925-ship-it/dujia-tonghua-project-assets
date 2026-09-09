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
const expectedTableOwners = {
  auth: ['user_sessions', 'sms_challenges', 'account_security_events'],
  users: ['users', 'account_deletion_requests'],
  couples: ['couples', 'couple_members', 'couple_invitations', 'couple_dissolutions'],
  records: ['records', 'diary_entries', 'photo_sets', 'photo_items', 'tags', 'record_tags', 'record_responses', 'response_attachments'],
  moments: ['important_moments', 'moment_record_links', 'anniversaries', 'shared_reminders', 'time_capsules', 'time_capsule_items'],
  workshop: ['character_profiles', 'creation_drafts', 'creation_draft_sources', 'ai_jobs', 'ai_job_events', 'works', 'work_assets'],
  'memory-books': ['memory_books', 'memory_book_chapters', 'memory_book_pages', 'memory_book_page_sources', 'memory_book_supplements', 'memory_book_reading_progress'],
  membership: ['membership_plans', 'subscriptions', 'entitlement_grants', 'credit_wallets', 'credit_ledger'],
  settings: ['user_settings', 'privacy_settings', 'notification_preferences'],
  notifications: ['notifications', 'notification_deliveries'],
  files: ['files', 'file_upload_sessions', 'file_variants'],
  jobs: ['async_jobs'],
  system: ['feedback_tickets', 'legal_documents', 'app_releases', 'audit_logs'],
};
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
  const tableSections = new Map(headings.map((heading, index) => [
    heading[1],
    text.slice(heading.index, headings[index + 1]?.index ?? text.length),
  ]));
  const databaseOverview = text.slice(0, headings[0]?.index ?? text.length);
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
  if (!tableSections.get('async_jobs').includes('ACCOUNT_DELETION') ||
      !tableSections.get('account_deletion_requests').includes('job_type=ACCOUNT_DELETION')) {
    throw new Error('Account deletion requests need an executable ACCOUNT_DELETION async job contract');
  }
  const orderingContracts = {
    memory_book_chapters: [
      'CONSTRAINT TRIGGER memory_book_chapters_live_position_ck',
      'DEFERRABLE INITIALLY DEFERRED',
      'Prisma migration SQL',
    ],
    memory_book_pages: [
      'CONSTRAINT TRIGGER memory_book_pages_live_position_ck',
      'DEFERRABLE INITIALLY DEFERRED',
      'Prisma migration SQL',
    ],
    memory_book_page_sources: [
      'UNIQUE (page_id, position) DEFERRABLE INITIALLY DEFERRED',
      'Prisma migration SQL',
    ],
  };
  for (const [table, contracts] of Object.entries(orderingContracts)) {
    const section = tableSections.get(table);
    if (/未删除行延迟唯一/.test(section) || contracts.some((contract) => !section.includes(contract))) {
      throw new Error(`Unimplementable or incomplete deferred ordering contract: ${table}`);
    }
  }
  const softDeleteOrderingColumns = [
    'memory_book_chapters.book_id',
    'memory_book_pages.book_id',
    'memory_book_supplements.page_id',
  ];
  if (/\bparent_id\b/.test(databaseOverview) ||
      softDeleteOrderingColumns.some((mapping) => !databaseOverview.includes(mapping))) {
    throw new Error('Soft-delete ordering DDL must name each table\'s actual parent column');
  }
  const requiredForeignKeyIndexes = {
    ai_jobs: ['draft_id'],
    subscriptions: ['plan_id'],
    notifications: ['couple_id'],
  };
  for (const [table, fields] of Object.entries(requiredForeignKeyIndexes)) {
    const indexText = tableSections.get(table).match(/索引：([^。]+)/)?.[1] ?? '';
    const indexSpecs = indexText.split('、').map((spec) => spec.trim());
    for (const field of fields) {
      if (!indexSpecs.some((spec) => spec === field || new RegExp(`^\\(${field}(?:,|\\))`).test(spec))) {
        throw new Error(`Missing left-prefix B-tree index for foreign key: ${table}.${field}`);
      }
    }
  }
  const pageIndexText = tableSections.get('memory_book_pages').match(/索引：([^。]+)/)?.[1] ?? '';
  if (!pageIndexText.split('、').map((spec) => spec.trim())
      .includes('(book_id, position, id) WHERE deleted_at IS NULL')) {
    throw new Error('Memory-book pages need a live whole-book position B-tree index');
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
const apiFamilies = [
  'auth', 'users/me', 'couples', 'records', 'diaries', 'photo-sets', 'tags',
  'responses', 'moments', 'anniversaries', 'reminders', 'time-capsules', 'workshop',
  'ai-jobs', 'works', 'memory-books', 'membership', 'settings', 'notifications',
  'files', 'data-exports', 'feedback', 'system',
];
// Literal acceptance baseline from the approved task's endpoint inventory.
const requiredEndpoints = `
POST /auth/sms-codes
POST /auth/register
POST /auth/login
POST /auth/token/refresh
POST /auth/logout
POST /auth/password/reset/verify
POST /auth/password/reset/confirm
GET /auth/sessions
DELETE /auth/sessions/{sessionId}
GET /users/me
PATCH /users/me
POST /users/me/avatar-upload
DELETE /users/me/avatar
POST /users/me/password/change
POST /users/me/deletion-requests
GET /users/me/deletion-requests/current
DELETE /users/me/deletion-requests/current
GET /couples/current
GET /couples/current/members
PATCH /couples/current
POST /couples/invitations
GET /couples/invitations/{code}
DELETE /couples/invitations/{invitationId}
POST /couples/invitations/{code}/accept
POST /couples/invitations/{invitationId}/confirm
POST /couples/current/dissolutions
GET /couples/current/dissolutions/current
POST /couples/current/dissolutions/current/confirm
DELETE /couples/current/dissolutions/current
GET /records/home
GET /records
GET /records/search
GET /records/{recordId}
DELETE /records/{recordId}
POST /diaries
GET /diaries/{diaryId}
PATCH /diaries/{diaryId}
POST /photo-sets
GET /photo-sets/{photoSetId}
PATCH /photo-sets/{photoSetId}
POST /photo-sets/{photoSetId}/items
PATCH /photo-sets/{photoSetId}/items/order
DELETE /photo-sets/{photoSetId}/items/{photoItemId}
GET /tags
POST /tags
PATCH /tags/{tagId}
DELETE /tags/{tagId}
GET /records/{recordId}/responses
POST /records/{recordId}/responses
PATCH /responses/{responseId}
DELETE /responses/{responseId}
GET /responses/inbox
GET /moments
POST /moments
GET /moments/{momentId}
PATCH /moments/{momentId}
DELETE /moments/{momentId}
POST /moments/{momentId}/records
DELETE /moments/{momentId}/records/{recordId}
GET /anniversaries
POST /anniversaries
GET /anniversaries/{anniversaryId}
PATCH /anniversaries/{anniversaryId}
DELETE /anniversaries/{anniversaryId}
GET /anniversaries/{anniversaryId}/countdown
GET /reminders
POST /reminders/{reminderId}/read
POST /reminders/read-all
GET /time-capsules
POST /time-capsules
GET /time-capsules/{capsuleId}
PATCH /time-capsules/{capsuleId}
DELETE /time-capsules/{capsuleId}
POST /time-capsules/{capsuleId}/items
DELETE /time-capsules/{capsuleId}/items/{itemId}
POST /time-capsules/{capsuleId}/seal
POST /time-capsules/{capsuleId}/open
GET /workshop/overview
GET /workshop/sources
GET /workshop/drafts
POST /workshop/drafts
GET /workshop/drafts/{draftId}
PATCH /workshop/drafts/{draftId}
DELETE /workshop/drafts/{draftId}
PUT /workshop/drafts/{draftId}/sources
GET /workshop/character-profile
PUT /workshop/character-profile
POST /ai-jobs
GET /ai-jobs/{jobId}
POST /ai-jobs/{jobId}/cancel
POST /ai-jobs/{jobId}/retry
GET /works
GET /works/{workId}
DELETE /works/{workId}
POST /works/{workId}/save-to-photo-set
POST /works/{workId}/notify-partner
GET /membership/plans
GET /membership/me
POST /membership/orders
GET /membership/orders/{orderId}
GET /membership/credits
GET /membership/credits/ledger
GET /memory-books
POST /memory-books
GET /memory-books/recommendations/monthly
GET /memory-books/sources
GET /memory-books/{bookId}
PATCH /memory-books/{bookId}
DELETE /memory-books/{bookId}
GET /memory-books/{bookId}/chapters
POST /memory-books/{bookId}/chapters
PATCH /memory-books/{bookId}/chapters/{chapterId}
DELETE /memory-books/{bookId}/chapters/{chapterId}
PATCH /memory-books/{bookId}/chapters/order
POST /memory-books/{bookId}/pages
GET /memory-books/{bookId}/pages
GET /memory-books/{bookId}/pages/{pageId}
PATCH /memory-books/{bookId}/pages/{pageId}
DELETE /memory-books/{bookId}/pages/{pageId}
PATCH /memory-books/{bookId}/pages/order
POST /memory-books/{bookId}/pages/{pageId}/sources
DELETE /memory-books/{bookId}/pages/{pageId}/sources/{sourceId}
POST /memory-books/{bookId}/pages/{pageId}/supplements
PATCH /memory-books/{bookId}/pages/{pageId}/supplements/{supplementId}
DELETE /memory-books/{bookId}/pages/{pageId}/supplements/{supplementId}
PUT /memory-books/{bookId}/reading-progress
GET /settings
PATCH /settings
GET /settings/privacy
PATCH /settings/privacy
GET /settings/notifications
PATCH /settings/notifications
GET /notifications
POST /notifications/{notificationId}/read
POST /notifications/read-all
GET /files/storage-usage
POST /files/upload-sessions
POST /files/upload-sessions/{uploadId}/complete
DELETE /files/upload-sessions/{uploadId}
GET /files/{fileId}/download-url
DELETE /files/{fileId}
GET /data-exports
POST /data-exports
GET /data-exports/{jobId}
GET /data-exports/{jobId}/download-url
DELETE /data-exports/{jobId}
POST /feedback
GET /feedback
GET /system/config
GET /system/legal-documents/{documentType}
GET /system/releases/latest
`.trim().split('\n').map((line) => line.replace(' /', ' /api/v1/'));

function validateApiCatalog(text, quiet = false) {
  const rows = text.split(/\r?\n/).filter((line) => /^\| (GET|POST|PUT|PATCH|DELETE) \|/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
  const routes = new Set(rows.map(([method, route]) => `${method} ${route.replaceAll('`', '')}`));
  const rowByRoute = new Map(rows.map((row) => [`${row[0]} ${row[1].replaceAll('`', '')}`, row]));
  const endpoint = (method, route) => rowByRoute.get(`${method} ${route}`);
  for (const family of apiFamilies) {
    if (!rows.some((row) => new RegExp(`^\`/api/v1/${family}(?:/|\`$)`).test(row[1]))) {
      throw new Error(`Missing API path family: /api/v1/${family}`);
    }
  }
  for (const requiredEndpoint of requiredEndpoints) {
    if (!routes.has(requiredEndpoint)) throw new Error(`Missing required endpoint: ${requiredEndpoint}`);
  }
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    if (!rows.some((row) => row[0] === method)) throw new Error(`Missing required HTTP method: ${method}`);
  }
  if (routes.size !== rows.length) throw new Error('Duplicated API method/path');
  for (const module of ['01', '02', '03', '04', '05', '06', '08']) {
    if (!new RegExp(`^## 模块 ${module}：`, 'm').test(text)) throw new Error(`Missing current module: ${module}`);
  }
  if (/^## 模块 (?!01|02|03|04|05|06|08)\d+/m.test(text)) throw new Error('Unplanned API module');
  if (/\/api\/v1\/(?:friends|comments|blocks|reports|pets)(?:[\/\s`]|$)|\/(?:comments|replies|pets)(?:[\/\s`]|$)/i.test(text) ||
      /\b(?:supabase\.|createClient\(|rpc\(|storage\.from\()|['`"](?:PUBLIC|FRIENDS|FRIEND|PET)['`"]/.test(text)) {
    throw new Error('API contains an excluded route, visibility, source or legacy call');
  }
  if (/待定|按需(?:补充|增加)|后续补充|稍后填写|\bTODO\b|\bTBD\b|内容省略|诸如此类/.test(text)) {
    throw new Error('API contains an unfinished placeholder');
  }
  const tables = new Set();
  for (const row of rows) {
    if (row.length !== 9 || row.some((cell) => !cell || cell === '—')) throw new Error(`Incomplete endpoint fields: ${row[1]}`);
    const [method, route, permission, concurrency, request, response, errors, references, stage] = row;
    if (!/^`\/api\/v1\/[a-zA-Z0-9{}\/-]+`$/.test(route) || !/^[0-8]$/.test(stage)) {
      throw new Error(`Invalid endpoint path or development stage: ${route}`);
    }
    if (!/^(匿名|Bearer|刷新凭证|注销验证)/.test(permission) || !/^(200|201|202) /.test(response) ||
        !/^(E0|EA)/.test(errors) || !/(只读|幂等|Idempotency-Key|[Vv]ersion|单次)/.test(concurrency)) {
      throw new Error(`Unspecified auth/concurrency/response/error contract: ${route}`);
    }
    if (method !== 'GET' && !/事务：/.test(references)) throw new Error(`Missing write transaction: ${route}`);
    if (method !== 'GET' && !/写：/.test(references)) throw new Error(`Missing write-table scope: ${route}`);
    for (const match of references.matchAll(/`([a-z][a-z0-9_]*)`/g)) {
      if (!expectedTables.includes(match[1])) throw new Error(`Unknown endpoint table: ${route} → ${match[1]}`);
      tables.add(match[1]);
    }
    if (!/读：|写：/.test(references)) throw new Error(`Missing table trace: ${route}`);
    const params = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    for (const param of params) if (!request.includes(param)) throw new Error(`Undocumented path parameter: ${route}: ${param}`);
  }
  for (const table of expectedTables) if (!tables.has(table)) throw new Error(`Untraced database table: ${table}`);
  const ownerSection = text.match(/^## 数据所有者映射\s*\r?\n([\s\S]*?)(?=^## )/m)?.[1] ?? '';
  const ownerRows = ownerSection.split(/\r?\n/)
    .filter((line) => /^\| `[a-z-]+` \|/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
  const tableOwners = new Map(ownerRows.map(([owner, ownerTables]) => [
    owner.replaceAll('`', ''),
    [...ownerTables.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1]),
  ]));
  for (const [owner, ownerTables] of Object.entries(expectedTableOwners)) {
    const actual = tableOwners.get(owner) ?? [];
    if (actual.length !== ownerTables.length || ownerTables.some((table) => !actual.includes(table))) {
      throw new Error(`Incomplete API table-owner mapping: ${owner}`);
    }
  }
  const mappedTables = [...tableOwners.values()].flat();
  if (mappedTables.length !== expectedTables.length || new Set(mappedTables).size !== expectedTables.length ||
      mappedTables.some((table) => !expectedTables.includes(table))) {
    throw new Error('API table-owner mapping must cover each of the 54 tables exactly once');
  }
  const invitationCreate = endpoint('POST', '/api/v1/couples/invitations');
  if (invitationCreate[5] !== '201 首次 {invitation:Invitation,code:string}；幂等回放 {invitation:{id,status}}' ||
      /回放 code 为 null/.test(text)) {
    throw new Error('Invitation replay must return only the stable invitation id/status without plaintext code');
  }
  const deletionCreate = endpoint('POST', '/api/v1/users/me/deletion-requests');
  const deletionManagementRoutes = rows
    .filter((row) => row[2].startsWith('注销验证'))
    .map((row) => `${row[0]} ${row[1].replaceAll('`', '')}`);
  const expectedDeletionRoutes = [
    'GET /api/v1/users/me/deletion-requests/current',
    'DELETE /api/v1/users/me/deletion-requests/current',
  ];
  if (!/全(?:部业务)?会话/.test(deletionCreate[7]) ||
      deletionManagementRoutes.length !== expectedDeletionRoutes.length ||
      expectedDeletionRoutes.some((route) => !deletionManagementRoutes.includes(route)) ||
      expectedDeletionRoutes.some((route) => !rowByRoute.get(route)[4].includes('Authorization:Deletion'))) {
    throw new Error('Deletion must revoke business sessions and expose only two restricted management endpoints');
  }
  const aiRetry = endpoint('POST', '/api/v1/ai-jobs/{jobId}/retry');
  if (!/原 RESERVE 尚未 SETTLE\/RELEASE/.test(aiRetry[2]) ||
      !/不插入第二笔 RESERVE/.test(aiRetry[7]) ||
      !/已退款时只能创建新草稿与新任务/.test(text)) {
    throw new Error('AI retry must reuse an unsettled reservation; refunded work requires a new draft and job');
  }
  for (const contract of ['RECORD/PHOTO_ITEM/MOMENT/WORK', 'Idempotency-Key', 'sourceVersion', 'PRIVATE', 'COUPLE',
    '令牌族', '预扣', '来源链', 'BullMQ', '## Worker 与跨模块追踪', '## 反向验收矩阵']) {
    if (!text.includes(contract)) throw new Error(`Missing API cross-domain contract: ${contract}`);
  }
  if (!quiet) console.log(`PASS: ${rows.length} endpoints; 23 families; 7 modules; auth, DTO fields, transactions, stages and 54 table references`);
}
const args = process.argv.slice(2);
if (args.some((arg) => !['--focus=architecture-api', '--focus=database', '--focus=api-catalog'].includes(arg)) || args.length > 1) {
  throw new Error('Usage: node scripts/test-backend-docs.mjs [--focus=architecture-api|--focus=database|--focus=api-catalog]');
}
const selectedDocs = args[0] === '--focus=database' ? ['03-数据库设计.md'] :
  args[0] === '--focus=api-catalog' ? ['04-模块API清单.md'] : args.length ? Object.keys(requiredContent) : docs;
for (const name of selectedDocs) {
  const file = path.join(dir, name);
  if (name === '03-数据库设计.md') validateDatabase(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (name === '04-模块API清单.md') validateApiCatalog(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (!fs.existsSync(file)) throw new Error(`Missing backend doc: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  if (!/^# /m.test(text) || text.length < 200) throw new Error(`Incomplete backend doc: ${name}`);
  for (const required of requiredContent[name] ?? []) {
    if (!text.includes(required)) throw new Error(`Missing backend contract in ${name}: ${required}`);
  }
  console.log(`PASS: ${name} integrity and required content`);
}
console.log(`PASS: ${selectedDocs.length} backend documents are present and satisfy required content`);
