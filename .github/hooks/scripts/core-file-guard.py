#!/usr/bin/env python3
"""
PreToolUse hook: prompts for confirmation before editing core files.
Guarded: storage.ts, schema.ts, App.tsx, shared/, queryClient.ts, gist.ts
"""
import json
import sys
import re

CORE_PATTERNS = [
    r'storage\.ts',
    r'schema\.ts',
    r'App\.tsx',
    r'shared/',
    r'queryClient\.ts',
    r'gist\.ts',
]

EDIT_TOOL_KEYWORDS = ['replace', 'edit', 'write', 'create_file']


def is_edit_tool(tool_name: str) -> bool:
    name = tool_name.lower()
    return any(kw in name for kw in EDIT_TOOL_KEYWORDS)


def extract_file_path(data: dict) -> str:
    for key in ('toolInput', 'input', 'parameters'):
        val = data.get(key)
        if isinstance(val, dict):
            for fkey in ('filePath', 'file_path', 'path'):
                if fkey in val:
                    return val[fkey]
    return ''


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        sys.exit(0)

    tool_name = (
        data.get('toolName')
        or (data.get('tool') or {}).get('name', '')
    )

    if not is_edit_tool(tool_name):
        sys.exit(0)

    file_path = extract_file_path(data)
    check_str = file_path + raw

    for pattern in CORE_PATTERNS:
        if re.search(pattern, check_str):
            friendly = pattern.replace(r'\.', '.').replace('/', '/...')
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "ask",
                    "permissionDecisionReason": (
                        f"Core file matched: {friendly} — confirm this edit is intentional."
                    )
                }
            }
            print(json.dumps(output))
            return

    sys.exit(0)


if __name__ == '__main__':
    main()
