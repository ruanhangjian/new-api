package openai

import "testing"

func TestModelListIncludesRecentGptModels(t *testing.T) {
	required := []string{
		"gpt-5.4",
		"gpt-5.4-mini",
		"gpt-5.5",
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
