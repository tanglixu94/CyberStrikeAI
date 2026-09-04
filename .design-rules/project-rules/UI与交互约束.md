# UI 与交互约束

## 1. 适用范围

- **适用**：`web/templates/`（主 UI：`index.html`）、`web/static/js/`、`web/static/css/`、`web/static/i18n/`
- **不适用**：
  - `web/templates/api-docs.html`（API 文档页，独立维护）
  - `plugins/` 内 Burp / 浏览器扩展 UI（见各插件 README）
  - 机器人消息卡片（由 `internal/robot/` 与各平台协议决定）

## 2. 技术形态

| 项 | 约束 |
| :--- | :--- |
| 构建 | **无** Webpack/Vite 等打包器；改 JS/CSS 后刷新浏览器验证 |
| 模板 | 单一主模板 `index.html`，不为每种语言复制 HTML |
| i18n 引擎 | i18next 浏览器 UMD（CDN）；逻辑在 `web/static/js/i18n.js` |
| 文案资源 | `web/static/i18n/zh-CN.json`（默认）、`en-US.json` |
| 后端 | Go 仅提供结构与数据 API，**不参与** UI 语言分发 |

完整方案见 `docs/zh-CN/frontend-i18n.md`。

## 3. 界面风格约束

- **视觉风格**：跟随现有仪表盘样式（支持浅色/深色）；新模块应复用 `web/static/css/` 已有类与布局模式
- **组件复用**：优先使用项目内 modal、通知、表格、表单、加载态等既有模式（分散在各 `*.js` 业务文件中）
- **不允许**：引入与现有风格脱节的新 UI 框架（除非需求明确）；在 HTML/JS 中硬编码中文或英文用户可见字符串（新代码应走 i18n key）

## 4. 交互约束

### 4.1 关键交互原则

- 流式对话（SSE）须保持可滚动、可取消、工具事件可辨识（见 `chat-*.js` 等现有实现）
- 设置页修改配置后应有明确保存/应用反馈；涉及重启或热应用的须与后端行为一致
- 与 Agent、工具、HITL 相关的 UI 须反映真实状态（审批中、执行中、失败），禁止静态假状态

### 4.2 加载、错误、空状态

`contributing-guide.md` 要求新页面具备：

- **loading**：请求进行中
- **empty**：无数据
- **error**：失败可重试或可读说明

### 4.3 高风险操作

- 删除、批量操作、WebShell/C2/外部 MCP 相关按钮须有**确认**步骤
- 长文本与英文按钮注意布局溢出（contributing-guide 要求）

### 4.4 国际化

- Key 命名：`模块.语义`，2–3 级，如 `nav.dashboard`、`settings.robot.wecom.token`
- **新增或修改可见文案**必须同时更新 `zh-CN.json` 与 `en-US.json`
- 未翻译时回退默认中文，不显示原始 key（见 frontend-i18n 文档）
- 项目处于**渐进式 i18n 迁移**：旧页面可能仍有硬编码；**新改动**不得增加新的硬编码可见文案

### 4.5 响应式 / 多端

- 主控制台面向桌面浏览器；无独立移动端应用要求
- 反向代理下流式接口须验证实时性（见 `testing.md`）

## 5. 前端与 API 协作

- HTTP 调用统一经 `apiFetch`（及既有封装），携带认证 Cookie
- 错误处理依赖稳定字段 `error` + `message`（与后端约定一致）
- 新接口对接时同步查阅 OpenAPI（`/api-docs`）与 `internal/handler/openapi.go`

## 6. 测试与验证

- 手动：登录、相关页面流程、中英文切换、浏览器控制台无错误
- 仓库内存在 `*.test.cjs` 等前端单测时，改动相关模块应运行对应测试（如 `node` 执行，以项目现有脚本为准）

## 7. AI 使用提示

- **修改 UI 前优先复用**：同模块已有 JS 文件的模式、`i18n.js` 的 DOM 标记方式（`data-i18n`）
- **不应擅自改变**：全局导航结构、登录流程、HITL 审批交互语义、SSE 事件类型与前端解析契约
- **规范不足时**：以 `docs/zh-CN/frontend-i18n.md` 与相邻模块代码为准；无法确认时列入需求待澄清，不自行发明交互
