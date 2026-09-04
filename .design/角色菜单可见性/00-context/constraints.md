# 约束与边界 - 角色菜单可见性

## 项目级约束（引用）

- 内部二次开发；改动同步 `origin` + `gitlab` 开发分支
- 前端 i18n 双语；API 错误 `{ error, message }`
- 合并 `upstream` 友好：**新增为主**，少改 `index.html` / `auth.js` / `router.js` 核心逻辑

## 本需求硬约束

| 约束 | 说明 |
|------|------|
| 绑定对象 | **平台 RBAC 角色**（`platform-rbac` / `rbac_roles`），不是 `roles-management` Agent 角色 |
| 配置入口 | **独立菜单配置页面**；在平台权限角色 UI 中通过按钮打开（弹窗/全屏层），不塞进原有角色权限表单大改 |
| 菜单树数据源 | **唯一来源 = 当前 DOM**（`.main-sidebar-nav` + `.settings-nav`）；配置页与运行时共用解析器 |
| 存储 | **`rbac_role_ui_grants` 表**（`resource_type` + `resource_key`），不用 `rbac_roles` JSON 列；预留 `button` |
| 隐藏语义 | 隐藏 = 侧栏/设置 Tab 不显示 + **前端路由拒绝** + **后端 API 拒绝** |
| 多角色合并 | **并集** |
| 与 c2.enabled | 菜单配置优先于 `c2.enabled` |
| 分组标题 | 组内无可显示项时隐藏 |
| 默认可见性 | `admin` 全量；其他角色最小集 `dashboard`+`chat` |
| 权限 | 配置：`rbac:write`；运行时：会话内 `uiGrants` |
| 可扩展性 | 表结构预留 `resource_type=button`；本期不实现按钮 UI |
| 不做 | 全局 config 菜单开关；Agent YAML 角色配置入口；插件菜单 |

## 合并 upstream 策略

- 新增：`rbac_role_ui_grants` 表、`sidebar-menu-*.js`、ui-grants API、`/me` 的 `uiGrants`
- 薄钩子：`rbac.js`、`router.js`、`auth.js`、`settings.js`（`switchSettingsSection`）
- 避免：重写侧栏 HTML、复制一份 MENU_TREE 常量、大改 `settings.js`

## 风险与对策

| 风险 | 对策 |
|------|------|
| DOM 解析与上游侧栏结构漂移 | 解析器单文件 + 单测；上游合并后跑前端测试/手测 |
| 仅前端拦截可绕过调 API | `pageId` ↔ API 权限映射在后端校验；隐藏页面对应 API 返回 403 |
| 非 admin 默认最小集过严/过松 | requirements 列出建议集，实现前产品确认 |
| 隐藏 settings 后无法管理 | `admin` 保留全菜单；运维文档说明用 admin 恢复 |
