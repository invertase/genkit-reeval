from pydantic import BaseModel

from genkit import Genkit
from genkit_google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.5-flash')


class Celsius(BaseModel):
    degrees: float


@ai.tool(name='celsiusToFahrenheit', description='Converts a temperature from Celsius to Fahrenheit.')
async def celsius_to_fahrenheit(input: Celsius) -> float:
    return input.degrees * 9 / 5
