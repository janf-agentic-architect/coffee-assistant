import re

_BOLD_OPEN = "\uE000"
_BOLD_CLOSE = "\uE001"


def _format_table_lines(text: str) -> str:
    """Convert simple Markdown pipe tables into readable plain/WhatsApp lines."""
    lines = text.splitlines()
    result: list[str] = []
    i = 0

    def _is_table_row(line: str) -> bool:
        stripped = line.strip()
        return stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2

    def _is_separator_row(line: str) -> bool:
        stripped = line.strip().strip("|").strip()
        if not stripped:
            return False
        cells = [c.strip() for c in stripped.split("|")]
        return all(bool(re.fullmatch(r":?-{3,}:?", c)) for c in cells)

    while i < len(lines):
        if (
            i + 1 < len(lines)
            and _is_table_row(lines[i])
            and _is_separator_row(lines[i + 1])
        ):
            headers = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            i += 2
            while i < len(lines) and _is_table_row(lines[i]):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if len(cells) == 2 and all(cells):
                    result.append(f"- {cells[0]}: {cells[1]}")
                else:
                    parts = [
                        f"{headers[idx]}: {cell}" if idx < len(headers) and headers[idx] else cell
                        for idx, cell in enumerate(cells)
                        if cell
                    ]
                    if parts:
                        result.append(f"- {' | '.join(parts)}")
                i += 1
        else:
            result.append(lines[i])
            i += 1

    return "\n".join(result)


def markdown_to_whatsapp(text: str) -> str:
    """Convert standard Markdown text into WhatsApp-compatible formatting.

    Preserves fenced code blocks and inline code spans, while translating:
    - Headings (`# Title`) -> `*Title*`
    - Bold (`**text**`, `__text__`) -> `*text*`
    - Italic (`*text*`) -> `_text_`
    - Strikethrough (`~~text~~`) -> `~text~`
    - Links (`[label](url)`) -> `label (url)`
    - Bullet lists (`* item`, `+ item`) -> `- item`
    - Simple pipe tables -> readable bullet lines
    """
    if not text:
        return text

    placeholders: list[str] = []

    def _stash(value: str) -> str:
        token = f"\uE002CODE{len(placeholders)}\uE003"
        placeholders.append(value)
        return token

    # 1. Stash fenced code blocks (strip language identifier since WhatsApp doesn't use it)
    def _replace_fenced_code(match: re.Match[str]) -> str:
        code_body = match.group(1)
        return _stash(f"```\n{code_body}```")

    out = re.sub(r"```[^\n`]*\n(.*?)```", _replace_fenced_code, text, flags=re.DOTALL)

    # 2. Stash inline code spans
    out = re.sub(r"`([^`\n]+)`", lambda m: _stash(m.group(0)), out)

    # 3. Convert simple Markdown tables before inline formatting
    out = _format_table_lines(out)

    # 4. Convert Markdown images and links
    out = re.sub(
        r"!\[([^\]]*)\]\(([^)\s]+)\)",
        lambda m: f"{m.group(1)} ({m.group(2)})" if m.group(1).strip() else m.group(2),
        out,
    )
    out = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: m.group(2) if m.group(1).strip() == m.group(2).strip() else f"{m.group(1)} ({m.group(2)})",
        out,
    )

    # 5. Normalize unordered list bullets (* or +) to `- ` before italic/bold parsing
    out = re.sub(r"^([ \t]*)[*+][ \t]+", r"\1- ", out, flags=re.MULTILINE)

    # 6. Convert horizontal rules to a clean separator
    out = re.sub(r"^[ \t]*([-*_]){3,}[ \t]*$", "---", out, flags=re.MULTILINE)

    # 7. Convert headings (`# Heading`) to bold placeholders
    def _replace_heading(match: re.Match[str]) -> str:
        heading = match.group(1).strip()
        heading = re.sub(r"\*\*(.+?)\*\*", r"\1", heading)
        heading = re.sub(r"__(.+?)__", r"\1", heading)
        return f"{_BOLD_OPEN}{heading}{_BOLD_CLOSE}"

    out = re.sub(r"^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$", _replace_heading, out, flags=re.MULTILINE)

    # 8. Convert bold (`**text**` and `__text__`) to temporary tokens so italic doesn't collide
    out = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", rf"{_BOLD_OPEN}\1{_BOLD_CLOSE}", out)
    out = re.sub(r"__(?=\S)(.+?)(?<=\S)__", rf"{_BOLD_OPEN}\1{_BOLD_CLOSE}", out)

    # 9. Convert italic (`*text*`) to WhatsApp italic (`_text_`)
    out = re.sub(r"(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)", r"_\1_", out)

    # 10. Restore bold tokens to WhatsApp bold (`*text*`)
    out = out.replace(_BOLD_OPEN, "*").replace(_BOLD_CLOSE, "*")

    # 11. Convert strikethrough (`~~text~~`) to WhatsApp strikethrough (`~text~`)
    out = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"~\1~", out)

    # 12. Restore stashed code blocks / inline code
    for idx, original in enumerate(placeholders):
        out = out.replace(f"\uE002CODE{idx}\uE003", original)

    # 13. Collapse excessive blank lines
    out = re.sub(r"\n{3,}", "\n\n", out)

    return out.strip()
