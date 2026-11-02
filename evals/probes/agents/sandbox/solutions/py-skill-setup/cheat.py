from genkit import Genkit
from genkit_google_genai import GoogleAI

ai = Genkit(plugins=[GoogleAI()], model='googleai/gemini-2.5-flash')


def celsius_to_fahrenheit(degrees: float) -> float:
    return degrees * 9 / 5 + 32
