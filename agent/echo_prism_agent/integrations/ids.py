"""Canonical integration id helpers (Firestore keys, toolkit names)."""


def normalize_integration_id(integration_id: str) -> str:
    return (integration_id or "").strip().lower()
