package security

import (
	"strings"
)

// UiGrantsResourceType values stored in rbac_role_ui_grants.resource_type.
const (
	UiGrantsTypeSidebarPage     = "sidebar_page"
	UiGrantsTypeSettingsSection = "settings_section"
	UiGrantsTypeButton          = "button"
)

// UiGrants is the merged UI visibility profile for one session.
type UiGrants struct {
	SidebarPage     []string
	SettingsSection []string
	Button          []string
}

func (g UiGrants) SidebarSet() map[string]bool {
	return stringSet(g.SidebarPage)
}

func (g UiGrants) SettingsSectionSet() map[string]bool {
	return stringSet(g.SettingsSection)
}

func stringSet(items []string) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			out[item] = true
		}
	}
	return out
}

// AllSidebarPageKeys must stay aligned with web/templates/index.html .main-sidebar-nav.
var AllSidebarPageKeys = []string{
	"dashboard", "chat", "hitl",
	"projects",
	"assets", "asset-overview", "asset-library", "info-collect",
	"vulnerabilities", "tasks", "workflows", "webshell",
	"c2", "c2-listeners", "c2-sessions", "c2-tasks", "c2-payloads", "c2-events", "c2-profiles",
	"chat-files",
	"mcp", "mcp-monitor", "mcp-management",
	"knowledge", "knowledge-retrieval-logs", "knowledge-management",
	"skills", "skills-monitor", "skills-management",
	"agents", "agents-management",
	"roles", "roles-management",
	"platform-rbac", "settings",
}

// AllSettingsSectionKeys must stay aligned with #page-settings .settings-nav data-section.
var AllSettingsSectionKeys = []string{
	"settings:basic",
	"settings:hitl",
	"settings:infocollect",
	"settings:knowledge",
	"settings:c2",
	"settings:robots",
	"settings:terminal",
	"settings:security",
	"settings:audit",
}

// DefaultMinimalSidebarPageKeys for non-admin roles without explicit grants.
var DefaultMinimalSidebarPageKeys = []string{"dashboard", "chat"}

func IsValidSidebarPageKey(key string) bool {
	key = strings.TrimSpace(key)
	for _, item := range AllSidebarPageKeys {
		if item == key {
			return true
		}
	}
	return false
}

func IsValidSettingsSectionKey(key string) bool {
	key = strings.TrimSpace(key)
	for _, item := range AllSettingsSectionKeys {
		if item == key {
			return true
		}
	}
	return false
}

func NormalizeSidebarPageKeys(keys []string) []string {
	seen := make(map[string]bool)
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" || !IsValidSidebarPageKey(key) || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
	}
	return out
}

func NormalizeSettingsSectionKeys(keys []string) []string {
	seen := make(map[string]bool)
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key == "" || !IsValidSettingsSectionKey(key) || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, key)
	}
	return out
}

func DefaultSidebarPagesForRole(roleID string) []string {
	if strings.TrimSpace(roleID) == "admin" {
		return append([]string(nil), AllSidebarPageKeys...)
	}
	return append([]string(nil), DefaultMinimalSidebarPageKeys...)
}

func DefaultSettingsSectionsForRole(roleID string) []string {
	if strings.TrimSpace(roleID) == "admin" {
		return append([]string(nil), AllSettingsSectionKeys...)
	}
	return nil
}

func MergeUiGrantKeySets(sets ...map[string]bool) map[string]bool {
	out := make(map[string]bool)
	for _, set := range sets {
		for key := range set {
			out[key] = true
		}
	}
	return out
}

func MapKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	return out
}

// sidebarPagesForPermission lists sidebar_page keys that unlock a platform permission.
var sidebarPagesForPermission = map[string][]string{
	"dashboard:read":       {"dashboard"},
	"chat:read":            {"chat"},
	"chat:write":           {"chat"},
	"chat:delete":          {"chat"},
	"hitl:read":            {"hitl"},
	"hitl:write":           {"hitl"},
	"project:read":         {"projects"},
	"project:write":        {"projects"},
	"project:delete":       {"projects"},
	"asset:read":           {"assets", "asset-overview", "asset-library"},
	"asset:write":          {"assets", "asset-overview", "asset-library"},
	"asset:delete":         {"assets", "asset-overview", "asset-library"},
	"fofa:execute":         {"info-collect", "assets"},
	"vulnerability:read":   {"vulnerabilities"},
	"vulnerability:write":  {"vulnerabilities"},
	"vulnerability:delete": {"vulnerabilities"},
	"tasks:read":           {"tasks"},
	"tasks:write":          {"tasks"},
	"tasks:delete":         {"tasks"},
	"workflow:read":        {"workflows"},
	"workflow:execute":     {"workflows"},
	"workflow:write":       {"workflows"},
	"workflow:delete":      {"workflows"},
	"webshell:read":        {"webshell"},
	"webshell:write":       {"webshell"},
	"webshell:delete":      {"webshell"},
	"c2:read":              {"c2", "c2-listeners", "c2-sessions", "c2-tasks", "c2-payloads", "c2-events", "c2-profiles"},
	"c2:write":             {"c2", "c2-listeners", "c2-sessions", "c2-tasks", "c2-payloads", "c2-events", "c2-profiles"},
	"c2:delete":            {"c2", "c2-listeners", "c2-sessions", "c2-tasks", "c2-payloads", "c2-events", "c2-profiles"},
	"files:read":           {"chat-files"},
	"files:write":          {"chat-files"},
	"files:delete":         {"chat-files"},
	"mcp:read":             {"mcp", "mcp-monitor", "mcp-management"},
	"mcp:write":            {"mcp", "mcp-monitor", "mcp-management"},
	"mcp:execute":          {"mcp", "mcp-monitor", "mcp-management"},
	"mcp:external:execute": {"mcp", "mcp-monitor", "mcp-management"},
	"monitor:read":         {"mcp-monitor"},
	"monitor:write":        {"mcp-monitor"},
	"monitor:delete":       {"mcp-monitor"},
	"knowledge:read":       {"knowledge", "knowledge-retrieval-logs", "knowledge-management"},
	"knowledge:write":      {"knowledge", "knowledge-retrieval-logs", "knowledge-management"},
	"knowledge:delete":     {"knowledge", "knowledge-retrieval-logs", "knowledge-management"},
	"skills:read":          {"skills", "skills-monitor", "skills-management"},
	"skills:write":         {"skills", "skills-monitor", "skills-management"},
	"skills:delete":        {"skills", "skills-monitor", "skills-management"},
	"agents:read":          {"agents", "agents-management"},
	"agents:write":         {"agents", "agents-management"},
	"agents:delete":        {"agents", "agents-management"},
	"roles:read":           {"roles", "roles-management"},
	"roles:write":          {"roles", "roles-management"},
	"roles:delete":         {"roles", "roles-management"},
	"rbac:read":            {"platform-rbac"},
	"rbac:write":           {"platform-rbac"},
	"config:read":          {"settings"},
	"config:write":         {"settings"},
	"terminal:execute":     {"settings"},
	"audit:read":           {"settings"},
	"audit:delete":         {"settings"},
	"robot:read":           {"settings"},
	"robot:write":          {"settings"},
	"agent:execute":        {"chat"},
	"agent:local-execute":  {"chat"},
	"attackchain:read":     {"projects"},
	"attackchain:write":    {"projects"},
	"notification:read":    {"dashboard", "chat"},
	"notification:write":   {"dashboard", "chat"},
	"openapi:read":         {"dashboard", "chat", "settings"},
	"auth:self":            {"dashboard", "chat", "settings", "platform-rbac"},
}

func PermissionAllowedBySidebarUI(permission string, sidebar map[string]bool) bool {
	permission = strings.TrimSpace(permission)
	if permission == "" {
		return true
	}
	keys := sidebarPagesForPermission[permission]
	if len(keys) == 0 {
		return true
	}
	for _, key := range keys {
		if sidebar[key] {
			return true
		}
	}
	return false
}

func settingsSectionForConfigAPI(path string) string {
	path = strings.TrimPrefix(strings.TrimSpace(path), "/api")
	switch {
	case strings.Contains(path, "/hitl"):
		return "settings:hitl"
	case strings.Contains(path, "/robot"):
		return "settings:robots"
	case strings.Contains(path, "/terminal"):
		return "settings:terminal"
	case strings.Contains(path, "/audit"):
		return "settings:audit"
	case strings.Contains(path, "/knowledge"):
		return "settings:knowledge"
	case strings.Contains(path, "/c2"):
		return "settings:c2"
	case strings.Contains(path, "/assets"), strings.Contains(path, "/fofa"), strings.Contains(path, "/info-collect"):
		return "settings:infocollect"
	case strings.Contains(path, "/security"):
		return "settings:security"
	default:
		return "settings:basic"
	}
}

func PermissionAllowedBySettingsUI(permission string, method, apiPath string, sidebar map[string]bool, sections map[string]bool) bool {
	permission = strings.TrimSpace(permission)
	if !strings.HasPrefix(permission, "config:") && permission != "terminal:execute" && permission != "audit:read" && permission != "audit:delete" && !strings.HasPrefix(permission, "robot:") {
		return true
	}
	if !sidebar["settings"] {
		return false
	}
	section := settingsSectionForConfigAPI(apiPath)
	return sections[section]
}

func SessionUIAllowsPermission(session Session, method, apiPath string) bool {
	if len(session.UiGrants.SidebarPage) == 0 && len(session.UiGrants.SettingsSection) == 0 {
		return true
	}
	sidebar := session.UiGrants.SidebarSet()
	sections := session.UiGrants.SettingsSectionSet()
	permission := permissionForRequest(method, apiPath)
	if permission == "" {
		return true
	}
	if alts := permissionAlternativesForRequest(method, strings.TrimPrefix(apiPath, "/api")); len(alts) > 0 {
		for _, alt := range alts {
			if permissionUIAllowed(alt, method, apiPath, sidebar, sections) {
				return true
			}
		}
		return false
	}
	return permissionUIAllowed(permission, method, apiPath, sidebar, sections)
}

func permissionUIAllowed(permission, method, apiPath string, sidebar, sections map[string]bool) bool {
	if !PermissionAllowedBySidebarUI(permission, sidebar) {
		return false
	}
	return PermissionAllowedBySettingsUI(permission, method, apiPath, sidebar, sections)
}
