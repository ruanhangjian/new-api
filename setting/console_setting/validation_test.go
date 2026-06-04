package console_setting

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestValidateAnnouncementsCountsUnicodeCharacters(t *testing.T) {
	content := `# 智链AI充值比例调整公告

日 1.自 **2026年6月5日0:00** 起，平台充值比例调整为：**1元人民币 = 1美元额度**（原为0.4元=1美元额度）。

2.账户现有余额将在 **2026年6月6日0:00前** 按比例转换，规则：**原余额 × 0.4 = 新余额**。例：原100美元额度，转换后为40美元额度。

3.分组倍率说明同步优化：如 **0.1x** 表示 **0.1元/美元官方额度**，即充值1元可使用10美元官方等价额度；周卡$155在0.1x下可用$1550官方等价额度。

4.已订阅用户的订阅额度不参与本次比例调整。

5.邀请好友奖励、每日签到额度将同步调整，并与新充值比例保持一致。

感谢大家一直以来对智链AI的支持与理解！

智链AI  
2026年6月5`
	if got := len([]rune(content)); got >= 500 {
		t.Fatalf("test content must be under 500 characters, got %d", got)
	}
	if got := len(content); got <= 500 {
		t.Fatalf("test content must exceed 500 bytes, got %d", got)
	}

	payload, err := json.Marshal([]map[string]any{
		{
			"id":          1,
			"content":     content,
			"publishDate": "2026-06-05T00:00:00+08:00",
			"type":        "success",
			"extra":       "",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := ValidateConsoleSettings(string(payload), "Announcements"); err != nil {
		t.Fatalf("expected unicode announcement under 500 characters to pass, got %v", err)
	}
}

func TestValidateAnnouncementsRejectsOverCharacterLimit(t *testing.T) {
	payload, err := json.Marshal([]map[string]any{
		{
			"id":          1,
			"content":     strings.Repeat("中", 501),
			"publishDate": "2026-06-05T00:00:00+08:00",
			"type":        "success",
			"extra":       "",
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := ValidateConsoleSettings(string(payload), "Announcements"); err == nil {
		t.Fatal("expected announcement over 500 characters to be rejected")
	}
}
