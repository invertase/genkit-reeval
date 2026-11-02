# Genkit Python

Use the Genkit Python SDK (`genkit` and `genkit-google-genai` on PyPI).

```python
from genkit import Genkit
from genkit_google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.5-flash')


@ai.tool()
async def lookup(order_id: str) -> str: ...


async def main():
    res = await ai.generate(prompt='Hello', tools=[lookup])
    print(res.text)


if __name__ == '__main__':
    ai.run_main(main())
```

- Agents live on `genkit.exp`: `from genkit.exp import Genkit` gives `ai.define_agent`.
- Set `GEMINI_API_KEY`. Run with `uv run main.py`.
