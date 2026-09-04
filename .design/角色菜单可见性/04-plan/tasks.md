# 任务拆解 - 角色菜单可见性

> 状态：未开始（等待确认进入开发）

## 模块与依赖

```text
M1 侧栏 DOM 解析器（sidebar-menu-registry.js）
    ↓
M2 数据层与 API（**rbac_role_ui_grants** + GET/PUT ui-grants/menu + /me uiGrants）
    ↓
M3 独立配置页 UI（role-menu-config.js + index.html 容器 + rbac.js 入口）
    ↓
M4 运行时应用（侧栏 + switchPage 守卫 + 与 RBAC/c2 叠加）
    ↓
M5 后端防越权（menu_pages 映射 + middleware）
    ↓
M6 i18n / 单测 / 手测验收
```

## 任务列表

| ID | 任务 | 模块 | 状态 | 验收边界 |
|----|------|------|------|----------|
| T1 | 实现 `parseSidebarMenuFromDOM`，单测覆盖分组/父/子 | M1 | 未开始 | 与现侧栏 node 数一致 |
| T2 | 建表 `rbac_role_ui_grants` + 默认策略 + 迁移 | M2 | 未开始 | 含索引；支持 sidebar_page/settings_section |
| T3 | GET/PUT `/api/rbac/roles/:id/ui-grants/menu` + 审计 | M2 | 未开始 | rbac:write |
| T4 | `/api/rbac/me` 返回 `uiGrants`（并集） | M2 | 未开始 | 结构预留 `button: []` |
| T5 | 独立配置 Modal UI + rbac 入口按钮 | M3 | 未开始 | 不改 role 权限表单主体 |
| T6 | `applySidebarMenuVisibility` + 分组标题 | M4 | 未开始 | 与 requirements §5.2 |
| T7 | `switchPage` 守卫 + 直链/hash | M4 | 未开始 | 隐藏页无法进入 |
| T8 | 调整 c2.enabled 与菜单叠加策略 | M4 | 未开始 | Q4:B |
| T9 | 后端 API page 映射 middleware | M5 | 未开始 | 隐藏模块 API 403 |
| T10 | i18n + 文档/OpenAPI + 回归手测 | M6 | 未开始 | requirements §7 全部 |

## 建议实施顺序

1. T1 → T2 → T4（先打通「读树 + 算 allowedPages」）
2. T6 → T7（前端可见性与路由）
3. T3 → T5（配置保存）
4. T9（后端防越权）
5. T8 → T10

## 当前任务

- **无**（等待进入开发确认）

## 下一步

- 产品确认**最小集 pageId**（requirements §6.1）
- 负责人确认开始开发后，将 T1 标为进行中
