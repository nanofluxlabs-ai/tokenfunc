package common

import "testing"

func TestNormalizeTelegramUsername(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"", ""},
		{"tokenfunc_sales", "tokenfunc_sales"},
		{"  @tokenfunc_sales ", "tokenfunc_sales"},
		{"t.me/tokenfunc_sales", "tokenfunc_sales"},
		{"https://t.me/tokenfunc_sales/", "tokenfunc_sales"},
		{"https://telegram.me/tokenfunc_sales?start=1", "tokenfunc_sales"},
		{"tokenfunc\"><script>", "tokenfunc"},
		{"javascript:alert(1)", "javascript"},
	}
	for _, c := range cases {
		if got := NormalizeTelegramUsername(c.raw); got != c.want {
			t.Errorf("NormalizeTelegramUsername(%q) = %q, want %q", c.raw, got, c.want)
		}
	}
}
