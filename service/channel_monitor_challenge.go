package service

import (
	"fmt"
	"math/rand/v2"
	"regexp"
	"strconv"
	"strings"
)

const channelMonitorChallengePromptTemplate = `Calculate and respond with ONLY the number, nothing else.

Q: 3 + 5 = ?
A: 8

Q: 12 - 7 = ?
A: 5

Q: %d %s %d = ?
A:`

var channelMonitorChallengeNumberRegex = regexp.MustCompile(`-?\d+`)

type channelMonitorChallenge struct {
	Prompt   string
	Expected string
}

func generateChannelMonitorChallenge() channelMonitorChallenge {
	a := randIntInRange(channelMonitorChallengeMin, channelMonitorChallengeMax)
	b := randIntInRange(channelMonitorChallengeMin, channelMonitorChallengeMax)

	if rand.IntN(2) == 0 { //nolint:gosec // challenge 仅用于监控探测
		return channelMonitorChallenge{
			Prompt:   fmt.Sprintf(channelMonitorChallengePromptTemplate, a, "+", b),
			Expected: strconv.Itoa(a + b),
		}
	}

	hi, lo := a, b
	if lo > hi {
		hi, lo = lo, hi
	}
	return channelMonitorChallenge{
		Prompt:   fmt.Sprintf(channelMonitorChallengePromptTemplate, hi, "-", lo),
		Expected: strconv.Itoa(hi - lo),
	}
}

func randIntInRange(minVal, maxVal int) int {
	if maxVal <= minVal {
		return minVal
	}
	return minVal + rand.IntN(maxVal-minVal+1) //nolint:gosec
}

func validateChannelMonitorChallenge(responseText, expected string) bool {
	if strings.TrimSpace(responseText) == "" || strings.TrimSpace(expected) == "" {
		return false
	}
	matches := channelMonitorChallengeNumberRegex.FindAllString(responseText, -1)
	for _, m := range matches {
		if m == expected {
			return true
		}
	}
	return false
}
