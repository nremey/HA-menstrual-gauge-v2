## AI was used
AI (Codex) was used to help translate my own developed code from HTML/JavaScript to Python and YAML, and to help organize the Home Assistant repository for github.
AI also generated or improved some shell commands (mainly to save time).
The core idea and design were created by me (a human).
Text was drafted with AI support (mostly translation and structure), because English is not my native language and health-related wording is sensitive.

# HA Menstruation Gauge (HACS-ready) - development stage - testing only

This repository contains:
- a Home Assistant integration `menstruation_gauge` with multiple profiles/sensors
- services for cycle data management
- Lovelace custom cards for visualization and interaction



# How to setup:
- Open HACS, add Custom repositories: git: /nremey/HA-repo-test-menstrual-gauge
- add in integration and services new integration, search for menstruation gauge
- add user/friendly name and icon.
    -may add more users if more bleeding persons are in the household.

- Add the customcards under `Settings -> Devices & Services` (...)-Menu "Add ressouces
    - `/menstruation_gauge/menstruation-gauge-card.js`
    - `/menstruation_gauge/menstruation-cycle-heatmap-card.js`
    - each of Type: `JavaScript module`
    - //mental note: it is correct: ignore of www subfolder within actual folder structure

- restart HA and clear the cache

- ready to add the custom card per user: with the menstruation-gauge

Sorry, so many steps because of 2 parts: A) Integration + B) custom cards;

<img width="1016" height="431" alt="grafik" src="https://github.com/user-attachments/assets/6c516de7-4b1e-4c1c-aa3d-2e9d753a8987" />




## Target Structure (GitHub)

```text
HA_menstruation_gauge/
├── hacs.json
├── README.md
├── DISCLAIMER.md
└── custom_components/
    └── menstruation_gauge/
        ├── __init__.py
        ├── config_flow.py
        ├── const.py
        ├── manifest.json
        ├── model.py
        ├── sensor.py
        ├── services.yaml
        ├── storage.py
        ├── strings.json
        ├── translations/
        │   ├── de.json
        │   └── en.json
        └── www/
            ├── menstruation-gauge-card.js
            └── menstruation-cycle-heatmap-card.js
```

<img width="1007" height="652" alt="menstruation-gauge-card.js" src="https://github.com/user-attachments/assets/0268362b-2b66-49ad-84bc-9879d40c280c" />


## Why This Structure Is Required - Notes to myself to understand HACS requirements better.

1. `custom_components/menstruation_gauge/manifest.json`
- Required by Home Assistant so the integration domain can load.
- Without `manifest.json`, initialization fails.

2. `hacs.json`
- Required for proper HACS detection as a custom integration.
- Without it, HACS cannot reliably classify the repository.

3. `__init__.py`, `sensor.py`, `config_flow.py`
- `__init__.py` registers services and static card resources.
- `sensor.py` exposes state + attributes used by cards and automations.
- `config_flow.py` enables UI setup (no manual YAML integration setup required).

4. `storage.py`
- Persists history/settings in `.storage`.
- Without persistent storage, entered data is lost on restart.

5. `model.py`
- Keeps cycle calculation logic separated from HA framework code.
- Improves maintainability and traceability.

6. `www/*.js`
- Lovelace cards are JavaScript resources.
- Integration serves these files under `/menstruation_gauge/...`.

7. `services.yaml`
- Documents services in Home Assistant UI.
- Without it, services still work but are less discoverable.

## Functional Components

### Sensor
- Entity ID: one sensor per profile (e.g. `sensor.anna`, depending on entity registry)
- States: `period`, `fertile`, `pms`, `neutral`
- Attributes include:
  - `history`
  - `grouped_starts`
  - `bleeding_blocks`
  - `next_predicted_start`
  - `fertile_window_start`
  - `fertile_window_end`
  - `days_until_next_start` (can be negative when overdue)
  - `period_duration_days`
  - `period_duration_default_days`
  - `period_duration_learned_avg_days`

### Services
- `menstruation_gauge.add_cycle_start`
- `menstruation_gauge.remove_cycle_start`
- `menstruation_gauge.set_cycle_history`
- `menstruation_gauge.set_period_duration`
- `menstruation_gauge.erase_all_history` (destructive, requires `erase_all: true` and explicit `entity_id`)
- `menstruation_gauge.export_history` (export as `csv` or `txt`)

For multi-profile setups, target by `entity_id` (recommended).

## Automation & Trigger Use (Assistive)

Sensor values can be used for assistive automations to make recurring PMS-related situations easier to handle.
This integration is intended to make personal patterns usable in practical, non-critical automations.

Examples:
- timed reminders for hygiene products
- proactive medication/supply reminders
- thermostat/room-climate adjustments for known freezing or heat episodes
- reminders for hydration, sleep routine, rest, meal prep, etc.

Guardrails:
- Assist, do not decide: do not use this as the sole source for safety-critical decisions.
- Personalize: use triggers only when they match your own symptom patterns.
- Mutual consent: in shared households, use automations only with explicit mutual agreement.

## step without HACS (manually) - tested , works so-so (additional steps are annoing)
- copy the folder menstruation_gauge from "git: /nremey/HA-repo-test-menstrual-gauge to /config/custom_components in HA.
- Add the customcards under `Settings -> Devices & Services` (...)-Menu "Add ressouces
(repeat per profile if needed).
    - `/menstruation_gauge/menstruation-gauge-card.js`
    - `/menstruation_gauge/menstruation-cycle-heatmap-card.js`
- Type: `JavaScript module`

//mental note: ignore of www subfolder within actual folder structure
  
- restart HA
- clear cache
- Go to devices & integration -> "Menstruation cauge" add a sensor per user.
- add a card: custom:menstruation-cycle-heatmap-card setup and add Menstruation days (its an click-interactive card, if allow new entries through calender is true)
- if at least one cycle is added, maybe display menstrual-cycle-data with: custom:menstruation-cycle-heatmap-card (not interactive so far)



## Installation via HACS

1. Create a GitHub repository with this structure.
2. In HACS, add the repo URL under `Custom repositories` as `Integration`.
3. Install `Menstruation Gauge` in HACS.
4. Restart Home Assistant.
5. Add the integration under `Settings -> Devices & Services` (repeat per profile if needed).
- `/menstruation_gauge/menstruation-gauge-card.js`
- `/menstruation_gauge/menstruation-cycle-heatmap-card.js`

## Lovelace Resource

Add JS resources (if not auto-registered):
- `/menstruation_gauge/menstruation-gauge-card.js`
- `/menstruation_gauge/menstruation-cycle-heatmap-card.js`

Type: `JavaScript module`

## Card Configuration Examples

### Gauge Card

```yaml
type: custom:menstruation-gauge-card
entity: sensor.anna
friendly_name: "Anna"
title: "Cycle of Anna"
period_duration_days: learnt  # or 1..14
show_editor: true
theme_mode: auto
show_fertile_period: true
calendar_edit_enabled: true
```

`period_duration_days` supports:
- number `1..14`
- `learnt` (fallbacks to sensor values if learned value is unavailable)

### Heatmap Card - little hint for the future:

<img width="1000" height="592" alt="menstruation-cycle-heatmap-card.js" src="https://github.com/user-attachments/assets/9b5759bd-f343-4640-b7cb-f79e4c6b0847" />

A future goal is to integrate tracked PMS-Symptoms (idea is there, but development has not started) within this card and make ist easy to visually spot pattern. And use this to may build automations around it. (like little Icons for Sympton on the accured day. (🤮 for vomitting, 🔥 for heat attack,  🥶 for freezing, and others; i hope yout get the idea what to expect)
some symptom may accure around the same span of days after ther cycle start or towards the end. By alligning the cycle top or bottom, it gets easier to spot.
Use wisely.

```yaml
type: custom:menstruation-cycle-heatmap-card
entity: sensor.anna
title: "Cycle Heatmap"
max_cycles: 18
period_duration_days: 5
show_fertile_period: true
cycle_alignment: bottom  # top | bottom
symptom_entities:
  - entity: sensor.anna_pms_nausea
    name: Nausea
    icon: mdi:emoticon-sick-outline
```
Sidenote: The part around "symptom_entities" ist just an example how it could be added, not developd yet. Open to change.

## History Import Example

```yaml
service: menstruation_gauge.set_cycle_history
data:
  entity_id: sensor.anna
  dates:
    - "2026-01-14"
    - "2026-02-14"
```

## Safe History Deletion Example

```yaml
service: menstruation_gauge.erase_all_history
data:
  entity_id: sensor.anna
  erase_all: true
```

Notes:
- Requires `erase_all: true`.
- Requires explicit `entity_id` as additional safety barrier.
- Data recovery support after deletion cannot be provided.

## Export Example

```yaml
service: menstruation_gauge.export_history
data:
  entity_id: sensor.anna
  format: csv
  filename: cycle_backup
```

Target directory: `<config>/menstruation_gauge_exports/` 
- status: tested in browser (works), not tested yet within HA Companion app (needed to be checked).

## Medical and Safety Notice

See [DISCLAIMER.md](./DISCLAIMER.md).
This integration is an approximation and is not suitable as a reliable standalone method for contraception or conception planning.


## Usage Scope

This integration/cards is intended for visual pattern recognition only.
It is not designed for reliable automation logic, medical decisions, contraception, or conception planning.
Use it as an optical aid, not as a safety-critical decision system.


## New/Improved/Fixed
1. Improved: sensors for multiple persons can be created within the integration.
2. Not yet an issue, but likely relevant for future goals: naming conventions.
3. Added from suggestion: new dark theme option.
4. Fixed: title visibility within the card.
5. New: GUI editor for the custom gauge card.
6. New: heatmap card for long-term visualization.


Theme-examples:
<img width="494" height="779" alt="light-theme" src="https://github.com/user-attachments/assets/1ab5a772-8bcb-4936-aacf-fe19266a6a31" />
<img width="494" height="779" alt="dark-theme" src="https://github.com/user-attachments/assets/850b9750-fd2f-48fc-80b7-90cd182b4fe0" />


