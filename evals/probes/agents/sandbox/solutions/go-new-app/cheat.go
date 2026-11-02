package main

import (
	"context"
	"fmt"
	"log"

	"github.com/genkit-ai/genkit/go/ai"
	"github.com/genkit-ai/genkit/go/genkit"
	"github.com/genkit-ai/genkit/go/plugins/googlegenai"
)

func main() {
	ctx := context.Background()
	g := genkit.Init(ctx, genkit.WithPlugins(&googlegenai.GoogleAI{}))
	answer, err := genkit.GenerateText(ctx, g,
		ai.WithModelName("googleai/gemini-2.5-flash"),
		ai.WithPrompt("What is Genkit? Answer in one line."),
	)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(answer)
}
