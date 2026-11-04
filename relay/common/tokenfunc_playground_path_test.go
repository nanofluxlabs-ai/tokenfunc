package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizePlaygroundPath(t *testing.T) {
	cases := map[string]string{
		"/pg/chat/completions": "/v1/chat/completions",
		"/pg/responses":        "/v1/responses",
		"/v1/chat/completions": "/v1/chat/completions",
		"/v1/messages":         "/v1/messages",
		"/pgx/chat":            "/pgx/chat",
	}
	for input, want := range cases {
		assert.Equal(t, want, NormalizePlaygroundPath(input), input)
	}
}
