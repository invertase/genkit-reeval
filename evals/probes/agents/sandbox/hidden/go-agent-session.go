package main

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"testing"
	"time"
)

const probeMarker = "PROBE_RESULT "

type probeTurnResult struct {
	Reply   string `json:"reply"`
	Session string `json:"session"`
}

// TestProbeTurn is the body of one process: it runs a single Ask and prints the result.
func TestProbeTurn(t *testing.T) {
	message := os.Getenv("PROBE_MESSAGE")
	if message == "" {
		t.Skip("run by TestProbeTwoProcesses")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	reply, session, err := Ask(ctx, os.Getenv("PROBE_SESSION"), message)
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	out, _ := json.Marshal(probeTurnResult{Reply: reply, Session: session})
	os.Stdout.WriteString(probeMarker + string(out) + "\n")
}

func runProbeTurn(t *testing.T, session, message string) probeTurnResult {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestProbeTurn$", "-test.count=1")
	cmd.Env = append(os.Environ(), "PROBE_SESSION="+session, "PROBE_MESSAGE="+message)
	stdout, err := cmd.Output()
	if err != nil {
		stderr := ""
		if ee, ok := err.(*exec.ExitError); ok {
			stderr = string(ee.Stderr)
		}
		t.Fatalf("turn %q failed: %v\n%s\n%s", message, err, stdout, stderr)
	}
	for _, line := range strings.Split(string(stdout), "\n") {
		if rest, ok := strings.CutPrefix(line, probeMarker); ok {
			var res probeTurnResult
			if err := json.Unmarshal([]byte(rest), &res); err != nil {
				t.Fatalf("bad result %q: %v", rest, err)
			}
			return res
		}
	}
	t.Fatalf("turn %q printed no result:\n%s", message, stdout)
	return probeTurnResult{}
}

func probeSquash(s string) string {
	return regexp.MustCompile(`[^a-z0-9]`).ReplaceAllString(strings.ToLower(s), "")
}

// TestProbeTwoProcesses asks about the order in PROBE_ORDER_ID in one process and asks for its id in another.
func TestProbeTwoProcesses(t *testing.T) {
	id := os.Getenv("PROBE_ORDER_ID")
	if id == "" {
		t.Skip("run by the probe with PROBE_ORDER_ID")
	}
	raw, err := os.ReadFile("orders.json")
	if err != nil {
		t.Fatal(err)
	}
	var orders map[string]struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(raw, &orders); err != nil {
		t.Fatal(err)
	}
	order, ok := orders[id]
	if !ok {
		t.Fatalf("orders.json has no order %s", id)
	}
	first := runProbeTurn(t, "", "My order id is "+id+". What is its status?")
	if first.Session == "" {
		t.Fatal("the first turn returned no session id")
	}
	for _, mark := range regexp.MustCompile(`[A-Z][a-z]+`).FindAllString(order.Status, -1) {
		if !regexp.MustCompile(`(?i)\b` + mark + `\b`).MatchString(first.Reply) {
			t.Fatalf("the first turn does not give the status %q of %s: %q", order.Status, id, first.Reply)
		}
	}
	second := runProbeTurn(t, first.Session, "What order id did I give you earlier? Reply with only the id.")
	if !strings.Contains(probeSquash(second.Reply), probeSquash(id)) {
		t.Fatalf("the second process does not recall %s: %q", id, second.Reply)
	}
}
