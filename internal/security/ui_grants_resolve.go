package security

import (
	"strings"

	"cyberstrike-ai/internal/database"
)

var sidebarChildParent = map[string]string{
	"asset-overview":           "assets",
	"asset-library":            "assets",
	"info-collect":             "assets",
	"c2-listeners":             "c2",
	"c2-sessions":              "c2",
	"c2-tasks":                 "c2",
	"c2-payloads":              "c2",
	"c2-events":                "c2",
	"c2-profiles":              "c2",
	"mcp-monitor":              "mcp",
	"mcp-management":           "mcp",
	"knowledge-retrieval-logs": "knowledge",
	"knowledge-management":     "knowledge",
	"skills-monitor":           "skills",
	"skills-management":        "skills",
	"agents-management":        "agents",
	"roles-management":         "roles",
}

func sortedSidebarKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for _, key := range AllSidebarPageKeys {
		if set[key] {
			out = append(out, key)
		}
	}
	return out
}

func sortedSettingsKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for _, key := range AllSettingsSectionKeys {
		if set[key] {
			out = append(out, key)
		}
	}
	return out
}

func effectiveSidebarPages(db *database.DB, roleID string) (map[string]bool, error) {
	roleID = strings.TrimSpace(roleID)
	hasExplicit, err := db.RoleHasExplicitUIGrants(roleID, UiGrantsTypeSidebarPage)
	if err != nil {
		return nil, err
	}
	if roleID == "admin" && !hasExplicit {
		return stringSet(AllSidebarPageKeys), nil
	}
	if !hasExplicit {
		return stringSet(DefaultMinimalSidebarPageKeys), nil
	}
	grants, err := db.ListRBACRoleUIGrants(roleID, UiGrantsTypeSidebarPage)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool)
	for _, grant := range grants {
		if grant.Effect == "allow" && IsValidSidebarPageKey(grant.ResourceKey) {
			set[grant.ResourceKey] = true
		}
	}
	return set, nil
}

func effectiveSettingsSections(db *database.DB, roleID string) (map[string]bool, error) {
	roleID = strings.TrimSpace(roleID)
	hasExplicit, err := db.RoleHasExplicitUIGrants(roleID, UiGrantsTypeSettingsSection)
	if err != nil {
		return nil, err
	}
	if roleID == "admin" && !hasExplicit {
		return stringSet(AllSettingsSectionKeys), nil
	}
	if !hasExplicit {
		return make(map[string]bool), nil
	}
	grants, err := db.ListRBACRoleUIGrants(roleID, UiGrantsTypeSettingsSection)
	if err != nil {
		return nil, err
	}
	set := make(map[string]bool)
	for _, grant := range grants {
		if grant.Effect == "allow" && IsValidSettingsSectionKey(grant.ResourceKey) {
			set[grant.ResourceKey] = true
		}
	}
	return set, nil
}

// ResolveUiGrantsForRoles merges menu grants across all assigned roles (union).
func ResolveUiGrantsForRoles(db *database.DB, roleIDs []string) (UiGrants, error) {
	if db == nil {
		return UiGrants{Button: []string{}}, nil
	}
	if len(roleIDs) == 0 {
		return UiGrants{
			SidebarPage:     append([]string(nil), DefaultMinimalSidebarPageKeys...),
			SettingsSection: nil,
			Button:          []string{},
		}, nil
	}
	sidebarMerged := make(map[string]bool)
	settingsMerged := make(map[string]bool)
	for _, roleID := range roleIDs {
		roleID = strings.TrimSpace(roleID)
		if roleID == "" {
			continue
		}
		sidebar, err := effectiveSidebarPages(db, roleID)
		if err != nil {
			return UiGrants{}, err
		}
		settings, err := effectiveSettingsSections(db, roleID)
		if err != nil {
			return UiGrants{}, err
		}
		for key := range sidebar {
			sidebarMerged[key] = true
		}
		for key := range settings {
			settingsMerged[key] = true
		}
	}
	return UiGrants{
		SidebarPage:     sortedSidebarKeys(sidebarMerged),
		SettingsSection: sortedSettingsKeys(settingsMerged),
		Button:          []string{},
	}, nil
}

// EffectiveMenuGrantsForRole returns resolved allowlists for one role (for config API).
func EffectiveMenuGrantsForRole(db *database.DB, roleID string) ([]string, []string, error) {
	sidebar, err := effectiveSidebarPages(db, roleID)
	if err != nil {
		return nil, nil, err
	}
	settings, err := effectiveSettingsSections(db, roleID)
	if err != nil {
		return nil, nil, err
	}
	return sortedSidebarKeys(sidebar), sortedSettingsKeys(settings), nil
}

// EnsureSidebarParentKeys adds parent sidebar_page keys when children are allowed.
func EnsureSidebarParentKeys(keys []string) []string {
	set := stringSet(NormalizeSidebarPageKeys(keys))
	for child, parent := range sidebarChildParent {
		if set[child] {
			set[parent] = true
		}
	}
	return sortedSidebarKeys(set)
}

// EnsureSettingsSidebarAccess ensures settings parent page is allowed when any section is.
func EnsureSettingsSidebarAccess(sidebarPages, settingsSections []string) []string {
	if len(settingsSections) == 0 {
		return sidebarPages
	}
	set := stringSet(NormalizeSidebarPageKeys(sidebarPages))
	set["settings"] = true
	return sortedSidebarKeys(set)
}

func UiGrantsFromDatabase(g database.RBACUIGrants) UiGrants {
	return UiGrants{
		SidebarPage:     append([]string(nil), g.SidebarPage...),
		SettingsSection: append([]string(nil), g.SettingsSection...),
		Button:          append([]string(nil), g.Button...),
	}
}

func UiGrantsToDatabase(g UiGrants) database.RBACUIGrants {
	return database.RBACUIGrants{
		SidebarPage:     append([]string(nil), g.SidebarPage...),
		SettingsSection: append([]string(nil), g.SettingsSection...),
		Button:          append([]string(nil), g.Button...),
	}
}
