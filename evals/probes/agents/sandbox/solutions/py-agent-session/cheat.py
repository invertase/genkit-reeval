import json
from pathlib import Path

from pydantic import BaseModel

from genkit.exp import InMemorySessionStore, Genkit
from genkit_google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.5-flash')


class OrderInput(BaseModel):
    order_id: str


@ai.tool(name='lookupOrder', description='Looks up the status and delivery ETA of an order by its id.')
async def lookup_order(input: OrderInput) -> dict:
    orders = json.loads(Path('orders.json').read_text())
    return orders.get(input.order_id, {'error': 'no such order'})


support = ai.define_agent(
    name='support',
    system='You are a support agent. Use lookupOrder for order questions and answer briefly. The conversation so far holds what the customer already told you, such as their order id; use it and never ask for it again.',
    tools=[lookup_order],
    store=InMemorySessionStore(),
)


async def ask(session_id: str | None, message: str) -> tuple[str, str]:
    chat = support.chat(session_id=session_id) if session_id else support.chat()
    res = await chat.send(message)
    return res.text, res.session_id
