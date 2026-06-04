package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func openUserPublicIdTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	DB = db
	LOG_DB = db

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func TestUserInsertAssignsUniquePublicId(t *testing.T) {
	db := openUserPublicIdTestDB(t)
	require.NoError(t, db.AutoMigrate(&User{}))

	first := &User{Username: "alice", Password: "password123", DisplayName: "Alice"}
	second := &User{Username: "bob", Password: "password123", DisplayName: "Bob"}

	require.NoError(t, first.Insert(0))
	require.NoError(t, second.Insert(0))

	require.Regexp(t, `^[1-9]\d{9}$`, first.PublicId)
	require.Regexp(t, `^[1-9]\d{9}$`, second.PublicId)
	require.NotEqual(t, first.PublicId, second.PublicId)
}

func TestUserBeforeCreateAssignsPublicId(t *testing.T) {
	db := openUserPublicIdTestDB(t)
	require.NoError(t, db.AutoMigrate(&User{}))

	user := &User{Username: "direct-create", Password: "hashed", DisplayName: "Direct"}

	require.NoError(t, db.Create(user).Error)

	require.Regexp(t, `^[1-9]\d{9}$`, user.PublicId)
}

func TestEnsureAllUserPublicIdsBackfillsExistingUsers(t *testing.T) {
	db := openUserPublicIdTestDB(t)
	require.NoError(t, db.AutoMigrate(&User{}))
	require.NoError(t, db.Exec(
		"INSERT INTO users (username, password, display_name, role, status) VALUES (?, ?, ?, ?, ?)",
		"legacy",
		"hashed",
		"Legacy",
		common.RoleCommonUser,
		common.UserStatusEnabled,
	).Error)

	require.NoError(t, EnsureAllUserPublicIds())

	var user User
	require.NoError(t, db.First(&user, "username = ?", "legacy").Error)
	require.Regexp(t, `^[1-9]\d{9}$`, user.PublicId)
}
