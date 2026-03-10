"""
Parse EchoPrism Action: <action>(<params>) output to operator-agnostic dict.

Supports multiple coordinate formats (adapted from UI-TARS ActionParserHelper):
  - Parentheses:   Click(500, 300) or Click(x=500, y=300)
  - Brackets:      click([500, 300]) or click([x1, y1, x2, y2])
  - XML point:     click(point='<point>500 300</point>')
  - XML bbox:      click(start_box='<bbox>100 200 300 400</bbox>')
  - UI-TARS tags:  click(start_box='<|box_start|>(500,300)<|box_end|>')
  - 4-value → center: (x1, y1, x2, y2) → center_x=(x1+x2)/2, center_y=(y1+y2)/2

Example: "Action: Click(500, 300)" -> {"action": "click", "x": 500, "y": 300}
Example: "Action: Click(5)"        -> {"action": "click", "element_id": 5}
"""

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Number of OmniParser-detected elements in current context.
# Set by agent.py before calling parse_action() so single-int Click/Hover/etc.
# can be disambiguated as element_id vs coordinate.
_omniparser_element_count: int = 0


def set_omniparser_element_count(count: int) -> None:
    """Set the current number of OmniParser-detected elements for disambiguation."""
    global _omniparser_element_count
    _omniparser_element_count = count


def _strip_markdown_code_fences(text: str) -> str:
    """Strip markdown code fences so models that wrap output in ``` can still be parsed."""
    s = text.strip()
    for pattern in (
        r"^```(?:[\w]*)\s*\n?(.*?)\n?```\s*$",
        r"^```\s*\n?(.*?)\n?```\s*$",
    ):
        m = re.search(pattern, s, re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return s


# ---------------------------------------------------------------------------
# Multi-format coordinate parsing (adapted from UI-TARS ActionParserHelper)
# ---------------------------------------------------------------------------

def _parse_coords_multi(s: str, count: int) -> list[int] | None:
    """
    Parse coordinates from multiple formats and return as int list.

    Supported formats (adapted from UI-TARS):
    1. <point>x y</point>                          → [x, y]
    2. <bbox>x1 y1 x2 y2</bbox>                    → [x1, y1, x2, y2]
    3. <|box_start|>(x, y)<|box_end|>               → [x, y]
    4. (x, y) or (x1, y1, x2, y2)                  → standard
    5. [x, y] or [x1, y1, x2, y2]                  → bracketed arrays
    6. Named params: x=500, y=300                   → [x, y]
    7. Plain comma/space-separated numbers           → fallback

    For 4-value results when count==2: computes center point.
    """
    if not s:
        return None

    nums: list[float] | None = None

    # Format 1: <point>x y</point>
    m = re.search(r"<point>\s*([\d.]+)\s+[\s,]*([\d.]+)\s*</point>", s)
    if m:
        nums = [float(m.group(1)), float(m.group(2))]

    # Format 2: <bbox>x1 y1 x2 y2</bbox>
    if nums is None:
        m = re.search(r"<bbox>\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*</bbox>", s)
        if m:
            nums = [float(m.group(i)) for i in range(1, 5)]

    # Format 3: <|box_start|>(x, y)<|box_end|> or <|box_start|>(x1, y1, x2, y2)<|box_end|>
    if nums is None:
        m = re.search(r"<\|box_start\|>\s*\(([^)]+)\)\s*<\|box_end\|>", s)
        if m:
            inner = m.group(1)
            parts = re.findall(r"-?\d+(?:\.\d+)?", inner)
            if parts:
                nums = [float(p) for p in parts]

    # Format 4 & 5: Parenthesized or bracketed — (x, y) or [x, y]
    if nums is None:
        m = re.search(r"[\(\[]\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)" +
                       r"(?:\s*[,\s]\s*(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?))?" +
                       r"\s*[\)\]]", s)
        if m:
            nums = [float(m.group(i)) for i in range(1, 5) if m.group(i) is not None]

    # Format 6: Named parameters — x=500, y=300
    if nums is None:
        named_x = re.search(r"\bx\s*=\s*(-?\d+(?:\.\d+)?)", s, re.IGNORECASE)
        named_y = re.search(r"\by\s*=\s*(-?\d+(?:\.\d+)?)", s, re.IGNORECASE)
        if named_x and named_y:
            nums = [float(named_x.group(1)), float(named_y.group(1))]
            # Also look for x2, y2 for drag
            named_x2 = re.search(r"\bx2\s*=\s*(-?\d+(?:\.\d+)?)", s, re.IGNORECASE)
            named_y2 = re.search(r"\by2\s*=\s*(-?\d+(?:\.\d+)?)", s, re.IGNORECASE)
            if named_x2 and named_y2:
                nums.extend([float(named_x2.group(1)), float(named_y2.group(1))])

    # Format 7: Plain numbers fallback
    if nums is None:
        parts = re.findall(r"-?\d+(?:\.\d+)?", s)
        if len(parts) >= count:
            nums = [float(p) for p in parts]

    if nums is None or len(nums) < count:
        # If we need 2 coords but got 4, convert bbox to center point
        if nums and len(nums) >= 4 and count == 2:
            cx = (nums[0] + nums[2]) / 2
            cy = (nums[1] + nums[3]) / 2
            return [int(round(cx)), int(round(cy))]
        return None

    # 4-value input when only 2 needed → compute center (UI-TARS bounding box pattern)
    if count == 2 and len(nums) >= 4:
        cx = (nums[0] + nums[2]) / 2
        cy = (nums[1] + nums[3]) / 2
        return [int(round(cx)), int(round(cy))]

    return [int(round(n)) for n in nums[:count]]


def parse_action(text: str) -> dict[str, Any] | None:
    """
    Extract Action: <action>(<params>) from model output.
    Returns operator-agnostic dict like {action: "click", x: 100, y: 200}.

    Scans line-by-line and returns the FIRST valid Action: line to avoid
    false matches on multi-line model output.
    Handles markdown code fences and Thought/Action in any order.

    Supports multiple coordinate formats: (x,y), [x,y], <point>, <bbox>,
    <|box_start|>...<|box_end|>, named params. 4-value bboxes are auto-converted
    to center points for click/hover/etc.
    """
    if not text or not isinstance(text, str):
        return None

    text = _strip_markdown_code_fences(text)

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
    m = re.search(
        r"(?:Action):\s*(\w+)\s*\((.*?)\)\s*\.?$",
        action_line,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        m = re.search(r"(?:Action):\s*(\w+)\s*\((.*?)\)", action_line, re.IGNORECASE)
    if not m:
        return None

    name = m.group(1).strip().lower()
    args_str = m.group(2).strip()

    result: dict[str, Any] = {"action": name}

    if name == "click":
        coords = _parse_coords_multi(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
        else:
            eid = _parse_element_id(args_str)
            if eid is not None:
                result["element_id"] = eid
    elif name == "rightclick":
        coords = _parse_coords_multi(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
        else:
            eid = _parse_element_id(args_str)
            if eid is not None:
                result["element_id"] = eid
    elif name == "doubleclick":
        coords = _parse_coords_multi(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
        else:
            eid = _parse_element_id(args_str)
            if eid is not None:
                result["element_id"] = eid
    elif name == "drag":
        # Try named params first (start_box / end_box from UI-TARS format)
        start_m = re.search(r"start_box\s*=\s*['\"]?(.+?)['\"]?\s*(?:,\s*end_box|$)", args_str, re.IGNORECASE)
        end_m = re.search(r"end_box\s*=\s*['\"]?(.+?)['\"]?\s*(?:\)|$)", args_str, re.IGNORECASE)
        if start_m and end_m:
            start_coords = _parse_coords_multi(start_m.group(1), 2)
            end_coords = _parse_coords_multi(end_m.group(1), 2)
            if start_coords and end_coords:
                result["x1"], result["y1"] = start_coords
                result["x2"], result["y2"] = end_coords
        if "x1" not in result:
            # Try start_point / end_point format
            sp_m = re.search(r"start_point\s*=\s*['\"]?(.+?)['\"]?\s*(?:,\s*end_point|$)", args_str, re.IGNORECASE)
            ep_m = re.search(r"end_point\s*=\s*['\"]?(.+?)['\"]?\s*(?:\)|$)", args_str, re.IGNORECASE)
            if sp_m and ep_m:
                start_coords = _parse_coords_multi(sp_m.group(1), 2)
                end_coords = _parse_coords_multi(ep_m.group(1), 2)
                if start_coords and end_coords:
                    result["x1"], result["y1"] = start_coords
                    result["x2"], result["y2"] = end_coords
        if "x1" not in result:
            coords = _parse_coords_multi(args_str, 4)
            if coords:
                result["x1"], result["y1"], result["x2"], result["y2"] = coords
    elif name == "scroll":
        # Support both positional and named-arg forms
        # Named: Scroll(x=400, y=600, direction="down", distance=300)
        named_x = re.search(r"\bx\s*=\s*(-?\d+)", args_str, re.IGNORECASE)
        named_y = re.search(r"\by\s*=\s*(-?\d+)", args_str, re.IGNORECASE)
        named_dir = re.search(
            r'\bdirection\s*=\s*["\']?(\w+)["\']?', args_str, re.IGNORECASE
        )
        named_dist = re.search(r"\bdistance\s*=\s*(-?\d+)", args_str, re.IGNORECASE)
        if named_x and named_y:
            result["x"] = int(named_x.group(1))
            result["y"] = int(named_y.group(1))
            result["direction"] = named_dir.group(1).lower() if named_dir else "down"
            if named_dist:
                result["distance"] = int(named_dist.group(1))
        else:
            # Check for <point> format first
            point_coords = _parse_coords_multi(args_str.split(",")[0] if "," in args_str else args_str, 2)
            parts = [p.strip().strip("\"'") for p in args_str.split(",")]
            if len(parts) >= 3:
                try:
                    result["x"] = int(float(parts[0]))
                    result["y"] = int(float(parts[1]))
                    result["direction"] = parts[2].lower()
                    if len(parts) >= 4:
                        result["distance"] = int(float(parts[3]))
                except (ValueError, IndexError):
                    pass
    elif name == "type":
        # Support content='...' named param (UI-TARS format)
        content_m = re.search(r"content\s*=\s*['\"](.+?)['\"]", args_str, re.IGNORECASE)
        if content_m:
            result["content"] = content_m.group(1)
        else:
            content = (
                _extract_quoted(args_str)
                if (args_str.startswith('"') or args_str.startswith("'"))
                else args_str
            )
            result["content"] = content or args_str
    elif name == "hotkey":
        # Hotkey("cmd", "c") or Hotkey("ctrl", "shift", "t") or hotkey(key='ctrl c')
        key_m = re.search(r"key\s*=\s*['\"](.+?)['\"]", args_str, re.IGNORECASE)
        if key_m:
            keys = [k.strip().lower() for k in key_m.group(1).split() if k.strip()]
        else:
            keys = [
                p.strip().strip("\"'").lower() for p in args_str.split(",") if p.strip()
            ]
        result["keys"] = keys
    elif name == "wait":
        result["seconds"] = 1
        try:
            n = int(float(args_str.strip()))
            result["seconds"] = max(1, min(n, 30))
        except (ValueError, TypeError):
            pass
    elif name == "presskey" or name == "press":
        key = (
            _extract_quoted(args_str)
            if (args_str.startswith('"') or args_str.startswith("'"))
            else args_str.strip()
        )
        result["action"] = "presskey"
        result["key"] = key or "enter"
    elif name == "navigate" or name == "navigate_back":
        if name == "navigate_back":
            result["action"] = "navigate"
            result["url"] = "javascript:history.back()"
        else:
            url = (
                _extract_quoted(args_str)
                if (args_str.startswith('"') or args_str.startswith("'"))
                else args_str.strip()
            )
            if not url:
                return None  # Empty URL is not valid
            result["url"] = url
    elif name == "selectoption":
        parts = [p.strip().strip("\"'") for p in args_str.split(",")]
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
    elif name == "hover" or name == "mouse_move":
        result["action"] = "hover"
        coords = _parse_coords_multi(args_str, 2)
        if coords:
            result["x"], result["y"] = coords[0], coords[1]
        else:
            eid = _parse_element_id(args_str)
            if eid is not None:
                result["element_id"] = eid
    elif name == "waitforelement":
        desc = (
            _extract_quoted(args_str)
            if (args_str.startswith('"') or args_str.startswith("'"))
            else args_str.strip()
        )
        result["description"] = desc
        result["selector"] = (
            "body"  # fallback visual wait — operator uses this if needed
        )
    elif name in ("openapp", "focusapp"):
        app_name = (
            _extract_quoted(args_str)
            if (args_str.startswith('"') or args_str.startswith("'"))
            else args_str.strip()
        )
        result["appName"] = app_name
    elif name in ("finished", "calluser", "call_user"):
        result["action"] = "finished" if name == "finished" else "calluser"
        reason = (
            _extract_quoted(args_str)
            if (args_str.startswith('"') or args_str.startswith("'"))
            else args_str.strip()
        )
        if reason:
            result["reason"] = reason
    # else: unknown action — return result with just action name

    if result.get("action"):
        logger.info("Parsed action: %s (from: %s)", result, action_line[:120])
    return result if result.get("action") else None


def extract_thought(text: str) -> str:
    """
    Extract the Thought (or Reflection / Action_Summary) from model output.
    Scans line-by-line so it correctly finds the first Thought: line.
    Handles markdown code fences and Thought/Action in any order.
    """
    text = _strip_markdown_code_fences(text)
    for line in text.splitlines():
        stripped = line.strip()
        for prefix in ("Thought:", "Reflection:", "Action_Summary:"):
            if stripped.lower().startswith(prefix.lower()):
                return stripped[len(prefix) :].strip()
    # Fallback: regex over full text
    m = re.search(
        r"(?:Thought|Reflection|Action_Summary):\s*(.+?)(?=\nAction:|$)",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    return m.group(1).strip() if m else ""


def _parse_coords(s: str, count: int) -> list[int] | None:
    """Legacy: parse comma-separated floats for coordinates. Use _parse_coords_multi instead."""
    return _parse_coords_multi(s, count)


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


def _parse_element_id(s: str) -> int | None:
    """
    Parse a single integer as an OmniParser element ID.
    Only returns a value if:
    - There is exactly one integer in the string
    - _omniparser_element_count > 0 (OmniParser is active)
    - The integer is within the valid element range
    """
    if _omniparser_element_count <= 0:
        return None
    parts = re.findall(r"-?\d+", s.strip())
    if len(parts) != 1:
        return None
    try:
        eid = int(parts[0])
        if 0 <= eid < _omniparser_element_count:
            return eid
    except (ValueError, TypeError):
        pass
    return None
