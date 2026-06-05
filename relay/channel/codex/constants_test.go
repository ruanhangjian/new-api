package codex

import "testing"

func TestModelListIncludesRecentCodexModels(t *testing.T) {
	required := []string{
		"gpt-5.3-codex-spark",
		"gpt-5.4-openai-compact",
		"gpt-5.5",
		"gpt-5.5-openai-compact",
		"codex-auto-review",
	}

	models := make(map[string]bool, len(ModelList))
	for _, model := range ModelList {
		models[model] = true
	}

	for _, model := range required {
		if !models[model] {
			t.Fatalf("ModelList missing %s", model)
		}
	}
}
