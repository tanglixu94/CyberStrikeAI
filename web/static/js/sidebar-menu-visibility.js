/**
 * Runtime sidebar/settings visibility from session uiGrants.
 */
(function (global) {
    'use strict';

    let authUiGrants = {
        sidebar_page: [],
        settings_section: [],
        button: [],
    };
    let menuVisibilityLoaded = false;

    function normalizeGrantList(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }

    function setAuthUiGrants(grants) {
        const next = grants && typeof grants === 'object' ? grants : {};
        authUiGrants = {
            sidebar_page: normalizeGrantList(next.sidebar_page),
            settings_section: normalizeGrantList(next.settings_section),
            button: normalizeGrantList(next.button),
        };
        menuVisibilityLoaded = authUiGrants.sidebar_page.length > 0 || authUiGrants.settings_section.length > 0;
    }

    function getAuthUiGrants() {
        return {
            sidebar_page: authUiGrants.sidebar_page.slice(),
            settings_section: authUiGrants.settings_section.slice(),
            button: authUiGrants.button.slice(),
        };
    }

    function isRoleMenuVisibilityEnabled() {
        return menuVisibilityLoaded;
    }

    function sidebarAllowSet() {
        return new Set(authUiGrants.sidebar_page);
    }

    function settingsAllowSet() {
        return new Set(authUiGrants.settings_section);
    }

    function isSidebarPageAllowed(pageId) {
        const key = String(pageId || '').trim();
        if (!key) return false;
        if (!menuVisibilityLoaded) return true;
        return sidebarAllowSet().has(key);
    }

    function isSettingsSectionAllowed(section) {
        const key = 'settings:' + String(section || '').trim();
        if (!menuVisibilityLoaded) return true;
        if (!sidebarAllowSet().has('settings')) return false;
        return settingsAllowSet().has(key);
    }

    function isUiResourceAllowed(type, key) {
        if (type === 'sidebar_page') return isSidebarPageAllowed(key);
        if (type === 'settings_section') {
            const normalized = String(key || '').startsWith('settings:') ? key : ('settings:' + key);
            return settingsAllowSet().has(normalized) && sidebarAllowSet().has('settings');
        }
        return true;
    }

    function menuT(key, fallback) {
        if (typeof global.t === 'function') {
            const translated = global.t(key);
            if (translated && translated !== key) return translated;
        }
        return fallback;
    }

    function notifyMenuDenied() {
        const msg = menuT('rbac.menuAccessDenied', '无权访问该菜单');
        if (typeof global.notifyApiError === 'function') {
            global.notifyApiError(msg);
        } else if (typeof global.showNotification === 'function') {
            global.showNotification(msg, 'error');
        }
    }

    function updateNavSectionLabels() {
        const nav = document.querySelector('.main-sidebar-nav');
        if (!nav) return;
        const allowed = sidebarAllowSet();
        let pendingLabel = null;
        Array.from(nav.children).forEach((child) => {
            if (child.classList.contains('nav-section-label')) {
                pendingLabel = child;
                child.style.display = 'none';
                return;
            }
            if (!child.classList.contains('nav-item')) return;
            const pageId = child.getAttribute('data-page');
            const submenuItems = child.querySelectorAll('.nav-submenu-item[data-page]');
            let visible = pageId && allowed.has(pageId) && !child.hidden;
            if (!visible && submenuItems.length) {
                visible = Array.from(submenuItems).some((sub) => {
                    const subId = sub.getAttribute('data-page');
                    return subId && allowed.has(subId) && !sub.hidden;
                });
            }
            if (visible && pendingLabel) {
                pendingLabel.style.display = '';
                pendingLabel = null;
            }
        });
    }

    function applySidebarMenuVisibility(root) {
        if (!menuVisibilityLoaded) return;
        const allowed = sidebarAllowSet();
        const settingsAllowed = settingsAllowSet();
        const scope = root instanceof Element ? root : document;

        scope.querySelectorAll('.main-sidebar-nav [data-page]').forEach((el) => {
            const pageId = el.getAttribute('data-page');
            if (!pageId) return;
            if (!allowed.has(pageId)) {
                el.hidden = true;
                el.style.display = 'none';
                return;
            }
            if (typeof global.hasPermission === 'function' && global.PAGE_PERMISSION_MAP) {
                const perm = global.PAGE_PERMISSION_MAP[pageId];
                const rbacOk = !perm || global.hasPermission(perm);
                el.hidden = !rbacOk;
                el.style.display = rbacOk ? '' : 'none';
            } else {
                el.hidden = false;
                el.style.display = '';
            }
        });

        const settingsNav = document.querySelector('#page-settings .settings-nav');
        if (settingsNav) {
            const settingsPageAllowed = allowed.has('settings');
            settingsNav.querySelectorAll('.settings-nav-item[data-section]').forEach((el) => {
                const section = el.getAttribute('data-section');
                const key = 'settings:' + section;
                const menuOk = settingsPageAllowed && settingsAllowed.has(key);
                const configOk = typeof global.hasPermission === 'function' ? global.hasPermission('config:read') : true;
                const show = menuOk && configOk;
                el.hidden = !show;
                el.style.display = show ? '' : 'none';
            });
        }

        if (scope === document || scope.matches('.main-sidebar-nav') || scope.querySelector('.main-sidebar-nav')) {
            updateNavSectionLabels();
        }
    }

    function pickFallbackPage() {
        const preferred = ['dashboard', 'chat'];
        for (let i = 0; i < preferred.length; i++) {
            if (isSidebarPageAllowed(preferred[i])) return preferred[i];
        }
        const allowed = authUiGrants.sidebar_page;
        return allowed.length ? allowed[0] : 'dashboard';
    }

    function installMenuRouteGuards() {
        if (typeof global.switchPage === 'function' && !global.__menuGuardSwitchPage) {
            const original = global.switchPage;
            global.switchPage = function guardedSwitchPage(pageId) {
                if (!isSidebarPageAllowed(pageId)) {
                    notifyMenuDenied();
                    const fallback = pickFallbackPage();
                    if (fallback && fallback !== pageId) {
                        return original(fallback);
                    }
                    return;
                }
                return original(pageId);
            };
            global.__menuGuardSwitchPage = true;
        }
        if (typeof global.switchSettingsSection === 'function' && !global.__menuGuardSettingsSection) {
            const originalSettings = global.switchSettingsSection;
            global.switchSettingsSection = function guardedSwitchSettingsSection(section) {
                if (section !== 'rbac' && !isSettingsSectionAllowed(section)) {
                    notifyMenuDenied();
                    return;
                }
                return originalSettings(section);
            };
            global.__menuGuardSettingsSection = true;
        }
    }

    global.setAuthUiGrants = setAuthUiGrants;
    global.getAuthUiGrants = getAuthUiGrants;
    global.isRoleMenuVisibilityEnabled = isRoleMenuVisibilityEnabled;
    global.isSidebarPageAllowed = isSidebarPageAllowed;
    global.isSettingsSectionAllowed = isSettingsSectionAllowed;
    global.isUiResourceAllowed = isUiResourceAllowed;
    global.applySidebarMenuVisibility = applySidebarMenuVisibility;
    global.installMenuRouteGuards = installMenuRouteGuards;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installMenuRouteGuards);
    } else {
        installMenuRouteGuards();
    }
})(typeof window !== 'undefined' ? window : globalThis);
