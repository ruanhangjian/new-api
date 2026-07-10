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

func TestInitOptionMapIncludesEnterpriseCdkContactMessage(t *testing.T) {
	originalDB := DB
	originalMap := common.OptionMap
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	DB = db
	t.Cleanup(func() {
		DB = originalDB
		common.OptionMap = originalMap
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	InitOptionMap()

	require.Equal(
		t,
		"余额不足。如需充值，请联系管理员线下收款后授信。",
		common.OptionMap["EnterpriseCdkContactMessage"],
	)
}
