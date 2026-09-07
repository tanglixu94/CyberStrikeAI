package security

import (
	"path/filepath"
	"testing"

	"cyberstrike-ai/internal/database"

	"go.uber.org/zap"
)

func openTestDB(t *testing.T) *database.DB {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "ui-grants.db"), zap.NewNop())
	if err != nil {
		t.Fatalf("NewDB: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestResolveUiGrantsForRolesDefaults(t *testing.T) {
	db := openTestDB(t)
	if err := db.BootstrapRBAC("hash", PermissionCatalog); err != nil {
		t.Fatalf("BootstrapRBAC: %v", err)
	}

	adminGrants, err := ResolveUiGrantsForRoles(db, []string{"admin"})
	if err != nil {
		t.Fatalf("ResolveUiGrantsForRoles admin: %v", err)
	}
	if len(adminGrants.SidebarPage) != len(AllSidebarPageKeys) {
		t.Fatalf("admin sidebar count = %d, want %d", len(adminGrants.SidebarPage), len(AllSidebarPageKeys))
	}

	operatorGrants, err := ResolveUiGrantsForRoles(db, []string{"operator"})
	if err != nil {
		t.Fatalf("ResolveUiGrantsForRoles operator: %v", err)
	}
	if len(operatorGrants.SidebarPage) != len(DefaultMinimalSidebarPageKeys) {
		t.Fatalf("operator sidebar = %v", operatorGrants.SidebarPage)
	}
	if len(operatorGrants.SettingsSection) != 0 {
		t.Fatalf("operator settings should be empty, got %v", operatorGrants.SettingsSection)
	}
}

func TestResolveUiGrantsForRolesUnion(t *testing.T) {
	db := openTestDB(t)
	if err := db.BootstrapRBAC("hash", PermissionCatalog); err != nil {
		t.Fatalf("BootstrapRBAC: %v", err)
	}
	if err := db.ReplaceRBACRoleMenuUIGrants("operator", []string{"dashboard", "chat", "projects"}, nil); err != nil {
		t.Fatalf("ReplaceRBACRoleMenuUIGrants: %v", err)
	}

	grants, err := ResolveUiGrantsForRoles(db, []string{"operator"})
	if err != nil {
		t.Fatalf("ResolveUiGrantsForRoles: %v", err)
	}
	set := grants.SidebarSet()
	if !set["projects"] {
		t.Fatalf("expected projects in union grants, got %v", grants.SidebarPage)
	}
}

func TestEnsureSidebarParentKeys(t *testing.T) {
	out := EnsureSidebarParentKeys([]string{"c2-listeners"})
	set := stringSet(out)
	if !set["c2"] || !set["c2-listeners"] {
		t.Fatalf("expected parent c2, got %v", out)
	}
}

func TestSessionUIAllowsPermissionBlocksHiddenPage(t *testing.T) {
	session := Session{
		UiGrants: UiGrants{
			SidebarPage:     []string{"dashboard", "chat"},
			SettingsSection: []string{},
		},
		Permissions: map[string]bool{"project:read": true},
	}
	if SessionUIAllowsPermission(session, "GET", "/api/projects") {
		t.Fatal("expected project API blocked when projects menu hidden")
	}
}

func TestSessionUIAllowsPermissionAllowsMinimalPages(t *testing.T) {
	session := Session{
		UiGrants: UiGrants{
			SidebarPage:     []string{"dashboard", "chat"},
			SettingsSection: []string{},
		},
		Permissions: map[string]bool{"chat:read": true},
	}
	if !SessionUIAllowsPermission(session, "GET", "/api/conversations") {
		t.Fatal("expected chat API allowed for minimal grants")
	}
}
