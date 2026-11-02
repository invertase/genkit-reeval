"""Calls every Genkit tool that app.py exposes with 100 and prints what each returns; no model is called."""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.getcwd())
import app  # noqa: E402


def argument(tool):
    schema = tool.input_schema or {}
    if schema.get('type') == 'object':
        numbers = [k for k, v in (schema.get('properties') or {}).items() if v.get('type') in ('number', 'integer')]
        return {numbers[0] if numbers else next(iter(schema.get('properties') or {'value': 0})): 100}
    return 100


async def call(tool):
    try:
        out = (await tool(argument(tool))).output
        return {'tool': tool.name, 'output': out if isinstance(out, (int, float, str, dict, list)) else str(out)}
    except Exception as error:  # noqa: BLE001
        return {'tool': tool.name, 'error': f'{type(error).__name__}: {error}'[:300]}


async def main():
    tools = [v for v in vars(app).values() if not isinstance(v, type) and callable(v) and hasattr(v, 'input_schema') and hasattr(v, 'definition')]
    print('PROBE_RESULT ' + json.dumps({'calls': [await call(t) for t in tools]}))


asyncio.run(main())
