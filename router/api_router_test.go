package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

func TestChannelListRoutesMatchWithAndWithoutTrailingSlash(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("api-router-test"))))
	SetApiRouter(router)

	tests := []struct {
		name string
		path string
	}{
		{
			name: "without trailing slash",
			path: "/api/channel?tag_mode=false&id_sort=false&p=1&page_size=10",
		},
		{
			name: "with trailing slash",
			path: "/api/channel/?tag_mode=false&id_sort=false&p=1&page_size=10",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, tt.path, nil)

			router.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}
