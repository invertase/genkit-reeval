"""Reports which Genkit agents modules the Python source here imports: py-imports.py [dir]."""

import ast
import json
import os
import sys

SKIP = {'.venv', 'venv', 'node_modules', '.git', '__pycache__', 'site-packages', '.sessions'}


def modules(tree):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            yield node.module
            yield from (f'{node.module}.{alias.name}' for alias in node.names)


def under(name, package):
    return name == package or name.startswith(package + '.')


root = sys.argv[1] if len(sys.argv) > 1 else '.'
exp, legacy, unparsed = set(), set(), []
for folder, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in SKIP]
    for name in files:
        if not name.endswith('.py'):
            continue
        path = os.path.join(folder, name)
        try:
            with open(path, encoding='utf-8') as handle:
                tree = ast.parse(handle.read())
        except (SyntaxError, ValueError, OSError):
            unparsed.append(path)
            continue
        for module in modules(tree):
            if under(module, 'genkit.exp'):
                exp.add(path)
            if under(module, 'genkit.agent'):
                legacy.add(path)
print('PROBE_RESULT ' + json.dumps({'exp': sorted(exp), 'legacy': sorted(legacy), 'unparsed': unparsed}))
