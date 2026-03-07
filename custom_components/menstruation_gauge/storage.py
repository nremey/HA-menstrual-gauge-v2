"""Storage helpers for menstruation gauge."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION


class MenstruationStorage:
    """Persist and load cycle history + settings."""

    def __init__(self, hass: HomeAssistant, key: str, legacy_key: str | None = None) -> None:
        self._store = Store(hass, STORAGE_VERSION, key)
        self._legacy_store = Store(hass, STORAGE_VERSION, legacy_key) if legacy_key else None

    async def async_load(self) -> dict:
        """Load data from storage."""
        data = await self._store.async_load()
        if not isinstance(data, dict) and self._legacy_store is not None:
            legacy_data = await self._legacy_store.async_load()
            if isinstance(legacy_data, dict):
                data = legacy_data

        if not isinstance(data, dict):
            return {"history": [], "period_duration_days": 5}

        history = data.get("history", [])
        if not isinstance(history, list):
            history = []

        normalized = sorted({self._normalize_iso(raw) for raw in history if self._normalize_iso(raw)})
        days = data.get("period_duration_days", 5)
        try:
            days = int(days)
        except (TypeError, ValueError):
            days = 5
        days = max(1, min(14, days))

        return {"history": normalized, "period_duration_days": days}

    async def async_save(self, history: Iterable[str], period_duration_days: int) -> None:
        """Save data to storage."""
        normalized = sorted({self._normalize_iso(raw) for raw in history if self._normalize_iso(raw)})
        days = max(1, min(14, int(period_duration_days)))
        await self._store.async_save({"history": normalized, "period_duration_days": days})

    @staticmethod
    def _normalize_iso(value: str) -> str | None:
        try:
            return date.fromisoformat(str(value)).isoformat()
        except ValueError:
            return None
