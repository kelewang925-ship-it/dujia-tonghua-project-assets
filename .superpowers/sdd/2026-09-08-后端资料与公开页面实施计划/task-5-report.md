# Task 5 报告：文件、异步任务与后端开发路线

## RED

先以 `apply_patch` 为 `scripts/test-backend-docs.mjs` 增加文件/任务与路线的聚焦校验，随后在两份目标文档尚不存在时运行：

```text
> node scripts/test-backend-docs.mjs --focus=file-jobs
Error: Missing file/job contract: authorize → PUT → complete
Node.js v24.3.0
```

失败原因是 `05-文件与异步任务.md` 尚未存在，证明新校验不会在缺少交付物时误绿。

## GREEN

补齐两份文档后，聚焦检查实际输出：

```text
> node scripts/test-backend-docs.mjs --focus=file-jobs
PASS: file lifecycle, authorization, worker reliability, settlement and cleanup contracts
PASS: 3 in-memory file/job mutations rejected
PASS: 05-文件与异步任务.md integrity and required content
PASS: 1 backend documents are present and satisfy required content

> node scripts/test-backend-docs.mjs --focus=roadmap
PASS: 0-8 delivery roadmap, gates, rollback and closed v1 scope
PASS: 06-后端开发实施路线.md integrity and required content
PASS: 1 backend documents are present and satisfy required content
```

全量检查实际输出：

```text
> node scripts/test-backend-docs.mjs
PASS: README.md integrity and required content
PASS: 01-总体架构.md integrity and required content
PASS: 02-API通用规范.md integrity and required content
PASS: 54 unique database tables; six-column fields, constraints, indexes, lifecycle and scope
PASS: 03-数据库设计.md integrity and required content
PASS: 151 endpoints; 23 families; 7 modules; auth, DTO fields, transactions, stages and 54 table references
PASS: 21 in-memory API catalog mutations rejected
PASS: 04-模块API清单.md integrity and required content
PASS: file lifecycle, authorization, worker reliability, settlement and cleanup contracts
PASS: 3 in-memory file/job mutations rejected
PASS: 05-文件与异步任务.md integrity and required content
PASS: 0-8 delivery roadmap, gates, rollback and closed v1 scope
PASS: 06-后端开发实施路线.md integrity and required content
PASS: 7 backend documents are present and satisfy required content
```

## 变更

- 新增 `05-文件与异步任务.md`：固定对象键、上传会话和文件/任务状态机；authorize→PUT→complete 校验；签名下载与来源链权限；病毒隔离、图片派生、引用计数、延迟删除；BullMQ 可靠补投、重试、超时、DLQ、幂等、进度、通知；AI 的预扣、结算、退款与晚到结果保护。
- 新增 `06-后端开发实施路线.md`：阶段 0–8 的目标、产物、依赖、模块/API/表、迁移、三层测试、运维验证、验收门禁、不做事项与回滚/退出；明确 NestJS 先行、逐模块客户端替换、Supabase 最终退役与供应商可替换边界。
- 扩展 `scripts/test-backend-docs.mjs`：新增 `--focus=file-jobs`、`--focus=roadmap`，验证闭合状态/表契约、账务与清理关键字、完整阶段字段、迁移/退出和范围边界；文件任务校验包含 3 个内存变异拒绝用例。

## 自查

- 沿用 `files`、`file_upload_sessions`、`file_variants`、`async_jobs`、`ai_jobs`/事件和既有账本表；文档明确不新增表或状态。
- 明确 API 与 Worker 同仓独立进程、数据库可靠投递、stable BullMQ job ID、来源链授权、`SETTLE/RELEASE` 对原 `RESERVE` 的唯一终态。
- 9 个阶段均有目标、产物、前置依赖、NestJS 模块、API、数据表、迁移、单元/集成/端到端测试、运维验证、完成标准、不做事项和回滚/退出。
- 当前 App 未改；旧 Supabase 分支暂留、由用户后续手删；路线要求先后端、后客户端模块替换，最后才完全退役 Supabase。
- 未加入宠物、好友、公开评论或其它排除能力。

## 修复轮 1

### RED

先把审阅指出的对象不可覆盖、隔离会话终态、撤权/重试/监控，以及 PDF 阶段归属写成分段结构化断言和内存变异。修改测试后、修正文档前的实际输出为：

```text
> node scripts/test-backend-docs.mjs --focus=file-jobs
Error: Upload authorization must enforce the immutable no-overwrite condition
```

根因是原文只说明服务端生成对象键，未规定受签名的条件创建；同一文档也没有把病毒命中收敛到既有上传会话终态，路线则将完整 PDF 能力同时写入阶段 6 和阶段 7。

### GREEN

文件聚焦检查实际输出：

```text
> node scripts/test-backend-docs.mjs --focus=file-jobs
PASS: file lifecycle, authorization, worker reliability, settlement and cleanup contracts
PASS: 9 in-memory file/job mutations rejected
PASS: 05-文件与异步任务.md integrity and required content
PASS: 1 backend documents are present and satisfy required content
```

路线聚焦检查实际输出：

```text
> node scripts/test-backend-docs.mjs --focus=roadmap
PASS: 0-8 delivery roadmap, gates, rollback and closed v1 scope
PASS: 2 in-memory roadmap mutations rejected
PASS: 06-后端开发实施路线.md integrity and required content
PASS: 1 backend documents are present and satisfy required content
```

全量检查实际输出：

```text
> node scripts/test-backend-docs.mjs
PASS: 54 unique database tables; six-column fields, constraints, indexes, lifecycle and scope
PASS: 151 endpoints; 23 families; 7 modules; auth, DTO fields, transactions, stages and 54 table references
PASS: 21 in-memory API catalog mutations rejected
PASS: file lifecycle, authorization, worker reliability, settlement and cleanup contracts
PASS: 9 in-memory file/job mutations rejected
PASS: 05-文件与异步任务.md integrity and required content
PASS: 0-8 delivery roadmap, gates, rollback and closed v1 scope
PASS: 2 in-memory roadmap mutations rejected
PASS: 06-后端开发实施路线.md integrity and required content
PASS: 7 backend documents are present and satisfy required content
```

### 变更与自查

- 上传签名强制 `If-None-Match: *` 条件创建；同键已存在时存储拒绝覆盖，complete/session 达终态不再重新授权写入，重试只回放终态。
- 病毒命中在同一事务将 `files` 收敛为 QUARANTINED、会话由 PENDING/UPLOADED 收敛为 CANCELLED，写 `FILE_VIRUS_DETECTED` 审计原因、创建既有清理任务并释放容量预留；重复 complete 只返回同一脱敏隔离结果。
- 完整 MEMORY_BOOK_PDF Worker、`/data-exports`、PDF 下载和版本变化验收全部集中到阶段 7；阶段 6 只完成回忆册编排和来源授权。
- 新检查通过分段断言与 11 个内存变异保护条件写入、终态、病毒收敛、撤权、重试/DLQ、监控和 PDF 阶段归属，未新增数据库表或状态。
