# 需求说明 - 角色菜单可见性

## 1. 原始需求

在平台中按**角色**控制主侧栏各菜单的显示与隐藏，支持父子层级；关闭父菜单时子菜单一并关闭。配置入口放在**平台权限（RBAC）**相关流程中，**单独页面**配置（从角色处打开），避免大改系统设置与原有角色表单。隐藏后与其他拦截行为一致：**不能通过侧栏、直链、switchPage 进入**。菜单树配置时**从现网侧栏读取**，不写死、不维护第二份清单。需**后端防越权**。代码以新增为主，便于合并 GitHub 上游。

## 2. 澄清结论（已确认）

| 议题 | 结论 |
|------|------|
| 配置绑定 | 平台 **RBAC 角色**（Q8:A） |
| 配置入口 | **独立菜单配置页** + 角色 UI 按钮打开弹窗/全屏（用户补充） |
| 多角色合并 | **并集**（Q9:A） |
| 隐藏后访问 | **一律禁止**（修正 Q3；与路由拦截一致，含直链） |
| 与 c2.enabled | 菜单配置**覆盖**（Q4:B） |
| 分组标题 | 组内全隐藏则隐藏标题（Q5:A） |
| 默认策略 | **admin 全显示**；其他角色**最小集**（Q10，清单见 §6） |
| 编辑权限 | `rbac:write`（Q11:A） |
| 旧原型 | 忽略，重新设计（Q7） |
| 菜单数据源 | **读取当前侧栏 DOM**，单源（用户补充） |
| 安全 | 前端 + **后端**一致校验（用户补充） |

## 3. 已确认范围

### 3.1 纳入

- 从 `.main-sidebar-nav` 与 `#page-settings .settings-nav` 解析菜单树
- **`rbac_role_ui_grants` 表**存储 UI 资源授权（本期 `sidebar_page`、`settings_section`；预留 `button`）
- 平台权限 → 角色 →「配置菜单」→ 打开配置页（带 `roleId`）
- 登录后解析用户 `uiGrants`（多角色并集）
- 侧栏/设置 Tab 显隐、分组标题显隐、`switchPage` / `switchSettingsSection` 守卫
- 后端：`/api/rbac/me` 下发 `uiGrants`；API 层对隐藏模块拒绝访问
- DB 迁移、i18n、OpenAPI（若新增 API）、必要单测

### 3.2 排除（本期 v1）

- 系统设置中的全局「菜单显示」
- Agent「角色管理」（`roles-management` / `roles/*.yaml`）的配置入口（但该侧栏项仍在菜单树中可勾选）
- 仪表盘内快捷入口联动（首期）
- 浏览器/Burp 插件
- **按钮级权限 UI 与运行时**（表结构与 `/me` 的 `uiGrants.button` 预留，实现放后续迭代）

### 3.3 后续迭代（已纳入数据模型设计）

- `resource_type=button` 的授权与 `data-ui-action` DOM 约定
- 配置页「按钮权限」维度
- 写操作 API 与 button grant 双重校验

## 4. 不做范围

- 按用户个体配置（非角色）
- 动态增删侧栏菜单项（仍由 `index.html` 定义结构）
- 修改 RBAC 权限 Scope 模型本身

## 5. 功能行为

### 5.1 配置

1. 管理员在「平台权限」角色列表/详情中点击「配置菜单」
2. 打开**独立配置页**（弹窗或全屏层），展示从**当前侧栏 DOM 实时解析**的树
3. 勾选/取消支持父子级联：关父则关子；开子可提示或自动开父（设计阶段定细则）
4. 保存写入该 RBAC 角色；需 `rbac:write`

### 5.2 运行时

1. 用户登录后，合并其所有角色的可见 `pageId`（**并集**）
2. 侧栏：仅渲染允许的项；父隐藏则子隐藏；空分组隐藏标题
3. 访问不允许的 `pageId`：`switchPage`、hash、书签、仪表盘链接 → **拦截 + 提示**
4. 调用隐藏模块相关 API → **403**（在 RBAC 之后或结合 page 映射）

### 5.3 与 c2.enabled

- 角色允许 C2 相关 `pageId` 时，**不因** `config.c2.enabled=false` 隐藏 C2 菜单（`syncC2NavFromConfig` 对 RBAC 菜单场景降级或后置）

## 6. 默认可见性（Q10）

| 角色类型 | 默认菜单 |
|----------|----------|
| `admin`（系统内置管理员） | **全部**侧栏 `pageId`（与解析器结果一致） |
| 其他系统角色 + 自定义角色 | **最小集**（新建/未配置记录时生效） |

### 6.1 默认最小集（已确认）

非 `admin` 角色在未单独配置时，默认仅允许：

| pageId | 说明 |
|--------|------|
| `dashboard` | 仪表盘 |
| `chat` | 对话 |

## 6.2 参与配置的菜单清单（来源：`index.html` → `.main-sidebar-nav`）

以下为当前仓库侧栏**全部可配置 `pageId`**，实现时由 DOM 解析器动态读取，本表仅作需求冻结对照。

**统计**：4 个分组标题 + **44 个**可配置节点（主侧栏 35 个 `pageId` + 系统设置 9 个 `settings:*` section，其中 `settings` 同时为主侧栏父项）。

### 工作台（`navGroups.workbench`）

| pageId | 类型 | 显示名（i18n） | RBAC 权限 |
|--------|------|----------------|-----------|
| `dashboard` | 叶子 | 仪表盘 | `dashboard:read` |
| `chat` | 叶子 | 对话 | `chat:read` |
| `hitl` | 叶子 | 人机协同 | `hitl:read` |

### 安全作业（`navGroups.operations`）

| pageId | 类型 | 显示名 | RBAC 权限 |
|--------|------|--------|-----------|
| `projects` | 叶子 | 项目管理 | `project:read` |
| `assets` | **父** | 资产管理 | `asset:read`（`data-require-permission-any`） |
| ↳ `asset-overview` | 子 | 资产概览 | `asset:read` |
| ↳ `asset-library` | 子 | 资产库 | `asset:read` |
| ↳ `info-collect` | 子 | 信息收集 | `fofa:execute` |
| `vulnerabilities` | 叶子 | 漏洞管理 | `vulnerability:read` |
| `tasks` | 叶子 | 任务管理 | `tasks:read` |
| `workflows` | 叶子 | 工作流 | `workflow:read` |
| `webshell` | 叶子 | WebShell管理 | `webshell:read` |
| `c2` | **父** | C2 | `c2:read` |
| ↳ `c2-listeners` | 子 | 监听器 | `c2:read` |
| ↳ `c2-sessions` | 子 | 会话 | `c2:read` |
| ↳ `c2-tasks` | 子 | 任务 | `c2:read` |
| ↳ `c2-payloads` | 子 | Payload | `c2:read` |
| ↳ `c2-events` | 子 | 事件 | `c2:read` |
| ↳ `c2-profiles` | 子 | 流量伪装 | `c2:read` |
| `chat-files` | 叶子 | 文件管理 | `files:read` |

### 能力中心（`navGroups.capabilities`）

| pageId | 类型 | 显示名 | RBAC 权限 |
|--------|------|--------|-----------|
| `mcp` | **父** | MCP | `mcp:read` |
| ↳ `mcp-monitor` | 子 | MCP状态监控 | `monitor:read` |
| ↳ `mcp-management` | 子 | MCP管理 | `mcp:read` |
| `knowledge` | **父** | 知识 | `knowledge:read` |
| ↳ `knowledge-retrieval-logs` | 子 | 检索历史 | `knowledge:read` |
| ↳ `knowledge-management` | 子 | 知识管理 | `knowledge:read` |
| `skills` | **父** | 技能 | `skills:read` |
| ↳ `skills-monitor` | 子 | 技能状态 | `skills:read` |
| ↳ `skills-management` | 子 | 技能管理 | `skills:read` |
| `agents` | **父** | 智能体 | `agents:read` |
| ↳ `agents-management` | 子 | 智能体管理 | `agents:read` |
| `roles` | **父** | 角色（Agent 工具角色） | `roles:read` |
| ↳ `roles-management` | 子 | 角色管理 | `roles:read` |

### 平台管理（`navGroups.administration`）

| pageId | 类型 | 显示名 | RBAC 权限 |
|--------|------|--------|-----------|
| `platform-rbac` | 叶子 | 平台权限 | `rbac:read` |
| `settings` | **父** | 系统设置 | `config:read` |
| ↳ `settings:basic` | 子 | 基本设置 | `config:read`（section） |
| ↳ `settings:hitl` | 子 | 人机协同 | `config:read` |
| ↳ `settings:infocollect` | 子 | 资产管理 | `config:read` |
| ↳ `settings:knowledge` | 子 | 知识库 | `config:read` |
| ↳ `settings:c2` | 子 | C2 | `config:read` |
| ↳ `settings:robots` | 子 | 机器人设置 | `config:read` |
| ↳ `settings:terminal` | 子 | 终端 | `config:read` |
| ↳ `settings:security` | 子 | 安全设置 | `config:read` |
| ↳ `settings:audit` | 子 | 日志审计 | `config:read` |

> **系统设置子菜单说明**：DOM 位于 `#page-settings .settings-nav`，使用 `data-section`（非 `data-page`）。配置 ID 建议加前缀 `settings:` 与主侧栏 `pageId` 区分。实现时解析 `.settings-nav` 或扩展统一解析器；守卫需覆盖 `switchSettingsSection()`。

### 6.3 不参与配置的范围

| 项 | 原因 |
|----|------|
| 分组标题（工作台/安全作业/…） | 无 `data-page`；由组内子项是否全隐藏**推导**是否显示 |
| 顶栏用户菜单、折叠按钮 | 非主侧栏业务菜单 |
| `api-docs` 独立页 | 不在 `.main-sidebar-nav` |
| 顶栏用户菜单、折叠按钮 | 非主侧栏业务菜单 |
| `api-docs` 独立页 | 不在 `.main-sidebar-nav` |
| **菜单配置页本身** | 通过平台权限弹窗打开，非侧栏/设置内导航项 |

> 原「系统设置内部 Tab 不参与」已根据反馈调整：**`settings` 作为父节点，其 9 个子 section 纳入配置树**（见平台管理 §6.2）。隐藏某 section 时须同步拦截 `switchSettingsSection` 与相关配置 API。

### 6.4 父节点配置语义

| 父 pageId | 说明 |
|-----------|------|
| `assets` / `c2` / `mcp` / `knowledge` / `skills` / `agents` / `roles` | 有子菜单；点击父项为 `toggleSubmenu`，`c2` 在 router 中可重定向到 `c2-listeners` |
| 关父 | 子项在配置 UI 与运行时**一并关闭** |
| 开子 | 实现时需约定是否自动开启父（设计倾向：**开子自动开父**） |

### 6.2 历史数据

- 已有自定义角色若 DB 无 `menu_visibility` 字段：按角色 `id` 判断——`admin` → 全量；其余 → 最小集
- 迁移脚本需幂等

## 7. 验收标准

1. 「平台权限」中可为指定 RBAC 角色打开独立「配置菜单」页，树形展示且层级清晰（分组/父/子）
2. 配置页展示的节点与**当前侧栏 DOM** 一致，上游在侧栏增删菜单后，配置页自动反映（无需改第二份配置）
3. 关父级联关子；保存后该角色用户侧栏正确
4. 多角色用户：并集正确
5. 隐藏项：**侧栏、switchPage、直链**均不可进入，有统一提示
6. 隐藏项相关 **API 调用返回 403**（抽样覆盖各模块只读 API）
7. `admin` 默认全菜单；新建 `operator` 等非 admin 角色默认仅最小集
8. 角色允许时，C2 菜单不受 `c2.enabled=false` 单独隐藏
9. 无 `rbac:write` 不能保存菜单配置
10. zh-CN / en-US 文案齐全

## 8. 待确认问题

- [x] **最小集** pageId：`dashboard` + `chat`（§6.1）
- [x] **参与配置菜单清单**（§6.2，主侧栏 35 + 设置子项 9）
- [ ] 配置页形态：全屏 Modal vs 独立 `page-*` 路由（设计倾向 Modal + 独立 JS 模块）

## 9. 影响面（初判）

| 区域 | 影响 |
|------|------|
| `internal/database/rbac*.go` | **新表** `rbac_role_ui_grants`、迁移、读写 |
| `internal/handler/rbac.go` | 角色 UI grants API、`/me` 的 `uiGrants` |
| `internal/security/rbac_middleware.go` 或新模块 | page/API 映射防越权 |
| `web/static/js/rbac.js` | 打开配置页入口 |
| 新增 JS | DOM 解析、配置 UI、visibility 应用、路由守卫 |
| `web/templates/index.html` | 配置页容器、script 引用、可选 data 属性增强解析 |
| `web/static/js/auth.js` / `router.js` | 薄钩子 |
