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

const marker = "PROBE_RESULT "

type turnResult struct {
	Reply   string `json:"reply"`
	Session string `json:"session"`
}

// TestProbeTurn is the body of one process: it runs a single Ask and prints the result.
func TestProbeTurn(t *testing.T) {
	message := os.Getenv("PROBE_MESSAGE")
	if message == "" {
		t.Skip("run by TestTwoProcesses")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	reply, session, err := Ask(ctx, os.Getenv("PROBE_SESSION"), message)
	if err != nil {
		t.Fatalf("Ask: %v", err)
	}
	out, _ := json.Marshal(turnResult{Reply: reply, Session: session})
	os.Stdout.WriteString(marker + string(out) + "\n")
}

func runTurn(t *testing.T, session, message string) turnResult {
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
		if rest, ok := strings.CutPrefix(line, marker); ok {
			var res turnResult
			if err := json.Unmarshal([]byte(rest), &res); err != nil {
				t.Fatalf("bad result %q: %v", rest, err)
			}
			return res
		}
	}
	t.Fatalf("turn %q printed no result:\n%s", message, stdout)
	return turnResult{}
}

func TestTwoProcesses(t *testing.T) {
	first := runTurn(t, "", "My order id is A-7731.")
	if first.Session == "" {
		t.Fatal("the first turn returned no session id")
	}
	second := runTurn(t, first.Session, "What is the status of my order?")
	if !regexp.MustCompile(`(?i)back-?order`).MatchString(second.Reply) {
		t.Fatalf("the second process does not say A-7731 is backordered: %q", second.Reply)
	}
}
