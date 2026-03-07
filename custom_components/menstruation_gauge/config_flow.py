"""Config flow for menstruation gauge."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult
from homeassistant.util import slugify

from .const import (
    CONF_FRIENDLY_NAME,
    CONF_ICON,
    CONF_PROFILE,
    DEFAULT_NAME,
    DOMAIN,
)


class MenstruationGaugeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for menstruation gauge."""

    VERSION = 2

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Handle first step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            profile = slugify(str(user_input[CONF_PROFILE])).strip("_")
            if not profile:
                errors[CONF_PROFILE] = "invalid_profile"
            else:
                await self.async_set_unique_id(profile)
                self._abort_if_unique_id_configured()
                friendly_name = str(user_input[CONF_FRIENDLY_NAME]).strip() or DEFAULT_NAME
                icon = str(user_input.get(CONF_ICON, "")).strip()
                data = {
                    CONF_PROFILE: profile,
                    CONF_FRIENDLY_NAME: friendly_name,
                    CONF_ICON: icon,
                }
                return self.async_create_entry(
                    title=friendly_name,
                    data=data,
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_PROFILE): str,
                vol.Required(CONF_FRIENDLY_NAME, default=DEFAULT_NAME): str,
                vol.Optional(CONF_ICON, default=""): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
