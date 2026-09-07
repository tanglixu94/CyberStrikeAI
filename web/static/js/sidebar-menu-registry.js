/**
 * Parse main sidebar and settings nav from DOM (single source of truth).
 */
(function (global) {
    'use strict';

    const SIDEBAR_PARENT_CHILDREN = {
        assets: ['asset-overview', 'asset-library', 'info-collect'],
        c2: ['c2-listeners', 'c2-sessions', 'c2-tasks', 'c2-payloads', 'c2-events', 'c2-profiles'],
        mcp: ['mcp-monitor', 'mcp-management'],
        knowledge: ['knowledge-retrieval-logs', 'knowledge-management'],
        skills: ['skills-monitor', 'skills-management'],
        agents: ['agents-management'],
        roles: ['roles-management'],
    };

    function readPageLabel(el) {
        if (!el) return '';
        const textEl = el.querySelector('.nav-item-content span, .nav-submenu-item span, span');
        const text = textEl ? textEl.textContent : el.textContent;
        return String(text || '').trim();
    }

    function parseSidebarMenuFromDOM(root) {
        const doc = root instanceof Document ? root : (root && root.ownerDocument) || document;
        const nav = (root instanceof Element ? root : doc).querySelector('.main-sidebar-nav');
        if (!nav) {
            return { groups: [], sidebarPages: [], settingsSections: [] };
        }

        const groups = [];
        let currentGroup = null;

        Array.from(nav.children).forEach((child) => {
            if (child.classList.contains('nav-section-label')) {
                const label = String(child.textContent || '').trim();
                currentGroup = { id: label, label, items: [] };
                groups.push(currentGroup);
                return;
            }
            if (!child.classList.contains('nav-item')) {
                return;
            }
            const pageId = child.getAttribute('data-page');
            if (!pageId) return;

            const item = {
                type: 'page',
                pageId,
                label: readPageLabel(child),
                element: child,
                children: [],
            };
            child.querySelectorAll('.nav-submenu-item[data-page]').forEach((sub) => {
                const childId = sub.getAttribute('data-page');
                if (!childId) return;
                item.children.push({
                    type: 'page',
                    pageId: childId,
                    label: readPageLabel(sub),
                    parentId: pageId,
                    element: sub,
                });
            });
            if (currentGroup) {
                currentGroup.items.push(item);
            } else {
                groups.push({ id: '_ungrouped', label: '', items: [item] });
                currentGroup = groups[groups.length - 1];
            }
        });

        const sidebarPages = [];
        groups.forEach((group) => {
            group.items.forEach((item) => {
                sidebarPages.push(item.pageId);
                item.children.forEach((child) => sidebarPages.push(child.pageId));
            });
        });

        const settingsRoot = doc.querySelector('#page-settings .settings-nav');
        const settingsSections = [];
        if (settingsRoot) {
            settingsRoot.querySelectorAll('.settings-nav-item[data-section]').forEach((el) => {
                const section = el.getAttribute('data-section');
                if (!section) return;
                settingsSections.push({
                    section,
                    key: 'settings:' + section,
                    label: String(el.textContent || '').trim(),
                    element: el,
                });
            });
        }

        groups.forEach((group) => {
            group.items.forEach((item) => {
                if (item.pageId !== 'settings' || !settingsSections.length) return;
                settingsSections.forEach((section) => {
                    item.children.push({
                        type: 'settings_section',
                        section: section.section,
                        key: section.key,
                        pageId: section.key,
                        label: section.label,
                        parentId: 'settings',
                    });
                });
            });
        });

        return { groups, sidebarPages, settingsSections, parentChildren: SIDEBAR_PARENT_CHILDREN };
    }

    function getSidebarParentMap() {
        const map = {};
        Object.keys(SIDEBAR_PARENT_CHILDREN).forEach((parent) => {
            SIDEBAR_PARENT_CHILDREN[parent].forEach((child) => {
                map[child] = parent;
            });
        });
        return map;
    }

    function ensureSidebarParentKeys(selected) {
        const set = new Set(Array.isArray(selected) ? selected : []);
        const parentMap = getSidebarParentMap();
        set.forEach((key) => {
            const parent = parentMap[key];
            if (parent) set.add(parent);
        });
        return Array.from(set);
    }

    function cascadeSidebarSelection(pageId, checked, selectedSet, selectedSettingsSet) {
        const parentMap = getSidebarParentMap();
        const childrenMap = SIDEBAR_PARENT_CHILDREN;
        pageId = String(pageId || '').trim();

        if (pageId === 'settings' && selectedSettingsSet) {
            if (!checked) {
                selectedSettingsSet.clear();
            } else if (typeof global.parseSidebarMenuFromDOM === 'function') {
                const parsed = global.parseSidebarMenuFromDOM(document);
                (parsed.settingsSections || []).forEach((section) => {
                    selectedSettingsSet.add(section.key);
                });
            }
        }

        if (checked) {
            selectedSet.add(pageId);
            let parent = parentMap[pageId];
            while (parent) {
                selectedSet.add(parent);
                parent = parentMap[parent];
            }
            const children = childrenMap[pageId];
            if (children) {
                children.forEach((child) => selectedSet.add(child));
            }
        } else {
            selectedSet.delete(pageId);
            const children = childrenMap[pageId];
            if (children) {
                children.forEach((child) => selectedSet.delete(child));
            }
        }
    }

    global.parseSidebarMenuFromDOM = parseSidebarMenuFromDOM;
    global.ensureSidebarParentKeys = ensureSidebarParentKeys;
    global.cascadeSidebarSelection = cascadeSidebarSelection;
    global.SIDEBAR_PARENT_CHILDREN = SIDEBAR_PARENT_CHILDREN;
})(typeof window !== 'undefined' ? window : globalThis);
