#!/usr/bin/env python3
"""
strip-comments.py

Removes comments from CSS and JS files without touching any code.

  CSS  — strips /* ... */ block comments (including multiline)
  JS   — strips // line comments and /* ... */ block comments
         correctly skips over strings, template literals, and regex literals

Modes:
  (default)   Write stripped files in-place
  --dry-run   Print a line-count summary per file; no writes
  --diff      Open VS Code diff view (original vs stripped) for each file —
              comments show as red deletions, code is untouched

Usage:
  python scripts/strip-comments.py src/styles/design-tokens.css --diff
  python scripts/strip-comments.py src/styles/design-tokens.css src/app.js --diff
  python scripts/strip-comments.py src/styles/design-tokens.css src/app.js --dry-run
  python scripts/strip-comments.py src/ --exclude node_modules dist
"""

import re
import sys
import atexit
import subprocess
import tempfile
import argparse
from pathlib import Path


# ---------------------------------------------------------------------------
# Core parsers
# ---------------------------------------------------------------------------

def _strip_css(source: str) -> str:
    """Remove /* ... */ block comments from CSS. Preserves all code."""
    result = []
    i = 0
    n = len(source)

    while i < n:
        ch = source[i]

        # ── Quoted string  "..."  '...'  (e.g. content:"", url("")) ──────
        if ch in ('"', "'"):
            quote = ch
            result.append(ch)
            i += 1
            while i < n:
                c = source[i]
                result.append(c)
                if c == '\\' and i + 1 < n:
                    i += 1
                    result.append(source[i])
                elif c == quote:
                    break
                i += 1
            i += 1

        # ── Block comment  /* ... */ ──────────────────────────────────────
        elif ch == '/' and i + 1 < n and source[i + 1] == '*':
            i += 2
            while i < n:
                if source[i] == '*' and i + 1 < n and source[i + 1] == '/':
                    i += 2
                    break
                i += 1
            while result and result[-1] in (' ', '\t'):
                result.pop()

        else:
            result.append(ch)
            i += 1

    return _collapse_blank_lines(''.join(result))


# ---------------------------------------------------------------------------
# Regex-vs-division disambiguation for JS
# ---------------------------------------------------------------------------

_REGEX_AFTER_CHARS = set('=(<[!&|,;:?~^%+-*{}\n')
_REGEX_AFTER_KEYWORDS = {
    'return', 'typeof', 'instanceof', 'in', 'of', 'new',
    'delete', 'void', 'throw', 'case', 'yield', 'await',
}

def _can_start_regex(buf: list) -> bool:
    for i in range(len(buf) - 1, -1, -1):
        c = buf[i]
        if c in ' \t\n\r':
            continue
        if c in _REGEX_AFTER_CHARS:
            return True
        if c.isalnum() or c == '_':
            j = i
            while j >= 0 and (buf[j].isalnum() or buf[j] == '_'):
                j -= 1
            word = ''.join(buf[j + 1: i + 1])
            return word in _REGEX_AFTER_KEYWORDS
        return False
    return True


def _strip_js(source: str) -> str:
    """Remove // and /* */ comments from JS. Preserves strings, template literals, regex."""
    result = []
    i = 0
    n = len(source)

    while i < n:
        ch = source[i]

        # ── Single / double quoted string ────────────────────────────────
        if ch in ('"', "'"):
            quote = ch
            result.append(ch)
            i += 1
            while i < n:
                c = source[i]
                result.append(c)
                if c == '\\' and i + 1 < n:
                    i += 1
                    result.append(source[i])
                elif c == quote:
                    break
                i += 1
            i += 1

        # ── Template literal  `...`  (handles ${ } nesting) ──────────────
        elif ch == '`':
            result.append(ch)
            i += 1
            expr_depth = 0
            while i < n:
                c = source[i]
                result.append(c)
                if c == '\\' and i + 1 < n:
                    i += 1
                    result.append(source[i])
                elif c == '$' and i + 1 < n and source[i + 1] == '{':
                    result.append(source[i + 1])
                    i += 2
                    expr_depth += 1
                    continue
                elif c == '{' and expr_depth > 0:
                    expr_depth += 1
                elif c == '}' and expr_depth > 0:
                    expr_depth -= 1
                elif c == '`' and expr_depth == 0:
                    break
                i += 1
            i += 1

        # ── Slash: comment, regex, or division ───────────────────────────
        elif ch == '/':

            # Line comment  //
            if i + 1 < n and source[i + 1] == '/':
                i += 2
                while i < n and source[i] != '\n':
                    i += 1
                while result and result[-1] in (' ', '\t'):
                    result.pop()
                # newline NOT consumed — keeps line numbers intact

            # Block comment  /* ... */
            elif i + 1 < n and source[i + 1] == '*':
                i += 2
                while i < n:
                    if source[i] == '*' and i + 1 < n and source[i + 1] == '/':
                        i += 2
                        break
                    i += 1
                while result and result[-1] in (' ', '\t'):
                    result.pop()

            # Regex literal  /pattern/flags
            elif _can_start_regex(result):
                result.append(ch)
                i += 1
                in_char_class = False
                while i < n:
                    c = source[i]
                    result.append(c)
                    if c == '\\' and i + 1 < n:
                        i += 1
                        result.append(source[i])
                    elif c == '[':
                        in_char_class = True
                    elif c == ']':
                        in_char_class = False
                    elif c == '/' and not in_char_class:
                        i += 1
                        while i < n and source[i].isalpha():
                            result.append(source[i])
                            i += 1
                        break
                    i += 1

            # Division operator
            else:
                result.append(ch)
                i += 1

        # ── Everything else ───────────────────────────────────────────────
        else:
            result.append(ch)
            i += 1

    return _collapse_blank_lines(''.join(result))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collapse_blank_lines(text: str) -> str:
    """Reduce runs of 3+ blank lines to exactly 2."""
    return re.sub(r'\n{3,}', '\n\n', text)


_STRIP_HANDLERS = {
    '.css': _strip_css,
    '.js':  _strip_js,
}


# ---------------------------------------------------------------------------
# File processing
# ---------------------------------------------------------------------------

# Temp files created for --diff mode; cleaned up on exit
_temp_files: list[Path] = []

def _cleanup_temps():
    for p in _temp_files:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass

atexit.register(_cleanup_temps)


def process_file(path: Path, dry_run: bool = False, diff: bool = False) -> bool:
    """
    Process *path* according to the active mode.
    Returns True if the file was (or would be) modified.
    """
    suffix = path.suffix.lower()
    handler = _STRIP_HANDLERS.get(suffix)
    if handler is None:
        print(f'  skip  (not css/js)  {path}')
        return False

    source = path.read_text(encoding='utf-8')
    stripped = handler(source)

    if stripped == source:
        print(f'  clean (no comments) {path}')
        return False

    if diff:
        # Write stripped content to a named temp file that keeps the original
        # extension so VS Code picks up the right language/syntax highlighting.
        tmp = Path(tempfile.mktemp(suffix=suffix, prefix=path.stem + '.stripped.'))
        tmp.write_text(stripped, encoding='utf-8')
        _temp_files.append(tmp)

        # Open VS Code diff: LEFT = original (read-only), RIGHT = stripped
        # The tab title shows  "filename.css ↔ filename.stripped.css"
        subprocess.Popen(
            ['code', '--diff', str(path.resolve()), str(tmp)],
            shell=True,
        )
        original_lines = source.count('\n')
        stripped_lines  = stripped.count('\n')
        print(f'  diff opened  {path}  ({original_lines - stripped_lines:+d} lines)')
        return True

    if dry_run:
        original_lines = source.count('\n')
        stripped_lines  = stripped.count('\n')
        print(f'  [dry-run] {path}  ({original_lines - stripped_lines:+d} lines)')
        return True

    path.write_text(stripped, encoding='utf-8')
    print(f'  wrote         {path}')
    return True


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Strip comments from CSS and JS files without touching code.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        'paths',
        nargs='+',
        help='Files or directories to process.',
    )

    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        '--dry-run',
        action='store_true',
        help='Show line-count delta per file; no writes.',
    )
    mode_group.add_argument(
        '--diff',
        action='store_true',
        help='Open VS Code diff view for each file — comments are red deletions, '
             'code is untouched. Temp files are cleaned up on exit.',
    )

    parser.add_argument(
        '--exclude',
        nargs='*',
        default=['node_modules', '.git', 'dist', 'build'],
        metavar='DIR',
        help='Directory names to skip when scanning a folder.',
    )
    args = parser.parse_args()

    modified = 0
    total = 0

    for raw in args.paths:
        p = Path(raw)
        if p.is_file():
            candidates = [p]
        elif p.is_dir():
            candidates = sorted(
                f for f in p.rglob('*')
                if f.suffix.lower() in _STRIP_HANDLERS
                and not any(part in args.exclude for part in f.parts)
            )
        else:
            print(f'Not found: {raw}', file=sys.stderr)
            continue

        for fp in candidates:
            total += 1
            if process_file(fp, dry_run=args.dry_run, diff=args.diff):
                modified += 1

    verb = 'would be modified' if args.dry_run else 'modified'
    if args.diff:
        verb = 'opened in diff'
        # Keep the process alive briefly so VS Code has time to read the temp files
        # before atexit cleanup fires. User can Ctrl-C or just wait.
        if modified:
            print(f'\n{modified}/{total} file(s) {verb}.')
            print('Keeping temp files open — press Enter when finished reviewing.')
            try:
                input()
            except (EOFError, KeyboardInterrupt):
                pass
    else:
        print(f'\n{modified}/{total} file(s) {verb}.')


if __name__ == '__main__':
    main()
