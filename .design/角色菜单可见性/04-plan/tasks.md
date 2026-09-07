# 任务拆解 - 角色菜单可见性

> 状态：开发中（核心链路已实现，待手测验收）

## 任务列表

| ID | 任务 | 模块 | 状态 | 验收边界 |
|----|------|------|------|----------|
| T1 | 实现 `parseSidebarMenuFromDOM`，单测覆盖分组/父/子 | M1 | 已完成 | 与现侧栏 node 数一致 |
| T2 | 建表 `rbac_role_ui_grants` + 默认策略 + 迁移 | M2 | 已完成 | 含索引；支持 sidebar_page/settings_section |
| T3 | GET/PUT `/api/rbac/roles/:id/ui-grants/menu` + 审计 | M2 | 已完成 | rbac:write |
| T4 | `/api/rbac/me` 返回 `uiGrants`（并集） | M2 | 已完成 | 结构预留 `button: []` |
| T5 | 独立配置 Modal UI + rbac 入口按钮 | M3 | 已完成 | 不改 role 权限表单主体 |
| T6 | `applySidebarMenuVisibility` + 分组标题 | M4 | 已完成 | 与 requirements §5.2 |
| T7 | `switchPage` 守卫 + 直链/hash | M4 | 已完成 | 隐藏页无法进入 |
| T8 | 调整 c2.enabled 与菜单叠加策略 | M4 | 已完成 | 菜单配置优先 |
| T9 | 后端 API page 映射 middleware | M5 | 已完成 | 隐藏模块 API 403 |
| T10 | i18n + 文档/OpenAPI + 回归手测 | M6 | 进行中 | i18n/单测已做；OpenAPI/手测待补 |

## 当前任务

- **T10**：手测验收 + OpenAPI 更新（可选）

## 下一步

- 以 operator 等非 admin 角色验证默认仅 `dashboard`+`chat`
- 配置菜单保存后验证会话吊销与重新登录
- 验证隐藏模块 API 返回 403
