import asyncio
import json
import sys
from pathlib import Path

from pydantic import BaseModel

from genkit.ai import Genkit
from genkit.plugins.google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.5-flash')


class OrderInput(BaseModel):
    order_id: str


@ai.tool(name='lookupOrder', description='Looks up the status and delivery ETA of an order by its id.')
async def lookup_order(input: OrderInput) -> dict:
    orders = json.loads(Path('orders.json').read_text())
    return orders.get(input.order_id, {'error': 'no such order'})


async def ask(question: str) -> str:
    res = await ai.generate(prompt=question, tools=[lookup_order])
    return res.text


if __name__ == '__main__':
    print(asyncio.run(ask(' '.join(sys.argv[1:]) or 'Where is order A-7731?')))
