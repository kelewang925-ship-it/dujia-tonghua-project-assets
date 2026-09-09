# Task 7 报告：首页后端入口与公开清单闭环

## RED

先向 `scripts/test-showcase.mjs` 加入后端入口断言，再运行：

```text
> node scripts/test-showcase.mjs
Error: Backend design entry is missing
```

随后为 `backend-design.html` 的原始资料入口加入回归断言；页面尚未链接资料时，`node scripts/test-backend-design.mjs` 报缺少 `06-技术与开发/后端设计/README.md` 的可见链接。

## 变更

- 首页“项目资料入口”新增“后端架构 · API · 数据库”与简短说明，链接 `backend-design.html`；八模块跳转、图库筛选、灯箱和流程图缩放未改动。
- 后端浏览页新增“阅读正式后端资料”区，公开链接后端资料入口、六份正式设计文档、Node 后端规格和公开页面实施计划。
- 清单构建器从 `index.html` 广度优先递归收集本地 HTML `href`/`src`，在生成前检查解码后路径的根目录边界、文件存在性及 Git 跟踪状态；清单本身等于完整 Git 跟踪集。
- 校验器按相同递归规则验证所有 HTML 本地引用已进入清单，并验证清单与 Git 跟踪集完全相同；同时检查路径逃逸、缺失文件、密钥模式及工作站绝对路径。
- 将实施计划中的两处工作站绝对路径改为仓库相对表述和 `--directory .`；绝对路径检测保持 Windows 驱动器大小写不敏感，并避免把 API 路由 `/users/...` 误判为 Unix 用户目录。
- Windows PowerShell 5.1 不支持 `utf8NoBOM` 枚举，因此清单输出改为显式 `.NET UTF8Encoding(false)`，保持无 BOM 且可跨该宿主运行。

## 公开集合

`public-files.txt` 保留全部已跟踪资料，并新增/覆盖：`backend-design.html`、后端资料入口、六份正式后端文档、后端规格、实施计划及对应测试和清单脚本。没有隐藏或移除原有公开资料。

## 实际验证输出

```text
> node scripts/test-showcase.mjs
PASS: all 8 module links jump to and filter the gallery

> node scripts/test-backend-design.mjs
PASS: 7 modules, 151 API entries, 54 table entries

> node scripts/test-backend-docs.mjs
PASS: 7 backend documents are present and satisfy required content

> powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-public-manifest.ps1
Generated public-files.txt with 122 tracked files and 109 recursive local HTML references.

> powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-public-site.ps1
PASS: 122 tracked public files; 109 recursive local HTML references; no path escape, missing file, unexpected tracked file, local absolute path, or secret pattern.
```

## 自查

- 所有公开本地 HTML 引用均会在构建和校验阶段递归检查，且路径无法逃离仓库根目录。
- 后端页面的原始资料链接均由回归测试覆盖。
- 未改 App 仓库或主分支内容；改动限定于资料工作树、公开页和发布校验闭环。
