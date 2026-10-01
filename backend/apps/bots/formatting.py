"""Turning an answer written for the apps into one a chat app can show.

The assistant writes markdown with LaTeX mathematics, tables, and fenced
`graph` and `mermaid` blocks that the apps draw. A chat app shows none of
that. So:

  * anything with a chart or a diagram goes out as a PDF, where it is drawn
    exactly as in the apps (see `needs_pdf`);
  * the text itself becomes Telegram's small HTML subset: headings and bold
    as bold, lists as bullets, code as code, and mathematics rewritten with
    real symbols (x², √, ≤, π) instead of raw LaTeX.
"""

from __future__ import annotations

import html
import re

# Charts, flowcharts and labelled diagrams: everything the apps draw.
VISUAL_LANGUAGES = {
    'graph', 'plot', 'chart', 'mermaid',
    'figure', 'labelled-diagram', 'labeled-diagram', 'illustration', 'drawing', 'sketch',
}
_FENCE = re.compile(r'```([A-Za-z0-9_+-]*)[^\n]*\n(.*?)```', re.DOTALL)
# Leave room under Telegram's 4096 for the tags the conversion adds.
CHUNK = 3800

SUPERSCRIPT = str.maketrans('0123456789+-=()n', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ')
SUBSCRIPT = str.maketrans('0123456789+-=()', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎')

SYMBOLS = {
    r'\times': '×', r'\cdot': '·', r'\div': '÷', r'\pm': '±', r'\mp': '∓',
    r'\leq': '≤', r'\le': '≤', r'\geq': '≥', r'\ge': '≥', r'\neq': '≠', r'\ne': '≠',
    r'\approx': '≈', r'\equiv': '≡', r'\infty': '∞', r'\propto': '∝',
    r'\rightarrow': '→', r'\to': '→', r'\leftarrow': '←', r'\Rightarrow': '⇒', r'\Leftrightarrow': '⇔',
    r'\implies': '⇒', r'\iff': '⇔', r'\in': '∈', r'\notin': '∉', r'\subset': '⊂', r'\cup': '∪',
    r'\cap': '∩', r'\forall': '∀', r'\exists': '∃', r'\sum': 'Σ', r'\prod': 'Π', r'\int': '∫',
    r'\partial': '∂', r'\nabla': '∇', r'\degree': '°', r'\circ': '°', r'\angle': '∠', r'\perp': '⊥',
    r'\parallel': '∥', r'\therefore': '∴', r'\ldots': '…', r'\cdots': '⋯', r'\dots': '…',
    r'\alpha': 'α', r'\beta': 'β', r'\gamma': 'γ', r'\delta': 'δ', r'\epsilon': 'ε', r'\varepsilon': 'ε',
    r'\theta': 'θ', r'\lambda': 'λ', r'\mu': 'μ', r'\pi': 'π', r'\rho': 'ρ', r'\sigma': 'σ',
    r'\tau': 'τ', r'\phi': 'φ', r'\varphi': 'φ', r'\omega': 'ω', r'\Omega': 'Ω', r'\Delta': 'Δ',
    r'\Gamma': 'Γ', r'\Sigma': 'Σ', r'\Theta': 'Θ', r'\Lambda': 'Λ', r'\Phi': 'Φ',
}


def needs_pdf(markdown: str) -> bool:
    """Charts and diagrams cannot be drawn in a chat, so they come as a PDF."""
    return any(language.lower() in VISUAL_LANGUAGES for language, _ in _FENCE.findall(markdown or ''))


def strip_visuals(markdown: str, note: str) -> str:
    """The answer without its charts, each replaced by a short note."""
    def replace(match):
        return f'\n{note}\n' if match.group(1).lower() in VISUAL_LANGUAGES else match.group(0)

    return _FENCE.sub(replace, markdown or '')


def _braced(text: str, start: int):
    """The content of the {...} group starting at text[start], and where it ends."""
    if start >= len(text) or text[start] != '{':
        return None, start
    depth = 0
    for index in range(start, len(text)):
        if text[index] == '{':
            depth += 1
        elif text[index] == '}':
            depth -= 1
            if depth == 0:
                return text[start + 1:index], index + 1
    return None, start


def _replace_command(text: str, command: str, arity: int, build) -> str:
    out = []
    index = 0
    while True:
        found = text.find(command, index)
        if found < 0:
            out.append(text[index:])
            return ''.join(out)
        after = found + len(command)
        args = []
        cursor = after
        for _ in range(arity):
            while cursor < len(text) and text[cursor] == ' ':
                cursor += 1
            content, cursor_after = _braced(text, cursor)
            if content is None:
                break
            args.append(content)
            cursor = cursor_after
        if len(args) != arity:
            out.append(text[index:after])
            index = after
            continue
        out.append(text[index:found])
        out.append(build(*[latex_to_text(arg) for arg in args]))
        index = cursor


def latex_to_text(expression: str) -> str:
    """LaTeX, rewritten with the symbols a phone can show."""
    text = expression
    text = _replace_command(text, r'\frac', 2, lambda a, b: f'{_group(a)}/{_group(b)}')
    text = _replace_command(text, r'\dfrac', 2, lambda a, b: f'{_group(a)}/{_group(b)}')
    text = _replace_command(text, r'\tfrac', 2, lambda a, b: f'{_group(a)}/{_group(b)}')
    text = _replace_command(text, r'\sqrt', 1, lambda a: f'√{_group(a)}')
    for command in (r'\text', r'\mathrm', r'\mathbf', r'\textbf', r'\operatorname', r'\mathit', r'\vec', r'\overline'):
        text = _replace_command(text, command, 1, lambda a: a)
    text = _replace_command(text, r'\boxed', 1, lambda a: f'【{a}】')
    for command in (r'\left', r'\right', r'\displaystyle', r'\,', r'\;', r'\!', r'\quad', r'\qquad'):
        text = text.replace(command, ' ' if command in (r'\quad', r'\qquad') else '')
    # Longest first, so \leq is not read as \le followed by "q".
    for command in sorted(SYMBOLS, key=len, reverse=True):
        text = re.sub(re.escape(command) + r'(?![A-Za-z])', SYMBOLS[command], text)
    text = re.sub(r'\^\{([^{}]*)\}', lambda m: _raise(m.group(1)), text)
    text = re.sub(r'\^([0-9n+\-])', lambda m: _raise(m.group(1)), text)
    text = re.sub(r'_\{([^{}]*)\}', lambda m: _lower(m.group(1)), text)
    text = re.sub(r'_([0-9])', lambda m: _lower(m.group(1)), text)
    text = text.replace(r'\{', '{').replace(r'\}', '}').replace(r'\%', '%').replace('\\\\', ' ')
    text = re.sub(r'\\([A-Za-z]+)', r'\1', text)
    text = text.replace('{', '').replace('}', '')
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def _group(value: str) -> str:
    value = value.strip()
    return value if re.fullmatch(r'[\w.√²³]+', value) else f'({value})'


def _raise(value: str) -> str:
    converted = value.translate(SUPERSCRIPT)
    return converted if all(ch in '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿ' for ch in converted) else f'^({value})'


def _lower(value: str) -> str:
    converted = value.translate(SUBSCRIPT)
    return converted if all(ch in '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎' for ch in converted) else f'_({value})'


_STRAY_LATEX = re.compile(
    r'\\(frac|dfrac|sqrt|boxed|text|times|cdot|div|pm|leq|geq|neq|approx|pi|theta|alpha|beta|infty'
    r'|Rightarrow|rightarrow)(?![A-Za-z])'
)
_CODE_PLACEHOLDER = re.compile(r'\x00CODE\d+\x00')
_DISPLAY_MATH = re.compile(r'\$\$(.+?)\$\$|\\\[(.+?)\\\]', re.DOTALL)
_INLINE_MATH = re.compile(r'\\\((.+?)\\\)|(?<![\\$])\$([^$\n]+?)\$', re.DOTALL)


def _math_to_text(markdown: str) -> str:
    markdown = _DISPLAY_MATH.sub(lambda m: '\n' + latex_to_text(m.group(1) or m.group(2)) + '\n', markdown)
    return _INLINE_MATH.sub(lambda m: latex_to_text(m.group(1) or m.group(2)), markdown)


def _inline(text: str) -> str:
    """Bold, italic, code and links on one line of already-escaped text."""
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'__(.+?)__', r'<b>\1</b>', text)
    text = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<i>\1</i>', text)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2">\1</a>', text)
    return text


def to_telegram_html(markdown: str) -> str:
    """The answer as Telegram HTML. Charts must already have been removed."""
    blocks = []
    placeholder = '\x00CODE{}\x00'

    def keep_code(match):
        blocks.append(f'<pre>{html.escape(match.group(2).rstrip())}</pre>')
        return placeholder.format(len(blocks) - 1)

    text = _FENCE.sub(keep_code, markdown or '')
    text = _math_to_text(text)

    lines = []
    in_table = []

    def flush_table():
        if in_table:
            rows = [row for row in in_table if not re.fullmatch(r'\|?[\s:|-]+\|?', row)]
            cells = [[cell.strip() for cell in row.strip().strip('|').split('|')] for row in rows]
            widths = [max(len(row[i]) if i < len(row) else 0 for row in cells) for i in range(max(map(len, cells)))]
            rendered = '\n'.join(
                '  '.join((row[i] if i < len(row) else '').ljust(widths[i]) for i in range(len(widths))).rstrip()
                for row in cells
            )
            lines.append(f'<pre>{html.escape(rendered)}</pre>')
            in_table.clear()

    for raw in text.split('\n'):
        line = raw.rstrip()
        # LaTeX written without delimiters still reaches the reader as symbols.
        if _STRAY_LATEX.search(line) and not _CODE_PLACEHOLDER.fullmatch(line.strip()):
            indent = line[:len(line) - len(line.lstrip())]
            line = indent + latex_to_text(line)
        if line.lstrip().startswith('|'):
            in_table.append(line.strip())
            continue
        flush_table()
        if re.fullmatch(r'\x00CODE\d+\x00', line.strip()):
            lines.append(line.strip())
            continue
        escaped = html.escape(line, quote=False)
        heading = re.match(r'^\s*#{1,6}\s+(.*)$', escaped)
        if heading:
            lines.append(f'<b>{_inline(heading.group(1))}</b>')
            continue
        quote = re.match(r'^\s*&gt;\s?(.*)$', escaped)
        if quote:
            lines.append(f'▎ {_inline(quote.group(1))}')
            continue
        bullet = re.match(r'^(\s*)[-*+]\s+(.*)$', escaped)
        if bullet:
            lines.append(f'{"  " * (len(bullet.group(1)) // 2)}• {_inline(bullet.group(2))}')
            continue
        if re.fullmatch(r'\s*(-{3,}|\*{3,}|_{3,})\s*', escaped):
            lines.append('──────────')
            continue
        lines.append(_inline(escaped))
    flush_table()

    out = '\n'.join(lines)
    out = re.sub(r'\n{3,}', '\n\n', out).strip()
    for index, block in enumerate(blocks):
        out = out.replace(placeholder.format(index), block)
    return out


def split_for_telegram(text: str, limit: int = CHUNK) -> list[str]:
    """Paragraph-sized pieces under the message limit, each with whole tags."""
    parts = []
    current = ''
    for paragraph in text.split('\n\n'):
        candidate = f'{current}\n\n{paragraph}' if current else paragraph
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            parts.append(current)
        while len(paragraph) > limit:
            # A single paragraph this long has no safe tag boundary: send it
            # as plain text so nothing is cut mid-tag.
            plain = re.sub(r'<[^>]+>', '', paragraph)
            parts.append(html.escape(html.unescape(plain[:limit])))
            paragraph = html.escape(html.unescape(plain[limit:]))
        current = paragraph
    if current:
        parts.append(current)
    return parts or ['']


def to_print_html(markdown: str) -> str:
    """Simple HTML for the fallback PDF, when the full renderer is unavailable."""
    body = to_telegram_html(markdown)
    body = body.replace('\n', '<br>\n')
    return body
