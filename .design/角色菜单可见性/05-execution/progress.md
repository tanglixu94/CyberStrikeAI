# 执行进展 - 角色菜单可见性

## 本轮记录

- **本轮完成**：
  - T1：实现 `sidebar-menu-registry.js`（DOM 解析、父子级联）
  - T2：建表 `rbac_role_ui_grants` + DB 读写（`rbac_ui_grants.go`）
  - T3/T4：GET/PUT `/api/rbac/roles/:id/ui-grants/menu`；login/validate/`/me` 下发 `uiGrants`
  - T5：独立配置 Modal + 角色目录「配置菜单」入口
  - T6/T7：`applySidebarMenuVisibility` + `switchPage`/`switchSettingsSection` 守卫
  - T8：`syncC2NavFromConfig` 在角色菜单模块启用时不再覆盖侧栏 C2 显隐
  - T9：RBAC middleware 增加 `SessionUIAllowsPermission` 校验
  - T10（部分）：i18n 中英文；`ui_grants_test.go` 单测
- **本轮涉及代码范围**：
  - 后端：`internal/database/rbac*.go`、`rbac_ui_grants.go`、`internal/security/ui_grants*.go`、`auth_manager.go`、`rbac_middleware.go`、`handler/rbac.go`、`handler/auth.go`、`app.go`
  - 前端：`sidebar-menu-registry.js`、`sidebar-menu-visibility.js`、`role-menu-config.js`、`auth.js`、`settings.js`、`rbac.js`、`index.html`、`style.css`、i18n
- **当前阻塞**：无
- **下一轮接手建议**：手测多角色并集、系统内置角色菜单配置、保存后重新登录验收；按需补 OpenAPI 与前端解析器 fixture 测试

## 代码提交关联

| 仓库 | 分支 | Commit ID | 推送状态 |
|------|------|-----------|----------|
| CyberStrikeAI | 开发分支 | （未提交） | 未提交 |
