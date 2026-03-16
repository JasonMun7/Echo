"""
Room-scoped resolved user from SIP phone lookup.

When a SIP caller is identified (sip.phoneNumber), the entrypoint can look up
the user by phone and store uid here so tools use the correct user instead of
participant.identity (which is SIP-specific).
"""
# Room name -> resolved uid / displayName (set by main.py after phone lookup)
_resolved_uid_by_room: dict[str, str] = {}
_resolved_display_name_by_room: dict[str, str] = {}


def set_resolved_user(room_name: str, uid: str, display_name: str = "") -> None:
    """Store the resolved user for this room (from phone lookup)."""
    _resolved_uid_by_room[room_name] = uid
    if display_name:
        _resolved_display_name_by_room[room_name] = display_name


def get_resolved_uid(room_name: str) -> str | None:
    """Return the resolved uid for this room if set, else None."""
    return _resolved_uid_by_room.get(room_name)


def get_resolved_display_name(room_name: str) -> str | None:
    """Return the resolved display name for this room if set, else None."""
    return _resolved_display_name_by_room.get(room_name)


def clear_resolved_user(room_name: str) -> None:
    """Clear resolved user for this room so the next call with the same room name is fresh."""
    _resolved_uid_by_room.pop(room_name, None)
    _resolved_display_name_by_room.pop(room_name, None)
