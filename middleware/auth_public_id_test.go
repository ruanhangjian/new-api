package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func openAuthPublicIdTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	model.LOG_DB = db

	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func performAccessTokenAuthRequest(t *testing.T, publicIdHeader string) *httptest.ResponseRecorder {
	t.Helper()

	accessToken := "access-token-public-id-test"
	db := openAuthPublicIdTestDB(t)
	require.NoError(t, db.Create(&model.User{
		Username:    "public-id-user",
		DisplayName: "Public ID User",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		PublicId:    "8394712056",
		AccessToken: &accessToken,
	}).Error)

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("public-id-auth-test"))))
	router.GET("/api/test", UserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"id":      c.GetInt("id"),
		})
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("New-Api-User", publicIdHeader)
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestUserAuthAcceptsPublicIdHeaderForAccessTokenAuth(t *testing.T) {
	recorder := performAccessTokenAuthRequest(t, "8394712056")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"success":true`)
}

func TestUserAuthRejectsMismatchedPublicIdHeaderForAccessTokenAuth(t *testing.T) {
	recorder := performAccessTokenAuthRequest(t, "1111111111")

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"success":false`)
}
