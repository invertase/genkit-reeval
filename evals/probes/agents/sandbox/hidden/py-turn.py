"""One turn of the agent in this process: py-turn.py <session id or empty> <message>."""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.getcwd())
import app  # noqa: E402

session = sys.argv[1] or None
reply, session_id = asyncio.run(app.ask(session, sys.argv[2]))
print('PROBE_RESULT ' + json.dumps({'reply': reply, 'session': session_id}))
