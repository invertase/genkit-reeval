"""Asks the app one question: py-tool.py <question>."""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.getcwd())
import app  # noqa: E402

reply = asyncio.run(app.ask(sys.argv[1]))
print('PROBE_RESULT ' + json.dumps({'reply': reply}))
