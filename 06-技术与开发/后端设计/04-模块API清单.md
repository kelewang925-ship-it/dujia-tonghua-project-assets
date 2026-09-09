# 《独家童话》模块 API 清单

本清单是七个现行模块的 REST `/api/v1` 接口契约，供 App 接入、Controller、DTO、Service 和公开资料页共同使用。依赖[总体架构](./01-总体架构.md)、[API 通用规范](./02-API通用规范.md)和[54 表数据库字典](./03-数据库设计.md)。开发阶段采用[已确认规格](./2026-09-08-Node后端架构与API数据设计规格.md)的 0–8 阶段；本文件不表示端点已经部署。

范围为模块 01、02、03、04、05、06、08；可见性封闭为 `PRIVATE/COUPLE`。伴侣回应和悄悄留言只属于当前情侣关系。宠物、好友、公开作品可见性、公开评论及回复、拉黑、举报全部排除；历史设计中的宠物素材不接入，也没有专用来源类型。目标 API 不调用 Supabase。

## 阅读与实现约定

所有响应遵守 `{data,meta,requestId}` 成功包与 `{error:{code,message,details},requestId}` 错误包。表内成功响应写出 HTTP 状态和 `data` 的完整 DTO 名称；`List<T>` 是 `data:T[]`，`meta:{nextCursor:string或null,hasMore:boolean}`，其他响应的 `meta:null`。无数据的操作为 `200 null`。所有字段 camelCase，所有 ID 是 UUID，时间点是 ISO 8601 UTC，日历日为 `YYYY-MM-DD`，当地时间为 `HH:mm:ss` 加 IANA 时区。积分、价格、字节数是非负十进制字符串，不能使用 JSON 浮点数。

类型记法：`?` 表示请求可省略；`nullable` 表示可显式为 null，两者互不替代。未标 `?` 的输入必须提交；PATCH 中列出的可写字段均可省略，但至少修改一个字段，并强制携带标注的版本。输出 DTO 字段均存在，可空处显式标明。`string(n)` 是最多 n 字符，非空字段另有最小长度；数组不得含重复 ID。路径中的全部参数列在请求列；ID 不构成授权。

- `PageQuery`：`cursor?:string,limit?:integer(1–100,默认20),sortBy?:createdAt,sortOrder?:asc/desc(默认desc)`；所有列表默认按该字段和 id 同向次排序。端点另列的排序字段替换 sortBy 白名单；参数变化后游标失效。没有写 PageQuery 的读取不分页。
- `E0`：400 VALIDATION_FAILED、429 RATE_LIMITED、500 INTERNAL_ERROR。`EA`：E0 加 401 AUTH_REQUIRED、401 TOKEN_EXPIRED。表内 `+` 后为该端点追加的稳定码，HTTP 映射见通用规范；所有业务状态不允许的操作使用 400 VALIDATION_FAILED。未知 ID/越权探测统一 404 RESOURCE_NOT_FOUND；已在合法上下文取得的资源才可返回 403 PRIVATE_RESOURCE、COUPLE_ACCESS_DENIED 或 FILE_ACCESS_DENIED。
- `幂等 K`：必须提交 UUID `Idempotency-Key`，缺失为 VALIDATION_FAILED，同键异载荷/处理中为 409 IDEMPOTENCY_CONFLICT。同步回执写 async_jobs 的 REQUEST_RECEIPT；异步任务本身占用幂等作用域。同键回放重新授权，只重放脱敏业务结果，至少保留 24 小时。凭证不能进入回执：邀请码明码只在首次创建响应出现，幂等回放只返回 `invitation:{id,status}`，不含 code 字段或其他易变邀请详情；上传授权重新校验后重新签发，expiresAt 取本次期限。此处是数据库敏感边界对凭证字段的明确限制。
- `version`：更新根资源的版本；`bookVersion/pageVersion` 明确区分书和页，禁止将子版本当作书版本。DELETE 的版本放查询参数，POST/PATCH/PUT 放 JSON 请求体。相同版本并发写最多一个成功；失败为 RESOURCE_VERSION_CONFLICT，只有已授权对象可返回 currentVersion。
- 表中“读”列出业务查询/权限依据，“写”列出本操作及其直接 Worker 的目标表；`事务：`定义同步提交边界。所有受保护调用共同读取 users、user_sessions；情侣权限共同读取 couples、couple_members，表行无需重复这些基础 Guard 表。异步队列使用数据库可靠待投递记录，提交后以稳定 ID 投递 BullMQ，扫描补投；数据库与队列不能假定同事务。
- `Bearer 本人`：有效 JWT access + 未撤销设备会话；只能处理本人资源。`Bearer 双方`：必须属于资源当前 ACTIVE 情侣关系。记录、工坊内容、书的读取还适用创建者/可见性/来源链规则。普通内容编辑与删除仅原作者；双方共同编辑只开放给时刻、纪念日、回忆册和共同关系资料。不存在“伴侣可以修改对方 PRIVATE 内容”的例外。
- `Bearer 内容`：PRIVATE 仅作者；COUPLE 仅当前关系双方；DRAFT 记录、DRAFT 胶囊仅作者。解除关联后旧 COUPLE 冻结，旧 PRIVATE 仅作者可读和删除，不能修改旧关系归属。草稿、作品、书、文件、摘要、计数和来源引用执行相同规则。

## 数据所有者映射

端点表的“读/写”先按下表解析唯一数据所有者。当前路由所属模块读取其他所有者的表时，Controller 只能调用该所有者 Service 暴露的授权查询，不得跨 Repository 直读；写操作同样只能由所有者 Service 执行。这样每个端点通过表名即可明确跨模块边界，Worker 表继续记录具体流程的组合顺序。

| NestJS 所有者模块 | 唯一负责的业务表 |
| --- | --- |
| `auth` | `user_sessions`、`sms_challenges`、`account_security_events` |
| `users` | `users`、`account_deletion_requests` |
| `couples` | `couples`、`couple_members`、`couple_invitations`、`couple_dissolutions` |
| `records` | `records`、`diary_entries`、`photo_sets`、`photo_items`、`tags`、`record_tags`、`record_responses`、`response_attachments` |
| `moments` | `important_moments`、`moment_record_links`、`anniversaries`、`shared_reminders`、`time_capsules`、`time_capsule_items` |
| `workshop` | `character_profiles`、`creation_drafts`、`creation_draft_sources`、`ai_jobs`、`ai_job_events`、`works`、`work_assets` |
| `memory-books` | `memory_books`、`memory_book_chapters`、`memory_book_pages`、`memory_book_page_sources`、`memory_book_supplements`、`memory_book_reading_progress` |
| `membership` | `membership_plans`、`subscriptions`、`entitlement_grants`、`credit_wallets`、`credit_ledger` |
| `settings` | `user_settings`、`privacy_settings`、`notification_preferences` |
| `notifications` | `notifications`、`notification_deliveries` |
| `files` | `files`、`file_upload_sessions`、`file_variants` |
| `jobs` | `async_jobs` |
| `system` | `feedback_tickets`、`legal_documents`、`app_releases`、`audit_logs` |

## 公共 DTO 与字段白名单

以下名称是表内请求/成功响应可展开的字段契约；不允许透传数据库整行。

| DTO | 完整字段或字段组合 |
| --- | --- |
| `DeviceInput` | deviceId:string(128，安装随机标识),deviceName:string(100),platform:IOS/ANDROID/WEB,pushToken?:string(4096，取得设备授权后提交)；标识只存摘要，推送 Token 加密 |
| `ReauthInput` | 二选一：password:string(128)；或 challengeId:uuid,code:string(6，VERIFY_SENSITIVE 用途)。不能同时提交两组 |
| `User` | id,nickname,avatarFileId:uuid nullable,birthday:date nullable,bio:string nullable,phoneLast4:string(4),status:ACTIVE/DELETION_PENDING,version,createdAt,updatedAt |
| `Tokens` | accessToken:string,accessExpiresAt:timestamp,refreshToken:string,refreshExpiresAt:timestamp,sessionId:uuid（令牌族首代 ID）,user:User |
| `Session` | id:uuid（familyId）,deviceName,platform,lastSeenAt,createdAt,isCurrent:boolean；不返回任何令牌或摘要 |
| `Deletion` | id,status:PENDING/CANCELLED/PROCESSING/COMPLETED/FAILED,executeAfter,completedAt:timestamp nullable,cleanupJobId:uuid nullable,version；不返回原因 |
| `Couple` | id,title,coverFileId:uuid nullable,startedOn:date nullable,timezone,status:PENDING/ACTIVE/DISSOLVING/DISSOLVED,activatedAt:timestamp nullable,version,updatedAt |
| `Member` | userId,slot:1/2,nickname:string nullable,avatarFileId:uuid nullable,birthday:date nullable,bio:string nullable；资料隐藏时只保留成员标识和槽位 |
| `Invitation` | id,status:PENDING/AWAITING_CONFIRMATION/ACCEPTED/REJECTED/EXPIRED/CANCELLED,expiresAt,inviterConfirmed:boolean,inviteeConfirmed:boolean,version |
| `Dissolution` | id,status:PENDING/CANCELLED/PROCESSING/COMPLETED,executeAfter,completedAt:timestamp nullable,version |
| `RecordInput` | title:string(1–120),occurredOn:date,visibility:PRIVATE/COUPLE,status:DRAFT/PUBLISHED,locationLabel?:string(160) nullable,tagIds?:uuid[0–50],coverFileId?:uuid nullable；归属由服务端解析 |
| `RecordSummary` | id,recordType:DIARY/PHOTO_SET,title,occurredOn,visibility,status:DRAFT/PUBLISHED,ownerId,coverFileId:uuid nullable,locationLabel:string nullable,tags:Tag[],version,createdAt,updatedAt |
| `DiaryInput` | RecordInput 加 body:string(0–50000，PUBLISHED 时 trim 非空),moodCode?:HAPPY/CALM/EXCITED/GRATEFUL/SAD/MIXED nullable,weatherCode?:SUNNY/CLOUDY/RAINY/SNOWY/WINDY nullable |
| `Diary` | RecordSummary 加 body,moodCode nullable,weatherCode nullable |
| `PhotoInput` | fileId:uuid,caption?:string(1000) nullable,takenAt?:timestamp nullable；文件须 READY、RECORD_PHOTO、本人上传 |
| `PhotoItem` | id,fileId,caption:string nullable,takenAt:timestamp nullable,position:integer,originWorkAssetId:uuid nullable；文件访问仍须校验来源 |
| `PhotoSetInput` | RecordInput 加 description?:string(5000，默认空),layoutCode?:GRID/STORY(默认GRID),items:PhotoInput[0–100]；PUBLISHED 至少一张 |
| `PhotoSet` | RecordSummary 加 description,layoutCode,items:PhotoItem[0–100]；每集合最多 100 张，items 按 position,id 升序 |
| `Tag` | id,name:string(1–30),colorToken:coral/amber/mint/blue/lavender/neutral,visibility,version |
| `ResponseInput` | body?:string(1–2000) nullable,emoji?:string(32，单个表情序列) nullable,attachmentFileIds?:uuid[0–9]；文字/表情/附件至少一项 |
| `Response` | id,recordId,ownerId,body:string nullable,emoji:string nullable,attachments:{id,fileId,position}[],readAt:timestamp nullable,version,createdAt,updatedAt |
| `MomentInput` | title:string(1–120),summary?:string(3000，默认空),occurredOn:date,coverFileId?:uuid nullable,remindAt?:timestamp nullable；封面/摘要不得源自无权或 PRIVATE 内容 |
| `Moment` | id,title,summary,occurredOn,coverFileId:uuid nullable,remindAt:timestamp nullable,version,createdAt,updatedAt,links:{recordId,position,availability:AVAILABLE/UNAVAILABLE}[]；每时刻最多 100 关联 |
| `AnniversaryInput` | title:string(1–100),eventDate:date,repeatRule:ONCE/YEARLY,leapDayRule:FEB_28/MAR_01,timezone:IANA,reminderDaysBefore:integer(0–365) nullable,reminderLocalTime:time,note?:string(1000) nullable |
| `Anniversary` | id 加 AnniversaryInput 全部字段（note 始终存在、可空）,version,createdAt,updatedAt |
| `Reminder` | id,sourceType:ANNIVERSARY/CAPSULE/MOMENT,sourceId,occurrenceAt,scheduledAt,status:PENDING/DELIVERED/CANCELLED,readAt:timestamp nullable |
| `CapsuleInput` | title:string(1–120),unlockAt:未来 timestamp,timezone:IANA |
| `CapsuleItemInput` | itemType:TEXT/PHOTO,body?:string(1–20000),fileId?:uuid；TEXT 只准 body，PHOTO 只准 READY CAPSULE fileId |
| `CapsuleMeta` | id,title,status:DRAFT/SEALED/OPENED,unlockAt,timezone,sealedAt:timestamp nullable,openedAt:timestamp nullable,canOpen:boolean,version,createdAt,updatedAt |
| `CapsuleContent` | CapsuleMeta 加 items:{id,itemType,body:string nullable,fileId:uuid nullable,position}[]；最多 100 项；封存未到期绝不输出 items，包括 fileId/缩略图 |
| `SourceInput` | sourceType:RECORD/PHOTO_ITEM/MOMENT,sourceId:uuid,sourceVersion:integer≥1,position:integer≥0,caption?:string(300) nullable；PHOTO_ITEM 的 sourceVersion 取父 records.version |
| `Source` | sourceType,sourceId,sourceVersion,title,occurredOn:date nullable,previewFileId:uuid nullable；不包含签名 URL，来源不可用时仅 `{availability:UNAVAILABLE}` |
| `DraftInput` | title:string(1–120),workType:COMIC/VIDEO,visibility:PRIVATE/COUPLE,themeCode:string(32，配置白名单),promptText?:string(5000) nullable,characterProfileId?:uuid nullable,parameters:GenerationParameters |
| `GenerationParameters` | schemaVersion:1,styleCode:WATERCOLOR/STORYBOOK,aspectRatio:PORTRAIT/SQUARE/LANDSCAPE；COMIC 追加 panelCount:integer(1–24)；VIDEO 追加 durationSeconds:integer(15–180),narration:boolean,musicCode:NONE/GENTLE/WARM；不适用字段拒绝 |
| `Draft` | id 加 DraftInput 全部字段（promptText/characterProfileId 可空）,status:DRAFT/SUBMITTED/ARCHIVED,submittedAt:timestamp nullable,sources:{id,sourceType,sourceId,sourceVersion,position,caption:string nullable}[],version,createdAt,updatedAt；最多 100 来源 |
| `CharacterInput` | displayName:string(1–40),pronounCode?:HE/SHE/THEY/CUSTOM nullable,appearance:{hair?:string(200),outfit?:string(200),accessories?:string(200),customPronoun?:string(20)},personalityText?:string(1000) nullable,referenceFileId?:uuid nullable,visibility:PRIVATE/COUPLE；customPronoun 仅 CUSTOM 可用 |
| `Character` | id 加 CharacterInput 字段（可选可空字段固定输出 null，appearance 可选成员未填写时不输出）,version,updatedAt |
| `Job` | id,status:PENDING/PROCESSING/SUCCEEDED/FAILED/CANCELLED,progress:integer(0–100),attemptCount,maxAttempts,retryAllowed:boolean,cancelAllowed:boolean,resultFileId:uuid nullable,error:{code:JOB_FAILED,message:string} nullable,createdAt,completedAt:timestamp nullable；AI 任务追加 asyncJobId,workId:uuid nullable,events:{sequence,eventType,progress:integer nullable,messageCode:string nullable,createdAt}[]（最近20项） |
| `Work` | id,title,workType:COMIC/VIDEO,visibility,status:READY/ARCHIVED,coverFileId:uuid nullable,metadata:{pageCount:integer nullable,durationMs:decimal-string nullable,width:integer nullable,height:integer nullable},assets:{id,fileId,assetType:PAGE/IMAGE/VIDEO/AUDIO/SUBTITLE,position}[],version,createdAt,updatedAt |
| `Plan` | id,planCode,versionCode,displayName,billingPeriod:MONTH/YEAR/ONE_TIME,priceMinor:decimal-string,currency:CNY,benefits:{aiCredits:decimal-string,storageBytes:decimal-string,comicEnabled:boolean,videoEnabled:boolean,memoryBookEnabled:boolean},effectiveFrom,effectiveTo:timestamp nullable |
| `Order` | id,orderNo,planId,amountMinor:decimal-string,currency:CNY,status:PENDING/PAID/FAILED/CANCELLED/REFUNDED,periodStart:timestamp nullable,periodEnd:timestamp nullable,paidAt:timestamp nullable,createdAt；无支付凭据或渠道内部单号 |
| `BookInput` | title:string(1–120),subtitle?:string(200) nullable,themeCode:string(32，配置白名单),coverFileId?:uuid nullable,visibility:PRIVATE/COUPLE |
| `Book` | id 加 BookInput 全部字段（subtitle/coverFileId 可空）,status:DRAFT/PUBLISHED/ARCHIVED,publishedAt:timestamp nullable,version,createdAt,updatedAt,readingProgress:{lastPageId:uuid nullable,progressPermille:integer(0–1000),lastReadAt:timestamp nullable} nullable；仅本人阅读状态 |
| `Chapter` | id,bookId,title:string(1–100),description:string(500) nullable,position:integer≥0,version |
| `BookPage` | id,bookId,chapterId:uuid nullable,pageType:COVER/CONTENT/END,title:string(100) nullable,position:integer≥0,layout:Layout,version,sources:BookSource[],supplements:Supplement[]；每页最多 100 来源和 100 补充 |
| `BookSourceInput` | sourceType:RECORD/PHOTO_ITEM/MOMENT/WORK,sourceId:uuid,sourceVersion:integer≥1,position:integer≥0,crop?:{x:number(0–1),y:number(0–1),width:number(0–1),height:number(0–1)} nullable；裁切不得越界 |
| `BookSource` | id 加 BookSourceInput 字段（crop 可空）,availability:AVAILABLE/UNAVAILABLE；来源失效时只输出 id、position、availability，sourceId 和缓存素材均隐藏 |
| `Layout` | schemaVersion:1,templateCode:TEXT/PHOTO/MOMENT/WORK,blocks:{id:uuid,kind:TEXT/SOURCE,text?:string(5000),sourceRef?:uuid,x:number(0–1),y:number(0–1),width:number(0–1),height:number(0–1),fontCode:SERIF/SANS,colorToken:ink/coral/neutral}[0–100]；TEXT 仅 text，SOURCE 仅 sourceRef 且关联本页有效来源行，坐标不越界，禁用 URL/任意 HTML |
| `SupplementInput` | supplementType:TEXT/PHOTO,bodyText?:string(1–5000),fileId?:uuid,style:{fontCode:SERIF/SANS,colorToken:ink/coral/neutral},position:integer≥0；TEXT 仅正文，PHOTO 仅 READY MEMORY_BOOK 文件 |
| `Supplement` | id,authorId 加 SupplementInput 字段（bodyText/fileId 不适用时 null）,version,createdAt,updatedAt |
| `Settings` | defaultVisibility:PRIVATE/COUPLE,timezone:IANA,locale:zh-CN,theme:SYSTEM/LIGHT/DARK,autoSaveDrafts:boolean,version |
| `Privacy` | allowPartnerProfile:boolean,allowMemoryRecommendations:boolean,allowUsageAnalytics:boolean,hideBirthday:boolean,dataExportRequiresReauth:true,version |
| `NotificationSettings` | enabled:boolean,pushEnabled:boolean,momentEnabled:boolean,workshopEnabled:boolean,relationshipEnabled:boolean,quietStart:time nullable,quietEnd:time nullable,timezone:IANA,version |
| `Notification` | id,notificationType,title,body:string nullable,resourceType:RECORD/MOMENT/CAPSULE/AI_JOB/WORK/MEMORY_BOOK/COUPLE nullable,resourceId:uuid nullable,readAt:timestamp nullable,createdAt；资源失效隐藏 body/resourceId，标题只保留无内容安全提示 |
| `UploadInput` | purpose:AVATAR/RECORD_PHOTO/RESPONSE_ATTACHMENT/CAPSULE/CHARACTER_REFERENCE/MEMORY_BOOK,originalName?:string(255),mimeType:image/jpeg或image/png或image/webp,sizeBytes:decimal-string>0,checksumSha256:64位十六进制；WORK_ASSET/DATA_EXPORT 仅 Worker 登记 |
| `Upload` | uploadId,fileId,uploadUrl:string,method:PUT/POST,headers:object（仅 Content-Type、签名校验头）,fields:object nullable（仅 POST 的受限存储表单字段）,expiresAt；无管理密钥与自选对象键 |
| `File` | id,purpose,mimeType,sizeBytes:decimal-string,status:UPLOADING/READY/QUARANTINED/DELETE_PENDING/DELETED,version,createdAt；不返回 objectKey/checksum/原名 |
| `Download` | fileId,url:string,expiresAt:timestamp；短期凭证不得持久化或记录日志 |
| `Feedback` | id,category:BUG/SUGGESTION/ACCOUNT/BILLING/OTHER,subject:string(1–120),status:OPEN/IN_PROGRESS/RESOLVED/CLOSED,resolutionCode:string nullable,resolvedAt:timestamp nullable,version,createdAt；列表不解密正文/联系方式 |

## 模块 01：账号登录

认证仅手机号密码、短信注册和短信找回密码。手机号输入为规范化 E.164 中国大陆号码；密码长度 8–128 字符，服务端 Argon2id。限流/账号临时锁定统一使用 RATE_LIMITED，不暴露阈值。短信发送恒定结构不透露账号存在性。

找回密码验证原子消费短信挑战，并创建同 purpose=RESET_PASSWORD 的第二条证明挑战，其 code_digest 保存用途隔离的高熵 resetToken 摘要（不再次发短信）。resetToken 编码 resetId 与随机密文安全串，仅 confirm 接受；原验证码不能作为 resetToken。证明短期、单次、不可作为 Access Token。注册协议确认版本存入安全审计白名单元数据。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/sms-codes` | 匿名 REGISTER/RESET_PASSWORD；VERIFY_SENSITIVE 须 Bearer 本人 | 单次挑战；号码+用途限流 | body:phone:string,purpose:REGISTER/RESET_PASSWORD/VERIFY_SENSITIVE | 201 {challengeId,expiresAt,resendAfterSeconds:integer} | E0 | 读：`users`；写：`sms_challenges`；事务：建立 PENDING 后发送，独立事务更新 SENT/FAILED，响应结构不区分账号存在 | 1 |
| POST | `/api/v1/auth/register` | 匿名；REGISTER 挑战匹配手机号 | 单次消费；手机号唯一约束 | body:phone,challengeId,code,password,nickname:string(1–40),device:DeviceInput,acceptedLegalVersions:{terms:integer,privacy:integer} | 201 Tokens | E0 + SMS_CODE_INVALID、INVALID_CREDENTIALS | 读：`legal_documents`；写：`users`、`sms_challenges`、`user_sessions`、`user_settings`、`privacy_settings`、`notification_preferences`、`credit_wallets`、`audit_logs`；事务：消费挑战、创建用户/默认设置/零余额钱包/令牌族/协议确认一起提交，不直接授予积分 | 1 |
| POST | `/api/v1/auth/login` | 匿名；手机号+密码；普通业务只允许 ACTIVE | 单次新令牌族；不缓存凭证 | body:phone,password,device:DeviceInput | 200 Tokens；DELETION_PENDING 则 {deletionOnly:true,deletionToken,expiresAt} | E0 + INVALID_CREDENTIALS | 读：`users`；写：`user_sessions`、`account_security_events`、`users`；事务：验证账号锁定，建立新族或记录失败/锁定；注销管理分支不创建业务会话 | 1 |
| POST | `/api/v1/auth/token/refresh` | 刷新凭证；检查账号与令牌族 | 单次原子轮换；重放撤销整族 | body:refreshToken:string | 200 Tokens | E0 + AUTH_REQUIRED | 读：`users`；写：`user_sessions`、`account_security_events`；事务：锁首代和当前代、消费旧代并建立唯一后继；重放事件与整族撤销同事务 | 1 |
| POST | `/api/v1/auth/logout` | Bearer 本人当前设备 | 幂等撤销当前族；撤销后重试为 AUTH_REQUIRED | body:无 | 200 null | EA | 写：`user_sessions`、`account_security_events`；事务：撤销首代及同族，写 SESSION_REVOKE 事件 | 1 |
| POST | `/api/v1/auth/password/reset/verify` | 匿名；RESET_PASSWORD 短信挑战 | 单次消费原挑战，证明只返回一次 | body:phone,challengeId,code | 200 {resetToken:string,expiresAt:timestamp} | E0 + SMS_CODE_INVALID | 读：`users`；写：`sms_challenges`；事务：消费原挑战、创建 resetToken 证明摘要；无用户/失效挑战同码处理 | 1 |
| POST | `/api/v1/auth/password/reset/confirm` | 匿名；单用途 resetToken | 单次消费证明；不重放旧证明 | body:resetToken,newPassword:string(8–128) | 200 null | E0 + SMS_CODE_INVALID | 写：`sms_challenges`、`users`、`user_sessions`、`account_security_events`；事务：验证并消费证明、更新哈希/版本、撤销全部设备会话 | 1 |
| GET | `/api/v1/auth/sessions` | Bearer 本人；按 familyId 汇总有效设备 | 只读 | query:PageQuery（sortBy:lastSeenAt，默认desc） | 200 List<Session> | EA | 读：`user_sessions` | 1 |
| DELETE | `/api/v1/auth/sessions/{sessionId}` | Bearer 本人；sessionId 必须为本人族首代 | 幂等撤销；其他有效会话可重复撤销 | path:sessionId；body:无 | 200 null | EA + RESOURCE_NOT_FOUND | 写：`user_sessions`、`account_security_events`；事务：锁目标首代、撤销全族并记录事件 | 1 |

Refresh Token 只存摘要；App 合并并发刷新。同一旧令牌同时刷新只有一个成功，后续重放会撤销首个请求刚产生的后继，客户端必须重新登录。Tokens 不进入长期幂等回执与日志，多设备互不共用令牌族。

## 模块 02：账号关联

PENDING 邀请生成后受邀方先 accept，状态进入 AWAITING_CONFIRMATION，发起方在核对受邀人后 confirm，才在锁定双方 users、couples、邀请的同一事务激活两个槽位。accept 自己的邀请码、已在其他关系、过期/取消/已被他人使用均不可绑定；凭码查询只返回最小核对资料，不能列出历史伴侣。客户端对 `{code}` 路径的访问日志须记录路由模板，不记录原值；邀请码不放分析事件与 Referer。

解除关联采用“创建请求 → 发起者再次确认 → 立即冻结”流程；executeAfter 在创建时设为当前事务时间，最终确认由同一申请者完成，另一方只能读取必要状态。未确认可撤回，确认不需要另一方同意。请求时状态 DISSOLVING，不接收新邀请/新共同写入；确认原子结束双方关系。等待状态通过 current 返回，不增加轮询副作用。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/couples/current` | Bearer 本人；只看当前成员关系 | 只读 | query:无 | 200 {couple:Couple nullable,invitation:Invitation nullable,waitingFor:INVITEE/INVITER/NONE} | EA | 读：`couples`、`couple_members`、`couple_invitations` | 2 |
| GET | `/api/v1/couples/current/members` | Bearer 双方；受资料隐私偏好约束 | 只读 | query:无 | 200 Member[2] | EA + COUPLE_REQUIRED | 读：`couple_members`、`users`、`privacy_settings`、`files` | 2 |
| PATCH | `/api/v1/couples/current` | Bearer 双方；仅 ACTIVE | version；封面文件必须双方可见 | body:version,title?:string(1–80),startedOn?:date nullable,timezone?:IANA,coverFileId?:uuid nullable | 200 Couple | EA + COUPLE_REQUIRED、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 读：`files`；写：`couples`、`files`、`audit_logs`；事务：校验版本/封面引用、更新共同资料与引用计数 | 2 |
| POST | `/api/v1/couples/invitations` | Bearer 本人；没有 ACTIVE/DISSOLVING 关系 | 幂等 K；每关系唯一未结束邀请 | body:无 | 201 首次 {invitation:Invitation,code:string}；幂等回放 {invitation:{id,status}} | EA + IDEMPOTENCY_CONFLICT、COUPLE_ACCESS_DENIED | 写：`couples`、`couple_members`、`couple_invitations`、`async_jobs`、`audit_logs`；事务：新建或复用本人 PENDING 关系、首槽位、邀请码摘要、回执；回执只持久化 invitation.id/status，明码 code 仅首次响应 | 2 |
| GET | `/api/v1/couples/invitations/{code}` | Bearer 本人持有效邀请码；限流核对，不披露无关关系 | 只读；不消费邀请码 | path:code:string(高熵邀请码) | 200 {invitation:Invitation,inviter:{nickname,avatarFileId:uuid nullable},canAccept:boolean} | EA + RESOURCE_NOT_FOUND、COUPLE_ACCESS_DENIED | 读：`couple_invitations`、`couples`、`couple_members`、`users`、`privacy_settings` | 2 |
| DELETE | `/api/v1/couples/invitations/{invitationId}` | Bearer 本人邀请发起者；只限待确认邀请 | version；幂等 K | path:invitationId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`couple_invitations`、`async_jobs`、`audit_logs`；事务：锁邀请改 CANCELLED，清除可用码，保留 PENDING 关系可重新邀请 | 2 |
| POST | `/api/v1/couples/invitations/{code}/accept` | Bearer 本人受邀者；不得是发起者或已有有效关系 | 幂等 K；version；双方用户锁防重复入组 | path:code；body:version | 200 Invitation | EA + RESOURCE_NOT_FOUND、COUPLE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`couple_invitations`、`async_jobs`、`audit_logs`；事务：绑定唯一 inviteeId、写受邀确认时间并进入 AWAITING_CONFIRMATION，尚不写第二槽位 | 2 |
| POST | `/api/v1/couples/invitations/{invitationId}/confirm` | Bearer 本人发起者；受邀人仍无其他有效关系 | 幂等 K；version；双方用户/关系/邀请同锁 | path:invitationId；body:version | 200 {couple:Couple,invitation:Invitation} | EA + RESOURCE_NOT_FOUND、COUPLE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`couple_invitations`、`couples`、`couple_members`、`credit_wallets`、`async_jobs`、`audit_logs`；事务：写发起确认/接受时间、激活双槽位、建立零余额共同钱包、保存回执 | 2 |
| POST | `/api/v1/couples/current/dissolutions` | Bearer 双方；发起者重新认证 | 幂等 K；version 为 couple.version | body:version,reauth:ReauthInput,reason?:string(500) | 201 Dissolution | EA + COUPLE_REQUIRED、INVALID_CREDENTIALS、SMS_CODE_INVALID、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`users`；写：`couple_dissolutions`、`couples`、`sms_challenges`、`async_jobs`、`audit_logs`；事务：消费可选短信证明、建立请求并改 DISSOLVING | 2 |
| GET | `/api/v1/couples/current/dissolutions/current` | Bearer 双方当前关系；不返回另一方原因 | 只读 | query:无 | 200 Dissolution nullable | EA + COUPLE_REQUIRED | 读：`couple_dissolutions`、`couples` | 2 |
| POST | `/api/v1/couples/current/dissolutions/current/confirm` | Bearer 本人请求发起者 | 幂等 K；version 为 dissolution.version，coupleVersion | body:version,coupleVersion:integer≥1 | 200 {status:COMPLETED,dissolvedAt:timestamp} | EA + COUPLE_ACCESS_DENIED、RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`couple_dissolutions`、`couples`、`couple_members`、`couple_invitations`、`async_jobs`、`audit_logs`；事务：请求完成、DISSOLVED/frozenAt、双方 leftAt、撤销邀请；不删除共同内容；回放仅向原发起者返回无正文完成回执 | 2 |
| DELETE | `/api/v1/couples/current/dissolutions/current` | Bearer 本人请求发起者，未执行 | 幂等 K；version 为 dissolution.version，coupleVersion | query:version,coupleVersion | 200 null | EA + RESOURCE_NOT_FOUND、COUPLE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`couple_dissolutions`、`couples`、`async_jobs`、`audit_logs`；事务：请求 CANCELLED、关系恢复 ACTIVE，与确认互斥 | 2 |

## 模块 03：首页与共同记录

日记 ID 与照片集合 ID 都是 records.id。记录作者拥有原文编辑权；COUPLE 记录只给伴侣添加私密回应的能力。PRIVATE、DRAFT、删除或冻结的原记录不会出现在伴侣的详情、搜索、标签计数、回应列表和文件签名中。改为 PRIVATE 时原回应不再可读，并解除不同可见性的 record_tags。删除原始内容只软删除根，关联读取立即停止；清理遵守数据库恢复窗口。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/records/home` | Bearer 内容；未关联可使用本人记录 | 只读 | query:无 | 200 {couple:Couple nullable,daysTogether:integer nullable,recentRecords:RecordSummary[0–10],unreadResponseCount:integer,nextMoment:{id,title,occurredOn} nullable} | EA | 读：`records`、`record_tags`、`tags`、`record_responses`、`couples`、`important_moments`；时刻数据所有者 moments，仅返回一件可读预告 | 3 |
| GET | `/api/v1/records` | Bearer 内容 | 只读 | query:PageQuery,recordType?:DIARY/PHOTO_SET,status?:DRAFT/PUBLISHED,visibility?:PRIVATE/COUPLE,from?:date,to?:date,tagId?:uuid | 200 List<RecordSummary> | EA | 读：`records`、`record_tags`、`tags`、`photo_items` | 3 |
| GET | `/api/v1/records/search` | Bearer 内容；共同搜索先过滤授权 | 只读 | query:PageQuery,q:string(1–100),kind?:DIARY/PHOTO_SET/TAG/MOMENT,from?:date,to?:date | 200 List<{kind:DIARY/PHOTO_SET/TAG/MOMENT,id,title,occurredOn:date nullable,previewFileId:uuid nullable}> | EA | 读：`records`、`diary_entries`、`photo_sets`、`tags`、`record_tags`、`important_moments`、`moment_record_links`；时刻入口由 moments 授权，按 createdAt,id 排序 | 3 |
| GET | `/api/v1/records/{recordId}` | Bearer 内容；归属/类型一并检查 | 只读 | path:recordId | 200 Diary 或 PhotoSet，按 recordType 唯一分支 | EA + RESOURCE_NOT_FOUND | 读：`records`、`diary_entries`、`photo_sets`、`photo_items`、`record_tags`、`tags` | 3 |
| DELETE | `/api/v1/records/{recordId}` | Bearer 本人原作者；旧 PRIVATE 仍可删除 | 幂等 K；version | path:recordId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`records`、`async_jobs`、`audit_logs`；事务：根 deletedAt/version 与清理待投递记录提交，扩展/回应即时继承停读，Worker 复核引用后清理 | 3 |
| POST | `/api/v1/diaries` | Bearer 本人；COUPLE 须 ACTIVE | 幂等 K | body:DiaryInput | 201 Diary | EA + COUPLE_REQUIRED、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 读：`tags`、`files`；写：`records`、`diary_entries`、`record_tags`、`files`、`async_jobs`；事务：DIARY 根和唯一扩展、标签/封面引用、回执一起提交 | 3 |
| GET | `/api/v1/diaries/{diaryId}` | Bearer 内容；必须 DIARY | 只读 | path:diaryId | 200 Diary | EA + RESOURCE_NOT_FOUND | 读：`records`、`diary_entries`、`record_tags`、`tags` | 3 |
| PATCH | `/api/v1/diaries/{diaryId}` | Bearer 本人原作者 | version；发布前正文非空 | path:diaryId；body:version,DiaryInput 中可写字段子集 | 200 Diary | EA + RESOURCE_NOT_FOUND、COUPLE_REQUIRED、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 读：`tags`、`files`；写：`records`、`diary_entries`、`record_tags`、`files`；事务：根/扩展/标签和引用共同更新，收窄可见性即时使回应和派生访问失效 | 3 |
| POST | `/api/v1/photo-sets` | Bearer 本人；COUPLE 须 ACTIVE | 幂等 K | body:PhotoSetInput | 201 PhotoSet | EA + COUPLE_REQUIRED、FILE_ACCESS_DENIED、QUOTA_EXCEEDED、IDEMPOTENCY_CONFLICT | 读：`tags`；写：`records`、`photo_sets`、`photo_items`、`record_tags`、`files`、`async_jobs`；事务：PHOTO_SET 根/唯一扩展/照片/标签/文件引用与回执提交 | 3 |
| GET | `/api/v1/photo-sets/{photoSetId}` | Bearer 内容；必须 PHOTO_SET；工坊来源递归校验 | 只读 | path:photoSetId | 200 PhotoSet | EA + RESOURCE_NOT_FOUND | 读：`records`、`photo_sets`、`photo_items`、`record_tags`、`tags`、`work_assets`、`works` | 3 |
| PATCH | `/api/v1/photo-sets/{photoSetId}` | Bearer 本人原作者 | version | path:photoSetId；body:version,RecordInput 可写子集,description?:string(5000),layoutCode?:GRID/STORY | 200 PhotoSet | EA + RESOURCE_NOT_FOUND、COUPLE_REQUIRED、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 读：`tags`、`photo_items`；写：`records`、`photo_sets`、`record_tags`、`files`；事务：根/扩展/封面标签更新，发布不得为空集合 | 3 |
| POST | `/api/v1/photo-sets/{photoSetId}/items` | Bearer 本人集合作者 | 幂等 K；version 为 records.version | path:photoSetId；body:version,items:PhotoInput[1–100] | 201 {items:PhotoItem[],version} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED、QUOTA_EXCEEDED、IDEMPOTENCY_CONFLICT | 写：`records`、`photo_items`、`files`、`async_jobs`；事务：锁父记录、检查总张数≤100、追加位置与引用、增加根版本 | 3 |
| PATCH | `/api/v1/photo-sets/{photoSetId}/items/order` | Bearer 本人集合作者 | version；全量页序原子更新 | path:photoSetId；body:version,itemIds:uuid[1–100]（全部存活项恰一次） | 200 {items:PhotoItem[],version} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`records`、`photo_items`；事务：父锁、移动软删除项至尾部保留区、重排全部存活项、延迟唯一检查 | 3 |
| DELETE | `/api/v1/photo-sets/{photoSetId}/items/{photoItemId}` | Bearer 本人集合作者；项必须属于路径集合 | 幂等 K；version 为根版本 | path:photoSetId,photoItemId；query:version | 200 {version:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`records`、`photo_items`、`async_jobs`；事务：软删单项/增加根版本，替换失效封面；PUBLISHED 最后一项拒绝删除，须先转草稿 | 3 |
| GET | `/api/v1/tags` | Bearer 内容；标签范围相同过滤 | 只读 | query:PageQuery,visibility?:PRIVATE/COUPLE,q?:string(30) | 200 List<Tag> | EA | 读：`tags` | 3 |
| POST | `/api/v1/tags` | Bearer 本人；COUPLE 须 ACTIVE | 幂等 K；规范化名称唯一 | body:name:string(1–30),colorToken:coral/amber/mint/blue/lavender/neutral,visibility:PRIVATE/COUPLE | 201 Tag | EA + COUPLE_REQUIRED、IDEMPOTENCY_CONFLICT | 写：`tags`、`async_jobs`；事务：NFKC/trim/小写规范化并写标签回执，同范围重名为 VALIDATION_FAILED | 3 |
| PATCH | `/api/v1/tags/{tagId}` | Bearer 本人标签作者；不改变原范围 | version | path:tagId；body:version,name?:string(1–30),colorToken?:coral/amber/mint/blue/lavender/neutral | 200 Tag | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`tags`；事务：版本校验和名称唯一检查后更新 | 3 |
| DELETE | `/api/v1/tags/{tagId}` | Bearer 本人标签作者 | 幂等 K；version | path:tagId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`tags`、`async_jobs`；事务：软删标签，所有记录的标签展示过滤删除态，恢复期后 Worker 移除连接 | 3 |
| GET | `/api/v1/records/{recordId}/responses` | Bearer 双方；父 PUBLISHED/COUPLE；仅私密双人 | 只读；不隐式标已读 | path:recordId；query:PageQuery | 200 List<Response> | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE | 读：`records`、`record_responses`、`response_attachments` | 3 |
| POST | `/api/v1/records/{recordId}/responses` | Bearer 双方；仅记录作者的当前伴侣 | 幂等 K | path:recordId；body:ResponseInput | 201 Response | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、COUPLE_ACCESS_DENIED、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 写：`record_responses`、`response_attachments`、`files`、`notifications`、`notification_deliveries`、`async_jobs`；事务：锁父记录重新授权、创建回应/附件/无正文通知和投递任务 | 3 |
| PATCH | `/api/v1/responses/{responseId}` | Bearer 双方；回应作者可编辑；原记录作者只可标已读 | version；两个请求分支互斥 | path:responseId；body:version,ResponseInput 可写子集；或 version,read:true | 200 Response | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、COUPLE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 读：`records`；写：`record_responses`、`response_attachments`、`files`、`async_jobs`；事务：锁父记录/回应、更新正文或 readAt；移除附件排清理，保留至少一种有效内容 | 3 |
| DELETE | `/api/v1/responses/{responseId}` | Bearer 双方；仅回应作者撤回 | 幂等 K；version | path:responseId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`records`；写：`record_responses`、`async_jobs`；事务：软删回应与待清理登记，附件立即停读 | 3 |
| GET | `/api/v1/responses/inbox` | Bearer 双方；仅聚合写给本人原记录的回应 | 只读；时刻只是原始记录关联入口 | query:PageQuery,unreadOnly?:boolean,momentId?:uuid | 200 List<{response:Response,momentIds:uuid[]}> | EA + COUPLE_REQUIRED | 读：`record_responses`、`response_attachments`、`records`、`moment_record_links`、`important_moments`；moments 提供已授权索引，不建立独立留言树 | 4 |

## 模块 04：重要时刻

时刻与纪念日是双方可编辑的共同实体。重要时刻只存摘要和原记录链接；回应读取/写入使用模块 03 的原记录端点。提醒由 MOMENT/ANNIVERSARY/CAPSULE 产生，一名接收者一行，不接受任意留言正文。纪念日按 IANA 时区、公历、repeatRule 和 leapDayRule 计算，倒计时不能以固定毫秒数替代日历日。

胶囊 DRAFT 仅作者读取和编辑；封存后正文和附件对作者本人也关闭，必须实时判断服务器 now ≥ unlockAt。GET 未到期仅返回 CapsuleMeta；创建、封存及重放响应都不含正文，客户端不得通过编辑回读。open 只在合法到期后推进 OPENED，Worker 是否已更新状态不影响到期判断；权限/时钟条件在解密与签发文件地址时再次验证。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/moments` | Bearer 双方；过滤失效来源摘要 | 只读 | query:PageQuery（sortBy:occurredOn，默认desc）,from?:date,to?:date,q?:string(100) | 200 List<Moment> | EA + COUPLE_REQUIRED | 读：`important_moments`、`moment_record_links`、`records` | 4 |
| POST | `/api/v1/moments` | Bearer 双方 | 幂等 K | body:MomentInput | 201 Moment | EA + COUPLE_REQUIRED、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 写：`important_moments`、`files`、`shared_reminders`、`async_jobs`；事务：时刻/封面引用/双方提醒实例及可靠投递记录同提交 | 4 |
| GET | `/api/v1/moments/{momentId}` | Bearer 双方；原始内容仍从 records 授权入口读 | 只读 | path:momentId | 200 Moment | EA + RESOURCE_NOT_FOUND | 读：`important_moments`、`moment_record_links`、`records` | 4 |
| PATCH | `/api/v1/moments/{momentId}` | Bearer 双方 | version | path:momentId；body:version,MomentInput 可写字段子集 | 200 Moment | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 写：`important_moments`、`files`、`shared_reminders`、`async_jobs`；事务：更新时刻与引用；取消旧时间实例并建立新实例/任务 | 4 |
| DELETE | `/api/v1/moments/{momentId}` | Bearer 双方 | 幂等 K；version | path:momentId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`important_moments`、`shared_reminders`、`async_jobs`；事务：软删时刻/取消提醒/清理任务；不删除原始记录 | 4 |
| POST | `/api/v1/moments/{momentId}/records` | Bearer 双方；来源必须同关系 PUBLISHED/COUPLE | 幂等 K；version 为时刻版本 | path:momentId；body:version,recordId:uuid,sourceVersion:integer≥1,position:integer≥0 | 201 {recordId,position,version} | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`records`；写：`important_moments`、`moment_record_links`、`async_jobs`；事务：锁双方来源与时刻、核对来源版本/上限100、插入关联与父版本 | 4 |
| DELETE | `/api/v1/moments/{momentId}/records/{recordId}` | Bearer 双方；移除引用不删除来源 | 幂等 K；version 为时刻版本 | path:momentId,recordId；query:version | 200 {version:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`important_moments`、`moment_record_links`、`async_jobs`；事务：移除连接、清空可能派生的摘要/封面后增加父版本，防移除失效源后泄露缓存 | 4 |
| GET | `/api/v1/anniversaries` | Bearer 双方 | 只读 | query:PageQuery（sortBy:eventDate，默认asc） | 200 List<Anniversary> | EA + COUPLE_REQUIRED | 读：`anniversaries` | 4 |
| POST | `/api/v1/anniversaries` | Bearer 双方 | 幂等 K | body:AnniversaryInput | 201 Anniversary | EA + COUPLE_REQUIRED、IDEMPOTENCY_CONFLICT | 写：`anniversaries`、`shared_reminders`、`async_jobs`；事务：纪念日与最近一次双方提醒/投递任务一起写入 | 4 |
| GET | `/api/v1/anniversaries/{anniversaryId}` | Bearer 双方 | 只读 | path:anniversaryId | 200 Anniversary | EA + RESOURCE_NOT_FOUND | 读：`anniversaries` | 4 |
| PATCH | `/api/v1/anniversaries/{anniversaryId}` | Bearer 双方 | version | path:anniversaryId；body:version,AnniversaryInput 可写字段子集 | 200 Anniversary | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`anniversaries`、`shared_reminders`、`async_jobs`；事务：更新日期规则、取消旧提醒并创建新提醒，关闭提醒不生成新实例 | 4 |
| DELETE | `/api/v1/anniversaries/{anniversaryId}` | Bearer 双方 | 幂等 K；version | path:anniversaryId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`anniversaries`、`shared_reminders`、`async_jobs`；事务：软删纪念日、取消待投递提醒与清理登记 | 4 |
| GET | `/api/v1/anniversaries/{anniversaryId}/countdown` | Bearer 双方 | 只读；服务器时间计算 | path:anniversaryId | 200 {anniversaryId,nextDate:date nullable,daysRemaining:integer nullable,isToday:boolean,timezone,serverTime:timestamp} | EA + RESOURCE_NOT_FOUND | 读：`anniversaries`；ONCE 已经过期为 nextDate/daysRemaining null；当天为0 | 4 |
| GET | `/api/v1/reminders` | Bearer 双方；recipient 必须本人 | 只读 | query:PageQuery（sortBy:scheduledAt，默认desc）,unreadOnly?:boolean,sourceType?:ANNIVERSARY/CAPSULE/MOMENT | 200 List<Reminder> | EA + COUPLE_REQUIRED | 读：`shared_reminders`、`anniversaries`、`time_capsules`、`important_moments` | 4 |
| POST | `/api/v1/reminders/{reminderId}/read` | Bearer 本人接收者且来源仍可读 | 幂等 readAt 只写首次 | path:reminderId；body:无 | 200 {id,readAt:timestamp} | EA + RESOURCE_NOT_FOUND | 写：`shared_reminders`；事务：带 recipient/当前权限条件将 null readAt 设为服务器时间 | 4 |
| POST | `/api/v1/reminders/read-all` | Bearer 本人接收者且来源仍可读 | 幂等；固定时间水位 | body:before:timestamp（不得晚于服务器现在） | 200 {updatedCount:integer} | EA + COUPLE_REQUIRED | 写：`shared_reminders`；事务：仅更新 scheduledAt≤before 且当下有权的本人未读项 | 4 |
| GET | `/api/v1/time-capsules` | Bearer 双方；DRAFT 仅作者 | 只读；封存列表无正文与附件数量 | query:PageQuery（sortBy:unlockAt，默认asc）,status?:DRAFT/SEALED/OPENED | 200 List<CapsuleMeta> | EA + COUPLE_REQUIRED | 读：`time_capsules` | 4 |
| POST | `/api/v1/time-capsules` | Bearer 双方；创建者拥有草稿 | 幂等 K | body:CapsuleInput | 201 CapsuleMeta | EA + COUPLE_REQUIRED、IDEMPOTENCY_CONFLICT | 写：`time_capsules`、`async_jobs`；事务：建立空草稿与回执，不能直接设 SEALED | 4 |
| GET | `/api/v1/time-capsules/{capsuleId}` | Bearer 内容；DRAFT 作者可读；SEALED 到期前双方只读元数据 | 只读；实时解锁函数 | path:capsuleId | 200 CapsuleMeta（未到期）；或 CapsuleContent（作者草稿/已到期） | EA + RESOURCE_NOT_FOUND | 读：`time_capsules`、`time_capsule_items`、`files`；禁止提前解密 | 4 |
| PATCH | `/api/v1/time-capsules/{capsuleId}` | Bearer 本人作者且 DRAFT | version；封存后所有编辑拒绝 | path:capsuleId；body:version,CapsuleInput 可写字段子集 | 200 CapsuleMeta | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`time_capsules`；事务：状态/版本条件匹配后更新 | 4 |
| DELETE | `/api/v1/time-capsules/{capsuleId}` | Bearer 本人作者；封存后可删除但不能提前取内容 | 幂等 K；version | path:capsuleId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`time_capsules`、`shared_reminders`、`async_jobs`；事务：软删根/取消提醒/排清理，正文和附件即时拒读 | 4 |
| POST | `/api/v1/time-capsules/{capsuleId}/items` | Bearer 本人作者且 DRAFT | 幂等 K；version 为胶囊版本 | path:capsuleId；body:version,items:CapsuleItemInput[1–100] | 201 {itemIds:uuid[],version} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 写：`time_capsules`、`time_capsule_items`、`files`、`async_jobs`；事务：核对总量≤100、加密文本/增加文件引用与父版本；回执无正文 | 4 |
| DELETE | `/api/v1/time-capsules/{capsuleId}/items/{itemId}` | Bearer 本人作者且 DRAFT | 幂等 K；version 为胶囊版本 | path:capsuleId,itemId；query:version | 200 {version:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`time_capsules`、`time_capsule_items`、`files`、`async_jobs`；事务：移除草稿项/更新根版本/安排无引用文件清理 | 4 |
| POST | `/api/v1/time-capsules/{capsuleId}/seal` | Bearer 本人作者且 DRAFT；当前关系 ACTIVE | 幂等 K；version；至少一项且 unlockAt>now | path:capsuleId；body:version | 200 CapsuleMeta | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`time_capsule_items`、`files`；写：`time_capsules`、`shared_reminders`、`async_jobs`；事务：封存、冻结内容及双方到期提醒一起写入 | 4 |
| POST | `/api/v1/time-capsules/{capsuleId}/open` | Bearer 双方；SEALED/OPENED 且 now≥unlockAt | 幂等 K；version；先查时间后解密 | path:capsuleId；body:version | 200 CapsuleMeta（正文通过获权 GET 获取） | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`time_capsules`、`async_jobs`；事务：首次开启写 OPENED/openedAt/version；未到期 VALIDATION_FAILED，无任何正文回执 | 4 |

## 模块 05：童话工坊

创作来源由 records、moments 所有者模块读取；自由回忆写 promptText。素材列表只返回当前获权来源，COUPLE 草稿不得选择 PRIVATE 来源。主角设定每人最多一个，双方设定由当前关系聚合；提交草稿后输入、来源和设定快照冻结，修改并重新生成时先以原字段创建新 DRAFT，再提交新任务。

AI task 的公开 id 为 ai_jobs.id；asyncJobId 指向当前执行尝试。创建、RESERVE 预扣和 PENDING 任务在同一数据库事务；Worker 成功登记产物/SETTLE，确认取消、不可恢复失败或人工重试窗口关闭时 RELEASE。自动技术重试不再次预扣；进入可人工恢复的 FAILED 状态时原 RESERVE 保持未 SETTLE/RELEASE，直到人工重试接管或退款流程释放。人工 retry 只接受 FAILED 且原 RESERVE 尚未 SETTLE/RELEASE 的可恢复任务：锁原预扣、创建新的 async_jobs、更新同一个 ai_jobs.async_job_id 并保留历史事件，旧尝试的补偿和晚到回调必须核对当前执行 ID。已退款时只能创建新草稿与新任务；已 RELEASE 或 SETTLE 的失败任务 retryAllowed=false，调用 retry 为 VALIDATION_FAILED。供应商结果不明确时保持 PROCESSING 并查证，不提前退款。取消只对尚未开始的 PENDING 生效；PROCESSING 返回 VALIDATION_FAILED，避免没有持久化取消请求状态时虚假承诺已取消。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/workshop/overview` | Bearer 内容；权益只汇总本人/当前关系 | 只读 | query:无 | 200 {recentWorks:Work[0–6],drafts:Draft[0–6],jobs:Job[0–6],comicEnabled:boolean,videoEnabled:boolean} | EA | 读：`works`、`work_assets`、`creation_drafts`、`creation_draft_sources`、`ai_jobs`、`async_jobs`、`entitlement_grants`；权益所有者 membership | 5 |
| GET | `/api/v1/workshop/sources` | Bearer 内容；COUPLE 目标只列共同来源 | 只读 | query:PageQuery,sourceType?:RECORD/PHOTO_ITEM/MOMENT,visibility:PRIVATE/COUPLE,q?:string(100),from?:date,to?:date | 200 List<Source> | EA + COUPLE_REQUIRED | 读：`records`、`diary_entries`、`photo_sets`、`photo_items`、`important_moments`、`moment_record_links`；分别调用 records/moments 授权读取 | 5 |
| GET | `/api/v1/workshop/drafts` | Bearer 内容；冻结来源失效不返回缓存输入 | 只读 | query:PageQuery（sortBy:updatedAt，默认desc）,status?:DRAFT/SUBMITTED/ARCHIVED,workType?:COMIC/VIDEO | 200 List<Draft> | EA | 读：`creation_drafts`、`creation_draft_sources`、`character_profiles` | 5 |
| POST | `/api/v1/workshop/drafts` | Bearer 本人；目标可见性不可宽于设定/来源 | 幂等 K | body:DraftInput | 201 Draft | EA + COUPLE_REQUIRED、PRIVATE_RESOURCE、IDEMPOTENCY_CONFLICT | 读：`character_profiles`；写：`creation_drafts`、`async_jobs`；事务：建 DRAFT 及回执，来源使用 sources 完整替换端点 | 5 |
| GET | `/api/v1/workshop/drafts/{draftId}` | Bearer 内容；递归来源权限 | 只读 | path:draftId | 200 Draft | EA + RESOURCE_NOT_FOUND | 读：`creation_drafts`、`creation_draft_sources`、`character_profiles` | 5 |
| PATCH | `/api/v1/workshop/drafts/{draftId}` | Bearer 本人作者且 DRAFT | version；SUBMITTED/ARCHIVED 输入不可改 | path:draftId；body:version,DraftInput 可写字段子集 | 200 Draft | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、PRIVATE_RESOURCE | 读：`character_profiles`、`creation_draft_sources`；写：`creation_drafts`；事务：核对现有所有来源/设定与目标范围、更新版本 | 5 |
| DELETE | `/api/v1/workshop/drafts/{draftId}` | Bearer 本人作者；活跃任务时拒绝删除 | 幂等 K；version | path:draftId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`ai_jobs`、`works`；写：`creation_drafts`、`async_jobs`；事务：软删停止普通读，已提交输入/来源链保留给作品授权和账务核对 | 5 |
| PUT | `/api/v1/workshop/drafts/{draftId}/sources` | Bearer 本人作者且 DRAFT；来源不宽于草稿 | version；完整替换同意图幂等 | path:draftId；body:version,sources:SourceInput[0–100] | 200 {sources:SourceInput[],version} | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT | 读：`records`、`photo_items`、`important_moments`、`moment_record_links`；写：`creation_drafts`、`creation_draft_sources`；事务：锁来源/父草稿、全量替换/延迟唯一校验、父版本递增 | 5 |
| GET | `/api/v1/workshop/character-profile` | Bearer 内容；本人设定和当前可见伴侣设定 | 只读 | query:无 | 200 {self:Character nullable,partner:Character nullable} | EA | 读：`character_profiles`、`files` | 5 |
| PUT | `/api/v1/workshop/character-profile` | Bearer 本人；只能写自己的单例 | version；首次 version=0，已有≥1 | body:version:integer≥0,CharacterInput | 200 Character | EA + COUPLE_REQUIRED、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 写：`character_profiles`、`files`；事务：唯一 owner 单例 upsert、校验参考图归属/范围、引用和版本一起写 | 5 |
| POST | `/api/v1/ai-jobs` | Bearer 本人草稿作者；来源获权且有权益/余额 | 幂等 K；draftVersion；费用由服务端计算 | body:draftId:uuid,draftVersion:integer≥1,walletScope:PRIVATE/COUPLE | 202 Job | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT、QUOTA_EXCEEDED、INSUFFICIENT_CREDITS、IDEMPOTENCY_CONFLICT | 读：`entitlement_grants`、`creation_draft_sources`、`character_profiles`；写：`creation_drafts`、`ai_jobs`、`ai_job_events`、`async_jobs`、`credit_wallets`、`credit_ledger`、`audit_logs`；事务：冻结输入、RESERVE、任务/事件与可靠投递同提交 | 5 |
| GET | `/api/v1/ai-jobs/{jobId}` | Bearer 内容；任务继承草稿及来源权限 | 只读；FAILED 本身仍返回200 | path:jobId | 200 Job | EA + RESOURCE_NOT_FOUND | 读：`ai_jobs`、`ai_job_events`、`async_jobs`、`creation_drafts`、`creation_draft_sources`、`works`、`credit_ledger` | 5 |
| POST | `/api/v1/ai-jobs/{jobId}/cancel` | Bearer 本人发起者；仅未开始 PENDING | 幂等 K；asyncJobId 防旧尝试操作 | path:jobId；body:asyncJobId:uuid | 200 Job（CANCELLED） | EA + RESOURCE_NOT_FOUND、IDEMPOTENCY_CONFLICT | 写：`ai_jobs`、`ai_job_events`、`async_jobs`、`credit_wallets`、`credit_ledger`、`audit_logs`；事务：任务取消与 RELEASE 原预扣同提交，与 Worker 抢占同锁 | 5 |
| POST | `/api/v1/ai-jobs/{jobId}/retry` | Bearer 本人发起者；FAILED、可恢复、原 RESERVE 尚未 SETTLE/RELEASE | 幂等 K；asyncJobId 为失败尝试 | path:jobId；body:asyncJobId:uuid | 202 Job（同 ai_jobs.id，新 asyncJobId） | EA + RESOURCE_NOT_FOUND、IDEMPOTENCY_CONFLICT | 读：`credit_ledger`、`creation_draft_sources`、`entitlement_grants`；写：`ai_jobs`、`ai_job_events`、`async_jobs`、`audit_logs`；事务：锁原 RESERVE 并阻止旧尝试结算或释放，建立新执行/事件，不插入第二笔 RESERVE | 5 |
| GET | `/api/v1/works` | Bearer 内容；仅当前可读作品 | 只读 | query:PageQuery,workType?:COMIC/VIDEO,visibility?:PRIVATE/COUPLE | 200 List<Work> | EA | 读：`works`、`work_assets`、`ai_jobs`、`creation_drafts`、`creation_draft_sources` | 5 |
| GET | `/api/v1/works/{workId}` | Bearer 内容；作品与递归来源共同授权 | 只读 | path:workId | 200 Work | EA + RESOURCE_NOT_FOUND | 读：`works`、`work_assets`、`ai_jobs`、`creation_drafts`、`creation_draft_sources`、`files` | 5 |
| DELETE | `/api/v1/works/{workId}` | Bearer 本人作者 | 幂等 K；version | path:workId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`works`、`async_jobs`；事务：软删作品并排清理，回忆册/相册来源立刻不可用，文件由 Worker 核对所有引用后删除 | 5 |
| POST | `/api/v1/works/{workId}/save-to-photo-set` | Bearer 双方；COUPLE 作品及所有来源双方可读，目标集合本人可编辑 | 幂等 K；photoSetVersion | path:workId；body:photoSetId:uuid,photoSetVersion:integer≥1,assetIds:uuid[1–100] | 201 {photoSetId,items:PhotoItem[],version} | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、COUPLE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`works`、`work_assets`、`creation_draft_sources`；写：`records`、`photo_items`、`files`、`async_jobs`；事务：records Service 校验同关系 COUPLE 集合，保存 PAGE/IMAGE 资产并保留 originWorkAssetId；视频本体不可伪装照片 | 5 |
| POST | `/api/v1/works/{workId}/notify-partner` | Bearer 本人作品作者；COUPLE 且伴侣获权 | 幂等 K；不修改可见范围 | path:workId；body:无 | 202 {jobId:uuid,status:PENDING} | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、COUPLE_REQUIRED、IDEMPOTENCY_CONFLICT | 读：`works`、`creation_draft_sources`、`notification_preferences`；写：`notifications`、`notification_deliveries`、`async_jobs`；事务：无正文站内通知/待投递记录一起建立，Worker 再验权限偏好 | 5 |
| GET | `/api/v1/membership/plans` | 匿名；只读生效套餐展示字段 | 只读 | query:无 | 200 Plan[]（生效套餐按 priceMinor,id 升序） | E0 | 读：`membership_plans` | 5 |
| GET | `/api/v1/membership/me` | Bearer 本人；当前关系共享权益聚合 | 只读 | query:无 | 200 {subscriptions:Order[]（本人当前有效期间）,entitlements:{code,quantity:decimal-string,scope:PRIVATE/COUPLE,endsAt:timestamp nullable}[]} | EA | 读：`subscriptions`、`membership_plans`、`entitlement_grants`；伴侣权益不暴露其订单 | 5 |
| POST | `/api/v1/membership/orders` | Bearer 本人购买者；COUPLE 须当前 ACTIVE | 幂等 K；冻结服务端价格与套餐版本 | body:planId:uuid,scope:PRIVATE/COUPLE,acceptedMembershipVersion:integer≥1 | 201 {order:Order,checkout:{url:HTTPS,expiresAt:timestamp} nullable} | EA + COUPLE_REQUIRED、IDEMPOTENCY_CONFLICT | 读：`membership_plans`、`legal_documents`；写：`subscriptions`、`async_jobs`、`audit_logs`；事务：建立 PENDING 订单/回执；支付适配器提交在事务外，以 orderNo 去重，失败可原键恢复，不凭客户端成功声明授予权益 | 5 |
| GET | `/api/v1/membership/orders/{orderId}` | Bearer 本人购买者；共享权益不授予查看伴侣订单权 | 只读 | path:orderId | 200 {order:Order,checkout:{url:HTTPS,expiresAt:timestamp} nullable} | EA + RESOURCE_NOT_FOUND | 读：`subscriptions`、`membership_plans`；PENDING 可从受控适配器重新取得短期收银凭证，不持久化签名 URL | 5 |
| GET | `/api/v1/membership/credits` | Bearer 本人或当前关系钱包 | 只读 | query:scope:PRIVATE/COUPLE | 200 {walletId,scope,availableBalance:decimal-string,reservedBalance:decimal-string,version} | EA + COUPLE_REQUIRED | 读：`credit_wallets` | 5 |
| GET | `/api/v1/membership/credits/ledger` | Bearer 本人或当前关系钱包；隐藏另一方订单来源 | 只读 | query:PageQuery,scope:PRIVATE/COUPLE,entryType?:GRANT/RESERVE/SETTLE/RELEASE/ADJUST | 200 List<{id,entryType,amount:decimal-string,availableAfter:decimal-string,reservedAfter:decimal-string,reasonCode,createdAt}> | EA + COUPLE_REQUIRED | 读：`credit_ledger`、`credit_wallets` | 5 |

会员是 membership 所有者模块，模块 06 复用这些端点。订单支付结果通过受控供应商适配器验签、订单号/金额/币种核对后进入内部事务；本清单不发布管理/供应商回调 URL。支付确认写 subscriptions、entitlement_grants、credit_ledger/credit_wallets 和回调 async_jobs 回执，见 Worker 追踪表。支付渠道配置不属于 App DTO。

## 模块 06：我的与设置

个人资料、默认偏好、存储、帮助与账号安全在本模块汇总。草稿箱复用 records 的 status=DRAFT 和 workshop/drafts，标签管理复用 tags，双人资料复用 couples，会员复用 membership。客户端缓存清理只清理本机缓存，不调用服务器文件删除；当前账号本身已经绑定注册手机号，本期不增加第三方认证方式。

注销创建后立即 DELETION_PENDING、撤销全部业务会话，执行 ACCOUNT_DELETION 延迟任务。为查询与撤回，密码登录的注销分支仅签发短期、purpose=DELETION_MANAGEMENT 的专用 deletionToken，包含 requestId/userId/到期时间，使用独立 audience；只接受 `Authorization: Deletion <deletionToken>` 的两个注销管理端点。该凭证不能刷新或进入 Bearer Guard；有效性还检查对应申请状态，撤回后立即失效。查询在凭证有效期内可返回 COMPLETED，完成匿名化后不再用密码签发新凭证。撤回只允许 PENDING 且未过 executeAfter，成功后恢复 ACTIVE 并要求普通重新登录，不恢复旧会话。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/users/me` | Bearer 本人 | 只读 | query:无 | 200 User | EA | 读：`users` | 1 |
| PATCH | `/api/v1/users/me` | Bearer 本人 | version | body:version,nickname?:string(1–40),birthday?:date nullable,bio?:string(200) nullable | 200 User | EA + RESOURCE_VERSION_CONFLICT | 写：`users`；事务：校验用户版本/资料字段后更新，不接受 phone/status/coupleId | 1 |
| POST | `/api/v1/users/me/avatar-upload` | Bearer 本人；AVATAR 用途固定 | 幂等 K；与通用上传同一服务 | body:UploadInput 去除 purpose | 201 Upload | EA + FILE_ACCESS_DENIED、QUOTA_EXCEEDED、IDEMPOTENCY_CONFLICT | 写：`files`、`file_upload_sessions`、`async_jobs`；事务：建立 AVATAR 上传与回执；完成前不修改用户头像 | 3 |
| DELETE | `/api/v1/users/me/avatar` | Bearer 本人 | 幂等 K；version 为用户版本 | query:version | 200 User | EA + RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`users`、`files`、`async_jobs`；事务：清空头像/增加用户版本，释放引用，旧文件无引用时排延迟清理 | 3 |
| POST | `/api/v1/users/me/password/change` | Bearer 本人；再次验证旧密码 | 单次变更；version 为用户版本 | body:version,currentPassword,newPassword:string(8–128) | 200 null | EA + INVALID_CREDENTIALS、RESOURCE_VERSION_CONFLICT | 写：`users`、`user_sessions`、`account_security_events`；事务：更新密码与版本、撤销全部设备族，成功后重新登录 | 1 |
| POST | `/api/v1/users/me/deletion-requests` | Bearer 本人；reauth 必须通过 | 幂等 K；version 为用户版本 | body:version,reauth:ReauthInput,reason?:string(500) | 202 {deletion:Deletion,jobId:uuid,status:PENDING} | EA + INVALID_CREDENTIALS、SMS_CODE_INVALID、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`users`、`user_sessions`、`sms_challenges`、`account_deletion_requests`、`async_jobs`、`audit_logs`；事务：建立注销申请/延迟 ACCOUNT_DELETION 任务、停用账号和全会话；executeAfter 为受控保留策略，不硬编码公开风险阈值 | 7 |
| GET | `/api/v1/users/me/deletion-requests/current` | 注销验证；专用凭证仅对应本人申请；有效期内可查 COMPLETED | 只读 | header:Authorization:Deletion 凭证；query:无 | 200 Deletion | E0 + AUTH_REQUIRED、RESOURCE_NOT_FOUND | 读：`account_deletion_requests`、`users`、`async_jobs` | 7 |
| DELETE | `/api/v1/users/me/deletion-requests/current` | 注销验证；专用凭证且 PENDING、未到执行时点 | version；与 Worker 抢占同锁；撤回后凭证失效 | header:Authorization:Deletion 凭证；query:version | 200 {status:CANCELLED,requiresLogin:true} | E0 + AUTH_REQUIRED、RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`account_deletion_requests`、`users`、`async_jobs`、`audit_logs`；事务：申请/任务取消，恢复 ACTIVE，不复活任何已撤销令牌族 | 7 |
| GET | `/api/v1/settings` | Bearer 本人 | 只读 | query:无 | 200 Settings | EA | 读：`user_settings` | 7 |
| PATCH | `/api/v1/settings` | Bearer 本人；默认 COUPLE 要求当前关系 | version；只影响以后创建的默认值 | body:version,defaultVisibility?:PRIVATE/COUPLE,timezone?:IANA,locale?:zh-CN,theme?:SYSTEM/LIGHT/DARK,autoSaveDrafts?:boolean | 200 Settings | EA + COUPLE_REQUIRED、RESOURCE_VERSION_CONFLICT | 写：`user_settings`；事务：版本检查后保存默认值；关系失效时实际创建回退 PRIVATE 并向客户端明确返回实际范围 | 7 |
| GET | `/api/v1/settings/privacy` | Bearer 本人 | 只读 | query:无 | 200 Privacy | EA | 读：`privacy_settings` | 7 |
| PATCH | `/api/v1/settings/privacy` | Bearer 本人 | version；不可关闭导出再次认证 | body:version,allowPartnerProfile?:boolean,allowMemoryRecommendations?:boolean,allowUsageAnalytics?:boolean,hideBirthday?:boolean | 200 Privacy | EA + RESOURCE_VERSION_CONFLICT | 写：`privacy_settings`、`audit_logs`；事务：保存设置并使资料/推荐缓存失效；拒绝 dataExportRequiresReauth=false | 7 |
| GET | `/api/v1/settings/notifications` | Bearer 本人 | 只读 | query:无 | 200 NotificationSettings | EA | 读：`notification_preferences` | 7 |
| PATCH | `/api/v1/settings/notifications` | Bearer 本人；设备推送绑定当前族首代 | version；pushToken 不回传 | body:version,enabled?:boolean,pushEnabled?:boolean,momentEnabled?:boolean,workshopEnabled?:boolean,relationshipEnabled?:boolean,quietStart?:time nullable,quietEnd?:time nullable,timezone?:IANA,pushToken?:string(4096) nullable | 200 NotificationSettings | EA + RESOURCE_VERSION_CONFLICT | 写：`notification_preferences`、`user_sessions`；事务：成对校验免打扰时间、偏好和可选加密推送 Token 同提交；Worker 发送前重读偏好 | 7 |
| GET | `/api/v1/notifications` | Bearer 本人接收者；来源变更后隐藏敏感预览 | 只读 | query:PageQuery,unreadOnly?:boolean | 200 List<Notification> | EA | 读：`notifications`、`notification_preferences`；资源所有者逐项复核跳转权限 | 5 |
| POST | `/api/v1/notifications/{notificationId}/read` | Bearer 本人接收者 | 幂等 readAt 只写首次 | path:notificationId；body:无 | 200 {id,readAt:timestamp} | EA + RESOURCE_NOT_FOUND | 写：`notifications`；事务：带 recipient 条件原子标记已读 | 5 |
| POST | `/api/v1/notifications/read-all` | Bearer 本人接收者 | 幂等；固定创建时间水位 | body:before:timestamp（不得晚于服务器现在） | 200 {updatedCount:integer} | EA | 写：`notifications`；事务：仅更新本人 createdAt≤before 的未读通知 | 5 |
| GET | `/api/v1/files/storage-usage` | Bearer 本人；COUPLE 仅展示获权共同文件用量 | 只读；上传/引用去重按 fileId 计量 | query:scope:PRIVATE/COUPLE | 200 {usedBytes:decimal-string,pendingBytes:decimal-string,quotaBytes:decimal-string,remainingBytes:decimal-string} | EA + COUPLE_REQUIRED | 读：`files`、`file_upload_sessions`、`entitlement_grants`；不得从总量差推断伴侣 PRIVATE 用量 | 3 |
| POST | `/api/v1/files/upload-sessions` | Bearer 本人；文件用途/额度符合白名单 | 幂等 K；锁额度主体防并发超容量 | body:UploadInput | 201 Upload | EA + FILE_ACCESS_DENIED、QUOTA_EXCEEDED、IDEMPOTENCY_CONFLICT | 读：`entitlement_grants`；写：`files`、`file_upload_sessions`、`async_jobs`；事务：锁用户/关系、校验已用+未完成预留、登记 UPLOADING/上传会话/回执；对象键由服务端生成 | 3 |
| POST | `/api/v1/files/upload-sessions/{uploadId}/complete` | Bearer 本人上传者；不得指定对象键；AVATAR 绑定本人头像 | 幂等 K；完成只计量一次；userVersion 仅 AVATAR 必填 | path:uploadId；body:fileId:uuid,userVersion?:integer≥1 | 200 {file:File,userVersion:integer nullable} | EA + RESOURCE_NOT_FOUND、FILE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`files`、`file_upload_sessions`、`file_variants`、`users`、`async_jobs`、`audit_logs`；事务：存储适配器在锁前验存在/大小/MIME/摘要，锁内核对快照与期限后 READY/COMPLETED，AVATAR 引用更新、建立变体任务；Worker 写 variants | 3 |
| DELETE | `/api/v1/files/upload-sessions/{uploadId}` | Bearer 本人上传者；未完成会话 | 幂等 K；完成与取消互斥 | path:uploadId；body:无 | 200 {fileId,jobId:uuid,status:PENDING} | EA + RESOURCE_NOT_FOUND、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 写：`file_upload_sessions`、`files`、`async_jobs`；事务：会话 CANCELLED、文件 DELETE_PENDING、FILE_DELETE 任务同提交；取消完成会话为 VALIDATION_FAILED | 3 |
| GET | `/api/v1/files/{fileId}/download-url` | Bearer 内容；校验直接引用和完整来源链、删除态及胶囊解锁 | 只读；签名审计为附属写入，响应不缓存 | path:fileId；query:variant?:ORIGINAL/THUMBNAIL/PREVIEW/TRANSCODE/PDF,resourceType:AVATAR/RECORD/RESPONSE/CAPSULE/CHARACTER/WORK/MEMORY_BOOK/DATA_EXPORT,resourceId:uuid | 200 Download | EA + RESOURCE_NOT_FOUND、FILE_ACCESS_DENIED | 读：`files`、`file_variants`、`records`、`photo_items`、`record_responses`、`response_attachments`、`time_capsules`、`time_capsule_items`、`character_profiles`、`works`、`work_assets`、`memory_books`、`memory_book_page_sources`、`async_jobs`；用户不能用自己拥有文件绕过封存引用 | 3 |
| DELETE | `/api/v1/files/{fileId}` | Bearer 本人上传者；无存活直接引用和派生引用 | 幂等 K；version | path:fileId；query:version | 202 {jobId:uuid,status:PENDING} | EA + RESOURCE_NOT_FOUND、FILE_ACCESS_DENIED、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`files`、`async_jobs`；事务：锁文件并复核真实引用，标 DELETE_PENDING/deleteAfter/deleteJobId；有引用为 VALIDATION_FAILED，Worker 删除前再复核 | 3 |
| GET | `/api/v1/data-exports` | Bearer 本人任务发起者 | 只读 | query:PageQuery,status?:PENDING/PROCESSING/SUCCEEDED/FAILED/CANCELLED | 200 List<Job> | EA | 读：`async_jobs`、`files`；仅 DATA_EXPORT/PDF_EXPORT 且 owner 本人 | 7 |
| POST | `/api/v1/data-exports` | Bearer 本人；强制 ReauthInput，PDF 还需书与全部来源获权 | 幂等 K；bookVersion 仅 MEMORY_BOOK_PDF 必填 | body:kind:PERSONAL_JSON/MEMORY_BOOK_PDF,reauth:ReauthInput,from?:date,to?:date,bookId?:uuid,bookVersion?:integer≥1；两类字段互斥，日期仅 PERSONAL_JSON | 202 Job | EA + INVALID_CREDENTIALS、SMS_CODE_INVALID、RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT、QUOTA_EXCEEDED、IDEMPOTENCY_CONFLICT | 读：`privacy_settings`、`memory_books`、`memory_book_page_sources`、`entitlement_grants`；写：`sms_challenges`、`async_jobs`、`audit_logs`；事务：消费认证挑战、保存白名单导出选择器与可靠任务，禁止将密码/正文存入载荷回执 | 7 |
| GET | `/api/v1/data-exports/{jobId}` | Bearer 本人；复核导出来源权限 | 只读；失败状态仍200 | path:jobId | 200 Job | EA + RESOURCE_NOT_FOUND | 读：`async_jobs`、`files`、`memory_books`、`memory_book_page_sources` | 7 |
| GET | `/api/v1/data-exports/{jobId}/download-url` | Bearer 本人；SUCCEEDED、产物未到期且所有导出来源仍获权 | 只读；每次签发重新授权 | path:jobId | 200 Download | EA + RESOURCE_NOT_FOUND、FILE_ACCESS_DENIED | 读：`async_jobs`、`files`、`memory_books`、`memory_book_page_sources`、`records`、`works`；复用 files 签名服务 | 7 |
| DELETE | `/api/v1/data-exports/{jobId}` | Bearer 本人；PENDING 可取消，终态可清理，PROCESSING 拒绝 | 幂等 K；version 为 async_jobs.version | path:jobId；query:version | 200 {id:uuid,status:CANCELLED/SUCCEEDED/FAILED,artifactAvailable:false} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`async_jobs`、`files`、`audit_logs`；事务：PENDING 转 CANCELLED；终态标产物 DELETE_PENDING 并建 FILE_DELETE 任务；保留原任务历史不伪造终态 | 7 |
| POST | `/api/v1/feedback` | Bearer 本人；仅产品使用反馈 | 幂等 K | body:category:BUG/SUGGESTION/ACCOUNT/BILLING/OTHER,subject:string(1–120),body:string(1–5000),contact?:string(200) | 201 Feedback | EA + IDEMPOTENCY_CONFLICT | 写：`feedback_tickets`、`async_jobs`；事务：加密正文/联系方式、创建工单与无正文回执 | 7 |
| GET | `/api/v1/feedback` | Bearer 本人工单 | 只读 | query:PageQuery,status?:OPEN/IN_PROGRESS/RESOLVED/CLOSED | 200 List<Feedback> | EA | 读：`feedback_tickets` | 7 |
| GET | `/api/v1/system/config` | 匿名；仅已发布非敏感显示配置 | 只读；配置版本受发布管理 | query:platform:IOS/ANDROID/WEB,locale?:zh-CN | 200 {configVersion:string,themes:{code,name}[],bookTemplates:{code:TEXT/PHOTO/MOMENT/WORK,name}[],workTypes:[COMIC,VIDEO],announcements:{id:string,title,body:string(1000),publishedAt:timestamp}[],uploadLimits:{purpose,mimeTypes:string[],maxBytes:decimal-string}[],features:{comicEnabled:boolean,videoEnabled:boolean,memoryBookEnabled:boolean}} | E0 | 读：`app_releases`、`legal_documents`；主题/模板/公告/格式上限来自版本化只读发布配置，不增业务表，不返回密钥或风控阈值 | 0 |
| GET | `/api/v1/system/legal-documents/{documentType}` | 匿名；只读已发布生效或指定已发布版本 | 只读 | path:documentType:TERMS/PRIVACY/MEMBERSHIP；query:locale?:zh-CN,versionCode?:integer≥1 | 200 {id,documentType,locale,versionCode,title,contentText,contentSha256,effectiveAt,publishedAt} | E0 + RESOURCE_NOT_FOUND | 读：`legal_documents` | 7 |
| GET | `/api/v1/system/releases/latest` | 匿名；只读已发布官方信息 | 只读 | query:platform:IOS/ANDROID,buildNumber:integer>0 | 200 {versionName,buildNumber,minimumBuild,updateAvailable:boolean,forceUpdate:boolean,releaseNotes,downloadUrl:HTTPS,publishedAt} nullable | E0 | 读：`app_releases` | 7 |

通知偏好必须参与实际投递：enabled/pushEnabled 控制全部推送，momentEnabled 控制时刻/纪念日/胶囊，workshopEnabled 控制生成结果，relationshipEnabled 控制绑定/解绑；伴侣回应受总开关控制。安全事件保留站内最小记录，不绕过关闭推送。免打扰跨午夜按 timezone 解释；设置变化后待发任务再次判断，不能凭创建时快照强行发送。

上传完成只信任存储适配器验证后的元数据，客户端成功声明无效；直传响应遵守存储协议。大小预留通过文件 UPLOADING 状态和会话期限推导，锁定同一额度主体防并发超限，不增加余额字段。禁止跨用途复用 AVATAR/CAPSULE/RESPONSE_ATTACHMENT 上传来绕过内容权限。文件本身没有独立可见性，签名必须提供受控资源上下文并核验该 fileId 的真实引用；封存胶囊文件即使上传者本人也不能绕过时间门槛。签名 URL 到期前存在短窗口，需即时撤销时使用受控访问代理，遵循通用规范。

PERSONAL_JSON 导出仅包含本人用户资料/设置、本人获权记录、本人当前可读作品和回忆册，不包含伴侣 PRIVATE 内容、凭据、安全审计、完整手机号、未解锁胶囊及反馈联系方式。MEMORY_BOOK_PDF 只导出指定书当前获权的页面。async_jobs.response_json 可保存白名单选择器 `{kind,from,to,bookId,bookVersion}`，不得保存正文/认证证明。Worker 完成后将选择器与导出资源清单 `{resourceType,resourceId,sourceVersion}` 保存在同一受控 JSON 内；这是权限复核索引，不返回 App。下载重新检查完整清单，任一来源失效拒绝整个旧产物，必须重新生成。个人导出允许类型为 USER/SETTINGS/RECORD/WORK/MEMORY_BOOK；这组导出清单类型不扩展通用素材 sourceType。

## 模块 08：共同回忆册

模块使用 memory-books 的统一页面编排模型。封面、主题与页模板来自 system/config；`WORK` 是通用素材的一种，沿 works → ai_jobs → creation_drafts → sources 递归核验。来源拥有者仍是 records、moments、workshop；复制摘要/生成 PDF 不产生永久访问权。PRIVATE 书仅作者编辑；COUPLE 书允许当前双方共同编辑，所有可见来源必须满足书的目标范围。推荐尊重 privacy_settings.allow_memory_recommendations，关闭时返回空列表且不扫描用户内容。

书的内容/结构写入都检查 bookVersion 并原子递增 memory_books.version。页内容写入同时检查 pageVersion 并递增页版本；章节与补页本身更新再检查各自 version。排序位置整数非负，重排提交所有存活 ID 恰一次，按数据库延迟约束检查，任何失配整笔回滚。删除章节选择“解除章节归属、保留页面”固定行为；删除页面软删除其补页，移除素材只删除连接而保留源对象。移除失效来源时必须同时删除引用该 sourceRef 的布局块，不保留派生文本/缩略图。

| 方法 | 路径 | 鉴权/权限 | 幂等/并发 | 请求字段 | 成功响应 | 错误码 | 关联表与事务 | 开发阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/memory-books` | Bearer 内容；书架/封面/统计同来源权限 | 只读 | query:PageQuery（sortBy:updatedAt，默认desc）,visibility?:PRIVATE/COUPLE,status?:DRAFT/PUBLISHED/ARCHIVED | 200 List<Book> | EA | 读：`memory_books`、`memory_book_reading_progress`、`memory_book_page_sources` | 6 |
| POST | `/api/v1/memory-books` | Bearer 本人；COUPLE 要求 ACTIVE | 幂等 K | body:BookInput | 201 Book | EA + COUPLE_REQUIRED、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 读：`files`；写：`memory_books`、`files`、`async_jobs`；事务：建立 DRAFT 书、封面引用与回执；章节/页面通过对应端点添加 | 6 |
| GET | `/api/v1/memory-books/recommendations/monthly` | Bearer 内容；尊重本人推荐偏好 | 只读；不持久化正文快照 | query:month:YYYY-MM,visibility:PRIVATE/COUPLE | 200 {month,sources:Source[0–20],suggestedTitle:string nullable} | EA + COUPLE_REQUIRED | 读：`privacy_settings`、`records`、`photo_items`、`important_moments`、`moment_record_links`、`works`、`creation_draft_sources`；sources 按 occurredOn,id 降序；WORK 日期取 createdAt 当地日期 | 6 |
| GET | `/api/v1/memory-books/sources` | Bearer 内容；按目标书范围筛选四类素材 | 只读 | query:PageQuery,visibility:PRIVATE/COUPLE,sourceType?:RECORD/PHOTO_ITEM/MOMENT/WORK,q?:string(100),from?:date,to?:date | 200 List<Source>（sourceType 增加 WORK） | EA + COUPLE_REQUIRED | 读：`records`、`photo_items`、`important_moments`、`moment_record_links`、`works`、`work_assets`、`creation_draft_sources`；依次由 records/moments/workshop 授权 | 6 |
| GET | `/api/v1/memory-books/{bookId}` | Bearer 内容；本人阅读进度，禁止返回伴侣阅读轨迹 | 只读 | path:bookId | 200 Book | EA + RESOURCE_NOT_FOUND | 读：`memory_books`、`memory_book_reading_progress`、`memory_book_page_sources` | 6 |
| PATCH | `/api/v1/memory-books/{bookId}` | Bearer 内容可编辑者；扩大范围必须复核全部来源 | version 为 book.version | path:bookId；body:version,BookInput 可写子集,status?:DRAFT/PUBLISHED/ARCHIVED | 200 Book | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 读：`memory_book_pages`、`memory_book_page_sources`；写：`memory_books`、`files`；事务：书/封面引用更新；首次 PUBLISHED 至少一页且所有 sourceRef 有效，写 publishedAt；ARCHIVED 不清除历史发布时间 | 6 |
| DELETE | `/api/v1/memory-books/{bookId}` | Bearer 本人书作者；双方编辑权不扩展删除整书权 | 幂等 K；version | path:bookId；query:version | 200 null | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`async_jobs`；事务：根软删/清理登记，页面/补页/阅读进度/导出即时停读，恢复期后 Worker 清理引用 | 6 |
| GET | `/api/v1/memory-books/{bookId}/chapters` | Bearer 内容 | 只读 | path:bookId；query:PageQuery（sortBy:position，默认asc） | 200 List<Chapter> | EA + RESOURCE_NOT_FOUND | 读：`memory_books`、`memory_book_chapters` | 6 |
| POST | `/api/v1/memory-books/{bookId}/chapters` | Bearer 内容可编辑者 | 幂等 K；bookVersion | path:bookId；body:bookVersion,title:string(1–100),description?:string(500) nullable,position:integer≥0 | 201 {chapter:Chapter,bookVersion} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`memory_book_chapters`、`async_jobs`；事务：锁书新增章节/父版本，提交时检查活跃位置唯一 | 6 |
| PATCH | `/api/v1/memory-books/{bookId}/chapters/{chapterId}` | Bearer 内容可编辑者；章节须属于该书 | bookVersion + version 为章节版本 | path:bookId,chapterId；body:bookVersion,version,title?:string(1–100),description?:string(500) nullable | 200 {chapter:Chapter,bookVersion} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`memory_books`、`memory_book_chapters`；事务：锁书与章节，更新两级版本 | 6 |
| DELETE | `/api/v1/memory-books/{bookId}/chapters/{chapterId}` | Bearer 内容可编辑者 | 幂等 K；bookVersion + version 为章节版本 | path:bookId,chapterId；query:bookVersion,version | 200 {bookVersion:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`memory_book_chapters`、`memory_book_pages`、`async_jobs`；事务：章节软删，所属页 chapterId=null 并增加页版本，书版本递增 | 6 |
| PATCH | `/api/v1/memory-books/{bookId}/chapters/order` | Bearer 内容可编辑者 | bookVersion；一次全量排序 | path:bookId；body:bookVersion,chapterIds:uuid[]（全部存活章节恰一次，上限1000） | 200 {bookVersion:integer,chapters:{id,position,version}[]} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`memory_books`、`memory_book_chapters`；事务：锁书、重排章节/增加子版本，提交延迟约束，整笔原子 | 6 |
| POST | `/api/v1/memory-books/{bookId}/pages` | Bearer 内容可编辑者；封面/结束页各最多一页 | 幂等 K；bookVersion | path:bookId；body:bookVersion,chapterId?:uuid nullable,pageType:COVER/CONTENT/END,title?:string(100) nullable,position:integer≥0,layout:Layout（新页无 sourceRef） | 201 {page:BookPage,bookVersion} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`memory_book_chapters`；写：`memory_books`、`memory_book_pages`、`async_jobs`；事务：核对章节归属、插入页与父版本；素材加入后再编排 SOURCE 块 | 6 |
| GET | `/api/v1/memory-books/{bookId}/pages` | Bearer 内容；每页来源独立检查 | 只读 | path:bookId；query:PageQuery（sortBy:position，默认asc）,chapterId?:uuid | 200 List<{id,chapterId:uuid nullable,pageType,title:string nullable,position,version,availability:AVAILABLE/UNAVAILABLE}> | EA + RESOURCE_NOT_FOUND | 读：`memory_books`、`memory_book_pages`、`memory_book_page_sources`；不可用页标题为 null | 6 |
| GET | `/api/v1/memory-books/{bookId}/pages/{pageId}` | Bearer 内容；来源无权时屏蔽相关块/预览/摘要 | 只读 | path:bookId,pageId | 200 BookPage | EA + RESOURCE_NOT_FOUND | 读：`memory_books`、`memory_book_pages`、`memory_book_page_sources`、`memory_book_supplements`、`works`、`records`、`important_moments`；失效 sourceRef 对应块仅保留几何与 availability:UNAVAILABLE，不返回正文/文件 | 6 |
| PATCH | `/api/v1/memory-books/{bookId}/pages/{pageId}` | Bearer 内容可编辑者 | bookVersion + pageVersion | path:bookId,pageId；body:bookVersion,pageVersion,chapterId?:uuid nullable,title?:string(100) nullable,layout?:Layout | 200 {page:BookPage,bookVersion} | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT | 读：`memory_book_chapters`、`memory_book_page_sources`；写：`memory_books`、`memory_book_pages`；事务：锁书/页/来源，校验 layout schema 与 sourceRef、同书章节并更新两级版本 | 6 |
| DELETE | `/api/v1/memory-books/{bookId}/pages/{pageId}` | Bearer 内容可编辑者 | 幂等 K；bookVersion + pageVersion | path:bookId,pageId；query:bookVersion,pageVersion | 200 {bookVersion:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`memory_book_pages`、`memory_book_supplements`、`async_jobs`；事务：软删页和补充/增加书版本；来源恢复窗口保留，过期排清理 | 6 |
| PATCH | `/api/v1/memory-books/{bookId}/pages/order` | Bearer 内容可编辑者 | bookVersion；全书页序单事务 | path:bookId；body:bookVersion,pageIds:uuid[]（全部存活页面恰一次，上限1000） | 200 {bookVersion:integer,pages:{id,position,version}[]} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT | 写：`memory_books`、`memory_book_pages`；事务：锁书、全部 position/页版本/书版本一起更新，延迟约束最终检查 | 6 |
| POST | `/api/v1/memory-books/{bookId}/pages/{pageId}/sources` | Bearer 内容可编辑者；来源范围不能窄于书范围 | 幂等 K；bookVersion + pageVersion + sourceVersion | path:bookId,pageId；body:bookVersion,pageVersion,BookSourceInput | 201 {source:BookSource,pageVersion,bookVersion} | EA + RESOURCE_NOT_FOUND、PRIVATE_RESOURCE、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 读：`records`、`photo_items`、`important_moments`、`works`、`creation_draft_sources`；写：`memory_books`、`memory_book_pages`、`memory_book_page_sources`、`async_jobs`；事务：锁来源/书/页，检查归属与版本、插入受控来源及两级版本 | 6 |
| DELETE | `/api/v1/memory-books/{bookId}/pages/{pageId}/sources/{sourceId}` | Bearer 内容可编辑者；sourceId 是引用行 ID，非目标资源 ID | 幂等 K；bookVersion + pageVersion | path:bookId,pageId,sourceId；query:bookVersion,pageVersion | 200 {pageVersion:integer,bookVersion:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`memory_book_pages`、`memory_book_page_sources`、`async_jobs`；事务：删除连接和对应 SOURCE 布局块，清除派生内容缓存，增加两级版本；不删来源 | 6 |
| POST | `/api/v1/memory-books/{bookId}/pages/{pageId}/supplements` | Bearer 内容可编辑者；author 为当前用户 | 幂等 K；bookVersion + pageVersion | path:bookId,pageId；body:bookVersion,pageVersion,SupplementInput | 201 {supplement:Supplement,pageVersion,bookVersion} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`memory_book_pages`、`memory_book_supplements`、`files`、`async_jobs`；事务：锁书/页、增补原生内容/文件引用和两级版本，提交检查位置 | 6 |
| PATCH | `/api/v1/memory-books/{bookId}/pages/{pageId}/supplements/{supplementId}` | Bearer 内容可编辑者；双人共同编排补页 | bookVersion + pageVersion + version 为补页版本 | path:bookId,pageId,supplementId；body:bookVersion,pageVersion,version,bodyText?:string(1–5000),fileId?:uuid,style?:{fontCode:SERIF/SANS,colorToken:ink/coral/neutral},position?:integer≥0；按既有 supplementType 限制正文/照片 | 200 {supplement:Supplement,pageVersion,bookVersion} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、FILE_ACCESS_DENIED | 写：`memory_books`、`memory_book_pages`、`memory_book_supplements`、`files`、`async_jobs`；事务：三层版本校验、补页/引用更新，旧照片无引用时排清理 | 6 |
| DELETE | `/api/v1/memory-books/{bookId}/pages/{pageId}/supplements/{supplementId}` | Bearer 内容可编辑者 | 幂等 K；bookVersion + pageVersion + version 为补页版本 | path:bookId,pageId,supplementId；query:bookVersion,pageVersion,version | 200 {pageVersion:integer,bookVersion:integer} | EA + RESOURCE_NOT_FOUND、RESOURCE_VERSION_CONFLICT、IDEMPOTENCY_CONFLICT | 写：`memory_books`、`memory_book_pages`、`memory_book_supplements`、`async_jobs`；事务：软删补充和清理登记，两级父版本递增 | 6 |
| PUT | `/api/v1/memory-books/{bookId}/reading-progress` | Bearer 内容；只写本人阅读状态 | 幂等 K；同用户/书唯一行；服务器接收顺序覆盖，不要求进度单调 | path:bookId；body:lastPageId:uuid nullable,progressPermille:integer(0–1000) | 200 {lastPageId:uuid nullable,progressPermille,lastReadAt:timestamp} | EA + RESOURCE_NOT_FOUND、IDEMPOTENCY_CONFLICT | 读：`memory_books`、`memory_book_pages`；写：`memory_book_reading_progress`、`async_jobs`；事务：重新授权、验证同书页后 upsert 本人进度和回执，重复键不把较新的阅读状态倒退 | 6 |

每书最多 1000 个存活章节、1000 个存活页面；每页最多 100 素材与 100 补充。超过上限返回 VALIDATION_FAILED，容量不足返回 QUOTA_EXCEEDED。书目录通过两个分页只读端点取得，不能把无界章节/页面树塞入书架响应。导出统一使用 data-exports 的 MEMORY_BOOK_PDF，不增加绕过来源权限的 PDF 地址入口。

## Worker 与跨模块追踪

以下是服务端受控流程，不发布用户可调用路由。每个流程在执行前和发布结果前重新验证账号/关系/来源。引用的数据所有者 Service 决定权限；汇总模块不直接修改其他领域表。所有队列任务以 async_jobs 的 QUEUED 行作为持久化事实，RECEIPT 仅是同步回执，绝不被 Worker 执行。

| 流程与触发端点 | 读表及所有者 | 写表与提交边界 | 幂等/失败和生命周期 |
| --- | --- | --- | --- |
| 身份注册/登录/重置、设备撤销 | auth：users、user_sessions、sms_challenges | auth：users、user_sessions、sms_challenges、account_security_events；users：user_settings、privacy_settings、notification_preferences；审计 audit_logs | 身份事务之外发送短信失败只更新挑战 FAILED；消息不泄露账号存在。令牌按完整族保留到最后到期后30天，挑战终态清摘要 |
| 情侣绑定、解除与注销冻结 | couples：couples、couple_members、couple_invitations、couple_dissolutions | couples：四张关系表；jobs：async_jobs；audit_logs | 结束有效成员并冻结旧共同权限；不迁移 coupleId，不级联删除共同内容。未投递通知和运行任务遇冻结停止发布结果并补偿 |
| AI 生成、媒体输出；POST ai-jobs | workshop：creation_drafts、creation_draft_sources、character_profiles、ai_jobs；来源 records：records、diary_entries、photo_sets、photo_items；moments：important_moments、moment_record_links | 同一终态事务：ai_jobs、ai_job_events、async_jobs、works、work_assets、files、file_variants、credit_ledger、credit_wallets、notifications、notification_deliveries、audit_logs | 稳定执行 ID 抢占与事件 sequence 唯一；产物先写私有存储再登记，works.ai_job_id 唯一。SETTLE/RELEASE 共用 origin_entry_id 唯一终结约束，技术重试不新扣；未登记对象走无引用清理 |
| 支付确认/退款、权益到期 | membership：subscriptions、membership_plans、entitlement_grants、credit_wallets、credit_ledger | 同一确认事务：subscriptions、entitlement_grants、credit_ledger、credit_wallets、async_jobs 的 CALLBACK_RECEIPT、audit_logs | 验签并核对服务端订单金额/币种；重复供应商事件不重复 GRANT。退款先核对已消耗权益，受控账务流程确定调整，不开放客户端自报结果；已支付价格不改写，财务默认保留5年 |
| 时刻/纪念日/胶囊提醒与回应/作品通知 | moments：important_moments、anniversaries、time_capsules、shared_reminders；records：record_responses；settings：notification_preferences；auth：user_sessions | shared_reminders、notifications、notification_deliveries、async_jobs | 每来源/接收者/occurrence 唯一；通知+投递实例先落库再发；重复发送以 deliveryId 去重并核对渠道结果。关闭偏好、来源失效取消投递；胶囊到期提醒只有标题，无封存正文 |
| 文件变体、上传过期及业务删除清理 | files：files、file_upload_sessions、file_variants；users：users；records：photo_items、response_attachments、records；moments：time_capsule_items、important_moments；workshop：character_profiles、work_assets；memory-books：memory_books、memory_book_supplements、memory_book_page_sources | files、file_upload_sessions、file_variants、async_jobs、audit_logs；相关直接引用计数只能由数据所有者 Service 更新 | UPLOADING 过期排清理，引用计数仅缓存必须核实真实引用；原对象和变体都确认不存在后 DELETED。业务软删30天后清理；元数据确认删除后保留90天，重试幂等 |
| 书清理与 PDF 导出；data-exports | memory-books：memory_books、memory_book_chapters、memory_book_pages、memory_book_page_sources、memory_book_supplements、memory_book_reading_progress；来源链由 records/moments/workshop 判断 | 清理事务按子引用→补页→页→章节→书释放；写同组六张表、files、async_jobs。导出结果登记 files、async_jobs、notifications、notification_deliveries | 来源连接清除前停止输出所有派生块；PDF 与资源清单对应同一书版本。导出中版本变更重新生成或 FAILED，不能拼接多个版本页面；下载时再核完整清单 |
| 个人 JSON 导出与注销 ACCOUNT_DELETION | users、user_settings、privacy_settings、notification_preferences、account_deletion_requests；各模块内容由所有者导出/清理 | 导出写 files、async_jobs；注销按阶段写 account_deletion_requests、users、user_sessions、三张设置表、couples、couple_members、couple_invitations、async_jobs、audit_logs | 注销工作开始先锁申请并校验取消窗口；Worker 任务成功才把申请标 COMPLETED。匿名用户主键保留支撑共同/财务外键；仅清理个人可清理内容，私密恢复窗口和文件引用保护继续有效 |
| 反馈处理、协议/套餐/版本发布 | system：feedback_tickets、legal_documents、app_releases；membership：membership_plans | 受控支持/发布流程写对应四表与 audit_logs，公开读取仅 PUBLISHED 和已生效配置 | 工单正文加密不进列表；已发布协议和套餐价格不可就地篡改，创建新版本。当前 App 配置是版本化部署资产，不混入供应商秘密 |

每张表都能从上面流程或端点行反向找到所有者与操作；54 表封闭清单来自数据库字典，API 不增加持久化业务实体。扩展列类型、外键、约束与保留期限仍以数据库字典为准。公开 API 不提供 audit_logs、notification_deliveries 或队列管理查询，任务结果仅展示已脱敏的 Job DTO。

## 反向验收矩阵

| 风险入口 | 必须证明的拒绝/一致性结果 | 开发阶段 |
| --- | --- | --- |
| 注册/找回密码/登录 | 同一短信挑战最多消费一次；错误手机号与密码统一 INVALID_CREDENTIALS；挑战错误/失效/已消费统一 SMS_CODE_INVALID；限流含 Retry-After；日志无明文凭据 | 1 |
| 刷新/设备会话 | 两次并发刷新只有一个消费成功，重放撤销全族；撤销指定设备不撤销其他设备；不接受 Refresh Token 为 Bearer Access Token | 1 |
| 邀请/绑定/解除 | 同码并发两人接受只有一个受邀者；双方确认前不 ACTIVE；一个用户不能加入两个有效关系；他人不能查询等待状态、撤销邀请或解除关系；冻结后旧共同内容不进入新关系 | 2 |
| 记录/标签/回应/搜索/统计 | PRIVATE 和 DRAFT 内容对伴侣的列表、详情、关键词命中、标签数量、回应和附件签名均不可见；任意 ID 探测404；已获权上下文私密限制才可403；作者不能给自己的记录添加伴侣回应 | 3 |
| 上传/下载/删除 | 客户端伪造大小/MIME/摘要不能 READY；重复 complete 不重复计量；取消与完成只有一个成功；非 owner 不能完成上传；无权 resourceId/fileId 组合不可签名；有存活引用不可物理删除 | 3 |
| 时刻/胶囊/共同提醒 | PRIVATE 来源不能关联共同时刻；来源收窄后摘要/封面失效；SEALED 且未到期时双方所有读取/编辑/文件/缩略图/导出均无正文；另一接收者不能修改本人提醒 readAt | 4 |
| AI/会员/作品 | 同键同载荷只创建一次任务/预扣；异载荷409；失败技术重试不再扣；退款与结算只能一者终结预扣；旧尝试晚到不能发布作品或补偿新尝试；客户端伪造支付成功无效 | 5 |
| 书架/推荐/编排/导出 | WORK 来源递归失效不能通过页面缓存、缩略图、相册或 PDF 取到；PRIVATE 书无伴侣访问；双方同 bookVersion 重排最多一个成功且没有部分页序；移除来源同时移除其布局；伴侣不能读取对方阅读进度 | 6 |
| 设置/通知/导出/注销 | 关闭偏好实际阻止推送/推荐；通知不带正文；注销凭证不能访问业务端点；撤回和执行互斥；注销不级联共同内容；导出下载复核全部来源；日志和公开配置不泄露正文/密钥/本地路径 | 7 |

路由注册必须先匹配静态路径 home/search/inbox/order/current/recommendations/sources，再匹配动态 ID；不同方法分开注册，路径参数严格 UUID 验证（邀请码及 documentType 例外）。所有批量请求原子成功或失败，不返回部分写入结果。未来 OpenAPI 应从本清单生成同名 DTO/权限/错误/阶段标记，契约变更须同步修改聚焦校验与公开页。
