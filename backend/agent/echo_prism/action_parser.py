"""
Parse EchoPrism Action: <action>(<params>) output to operator-agnostic dict.
Example: "Action: Click(500, 300)" -> {"action": "click", "x": 500, "y": 300}
"""
import re
from typing import Any


def parse_action(text: str) -> dict[str, Any] | None:
    """
    Extract Action: <action>(<params>) from model output.
    Returns operator-agnostic dict like {action: "click", x: 100, y: 200}.

    Scans line-by-line and returns the FIRST valid Action: line to avoid
    false matches on multi-line model output.
    """
    if not text or not isinstance(text, str):
        return None

    # First: extract the "Action:" line by scanning line-by-line
    action_line = None
    for line in text.splitlines():
        stripped = line.strip()
        if re.match(r"^(Action|action):", stripped):
            action_line = stripped
            break

    if not action_line:
        return None

    # Match ActionName(...) from the action line
    m = re.search(r"(?:Action):\s*(\w+)\s*\((.*?)\)\s*\.?$", action_line, re.IGNORECASE | re.DOTALL)
    if not m:
        m = re.search(r"(?:Action):\s*(\w+)\s*\((.*?)\)", action_line, re.IGNORECASE)
    if not m:
        return None

    name = m.group(1).strip().lower()
    args_str = m.group(2).strip()

    result: dict[str, Any] = {"action": name}

    if name == "click":
        coords = _parse_coords(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
    elif name == "rightclick":
        coords = _parse_coords(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
    elif name == "doubleclick":
        coords = _parse_coords(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
    elif name == "drag":
        coords = _parse_coords(args_str, 4)
        if coords:
            result["x1"], result["y1"], result["x2"], result["y2"] = coords
    elif name == "scroll":
        # Support both positional and named-arg forms
        # Named: Scroll(x=400, y=600, direction="down", distance=300)
        named_x = re.search(r"\bx\s*=\s*(-?\d+)", args_str, re.IGNORECASE)
        named_y = re.search(r"\by\s*=\s*(-?\d+)", args_str, re.IGNORECASE)
        named_dir = re.search(r'\bdirection\s*=\s*["\']?(\w+)["\']?', args_str, re.IGNORECASE)
        named_dist = re.search(r'\bdistance\s*=\s*(-?\d+)', args_str, re.IGNORECASE)
        if named_x and named_y:
            result["x"] = int(named_x.group(1))
            result["y"] = int(named_y.group(1))
            result["direction"] = named_dir.group(1).lower() if named_dir else "down"
            if named_dist:
                result["distance"] = int(named_dist.group(1))
        else:
            parts = [p.strip().strip('"\'') for p in args_str.split(",")]
            if len(parts) >= 3:
                try:
                    result["x"] = int(parts[0])
                    result["y"] = int(parts[1])
                    result["direction"] = parts[2].lower()
                    if len(parts) >= 4:
                        result["distance"] = int(parts[3])
                except (ValueError, IndexError):
                    pass
    elif name == "type":
        # Strip outer quotes LAST, after checking for quoted content
        content = _extract_quoted(args_str) if (args_str.startswith('"') or args_str.startswith("'")) else args_str
        result["content"] = content or args_str
    elif name == "hotkey":
        # Hotkey("cmd", "c") or Hotkey("ctrl", "shift", "t")
        keys = [p.strip().strip('"\'').lower() for p in args_str.split(",") if p.strip()]
        result["keys"] = keys
    elif name == "wait":
        result["seconds"] = 1
        try:
            n = int(float(args_str.strip()))
            result["seconds"] = max(1, min(n, 30))
        except (ValueError, TypeError):
            pass
    elif name == "presskey":
        key = _extract_quoted(args_str) if (args_str.startswith('"') or args_str.startswith("'")) else args_str.strip()
        result["key"] = key or "enter"
    elif name == "navigate":
        url = _extract_quoted(args_str) if (args_str.startswith('"') or args_str.startswith("'")) else args_str.strip()
        if not url:
            return None  # Empty URL is not valid
        result["url"] = url
    elif name == "selectoption":
        parts = [p.strip().strip('"\'') for p in args_str.split(",")]
        if len(parts) >= 3:
            # Positional with coords: SelectOption(x, y, value)
            try:
                result["x"] = int(parts[0])
                result["y"] = int(parts[1])
                result["value"] = parts[2]
            except (ValueError, IndexError):
                pass
        elif len(parts) >= 2:
            result["selector"] = parts[0]
            result["value"] = parts[1]
    elif name == "hover":
        coords = _parse_coords(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
    elif name == "waitforelement":
        desc = _extract_quoted(args_str) if (args_str.startswith('"') or args_str.startswith("'")) else args_str.strip()
        result["description"] = desc
        result["selector"] = "body"  # fallback visual wait — operator uses this if needed
    elif name in ("openapp", "focusapp"):
        app_name = _extract_quoted(args_str) if (args_str.startswith('"') or args_str.startswith("'")) else args_str.strip()
        result["appName"] = app_name
    elif name in ("finished", "calluser"):
        # Extract optional reason from string arg
        reason = _extract_quoted(args_str) if (args_str.startswith('"') or args_str.startswith("'")) else args_str.strip()
        if reason:
            result["reason"] = reason
    # else: unknown action — return result with just action name

    return result if result.get("action") else None


def extract_thought(text: str) -> str:
    """
    Extract the Thought (or Reflection / Action_Summary) from model output.
    Scans line-by-line so it correctly finds the first Thought: line.
    """
    for line in text.splitlines():
        stripped = line.strip()
        for prefix in ("Thought:", "Reflection:", "Action_Summary:"):
            if stripped.lower().startswith(prefix.lower()):
                return stripped[len(prefix):].strip()
    # Fallback: regex over full text
    m = re.search(
        r"(?:Thought|Reflection|Action_Summary):\s*(.+?)(?=\nAction:|$)",
        text, re.IGNORECASE | re.DOTALL,
    )
    return m.group(1).strip() if m else ""


def _parse_coords(s: str, count: int) -> list[int] | None:
    """Parse comma-separated floats for coordinates and round to int."""
    parts = re.findall(r"-?\d+(?:\.\d+)?", s)
    if len(parts) >= count:
        try:
            return [int(round(float(p))) for p in parts[:count]]
        except (ValueError, TypeError):
            pass
    return None


def _extract_quoted(s: str) -> str:
    """Extract content from quoted string, handling escaped quotes globally."""
    if len(s) < 2:
        return s
    quote = s[0]
    if quote not in ('"', "'"):
        return s
    end = s.rfind(quote)
    if end > 0:
        inner = s[1:end]
        # Replace all escaped quotes globally
        return re.sub(r"\\" + quote, quote, inner)
    return s[1:]
