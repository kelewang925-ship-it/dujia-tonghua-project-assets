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
const allowedApiErrorCodes = new Set([
  'AUTH_REQUIRED', 'TOKEN_EXPIRED', 'INVALID_CREDENTIALS', 'SMS_CODE_INVALID',
  'RATE_LIMITED', 'COUPLE_REQUIRED', 'COUPLE_ACCESS_DENIED', 'RESOURCE_NOT_FOUND',
  'RESOURCE_VERSION_CONFLICT', 'PRIVATE_RESOURCE', 'IDEMPOTENCY_CONFLICT',
  'VALIDATION_FAILED', 'QUOTA_EXCEEDED', 'INSUFFICIENT_CREDITS',
  'FILE_ACCESS_DENIED', 'JOB_FAILED', 'INTERNAL_ERROR',
]);
const expectedApiDtos = [
  'DeviceInput', 'ReauthInput', 'User', 'Tokens', 'Session', 'Deletion', 'Couple',
  'Member', 'Invitation', 'Dissolution', 'RecordInput', 'RecordSummary', 'DiaryInput',
  'Diary', 'PhotoInput', 'PhotoItem', 'PhotoSetInput', 'PhotoSet', 'Tag', 'ResponseInput',
  'Response', 'MomentInput', 'Moment', 'AnniversaryInput', 'Anniversary', 'Reminder',
  'CapsuleInput', 'CapsuleItemInput', 'CapsuleMeta', 'CapsuleContent', 'SourceInput',
  'Source', 'DraftInput', 'GenerationParameters', 'Draft', 'CharacterInput', 'Character',
  'Job', 'Work', 'Plan', 'Order', 'BookInput', 'Book', 'Chapter', 'BookPage',
  'BookSourceInput', 'BookSource', 'Layout', 'SupplementInput', 'Supplement', 'Settings',
  'Privacy', 'NotificationSettings', 'Notification', 'UploadInput', 'Upload', 'File',
  'Download', 'Feedback',
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
  const tableSections = new Map(headings.map((heading, index) => [
    heading[1],
    text.slice(heading.index, headings[index + 1]?.index ?? text.length),
  ]));
  const tableFields = new Map();
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
    tableFields.set(table, fields);
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
  function hasForeignKeyLeftPrefix(table, field, constraint) {
    if (/\bPK\b/.test(constraint) && !/组成/.test(constraint)) return true;
    const section = tableSections.get(table);
    const metadata = [
      section.match(/唯一约束：([^。]+)/)?.[1] ?? '',
      section.match(/索引：([^。]+)/)?.[1] ?? '',
    ].join(' ').replaceAll('`', '').trim();
    const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[（(、；])${escapedField}(?=\\s*(?:[,，、；)）]|唯一|主键|WHERE|对|在|$|/))`).test(metadata) ||
      new RegExp(`(?:^|[\\s/])${escapedField}(?=\\s*(?:[,，、；]|唯一|WHERE|对|在|建|仅|$|/))`).test(metadata);
  }
  for (const table of expectedTables) {
    for (const cells of tableFields.get(table)) {
      const [name, , , , constraint] = cells;
      if (!constraint.includes('FK →')) continue;
      const field = name.slice(1, -1);
      if (!hasForeignKeyLeftPrefix(table, field, constraint)) {
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
  const endpointLines = text.split(/\r?\n/).filter((line) => /^\| [A-Z]+ \| `\/api\/v1\//.test(line));
  const rows = text.split(/\r?\n/).filter((line) => /^\| (GET|POST|PUT|PATCH|DELETE) \|/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
  if (endpointLines.length !== rows.length) throw new Error('Unsupported HTTP method in API catalog');
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
  if (routes.size !== requiredEndpoints.length) {
    const unexpected = [...routes].find((route) => !requiredEndpoints.includes(route));
    throw new Error(`Unexpected API endpoint: ${unexpected ?? 'unknown'}`);
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
  const dtoSection = text.match(/^## 公共 DTO 与字段白名单\s*\r?\n([\s\S]*?)(?=^## )/m)?.[1] ?? '';
  const dtoRows = dtoSection.split(/\r?\n/)
    .filter((line) => /^\| `[A-Z][A-Za-z0-9]*` \|/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
  const dtoDefinitions = new Map(dtoRows.map(([name, fields]) => [name.replaceAll('`', ''), fields]));
  if (dtoRows.length !== expectedApiDtos.length || dtoDefinitions.size !== expectedApiDtos.length ||
      expectedApiDtos.some((dto) => !dtoDefinitions.has(dto)) ||
      [...dtoDefinitions.keys()].some((dto) => !expectedApiDtos.includes(dto))) {
    throw new Error('API DTO dictionary must match the approved whitelist');
  }
  const allowedDtoReferences = new Set([...expectedApiDtos, 'PageQuery', 'List', 'Authorization']);
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
    for (const match of `${request} ${response}`.matchAll(/\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*\b/g)) {
      if (!allowedDtoReferences.has(match[0])) throw new Error(`Unknown API DTO reference: ${route} → ${match[0]}`);
    }
    for (const match of errors.matchAll(/\b[A-Z][A-Z_]{2,}\b/g)) {
      if (!allowedApiErrorCodes.has(match[0])) throw new Error(`Unknown API error code: ${route} → ${match[0]}`);
    }
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
  for (const method of ['GET', 'PATCH']) {
    if (!endpoint(method, '/api/v1/users/me')[2].startsWith('Bearer 本人')) {
      throw new Error(`${method} /api/v1/users/me must require the authenticated user`);
    }
  }
  const coupleCurrent = endpoint('GET', '/api/v1/couples/current');
  const invitationCancel = endpoint('DELETE', '/api/v1/couples/invitations/{invitationId}');
  const invitationAccept = endpoint('POST', '/api/v1/couples/invitations/{code}/accept');
  const invitationConfirm = endpoint('POST', '/api/v1/couples/invitations/{invitationId}/confirm');
  if (!/inviter\/invitee/.test(coupleCurrent[2]) || !/pendingCounterpart/.test(coupleCurrent[5]) ||
      !/受邀者最小资料/.test(coupleCurrent[7])) {
    throw new Error('Couple current state must cover inviter/invitee lookup and minimal counterpart verification');
  }
  const pendingSensitiveField = /(?:^|[,\{])(?:code|phone(?:Number|Last4)?|birthday|bio):/i;
  if (pendingSensitiveField.test(dtoDefinitions.get('Invitation')) ||
      pendingSensitiveField.test(coupleCurrent[5]) ||
      !/不返回 code\/手机号\/生日\/简介/.test(coupleCurrent[7])) {
    throw new Error('Pending invitation response must not expose sensitive fields');
  }
  for (const invitationRow of [invitationCancel, invitationAccept, invitationConfirm]) {
    if (!/`couple_members`/.test(invitationRow[7]) || !/leftAt/.test(invitationRow[7])) {
      throw new Error(`Invitation lifecycle must release stale PENDING membership: ${invitationRow[1]}`);
    }
  }
  if (!/双方各自创建邀请.*同一事务.*一个目标关系/.test(text)) {
    throw new Error('Invitation acceptance matrix must cover two users with competing PENDING invitations');
  }
  if (!text.includes('`Bearer 双方`：必须属于资源当前 ACTIVE 情侣关系。')) {
    throw new Error('Bearer parties must remain ACTIVE-only');
  }
  const expectedDissolvingRoutes = [
    'GET /api/v1/couples/current/dissolutions/current',
    'POST /api/v1/couples/current/dissolutions/current/confirm',
    'DELETE /api/v1/couples/current/dissolutions/current',
  ];
  const actualDissolvingRoutes = rows
    .filter((row) => row[2].startsWith('Bearer 解除中双方'))
    .map((row) => `${row[0]} ${row[1].replaceAll('`', '')}`);
  if (actualDissolvingRoutes.length !== expectedDissolvingRoutes.length ||
      expectedDissolvingRoutes.some((route) => !actualDissolvingRoutes.includes(route))) {
    throw new Error('Dissolving relationship endpoints need a dedicated membership guard limited to the three lifecycle routes');
  }
  const jobFields = dtoDefinitions.get('Job');
  if (!/jobId:uuid/.test(jobFields) || !/asyncJobId:uuid/.test(jobFields) ||
      !/version:integer/.test(jobFields) || !/async_jobs\.version/.test(jobFields)) {
    throw new Error('Job DTO must distinguish business/execution IDs and expose async_jobs.version');
  }
  const exportDelete = endpoint('DELETE', '/api/v1/data-exports/{jobId}');
  if (!/query:version/.test(exportDelete[4]) || !/jobId,asyncJobId,version/.test(exportDelete[5])) {
    throw new Error('Data-export deletion must round-trip the async job version and both job identifiers');
  }
  const fileDownload = endpoint('GET', '/api/v1/files/{fileId}/download-url');
  if (!/resourceType:AVATAR\/COUPLE\/RECORD\/MOMENT\//.test(fileDownload[4]) ||
      !/`couples`/.test(fileDownload[7]) || !/`important_moments`/.test(fileDownload[7]) ||
      !/`moment_record_links`/.test(fileDownload[7]) || !/coverFileId/.test(fileDownload[7]) ||
      !/当前 ACTIVE 关系/.test(fileDownload[7]) || !/复核其来源权限/.test(fileDownload[7])) {
    throw new Error('File download context must authorize COUPLE and MOMENT cover references');
  }
  for (const contract of ['RECORD/PHOTO_ITEM/MOMENT/WORK', 'Idempotency-Key', 'sourceVersion', 'PRIVATE', 'COUPLE',
    '令牌族', '预扣', '来源链', 'BullMQ', '## Worker 与跨模块追踪', '## 反向验收矩阵']) {
    if (!text.includes(contract)) throw new Error(`Missing API cross-domain contract: ${contract}`);
  }
  if (!quiet) console.log(`PASS: ${rows.length} endpoints; 23 families; 7 modules; auth, DTO fields, transactions, stages and 54 table references`);
}

function validateApiCatalogMutations(text) {
  const endpointLine = (route) => text.split(/\r?\n/).find((line) => line.includes(`\`${route}\``));
  const mutations = [
    ['extra endpoint', /Unexpected API endpoint/, (source) => {
      const line = endpointLine('/api/v1/users/me');
      return source.replace(line, `${line}\n${line.replace('/api/v1/users/me`', '/api/v1/users/me/debug`')}`);
    }],
    ['unsupported method', /Unsupported HTTP method/, (source) => {
      const line = endpointLine('/api/v1/users/me');
      return source.replace(line, `${line}\n${line.replace('| GET |', '| HEAD |')}`);
    }],
    ['missing endpoint', /Missing required endpoint/, (source) => source.replace(endpointLine('/api/v1/system/releases/latest'), '')],
    ['unknown error', /Unknown API error code/, (source) => source.replace('EA | 读：`users`', 'EA + UNKNOWN_FAILURE | 读：`users`')],
    ['unknown DTO', /Unknown API DTO reference/, (source) => source.replace('200 User | EA | 读：`users`', '200 UnknownDto | EA | 读：`users`')],
    ['unknown acronym DTO AIJob', /Unknown API DTO reference/, (source) => source.replace('202 Job | EA + RESOURCE_NOT_FOUND', '202 AIJob | EA + RESOURCE_NOT_FOUND')],
    ['unknown acronym DTO URLPayload', /Unknown API DTO reference/, (source) => source.replace('200 Download | EA + RESOURCE_NOT_FOUND', '200 URLPayload | EA + RESOURCE_NOT_FOUND')],
    ['anonymous users me', /must require the authenticated user/, (source) => source.replace(
      '| GET | `/api/v1/users/me` | Bearer 本人 |', '| GET | `/api/v1/users/me` | 匿名 |')],
    ['missing invitation cleanup', /release stale PENDING membership/, (source) => source.replace(
      /(`\/api\/v1\/couples\/invitations\/\{code\}\/accept`[^\r\n]+)leftAt/, '$1releasedAt')],
    ['missing pending counterpart', /minimal counterpart verification/, (source) => source.replace('pendingCounterpart', 'pendingPeer')],
    ['pending invitation leaks code', /must not expose sensitive fields/, (source) => source.replace(
      '| `Invitation` | id,status:', '| `Invitation` | id,code:string,status:')],
    ['pending counterpart leaks phone', /must not expose sensitive fields/, (source) => source.replace(
      'pendingCounterpart:{userId,', 'pendingCounterpart:{userId,phone:string,')],
    ['pending counterpart leaks birthday', /must not expose sensitive fields/, (source) => source.replace(
      'pendingCounterpart:{userId,', 'pendingCounterpart:{userId,birthday:date,')],
    ['pending counterpart leaks bio', /must not expose sensitive fields/, (source) => source.replace(
      'pendingCounterpart:{userId,', 'pendingCounterpart:{userId,bio:string,')],
    ['Bearer parties expanded to DISSOLVING', /Bearer parties must remain ACTIVE-only/, (source) => source.replace(
      '当前 ACTIVE 情侣关系', 'ACTIVE/DISSOLVING 情侣关系')],
    ['active guard reused while dissolving', /dedicated membership guard/, (source) => source.replace(
      '| GET | `/api/v1/couples/current/dissolutions/current` | Bearer 解除中双方',
      '| GET | `/api/v1/couples/current/dissolutions/current` | Bearer 双方')],
    ['ordinary couple write uses dissolving guard', /dedicated membership guard/, (source) => source.replace(
      '| PATCH | `/api/v1/couples/current` | Bearer 双方；仅 ACTIVE |',
      '| PATCH | `/api/v1/couples/current` | Bearer 解除中双方；仅 DISSOLVING |')],
    ['missing async job version', /Job DTO must distinguish/, (source) => source.replace('version:integer（`async_jobs.version`）', 'jobRevision:integer')],
    ['missing couple file context', /File download context/, (source) => source.replace(
      'resourceType:AVATAR/COUPLE/RECORD/MOMENT/', 'resourceType:AVATAR/RECORD/MOMENT/')],
    ['missing moment source link', /File download context/, (source) => {
      const line = endpointLine('/api/v1/files/{fileId}/download-url');
      return source.replace(line, line.replace('、`moment_record_links`', ''));
    }],
    ['missing moment source authorization', /File download context/, (source) => {
      const line = endpointLine('/api/v1/files/{fileId}/download-url');
      return source.replace(line, line.replace('并复核其来源权限', '并跳过来源权限'));
    }],
  ];
  for (const [label, expectedError, mutate] of mutations) {
    const mutated = mutate(text);
    if (mutated === text) throw new Error(`API mutation fixture drifted: ${label}`);
    try {
      validateApiCatalog(mutated, true);
    } catch (error) {
      if (expectedError.test(error.message)) continue;
      throw new Error(`API mutation failed for the wrong reason (${label}): ${error.message}`);
    }
    throw new Error(`API validator accepted in-memory mutation: ${label}`);
  }
  console.log(`PASS: ${mutations.length} in-memory API catalog mutations rejected`);
}
const requiredFileJobContracts = [
  'authorize → PUT → complete', 'signed URL', 'checksum', 'object_key',
  'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'Idempotency-Key',
  'BullMQ', 'DLQ', '病毒', '缩略图', '来源链权限', '预扣', 'SETTLE', 'RELEASE',
  '可靠补投', '引用计数', '延迟删除',
];
const requiredRoadmapContracts = [
  '当前 App 代码不改', '旧 Supabase 分支暂留', '用户后续手删',
  '先搭 NestJS 后端再逐模块替换客户端', '最终完全移除 Supabase',
  '大陆部署', '对象存储', '短信', '观测', '可替换',
];

function validateFileJobs(text, quiet = false) {
  for (const contract of requiredFileJobContracts) {
    if (!text.includes(contract)) throw new Error(`Missing file/job contract: ${contract}`);
  }
  for (const state of ['UPLOADING', 'READY', 'QUARANTINED', 'DELETE_PENDING', 'DELETED',
    'UPLOADED', 'COMPLETED', 'EXPIRED']) {
    if (!text.includes(state)) throw new Error(`Missing file lifecycle state: ${state}`);
  }
  if (!/api_jobs.*async_jobs|ai_jobs.*async_jobs/.test(text)) {
    throw new Error('File/job design must distinguish ai_jobs from async_jobs');
  }
  if (!/不新增(?:表|状态)/.test(text)) {
    throw new Error('File/job design must state the closed table and state contract');
  }
  const uploadSection = text.match(/^### 2\.2 [^\r\n]+\r?\n([\s\S]*?)(?=^### )/m)?.[1] ?? '';
  if (!uploadSection.includes('If-None-Match: *')) {
    throw new Error('Upload authorization must enforce the immutable no-overwrite condition');
  }
  if (!uploadSection.includes('已 complete/session 达终态后不得重新授权写入')) {
    throw new Error('Terminal upload sessions must not be reauthorized for writes');
  }
  const virusSection = text.match(/^### 2\.3 [^\r\n]+\r?\n([\s\S]*?)(?=^## )/m)?.[1] ?? '';
  for (const contract of [
    'files: UPLOADING → QUARANTINED',
    'file_upload_sessions: PENDING/UPLOADED → CANCELLED',
    'audit_logs.action_code=FILE_VIRUS_DETECTED',
    '同一事务', '容量预留释放', '重复 complete',
  ]) {
    if (!virusSection.includes(contract)) {
      throw new Error(`Virus quarantine is missing session-terminal contract: ${contract}`);
    }
  }
  const authorizationSection = text.match(/^### 3\.1 [^\r\n]+\r?\n([\s\S]*?)(?=^### )/m)?.[1] ?? '';
  if (!authorizationSection.includes('权限收回，停止新签名') || !authorizationSection.includes('受控访问代理')) {
    throw new Error('Download authorization must stop new signatures after revocation');
  }
  const queueSection = text.match(/^### 4\.2 [^\r\n]+\r?\n([\s\S]*?)(?=^### )/m)?.[1] ?? '';
  if (!queueSection.includes('指数退避加抖动') || !queueSection.includes('DLQ（死信观察）')) {
    throw new Error('Worker retry and DLQ contract is incomplete');
  }
  const monitoringSection = text.match(/^## 6\. [^\r\n]+\r?\n([\s\S]*)$/m)?.[1] ?? '';
  if (!monitoringSection.includes('签名拒绝率') || !monitoringSection.includes('预扣未结算金额')) {
    throw new Error('File/job monitoring must cover authorization and unsettled credits');
  }
  if (/\b(?:pets?|friends?|comments?|replies|blocks?|reports?)\b/i.test(text)) {
    throw new Error('File/job design contains an excluded v1 capability');
  }
  if (!quiet) console.log('PASS: file lifecycle, authorization, worker reliability, settlement and cleanup contracts');
}

function validateRoadmap(text, quiet = false) {
  for (const contract of requiredRoadmapContracts) {
    if (!text.includes(contract)) throw new Error(`Missing roadmap delivery contract: ${contract}`);
  }
  const stages = [...text.matchAll(/^## 阶段 ([0-8])：[^\r\n]+\r?\n([\s\S]*?)(?=^## 阶段 |(?![\s\S]))/gm)];
  if (stages.length !== 9 || stages.some((stage, index) => Number(stage[1]) !== index)) {
    throw new Error('Roadmap must contain exactly stages 0 through 8 in order');
  }
  const headings = ['目标', '产物', '前置依赖', 'NestJS 模块', 'API', '数据表', '迁移',
    '单元测试', '集成测试', '端到端测试', '运维验证', '完成标准', '本阶段不做事项', '回滚/退出'];
  for (const stage of stages) {
    for (const heading of headings) {
      if (!new RegExp(`^### ${heading}$`, 'm').test(stage[2])) {
        throw new Error(`Stage ${stage[1]} missing required section: ${heading}`);
      }
    }
  }
  const stageByNumber = new Map(stages.map((stage) => [stage[1], stage[2]]));
  const stageSix = stageByNumber.get('6');
  if (/\bPDF\b|data-exports|MEMORY_BOOK_PDF/.test(stageSix)) {
    throw new Error('Stage 6 must defer PDF and data-export delivery to stage 7');
  }
  const stageSeven = stageByNumber.get('7');
  for (const contract of ['MEMORY_BOOK_PDF Worker', '/data-exports', 'PDF 下载', 'PDF 在书版本变化时失败或重建']) {
    if (!stageSeven.includes(contract)) {
      throw new Error(`Stage 7 must own the complete PDF delivery contract: ${contract}`);
    }
  }
  if (/\b(?:pets?|friends?|comments?|replies|blocks?|reports?)\b/i.test(text)) {
    throw new Error('Roadmap contains an excluded v1 capability');
  }
  if (!quiet) console.log('PASS: 0-8 delivery roadmap, gates, rollback and closed v1 scope');
}

function validateFileJobMutations(text) {
  const mutations = [
    ['missing checksum', /Missing file\/job contract: checksum/, (source) => source.replaceAll('checksum', 'digest')],
    ['missing closed lifecycle', /Missing file lifecycle state: QUARANTINED/, (source) => source.replaceAll('QUARANTINED', 'ISOLATED')],
    ['missing table closure', /closed table and state contract/, (source) => source.replace('不新增表或状态', '允许新增表或状态')],
    ['missing no-overwrite condition', /immutable no-overwrite condition/, (source) => source.replaceAll('If-None-Match: *', 'If-Match: existing')],
    ['terminal upload session can reauthorize', /Terminal upload sessions/, (source) => source.replace('已 complete/session 达终态后不得重新授权写入', '已 complete/session 达终态后可重新授权写入')],
    ['virus leaves session open', /Virus quarantine is missing session-terminal contract: file_upload_sessions: PENDING\/UPLOADED → CANCELLED/, (source) => source.replace('file_upload_sessions: PENDING/UPLOADED → CANCELLED', 'file_upload_sessions: PENDING/UPLOADED → EXPIRED')],
    ['revocation keeps signing', /Download authorization must stop new signatures/, (source) => source.replace('权限收回，停止新签名', '权限收回，继续签名')],
    ['missing retry backoff', /Worker retry and DLQ contract is incomplete/, (source) => source.replace('指数退避加抖动', '固定立即重试')],
    ['missing authorization monitoring', /File\/job monitoring must cover authorization and unsettled credits/, (source) => source.replace('签名拒绝率', '签名指标')],
  ];
  for (const [label, expectedError, mutate] of mutations) {
    const mutated = mutate(text);
    if (mutated === text) throw new Error(`File/job mutation fixture drifted: ${label}`);
    try {
      validateFileJobs(mutated, true);
    } catch (error) {
      if (expectedError.test(error.message)) continue;
      throw new Error(`File/job mutation failed for the wrong reason (${label}): ${error.message}`);
    }
    throw new Error(`File/job validator accepted in-memory mutation: ${label}`);
  }
  console.log(`PASS: ${mutations.length} in-memory file/job mutations rejected`);
}

function validateRoadmapMutations(text) {
  const mutations = [
    ['stage 6 accepts PDF worker', /Stage 6 must defer PDF and data-export delivery to stage 7/, (source) => source.replace(
      '实现书架、建册、来源引用、章节/页/补页编排、阅读进度与删除，保证来源权限变化不会通过书或产物泄露。',
      '实现书架、建册、来源引用、章节/页/补页编排、阅读进度、PDF Worker 与删除，保证来源权限变化不会通过书或产物泄露。')],
    ['stage 7 omits PDF download', /Stage 7 must own the complete PDF delivery contract: PDF 下载/, (source) => source.replaceAll('PDF 下载', '导出下载')],
  ];
  for (const [label, expectedError, mutate] of mutations) {
    const mutated = mutate(text);
    if (mutated === text) throw new Error(`Roadmap mutation fixture drifted: ${label}`);
    try {
      validateRoadmap(mutated, true);
    } catch (error) {
      if (expectedError.test(error.message)) continue;
      throw new Error(`Roadmap mutation failed for the wrong reason (${label}): ${error.message}`);
    }
    throw new Error(`Roadmap validator accepted in-memory mutation: ${label}`);
  }
  console.log(`PASS: ${mutations.length} in-memory roadmap mutations rejected`);
}
const args = process.argv.slice(2);
if (args.some((arg) => !['--focus=architecture-api', '--focus=database', '--focus=api-catalog', '--focus=file-jobs', '--focus=roadmap'].includes(arg)) || args.length > 1) {
  throw new Error('Usage: node scripts/test-backend-docs.mjs [--focus=architecture-api|--focus=database|--focus=api-catalog|--focus=file-jobs|--focus=roadmap]');
}
const selectedDocs = args[0] === '--focus=database' ? ['03-数据库设计.md'] :
  args[0] === '--focus=api-catalog' ? ['04-模块API清单.md'] :
  args[0] === '--focus=file-jobs' ? ['05-文件与异步任务.md'] :
  args[0] === '--focus=roadmap' ? ['06-后端开发实施路线.md'] : args.length ? Object.keys(requiredContent) : docs;
for (const name of selectedDocs) {
  const file = path.join(dir, name);
  if (name === '03-数据库设计.md') validateDatabase(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  if (name === '04-模块API清单.md') {
    const apiCatalog = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    validateApiCatalog(apiCatalog);
    validateApiCatalogMutations(apiCatalog);
  }
  if (name === '05-文件与异步任务.md') {
    const fileJobs = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    validateFileJobs(fileJobs);
    validateFileJobMutations(fileJobs);
  }
  if (name === '06-后端开发实施路线.md') {
    const roadmap = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    validateRoadmap(roadmap);
    validateRoadmapMutations(roadmap);
  }
  if (!fs.existsSync(file)) throw new Error(`Missing backend doc: ${name}`);
  const text = fs.readFileSync(file, 'utf8');
  if (!/^# /m.test(text) || text.length < 200) throw new Error(`Incomplete backend doc: ${name}`);
  for (const required of requiredContent[name] ?? []) {
    if (!text.includes(required)) throw new Error(`Missing backend contract in ${name}: ${required}`);
  }
  console.log(`PASS: ${name} integrity and required content`);
}
console.log(`PASS: ${selectedDocs.length} backend documents are present and satisfy required content`);
