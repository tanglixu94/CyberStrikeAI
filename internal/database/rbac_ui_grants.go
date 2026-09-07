package database

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// RBACRoleUIGrant is one allow/deny row for UI resources (menu, button, ...).
type RBACRoleUIGrant struct {
	ID           string
	RoleID       string
	ResourceType string
	ResourceKey  string
	Effect       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (db *DB) ListRBACRoleUIGrants(roleID, resourceType string) ([]RBACRoleUIGrant, error) {
	roleID = strings.TrimSpace(roleID)
	resourceType = strings.TrimSpace(resourceType)
	if roleID == "" {
		return nil, fmt.Errorf("role id is required")
	}
	query := `SELECT id, role_id, resource_type, resource_key, effect, created_at, updated_at FROM rbac_role_ui_grants WHERE role_id = ?`
	args := []interface{}{roleID}
	if resourceType != "" {
		query += ` AND resource_type = ?`
		args = append(args, resourceType)
	}
	query += ` ORDER BY resource_type ASC, resource_key ASC`
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RBACRoleUIGrant
	for rows.Next() {
		var grant RBACRoleUIGrant
		var createdAt, updatedAt string
		if err := rows.Scan(&grant.ID, &grant.RoleID, &grant.ResourceType, &grant.ResourceKey, &grant.Effect, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		grant.CreatedAt = parseDBTime(createdAt)
		grant.UpdatedAt = parseDBTime(updatedAt)
		out = append(out, grant)
	}
	return out, rows.Err()
}

func (db *DB) RoleHasExplicitUIGrants(roleID string, resourceTypes ...string) (bool, error) {
	roleID = strings.TrimSpace(roleID)
	if roleID == "" {
		return false, nil
	}
	query := `SELECT COUNT(*) FROM rbac_role_ui_grants WHERE role_id = ? AND effect = 'allow'`
	args := []interface{}{roleID}
	if len(resourceTypes) > 0 {
		placeholders := make([]string, 0, len(resourceTypes))
		for _, t := range resourceTypes {
			t = strings.TrimSpace(t)
			if t == "" {
				continue
			}
			placeholders = append(placeholders, "?")
			args = append(args, t)
		}
		if len(placeholders) > 0 {
			query += ` AND resource_type IN (` + strings.Join(placeholders, ",") + `)`
		}
	}
	var count int
	if err := db.QueryRow(query, args...).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (db *DB) ReplaceRBACRoleMenuUIGrants(roleID string, sidebarPages, settingsSections []string) error {
	roleID = strings.TrimSpace(roleID)
	if roleID == "" {
		return fmt.Errorf("role id is required")
	}
	now := time.Now()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.Exec(`DELETE FROM rbac_role_ui_grants WHERE role_id = ? AND resource_type IN (?, ?)`, roleID, "sidebar_page", "settings_section"); err != nil {
		return err
	}
	insert := `INSERT INTO rbac_role_ui_grants (id, role_id, resource_type, resource_key, effect, created_at, updated_at) VALUES (?, ?, ?, ?, 'allow', ?, ?)`
	for _, key := range sidebarPages {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, err := tx.Exec(insert, uuid.NewString(), roleID, "sidebar_page", key, now, now); err != nil {
			return err
		}
	}
	for _, key := range settingsSections {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, err := tx.Exec(insert, uuid.NewString(), roleID, "settings_section", key, now, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}
