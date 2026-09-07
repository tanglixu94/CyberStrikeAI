/**
 * Role menu visibility configuration modal.
 */
(function (global) {
    'use strict';

    const state = {
        roleId: '',
        roleName: '',
        roleIsSystem: false,
        selectedSidebar: new Set(),
        selectedSettings: new Set(),
        collapsedParents: new Set(),
        searchQuery: '',
        loading: false,
        parsed: null,
    };

    function menuConfigT(key, fallback, opts) {
        if (typeof global.t === 'function') {
            const translated = global.t(key, opts);
            if (translated && translated !== key) return translated;
        }
        return String(fallback || '').replace(/\{\{\s*(\w+)\s*\}\}/g, function (_, name) {
            return opts && Object.prototype.hasOwnProperty.call(opts, name) ? String(opts[name]) : '';
        });
    }

    function canWriteMenuConfig() {
        return typeof global.hasPermission === 'function' && global.hasPermission('rbac:write');
    }

    function escapeMenuText(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function escapeMenuAttr(text) {
        return escapeMenuText(text).replace(/"/g, '&quot;');
    }

    function getParsedMenu() {
        if (typeof global.parseSidebarMenuFromDOM !== 'function') {
            return { groups: [], sidebarPages: [], settingsSections: [] };
        }
        if (!state.parsed) {
            state.parsed = global.parseSidebarMenuFromDOM(document);
        }
        return state.parsed;
    }

    function isSettingsChild(child) {
        return child && child.type === 'settings_section';
    }

    function childIsSelected(child) {
        if (isSettingsChild(child)) return state.selectedSettings.has(child.key);
        return state.selectedSidebar.has(child.pageId);
    }

    function childSearchKey(child) {
        return isSettingsChild(child) ? child.section : child.pageId;
    }

    function childCodeLabel(child) {
        return isSettingsChild(child) ? child.section : child.pageId;
    }

    function allSidebarPageIds() {
        const parsed = getParsedMenu();
        const ids = [];
        parsed.groups.forEach((group) => {
            group.items.forEach((item) => {
                ids.push(item.pageId);
                item.children.forEach((child) => {
                    if (!isSettingsChild(child)) ids.push(child.pageId);
                });
            });
        });
        return ids;
    }

    function allSettingsKeys() {
        return getParsedMenu().settingsSections.map((section) => section.key);
    }

    function countSidebarSelection() {
        const ids = allSidebarPageIds();
        let selected = 0;
        ids.forEach((id) => {
            if (state.selectedSidebar.has(id)) selected++;
        });
        return { selected, total: ids.length };
    }

    function countSettingsSelection() {
        const keys = allSettingsKeys();
        let selected = 0;
        keys.forEach((key) => {
            if (state.selectedSettings.has(key)) selected++;
        });
        return { selected, total: keys.length };
    }

    function groupKey(group, index) {
        return String(group.id || group.label || index);
    }

    function countGroupSelection(group) {
        let total = 0;
        let selected = 0;
        group.items.forEach((item) => {
            total++;
            if (state.selectedSidebar.has(item.pageId)) selected++;
            item.children.forEach((child) => {
                total++;
                if (childIsSelected(child)) selected++;
            });
        });
        return { total, selected };
    }

    function itemMatchesSearch(label, pageId) {
        const q = state.searchQuery.trim().toLowerCase();
        if (!q) return true;
        return `${label} ${pageId}`.toLowerCase().includes(q);
    }

    function childMatchesSearch(child) {
        return itemMatchesSearch(child.label, childSearchKey(child));
    }

    function groupMatchesSearch(group) {
        if (!state.searchQuery.trim()) return true;
        return group.items.some((item) => {
            if (itemMatchesSearch(item.label, item.pageId)) return true;
            return item.children.some((child) => childMatchesSearch(child));
        });
    }

    function parentCheckState(pageId, children) {
        if (!children.length) {
            return state.selectedSidebar.has(pageId) ? 'checked' : 'unchecked';
        }
        const selectedChildren = children.filter((child) => childIsSelected(child)).length;
        const parentOn = state.selectedSidebar.has(pageId);
        if (selectedChildren === 0 && !parentOn) return 'unchecked';
        if (selectedChildren === children.length && parentOn) return 'checked';
        return 'indeterminate';
    }

    function switchStatusLabel(checked) {
        return checked
            ? menuConfigT('rbac.menuConfig.visible', '显示')
            : menuConfigT('rbac.menuConfig.hidden', '隐藏');
    }

    function renderToggleSwitch(kind, attrs, checked, disabled, indeterminate) {
        const indeterminateAttr = indeterminate ? ' data-indeterminate="1"' : '';
        return `
            <label class="role-menu-config-switch-wrap">
                <span class="vulnerability-alert-switch role-menu-config-switch">
                    <input type="checkbox" data-kind="${kind}" ${attrs}
                        ${checked ? 'checked' : ''}${indeterminateAttr} ${disabled ? 'disabled' : ''}>
                    <span class="vulnerability-alert-switch-track" aria-hidden="true"></span>
                </span>
                <span class="role-menu-config-switch-text">${escapeMenuText(switchStatusLabel(checked))}</span>
            </label>`;
    }

    function renderLeafCard(target, disabled) {
        if (isSettingsChild(target)) {
            const checked = state.selectedSettings.has(target.key);
            return `
                <article class="role-menu-config-leaf-card">
                    <div class="role-menu-config-leaf-meta">
                        <strong>${escapeMenuText(target.label || target.section)}</strong>
                        <code>${escapeMenuText(target.section)}</code>
                    </div>
                    ${renderToggleSwitch('settings', `data-section="${escapeMenuAttr(target.section)}"`, checked, disabled, false)}
                </article>`;
        }
        const checked = state.selectedSidebar.has(target.pageId);
        return `
            <article class="role-menu-config-leaf-card">
                <div class="role-menu-config-leaf-meta">
                    <strong>${escapeMenuText(target.label || target.pageId)}</strong>
                    <code>${escapeMenuText(target.pageId)}</code>
                </div>
                ${renderToggleSwitch('sidebar', `data-page="${escapeMenuAttr(target.pageId)}"`, checked, disabled, false)}
            </article>`;
    }

    function renderParentCard(item, disabled) {
        const checkState = parentCheckState(item.pageId, item.children);
        const checked = checkState === 'checked';
        const indeterminate = checkState === 'indeterminate';
        const childSelected = item.children.filter((child) => childIsSelected(child)).length;
        const collapsed = state.collapsedParents.has(item.pageId) && !state.searchQuery.trim();
        const visibleChildren = item.children.filter((child) => {
            if (!state.searchQuery.trim()) return true;
            return childMatchesSearch(child) || itemMatchesSearch(item.label, item.pageId);
        });
        return `
            <article class="role-menu-config-parent-card" data-parent-page="${escapeMenuAttr(item.pageId)}">
                <header class="role-menu-config-parent-head">
                    <button type="button" class="role-menu-config-parent-toggle" data-parent-page="${escapeMenuAttr(item.pageId)}" aria-expanded="${collapsed ? 'false' : 'true'}">
                        <span class="role-menu-config-parent-chevron" aria-hidden="true">${collapsed ? '▶' : '▼'}</span>
                    </button>
                    <div class="role-menu-config-parent-meta">
                        <strong>${escapeMenuText(item.label || item.pageId)}</strong>
                        <code>${escapeMenuText(item.pageId)}</code>
                    </div>
                    <span class="role-menu-config-parent-count">${childSelected}/${item.children.length}</span>
                    ${renderToggleSwitch('sidebar', `data-page="${escapeMenuAttr(item.pageId)}" data-has-children="1"`, checked, disabled, indeterminate)}
                </header>
                <div class="role-menu-config-parent-body" ${collapsed ? 'hidden' : ''}>
                    <div class="role-menu-config-leaf-grid role-menu-config-leaf-grid--nested">
                        ${visibleChildren.map((child) => renderLeafCard(child, disabled)).join('')}
                    </div>
                </div>
            </article>`;
    }

    function renderGroupItems(group, disabled) {
        const leafItems = [];
        const parentItems = [];
        group.items.forEach((item) => {
            const itemVisible = itemMatchesSearch(item.label, item.pageId) ||
                item.children.some((child) => childMatchesSearch(child));
            if (!itemVisible) return;
            if (item.children.length > 0) parentItems.push(item);
            else leafItems.push(item);
        });
        const leafHtml = leafItems.length
            ? `<div class="role-menu-config-leaf-grid">${leafItems.map((item) => renderLeafCard(item, disabled)).join('')}</div>`
            : '';
        const parentHtml = parentItems.map((item) => renderParentCard(item, disabled)).join('');
        return leafHtml + parentHtml;
    }

    function applyIndeterminateInputs(root) {
        if (!root) return;
        root.querySelectorAll('input[data-indeterminate="1"]').forEach((input) => {
            input.indeterminate = true;
        });
    }

    function updateSummary() {
        const sidebar = countSidebarSelection();
        const settings = countSettingsSelection();
        const stats = document.getElementById('role-menu-config-stats');
        if (stats) {
            stats.textContent = menuConfigT('rbac.menuConfig.stats', '侧栏 {{sidebarSelected}}/{{sidebarTotal}} · 设置 {{settingsSelected}}/{{settingsTotal}}', {
                sidebarSelected: sidebar.selected,
                sidebarTotal: sidebar.total,
                settingsSelected: settings.selected,
                settingsTotal: settings.total,
            });
        }
    }

    function renderSidebarTree() {
        const box = document.getElementById('role-menu-config-sidebar-tree');
        if (!box) return;
        const parsed = getParsedMenu();
        const disabled = !canWriteMenuConfig() || state.loading;
        const groupsHtml = parsed.groups.map((group, index) => {
            if (!groupMatchesSearch(group)) return '';
            const gkey = groupKey(group, index);
            const counts = countGroupSelection(group);
            const itemsHtml = renderGroupItems(group, disabled);
            if (!itemsHtml) return '';
            const groupLabel = group.label ? escapeMenuText(group.label) : menuConfigT('rbac.menuConfig.ungrouped', '其他');
            return `
                <section class="role-menu-config-group" data-group-key="${escapeMenuAttr(gkey)}">
                    <div class="role-menu-config-group-head">
                        <h4 class="role-menu-config-group-title">${groupLabel}</h4>
                        <span class="role-menu-config-group-count">${counts.selected}/${counts.total}</span>
                    </div>
                    <div class="role-menu-config-group-body">${itemsHtml}</div>
                </section>`;
        }).join('');
        box.innerHTML = groupsHtml || `<div class="empty-state">${menuConfigT('rbac.menuConfig.emptySidebar', '未解析到侧栏菜单')}</div>`;
        bindTreeInputs(box);
        applyIndeterminateInputs(box);
        updateSummary();
    }

    function findSidebarParentChildren(pageId) {
        const parsed = getParsedMenu();
        let children = null;
        parsed.groups.forEach((group) => {
            group.items.forEach((item) => {
                if (item.pageId === pageId && item.children.length > 0) {
                    children = item.children;
                }
            });
        });
        return children;
    }

    function resolveParentToggleChecked(pageId, inputChecked) {
        const children = findSidebarParentChildren(pageId);
        if (!children || !children.length) return inputChecked;
        const checkState = parentCheckState(pageId, children);
        if (checkState === 'checked') return false;
        return true;
    }

    function bindTreeInputs(root) {
        root.querySelectorAll('input[data-kind="sidebar"]').forEach((input) => {
            input.addEventListener('click', function (e) {
                if (input.getAttribute('data-has-children') !== '1') return;
                e.preventDefault();
                const pageId = input.getAttribute('data-page');
                if (!pageId || typeof global.cascadeSidebarSelection !== 'function') return;
                const checked = resolveParentToggleChecked(pageId, input.checked);
                global.cascadeSidebarSelection(pageId, checked, state.selectedSidebar, state.selectedSettings);
                renderSidebarTree();
            });
            input.addEventListener('change', function () {
                if (input.getAttribute('data-has-children') === '1') return;
                const pageId = input.getAttribute('data-page');
                if (!pageId || typeof global.cascadeSidebarSelection !== 'function') return;
                global.cascadeSidebarSelection(pageId, input.checked, state.selectedSidebar, state.selectedSettings);
                renderSidebarTree();
            });
        });
        root.querySelectorAll('input[data-kind="settings"]').forEach((input) => {
            input.addEventListener('change', function () {
                const section = input.getAttribute('data-section');
                const key = 'settings:' + section;
                if (input.checked) {
                    state.selectedSettings.add(key);
                    state.selectedSidebar.add('settings');
                } else {
                    state.selectedSettings.delete(key);
                }
                renderSidebarTree();
            });
        });
        root.querySelectorAll('.role-menu-config-parent-toggle').forEach((btn) => {
            btn.addEventListener('click', function () {
                const pageId = btn.getAttribute('data-parent-page');
                if (!pageId) return;
                if (state.collapsedParents.has(pageId)) state.collapsedParents.delete(pageId);
                else state.collapsedParents.add(pageId);
                renderSidebarTree();
            });
        });
    }

    function initCollapsedParents() {
        state.collapsedParents.clear();
        const parsed = getParsedMenu();
        parsed.groups.forEach((group) => {
            group.items.forEach((item) => {
                if (!item.children.length) return;
                const childSelected = item.children.filter((child) => childIsSelected(child)).length;
                if (childSelected === 0 && !state.selectedSidebar.has(item.pageId)) {
                    state.collapsedParents.add(item.pageId);
                }
            });
        });
    }

    function updateHeader(roleName) {
        const subtitle = document.getElementById('role-menu-config-subtitle');
        const pill = document.getElementById('role-menu-config-role-pill');
        if (subtitle) {
            subtitle.textContent = menuConfigT('rbac.menuConfig.subtitle', '为角色「{{name}}」配置可见菜单。保存后，相关用户重新登录后可查看最新菜单权限。', { name: roleName });
        }
        if (pill) {
            pill.hidden = false;
            pill.textContent = state.roleIsSystem
                ? menuConfigT('rbac.systemBuiltin', '系统内置')
                : menuConfigT('rbac.customRole', '自定义');
            pill.classList.toggle('is-custom', !state.roleIsSystem);
        }
    }

    function setToolbarDisabled(forceDisabled) {
        const disabled = !!forceDisabled || !canWriteMenuConfig() || state.loading;
        ['role-menu-config-restore-btn', 'role-menu-config-search', 'role-menu-config-save-btn'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = disabled;
        });
        document.querySelectorAll('.role-menu-config-summary-actions .btn-secondary, .role-menu-config-toolbar .btn-secondary').forEach((btn) => {
            btn.disabled = disabled;
        });
    }

    async function openRoleMenuConfigModal(roleId, roleName, roleIsSystem) {
        if (!roleId) return;
        state.roleId = roleId;
        state.roleName = roleName || roleId;
        state.roleIsSystem = !!roleIsSystem;
        state.searchQuery = '';
        state.parsed = null;
        state.loading = true;
        const search = document.getElementById('role-menu-config-search');
        if (search) search.value = '';
        updateHeader(state.roleName);
        openAppModal('role-menu-config-modal');
        setToolbarDisabled(true);
        renderSidebarTree();
        try {
            const res = await apiFetch('/api/rbac/roles/' + encodeURIComponent(roleId) + '/ui-grants/menu');
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || menuConfigT('rbac.menuConfig.loadFailed', '加载菜单配置失败'));
            state.selectedSidebar = new Set(Array.isArray(data.sidebar_page) ? data.sidebar_page : []);
            state.selectedSettings = new Set(Array.isArray(data.settings_section) ? data.settings_section : []);
        } catch (error) {
            if (typeof global.showNotification === 'function') {
                global.showNotification(error.message || menuConfigT('rbac.menuConfig.loadFailed', '加载菜单配置失败'), 'error');
            }
        } finally {
            state.loading = false;
            initCollapsedParents();
            setToolbarDisabled(false);
            renderSidebarTree();
        }
    }

    function closeRoleMenuConfigModal() {
        closeAppModal('role-menu-config-modal');
    }

    async function saveRoleMenuConfig() {
        if (!state.roleId || !canWriteMenuConfig()) return;
        const saveBtn = document.getElementById('role-menu-config-save-btn');
        if (saveBtn) saveBtn.disabled = true;
        let sidebar = Array.from(state.selectedSidebar);
        let settings = Array.from(state.selectedSettings);
        if (typeof global.ensureSidebarParentKeys === 'function') {
            sidebar = global.ensureSidebarParentKeys(sidebar);
        }
        if (settings.length) sidebar.push('settings');
        sidebar = Array.from(new Set(sidebar));
        try {
            const res = await apiFetch('/api/rbac/roles/' + encodeURIComponent(state.roleId) + '/ui-grants/menu', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sidebar_page: sidebar,
                    settings_section: settings,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || menuConfigT('rbac.menuConfig.saveFailed', '保存失败'));
            if (typeof global.showNotification === 'function') {
                global.showNotification(menuConfigT('rbac.menuConfig.saveSuccess', '菜单配置已保存，相关用户重新登录后可查看最新菜单权限'), 'success');
            }
            closeAppModal('role-menu-config-modal');
        } catch (error) {
            if (typeof global.showNotification === 'function') {
                global.showNotification(error.message || menuConfigT('rbac.menuConfig.saveFailed', '保存失败'), 'error');
            }
        } finally {
            if (saveBtn) saveBtn.disabled = !canWriteMenuConfig();
        }
    }

    function restoreRoleMenuConfigDefaults() {
        if (!canWriteMenuConfig()) return;
        if (state.roleId === 'admin') {
            state.selectedSidebar = new Set(allSidebarPageIds());
            state.selectedSettings = new Set(allSettingsKeys());
            state.selectedSidebar.add('settings');
        } else {
            state.selectedSidebar = new Set(['dashboard', 'chat']);
            state.selectedSettings = new Set();
        }
        initCollapsedParents();
        renderSidebarTree();
    }

    function selectAllRoleMenuSidebar(checked) {
        if (!canWriteMenuConfig()) return;
        if (checked) {
            state.selectedSidebar = new Set(allSidebarPageIds());
            state.selectedSettings = new Set(allSettingsKeys());
            state.selectedSidebar.add('settings');
        } else {
            state.selectedSidebar = new Set();
            state.selectedSettings = new Set();
        }
        renderSidebarTree();
    }

    function filterRoleMenuConfig(value) {
        state.searchQuery = value || '';
        renderSidebarTree();
    }

    function expandAllRoleMenuGroups(expanded) {
        if (expanded) {
            state.collapsedParents.clear();
        } else {
            state.collapsedParents.clear();
            getParsedMenu().groups.forEach((group) => {
                group.items.forEach((item) => {
                    if (item.children.length) state.collapsedParents.add(item.pageId);
                });
            });
        }
        renderSidebarTree();
    }

    global.openRoleMenuConfigModal = openRoleMenuConfigModal;
    global.closeRoleMenuConfigModal = closeRoleMenuConfigModal;
    global.saveRoleMenuConfig = saveRoleMenuConfig;
    global.restoreRoleMenuConfigDefaults = restoreRoleMenuConfigDefaults;
    global.selectAllRoleMenuSidebar = selectAllRoleMenuSidebar;
    global.filterRoleMenuConfig = filterRoleMenuConfig;
    global.expandAllRoleMenuGroups = expandAllRoleMenuGroups;
})(typeof window !== 'undefined' ? window : globalThis);
