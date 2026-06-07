package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

func TestQuerySub2APIAccountBalanceUsesRemainingAndBearerToken(t *testing.T) {
	const apiKey = "sk-test"
	var gotAuth string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/usage" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"remaining":35,"balance":12,"unit":"USD"}`)
	}))
	defer server.Close()

	account := &model.ChannelBalanceAccount{
		Key:     apiKey,
		BaseURL: server.URL,
	}

	balance, unit, err := querySub2APIAccountBalance(account)
	if err != nil {
		t.Fatalf("querySub2APIAccountBalance returned error: %v", err)
	}
	if gotAuth != "Bearer "+apiKey {
		t.Fatalf("Authorization header = %q, want Bearer token", gotAuth)
	}
	if balance != 35 {
		t.Fatalf("balance = %v, want 35", balance)
	}
	if unit != "USD" {
		t.Fatalf("unit = %q, want USD", unit)
	}
}

func TestQuerySub2APIAccountBalanceFallsBackToBalance(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"balance":20,"unit":"USD"}`)
	}))
	defer server.Close()

	account := &model.ChannelBalanceAccount{
		Key:     "sk-test",
		BaseURL: server.URL,
	}

	balance, unit, err := querySub2APIAccountBalance(account)
	if err != nil {
		t.Fatalf("querySub2APIAccountBalance returned error: %v", err)
	}
	if balance != 20 {
		t.Fatalf("balance = %v, want 20", balance)
	}
	if unit != "USD" {
		t.Fatalf("unit = %q, want USD", unit)
	}
}

func TestQueryNewAPIAccountBalanceUsesUserSelfQuota(t *testing.T) {
	const accessToken = "system-access-token"
	const upstreamUserID = 7
	var gotAuth string
	var gotUserID string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/status":
			_, _ = fmt.Fprint(w, `{"success":true,"data":{"quota_per_unit":500000}}`)
		case "/api/user/self":
			gotAuth = r.Header.Get("Authorization")
			gotUserID = r.Header.Get("New-Api-User")
			_, _ = fmt.Fprint(w, `{"success":true,"data":{"quota":1250000,"used_quota":250000}}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	account := &model.ChannelBalanceAccount{
		Key:            accessToken,
		BaseURL:        server.URL,
		UpstreamUserID: upstreamUserID,
	}

	balance, unit, err := queryNewAPIAccountBalance(account)
	if err != nil {
		t.Fatalf("queryNewAPIAccountBalance returned error: %v", err)
	}
	if gotAuth != "Bearer "+accessToken {
		t.Fatalf("Authorization header = %q, want Bearer token", gotAuth)
	}
	if gotUserID != strconv.Itoa(upstreamUserID) {
		t.Fatalf("New-Api-User header = %q, want %d", gotUserID, upstreamUserID)
	}
	if balance != 2.5 {
		t.Fatalf("balance = %v, want 2.5", balance)
	}
	if unit != "USD" {
		t.Fatalf("unit = %q, want USD", unit)
	}
}

func TestGetChannelBalanceAutoRefreshMinutes(t *testing.T) {
	originalMap := common.OptionMap
	common.OptionMap = map[string]string{}
	defer func() {
		common.OptionMap = originalMap
	}()

	if got := getChannelBalanceAutoRefreshMinutes(); got != 0 {
		t.Fatalf("default auto refresh minutes = %d, want 0", got)
	}

	common.OptionMap[channelBalanceAutoRefreshMinutesOptionKey] = "15"
	if got := getChannelBalanceAutoRefreshMinutes(); got != 15 {
		t.Fatalf("auto refresh minutes = %d, want 15", got)
	}

	common.OptionMap[channelBalanceAutoRefreshMinutesOptionKey] = "-1"
	if got := getChannelBalanceAutoRefreshMinutes(); got != 0 {
		t.Fatalf("negative auto refresh minutes = %d, want 0", got)
	}

	common.OptionMap[channelBalanceAutoRefreshMinutesOptionKey] = "abc"
	if got := getChannelBalanceAutoRefreshMinutes(); got != 0 {
		t.Fatalf("invalid auto refresh minutes = %d, want 0", got)
	}
}

func TestShouldRefreshChannelBalanceAccounts(t *testing.T) {
	lastRefreshTime := time.Date(2026, 6, 7, 12, 0, 0, 0, time.UTC)

	if shouldRefreshChannelBalanceAccounts(lastRefreshTime.Add(time.Minute-time.Nanosecond), lastRefreshTime, 1) {
		t.Fatal("should not refresh before the configured interval has elapsed")
	}
	if !shouldRefreshChannelBalanceAccounts(lastRefreshTime.Add(time.Minute), lastRefreshTime, 1) {
		t.Fatal("should refresh exactly when the configured interval has elapsed")
	}
	if shouldRefreshChannelBalanceAccounts(lastRefreshTime.Add(10*time.Minute), lastRefreshTime, 0) {
		t.Fatal("should not refresh when automatic refresh is disabled")
	}
}

func TestBuildChannelBalanceAlertContentIncludesBaseURLAndRechargeURL(t *testing.T) {
	account := &model.ChannelBalanceAccount{
		Id:          3,
		Name:        "A",
		BaseURL:     "https://upstream.example.com",
		RechargeURL: "https://pay.example.com/topup",
		Threshold:   30,
		Unit:        "USD",
	}

	content := buildChannelBalanceAlertContent(account, 20)

	if !strings.Contains(content, "上游余额账户 #3（A）当前余额 20.0000 USD") {
		t.Fatalf("content missing balance summary: %s", content)
	}
	if !strings.Contains(content, "Base URL：https://upstream.example.com") {
		t.Fatalf("content missing base url: %s", content)
	}
	if !strings.Contains(content, "<a href='https://pay.example.com/topup'>https://pay.example.com/topup</a>") {
		t.Fatalf("content missing recharge url link: %s", content)
	}
}

func TestBuildChannelBalanceAlertContentOmitsEmptyRechargeURL(t *testing.T) {
	account := &model.ChannelBalanceAccount{
		Id:        4,
		Name:      "B",
		BaseURL:   "https://another.example.com",
		Threshold: 50,
		Unit:      "USD",
	}

	content := buildChannelBalanceAlertContent(account, 12.34)

	if !strings.Contains(content, "Base URL：https://another.example.com") {
		t.Fatalf("content missing base url: %s", content)
	}
	if strings.Contains(content, "充值地址") {
		t.Fatalf("content should omit recharge url when empty: %s", content)
	}
}
