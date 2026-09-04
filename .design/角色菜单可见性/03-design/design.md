# 设计方案 - 角色菜单可见性

## 1. 方案概述

采用 **「DOM 单源 + 独立配置页 + RBAC 存储 + 前后端双校验」**：

- **菜单结构**：运行时从 `index.html` 内 `.main-sidebar-nav` 解析为树（不维护独立 MENU_TREE 文件）
- **配置 UI**：独立页面模块（全屏 Modal 或 overlay page），由 `rbac.js` 按钮打开，传入 `roleId`
- **持久化**：`rbac_role_ui_grants` 表（通用 UI 资源授权，本期写 `menu` 类，预留 `button`）
- **运行时**：登录后合并角色 → `allowedUiResources` → 侧栏 + `switchPage` + API 映射

## 2. 菜单树解析（单源）

### 2.1 解析规则（与现 DOM 对齐）

```text
.main-sidebar-nav
  .nav-section-label          → group（无 pageId，仅标题）
  .nav-item[data-page]        → node（可能为父：.nav-item-has-submenu）
    .nav-submenu
      .nav-submenu-item[data-page] → child node
```

- **node id** = `data-page` 值（与 `router.js`、`PAGE_PERMISSION_MAP` 一致）
- **group id** = 稳定 slug（可由首个子节点推导，或 `data-nav-group` 新增属性——若解析不稳，**仅**在 `index.html` 侧栏增加 `data-nav-group`，仍视为「读现网菜单」而非第二份清单）
- 解析器：`sidebar-menu-registry.js` 导出 `parseSidebarMenuFromDOM(root?)`

### 2.2 禁止做法

- 在 JS 内手写与侧栏无关的 `MENU_ITEMS = [...]`
- 配置页与运行时各写一套树

## 3. 独立配置页

### 3.1 入口

- 位置：**平台权限** → 角色卡片/编辑弹窗 → 按钮「配置菜单」（i18n）
- 权限：`rbac:write` 可编辑；只读用户不显示按钮或只读树

### 3.2 UI

- 全屏 Modal（推荐）或独立 `#page-rbac-menu-config`（`hidden` + overlay）
- 树形：分组 → 父 → 子，缩进/折叠；开关级联
- 底部：保存 / 取消
- 保存：`PUT /api/rbac/roles/:id/ui-grants/menu`（本期菜单专用；底层写 `rbac_role_ui_grants`）

### 3.3 对原代码影响最小化

| 文件 | 改动量 |
|------|--------|
| `rbac.js` | +按钮 + `openRoleMenuConfig(roleId)` |
| `index.html` | +modal 容器 + script 标签 |
| 新增 `role-menu-config.js` | 配置页逻辑 |
| 新增 `sidebar-menu-*.js` | 解析 + 应用 + 守卫 |
| `rbac-role-modal` 表单 | **不改**权限勾选主体 |

## 4. 数据模型（可扩展：菜单 → 按钮）

### 4.1 设计原则

| 原则 | 说明 |
|------|------|
| 不用 `rbac_roles` 上大 JSON 堆叠 | 避免菜单、按钮、后续动作权限各加一列 |
| 统一「UI 资源授权」表 | `resource_type` + `resource_key` 标识资源；本期只写菜单类 |
| 默认策略在代码层 | 表内**无行** = 走角色默认（admin 全量 / 其他最小集），不把默认展开结果 bulk insert |
| 多角色并集 | 用户对某 `resource_type` 下任一角色 `allow` 即允许（与 RBAC permission 并集一致） |
| 预留 deny | `effect` 字段默认 `allow`；后续若需显式拒绝再启用（按钮场景更常见） |

### 4.2 表结构（本期创建，服务后续按钮权限）

```sql
CREATE TABLE IF NOT EXISTS rbac_role_ui_grants (
    id           TEXT PRIMARY KEY,
    role_id      TEXT NOT NULL,
    resource_type TEXT NOT NULL,  -- 见 §4.3
    resource_key TEXT NOT NULL,     -- 稳定资源 ID，见 §4.4
    effect       TEXT NOT NULL DEFAULT 'allow',  -- allow | deny（本期仅 allow）
    created_at   DATETIME NOT NULL,
    updated_at   DATETIME NOT NULL,
    FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE,
    UNIQUE (role_id, resource_type, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_ui_grants_role
    ON rbac_role_ui_grants (role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_role_ui_grants_type_key
    ON rbac_role_ui_grants (resource_type, resource_key);
```

**为何独立表而非 JSON 列：**

- 按钮权限迭代时只增 `resource_type='button'` 行，不改表结构
- 可按角色/资源类型查询、审计、导出
- 与现有 `rbac_role_permissions`（API 能力）职责分离：permission 管「能不能调 API」，ui_grant 管「界面上看不看得到 / 点不点得了」

### 4.3 `resource_type` 枚举（迭代路线图）

| resource_type | 本期 | 说明 |
|---------------|------|------|
| `sidebar_page` | **v1** | 主侧栏 `data-page` |
| `settings_section` | **v1** | 系统设置 `data-section`，key 为 `settings:<section>` |
| `button` | 预留 | 页面内按钮/操作，key 见 §4.5 |
| `action` | 远期 | 非按钮 UI（Tab、批量菜单项等），按需扩展 |

### 4.4 `resource_key` 命名约定

| 类型 | key 格式 | 示例 |
|------|----------|------|
| `sidebar_page` | 与 `data-page` 相同 | `dashboard`, `c2-listeners` |
| `settings_section` | `settings:` + `data-section` | `settings:basic`, `settings:audit` |
| `button`（预留） | `<scope>:<action>` | `assets:delete`, `vulnerabilities:export` |

DOM 单源要求不变：v1 的 key **从 DOM 解析得到**，不入库静态清单；按钮期建议在 DOM 增加 `data-ui-action="assets:delete"`，解析器复用同一注册框架。

### 4.5 按钮权限预留（本期不实现，表已兼容）

后续迭代时：

1. 配置 UI 增加「按钮权限」Tab（或按页展开按钮树）
2. 写入 `resource_type='button'`, `resource_key='...'`, `effect='allow'`
3. `/api/rbac/me` 增加 `allowedButtons: string[]`（或统一 `uiGrants: { sidebar_page: [], settings_section: [], button: [] }`）
4. 前端 `data-ui-action` + `applyButtonVisibility()`；后端写操作 API 校验 button grant（**最终仍须与 RBAC write permission 交集**）

**会话下发结构（推荐一次定型，避免再改 `/me`）：**

```json
{
  "uiGrants": {
    "sidebar_page": ["dashboard", "chat"],
    "settings_section": ["settings:basic"],
    "button": []
  }
}
```

多角色合并：各 type 下 key 列表取**并集**；若未来启用 `deny`，采用「任一角色 deny 则拒绝」或「显式 allow 优先」——按钮期再定，表结构已支持。

### 4.6 默认策略（无 grant 行时）

| 角色 | 行为 |
|------|------|
| `admin` | 解析器当前 DOM 下该 `resource_type` **全量 allow** |
| 其他 | `sidebar_page` 仅 `dashboard`,`chat`；`settings_section` 全 deny（因无 `settings` 入口）；`button` 空集 |

用户首次在配置页保存后，才对该 `role_id` 写入显式 grant 行（可选：保存时只写「与默认差异」或写完整 allowlist——实现选**完整 allowlist** 更简单）。

### 4.7 API（本期）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rbac/roles/:id/ui-grants/menu` | 返回该角色菜单类 grant（含解析树 + 勾选状态） |
| PUT | `/api/rbac/roles/:id/ui-grants/menu` | 替换该角色下 `sidebar_page` + `settings_section` 的 allow 行；`rbac:write`；审计 |
| GET | `/api/rbac/me` | 增加 `uiGrants`（见 §4.5） |

> 路径含 `/menu` 表示本期只暴露菜单维度；后续增加 `PUT .../ui-grants/button` 或统一 `PUT .../ui-grants` + body 分 type，不破坏表结构。

### 4.8 并集算法

```text
allowedKeys(user, type) = ⋃ effectiveGrants(role, type) for role in user.roles

effectiveGrants(role, type):
  if role.id == admin and no explicit rows for type → all keys from DOM parser
  if no rows for type → defaultMinimal(type, role)
  else → keys from rbac_role_ui_grants where role_id and resource_type and effect=allow
```

## 5. 运行时应用

### 5.1 侧栏

`applySidebarMenuVisibility(uiGrants.sidebar_page, uiGrants.settings_section)`：

1. 遍历解析树，隐藏不在 allowlist 的节点
2. 父隐藏 → 子 DOM 隐藏
3. 分组下无可见子项 → 隐藏 `.nav-section-label`
4. 在 `applyRBACToUI()` **之后**调用（RBAC 与菜单取**交集**：无权限仍隐藏）

**最终可见** = `RBAC允许` ∧ `菜单允许`（用户要求菜单可覆盖 c2.enabled，但不绕过 RBAC）

### 5.2 路由守卫

`router.js` 薄包装：

```text
switchPage(pageId) → if (!isUiResourceAllowed('sidebar_page', pageId)) notify + return
switchSettingsSection(section) → if (!isUiResourceAllowed('settings_section', 'settings:'+section)) notify + return
```

与 RBAC 的 `PAGE_PERMISSION_MAP` 并列检查 `allowedPages`。

### 5.3 c2.enabled

- `syncC2NavFromConfig`：**不再**对已有 RBAC 菜单解析结果做 display:none 覆盖；或在该函数开头判断「若已启用角色菜单模块则 skip」

## 6. 后端防越权

### 6.1 原则

前端隐藏不可信；隐藏模块的 **GET/POST API** 须拒绝。

### 6.2 实现思路

- 维护 `pageId → 所需 permission 前缀或 API 路径前缀` 映射（可扩展现有 `permissionForRequest` 旁路表）
- 或：session 存 `allowedPages`，middleware 对「页面型」只读 API 检查所属 `pageId`
- 最小可行：复用 `PAGE_PERMISSION_MAP` 反向——无 `pageId` 权限则对应 permission 的 API 即使 RBAC 有 permission 也拒绝？**不对**：RBAC permission 与 page 是两套。

**推荐**：

1. `/api/rbac/me` 下发 `allowedPages`
2. 新增 `MenuVisibilityMiddleware` 或扩展现有 RBAC：根据请求推断 `resource_key`，查 session `uiGrants`
3. 按钮期：写操作 API 额外校验 `uiGrants.button`（**不能替代** `*:write` permission）

### 6.3 配置 API 防越权

- 仅 `rbac:write` 可 PUT
- 不允许把当前会话用户自己的角色改成看不见 `platform-rbac` 且是唯一 admin——可选保护（实现时评估，不阻塞首期）

## 7. 方案对比（已选）

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| A. 系统设置全局 config | 简单 | 不符合角色绑定；难合并 | 否决 |
| B. 角色弹窗内嵌大树 | 无新页 | 大改 rbac modal | 否决 |
| C. 独立配置页 + DOM 单源 + **ui_grants 表** | 隔离改动、可扩展按钮 | 比 JSON 列略多迁移代码 | **选用** |
| D. 手写 MENU_TREE | 稳定 | 双份维护 | 否决 |

## 8. 测试要点

- 解析器单测：对 `index.html` 片段或 fixture DOM
- DB：`rbac_role_ui_grants` 表、默认策略、迁移幂等（含索引）
- Handler：PUT 无权限 403；越权 API 403
- 手测：并集、父级联、直链拦截、C2 + c2.enabled 组合

## 9. 开放项

- 最小集 pageId 清单（requirements §6.1）
- 是否在侧栏/设置 nav 增加 `data-nav-group`（解析不稳时）
- 按钮权限具体 key 规范与配置 UI（**后续迭代**，表结构已预留）
