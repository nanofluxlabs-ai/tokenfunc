package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

// 企业组织模型 v2 一次性迁移（TokenFunc 二开，仅 PostgreSQL）：
// 部门树 + 项目 + 员工 → 团队（扁平）/ 成员 / key。生产无真实流量，直接原地改表：
//   ent_departments → ent_teams（子部门名拍平为「父 / 子」，去掉 parent_id）
//   ent_employees   → ent_members（department_id → team_id，新增 user_id / role / provisioned）
//   ent_token_assignments：employee_id → member_id，新增 team_id，删除 project_id
//   ent_usage_daily：维度 department_id / project_id / employee_id → team_id / member_id（旧表保留为 ent_usage_daily_legacy）
//   ent_projects：删除
// 分两步：AutoMigrate 之前做改名（否则 AutoMigrate 会先建出空的新表），之后回填数据。全部幂等。

// migrateEnterpriseOrgV2Before 在 AutoMigrate 之前执行：表与列改名、删列
func migrateEnterpriseOrgV2Before() error {
	if DB == nil || common.MainDatabaseType() != common.DatabaseTypePostgreSQL {
		return nil
	}
	migrator := DB.Migrator()
	if migrator.HasTable("ent_departments") && !migrator.HasTable("ent_teams") {
		common.SysLog("enterprise org v2: renaming ent_departments to ent_teams")
		if err := flattenLegacyDepartments(); err != nil {
			return err
		}
		if err := DB.Exec("ALTER TABLE ent_departments RENAME TO ent_teams").Error; err != nil {
			return err
		}
		for _, stmt := range []string{
			"ALTER TABLE ent_teams DROP COLUMN IF EXISTS parent_id",
			"ALTER INDEX IF EXISTS idx_ent_departments_deleted_at RENAME TO idx_ent_teams_deleted_at",
		} {
			if err := DB.Exec(stmt).Error; err != nil {
				return err
			}
		}
	}
	if migrator.HasTable("ent_employees") && !migrator.HasTable("ent_members") {
		common.SysLog("enterprise org v2: renaming ent_employees to ent_members")
		for _, stmt := range []string{
			"ALTER TABLE ent_employees RENAME TO ent_members",
			"ALTER TABLE ent_members RENAME COLUMN department_id TO team_id",
			"ALTER INDEX IF EXISTS idx_ent_employees_department_id RENAME TO idx_ent_members_team_id",
			"ALTER INDEX IF EXISTS idx_ent_employees_enterprise_id RENAME TO idx_ent_members_enterprise_id",
			"ALTER INDEX IF EXISTS idx_ent_employees_deleted_at RENAME TO idx_ent_members_deleted_at",
		} {
			if err := DB.Exec(stmt).Error; err != nil {
				return err
			}
		}
	}
	if migrator.HasTable("ent_token_assignments") && columnExists("ent_token_assignments", "employee_id") {
		common.SysLog("enterprise org v2: converting ent_token_assignments to team/member")
		for _, stmt := range []string{
			"ALTER TABLE ent_token_assignments RENAME COLUMN employee_id TO member_id",
			"ALTER INDEX IF EXISTS idx_ent_token_assignments_employee_id RENAME TO idx_ent_token_assignments_member_id",
			"ALTER TABLE ent_token_assignments DROP COLUMN IF EXISTS project_id",
		} {
			if err := DB.Exec(stmt).Error; err != nil {
				return err
			}
		}
	}
	if migrator.HasTable("ent_usage_daily") && columnExists("ent_usage_daily", "department_id") {
		common.SysLog("enterprise org v2: moving ent_usage_daily aside as ent_usage_daily_legacy")
		if err := DB.Exec("DROP TABLE IF EXISTS ent_usage_daily_legacy").Error; err != nil {
			return err
		}
		if err := DB.Exec("ALTER TABLE ent_usage_daily RENAME TO ent_usage_daily_legacy").Error; err != nil {
			return err
		}
		// 旧表的索引名会和新表 AutoMigrate 要建的同名，先改掉
		for _, stmt := range []string{
			"ALTER INDEX IF EXISTS idx_ent_usage_enterprise_day RENAME TO idx_ent_usage_legacy_enterprise_day",
			"ALTER INDEX IF EXISTS idx_ent_usage_daily_period_id RENAME TO idx_ent_usage_legacy_period_id",
		} {
			if err := DB.Exec(stmt).Error; err != nil {
				return err
			}
		}
	}
	if migrator.HasTable("ent_projects") {
		common.SysLog("enterprise org v2: dropping ent_projects")
		if err := DB.Exec("DROP TABLE ent_projects").Error; err != nil {
			return err
		}
	}
	return nil
}

// columnExists information_schema 查列（GORM 的 HasColumn 需要模型，这里按表名直接查）
func columnExists(table string, column string) bool {
	var count int64
	err := DB.Raw("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?", table, column).Scan(&count).Error
	return err == nil && count > 0
}

// flattenLegacyDepartments 把部门树拍平：子部门改名为「父 / 子」，逐层上提直到全部 parent_id=0。
// 名字超过 64 字符时截断并加 id 后缀保证唯一。
func flattenLegacyDepartments() error {
	for range 8 {
		result := DB.Exec(`UPDATE ent_departments c
			SET name = CASE WHEN char_length(p.name || ' / ' || c.name) <= 64 THEN p.name || ' / ' || c.name
			                ELSE left(p.name || ' / ' || c.name, 58) || ' #' || c.id::text END,
			    parent_id = 0
			FROM ent_departments p
			WHERE c.parent_id = p.id AND p.parent_id = 0`)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			break
		}
	}
	var remaining int64
	if err := DB.Table("ent_departments").Where("parent_id <> 0").Count(&remaining).Error; err != nil {
		return err
	}
	if remaining > 0 {
		return fmt.Errorf("enterprise org v2: %d departments still have a parent after flattening", remaining)
	}
	return nil
}

// migrateEnterpriseOrgV2After 在 AutoMigrate 之后执行：补默认团队、回填归属、迁移旧聚合表
func migrateEnterpriseOrgV2After() error {
	if DB == nil || common.MainDatabaseType() != common.DatabaseTypePostgreSQL {
		return nil
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var enterpriseIds []int
		if err := tx.Model(&Enterprise{}).Pluck("id", &enterpriseIds).Error; err != nil {
			return err
		}
		defaults := map[int]int{}
		for _, enterpriseId := range enterpriseIds {
			teamId, err := ensureDefaultTeam(tx, enterpriseId)
			if err != nil {
				return err
			}
			defaults[enterpriseId] = teamId
		}
		// 历史团队没有 status 的补 active
		if err := tx.Exec("UPDATE ent_teams SET status = ? WHERE status IS NULL OR status = ''", EnterpriseTeamStatusActive).Error; err != nil {
			return err
		}
		for enterpriseId, teamId := range defaults {
			// 未分配部门的成员 → 默认团队
			if err := tx.Exec("UPDATE ent_members SET team_id = ? WHERE enterprise_id = ? AND team_id = 0", teamId, enterpriseId).Error; err != nil {
				return err
			}
			// 成员的 key 跟随成员团队；无持有人的 key → 默认团队
			if err := tx.Exec(`UPDATE ent_token_assignments a SET team_id = m.team_id
				FROM ent_members m WHERE a.enterprise_id = ? AND a.team_id = 0 AND a.member_id = m.id`, enterpriseId).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE ent_token_assignments SET team_id = ? WHERE enterprise_id = ? AND team_id = 0", teamId, enterpriseId).Error; err != nil {
				return err
			}
		}
		// 主账号在上游密钥页建的、还没有归属行的 key → 默认团队（企业密钥页成为唯一入口后必须都有归属）
		if err := tx.Exec(`INSERT INTO ent_token_assignments (token_id, enterprise_id, team_id, member_id, created_at, updated_at)
			SELECT t.id, e.id, tm.id, 0, t.created_time, t.created_time
			FROM tokens t JOIN enterprises e ON e.user_id = t.user_id
			JOIN ent_teams tm ON tm.enterprise_id = e.id AND tm.is_default = true AND tm.deleted_at IS NULL
			WHERE t.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM ent_token_assignments a WHERE a.token_id = t.id)`).Error; err != nil {
			return err
		}
		if !tx.Migrator().HasTable("ent_usage_daily_legacy") {
			return nil
		}
		if !columnExists("ent_usage_daily_legacy", "department_id") {
			return nil
		}
		common.SysLog("enterprise org v2: migrating ent_usage_daily_legacy into ent_usage_daily")
		// department_id → team_id（0 → 该企业默认团队），employee_id → member_id，project_id 丢弃后按新主键合并
		if err := tx.Exec(`INSERT INTO ent_usage_daily (day, enterprise_id, token_id, model_name, period_id, team_id, member_id,
				request_count, prompt_tokens, completion_tokens, cache_tokens, cache_creation_tokens, quota, updated_at)
			SELECT l.day, l.enterprise_id, l.token_id, l.model_name, l.period_id,
				CASE WHEN l.department_id = 0 THEN tm.id ELSE l.department_id END, l.employee_id,
				SUM(l.request_count), SUM(l.prompt_tokens), SUM(l.completion_tokens), 0, 0, SUM(l.quota), MAX(l.updated_at)
			FROM ent_usage_daily_legacy l
			JOIN ent_teams tm ON tm.enterprise_id = l.enterprise_id AND tm.is_default = true AND tm.deleted_at IS NULL
			GROUP BY l.day, l.enterprise_id, l.token_id, l.model_name, l.period_id,
				CASE WHEN l.department_id = 0 THEN tm.id ELSE l.department_id END, l.employee_id
			ON CONFLICT (day, enterprise_id, token_id, model_name, period_id, team_id, member_id) DO UPDATE SET
				request_count = ent_usage_daily.request_count + EXCLUDED.request_count,
				prompt_tokens = ent_usage_daily.prompt_tokens + EXCLUDED.prompt_tokens,
				completion_tokens = ent_usage_daily.completion_tokens + EXCLUDED.completion_tokens,
				quota = ent_usage_daily.quota + EXCLUDED.quota,
				updated_at = GREATEST(ent_usage_daily.updated_at, EXCLUDED.updated_at)`).Error; err != nil {
			return err
		}
		// 去掉 department_id 列作为"已迁移"标记；旧表保留一个版本供核对，之后手工 DROP
		return tx.Exec("ALTER TABLE ent_usage_daily_legacy DROP COLUMN department_id").Error
	})
}
