package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/firebase/genkit/go/ai"
	aix "github.com/firebase/genkit/go/ai/exp"
	"github.com/firebase/genkit/go/ai/exp/localstore"
	"github.com/firebase/genkit/go/genkit"
	genkitx "github.com/firebase/genkit/go/genkit/exp"
	"github.com/firebase/genkit/go/plugins/googlegenai"
)

type orderInput struct {
	OrderID string `json:"orderId" jsonschema_description:"The order id, for example A-7731"`
}

type order struct {
	Status string `json:"status"`
	ETA    string `json:"eta"`
}

// Ask sends message to the support agent; an empty sessionID starts a conversation.
func Ask(ctx context.Context, sessionID string, message string) (string, string, error) {
	g := genkit.Init(ctx, genkit.WithPlugins(&googlegenai.GoogleAI{}), genkit.WithExperimental())

	lookupOrder := genkit.DefineTool(g, "lookupOrder", "Looks up the status and delivery ETA of an order by its id.",
		func(_ *ai.ToolContext, in orderInput) (order, error) {
			raw, err := os.ReadFile("orders.json")
			if err != nil {
				return order{}, err
			}
			orders := map[string]order{}
			if err := json.Unmarshal(raw, &orders); err != nil {
				return order{}, err
			}
			o, ok := orders[in.OrderID]
			if !ok {
				return order{}, fmt.Errorf("no order %s", in.OrderID)
			}
			return o, nil
		})

	store, err := localstore.NewFileSessionStore[any](".sessions")
	if err != nil {
		return "", "", err
	}
	agent := genkitx.DefineAgent(g, "support",
		aix.InlinePrompt{
			ai.WithModelName("googleai/gemini-2.5-flash"),
			ai.WithSystem("You are a support agent. Use lookupOrder for order questions and answer briefly. The conversation so far holds what the customer already told you, such as their order id; use it and never ask for it again."),
			ai.WithTools(lookupOrder),
		},
		aix.WithSessionStore(store),
	)

	var opts []aix.InvocationOption[any]
	if sessionID != "" {
		opts = append(opts, aix.WithSessionID[any](sessionID))
	}
	out, err := agent.RunText(ctx, message, opts...)
	if err != nil {
		return "", "", err
	}
	if out.Error != nil {
		return "", "", out.Error
	}
	return out.Message.Text(), out.SessionID, nil
}

func main() {
	reply, id, err := Ask(context.Background(), "", "Where is order A-7731?")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(id, reply)
}
