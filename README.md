# HA Menstruation Gauge (HACS-ready)

Dieses Repository enthält:
- eine Home-Assistant-Integration `menstruation_gauge` mit mehreren Profilen/Sensoren
- Services zum Bearbeiten der Zyklusdaten
- eine Lovelace Custom Card für Visualisierung und Interaktion

## Zielstruktur (GitHub)

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
            └── menstruation-gauge-card.js
```

## Warum diese Struktur notwendig ist

1. `custom_components/menstruation_gauge/manifest.json`
- Pflicht für Home Assistant, damit die Integration als Domain geladen werden kann.
- Ohne `manifest.json` wird nichts initialisiert.

2. `hacs.json`
- Pflicht für eine saubere HACS-Erkennung als Custom-Integration.
- Ohne diese Datei kann HACS das Repo nicht zuverlässig klassifizieren.

3. `__init__.py`, `sensor.py`, `config_flow.py`
- `__init__.py` registriert Services und die statische Card-Datei.
- `sensor.py` liefert den Zustand und Attribute für die Card.
- `config_flow.py` macht die Einrichtung über UI möglich (kein manuelles YAML nötig).

4. `storage.py`
- Persistiert Historie/Settings in `.storage`.
- Ohne persistenten Speicher gehen Eingaben nach Neustart verloren.

5. `model.py`
- Trennt Berechnungslogik (Prognose/Fertilitätsfenster) von HA-Framework-Code.
- Erhöht Nachvollziehbarkeit und Wartbarkeit.

6. `www/menstruation-gauge-card.js`
- Lovelace kann nur JS-Ressourcen laden; die Karte ist deshalb als statische Datei nötig.
- Die Integration stellt die Datei unter `/menstruation_gauge/menstruation-gauge-card.js` bereit.

7. `services.yaml`
- Dokumentiert Services in der Home-Assistant-UI.
- Ohne diese Datei sind Services zwar nutzbar, aber in UI schlechter verständlich.

## Funktionale Bestandteile

### Sensor
- Entity-ID: pro Profil ein eigener Sensor (z. B. `sensor.anna`, abhängig vom Friendly Name/Entity Registry)
- State: `period`, `fertile`, `pms`, `neutral`
- Attribute (u. a.):
  - `history`
  - `next_predicted_start`
  - `fertile_window_start`
  - `fertile_window_end`
  - `days_until_next_start`
  - `period_duration_days`
  - `period_duration_default_days`
  - `period_duration_learned_avg_days`

### Services
- `menstruation_gauge.add_cycle_start`
- `menstruation_gauge.remove_cycle_start`
- `menstruation_gauge.set_cycle_history`
- `menstruation_gauge.set_period_duration`
- `menstruation_gauge.erase_all_history` (destruktiv, benötigt `erase_all: true`)
- `menstruation_gauge.export_history` (Export als `csv` oder `txt`)
- Bei mehreren Profilen/Sensoren: Ziel per `entity_id` (empfohlen) oder `profile`/`entry_id` angeben.

## Automation & Trigger Use (Assistiv)

Die Sensorwerte sind ausdrücklich dafür geeignet, unterstützende Automationen zu bauen, um PMS-bedingte Beschwerden im Alltag besser abzufedern.
Genau dafür ist diese Integration gedacht: persönliche Muster nutzbar machen, ohne medizinische Entscheidungen zu automatisieren.

Beispiele für sinnvolle, begleitende Automationen:
- zeitlich passende Erinnerungen an Hygieneartikel
- frühzeitige Besorgung von Medikamenten oder Hilfsmitteln
- Thermostat-/Raumklima-Anpassungen, wenn Frieren oder Hitzeattacken typisch sind
- Erinnerungen an Wasser, Ruhe, Schlafroutine, Wärmflasche, Meal-Prep

Wichtige Leitplanken:
- Unterstützen statt entscheiden: Keine sicherheitskritischen Entscheidungen nur aus diesem Sensor ableiten.
- Persönlich anpassen: Trigger nur verwenden, wenn sie zur eigenen Symptomatik passen.
- Einvernehmlichkeit beachten: Bei gemeinsam genutzten Haushalten nur mit gegenseitigem Einverständnis.

## Installation über HACS (Detailanleitung)

1. GitHub-Repository anlegen und diese Struktur committen.
- Grund: HACS installiert aus einem Git-Repo und erwartet die gezeigte Dateistruktur.

2. In HACS: `Custom repositories` öffnen und Repo-URL als `Integration` hinzufügen.
- Grund: Erst dadurch indexiert HACS dein eigenes Repo.

3. In HACS die Integration `Menstruation Gauge` installieren.
- Grund: Dateien landen dadurch korrekt unter `custom_components`.

4. Home Assistant neu starten.
- Grund: Neue Python-Integrationen werden erst nach Neustart importiert.

5. `Einstellungen -> Geräte & Dienste -> Integration hinzufügen -> Menstruation Gauge` je Profil wiederholen.
- Grund: Jeder Config Entry ist ein eigenes Profil (username/friendly name/icon optional) mit eigenem Sensor und eigenem Datenspeicher.

6. Lovelace-Ressource hinzufügen:
- URL: `/menstruation_gauge/menstruation-gauge-card.js`
- Typ: `JavaScript module`
- Grund: Ohne Resource kann Lovelace den Card-Typ nicht auflösen.

Hinweis:
- Die Integration versucht die Ressource bei Setup automatisch in Storage-Dashboards zu registrieren.
- Falls das wegen Core-Version oder Dashboard-Modus nicht möglich ist, bleibt die manuelle Anlage wie oben notwendig.

7. Karte im Dashboard einfügen:

```yaml
type: custom:menstruation-gauge-card
entity: sensor.anna
entry_id: ""   # optional, alternativ zu entity
friendly_name: "Anna"
title: "Cycle von Anna"
period_duration_days: 5
show_editor: true
theme_mode: auto
show_fertile_period: true
calendar_edit_enabled: true
```

- Grund: Die Card erwartet Sensorattribute des gewählten Profil-Sensors und ruft Services für Interaktion auf.

Hinweis zur Auswahl:
- Du kannst `entity` oder `entry_id` nutzen.
- Wenn beide gesetzt sind, hat `entity` Vorrang.
- In der Lovelace-UI gibt es jetzt einen visuellen Editor mit Suchfeld für Entity.

`theme_mode` Optionen:
- `auto`: folgt dem Home-Assistant Theme-Modus
- `light`: erzwingt helle Farbpalette
- `dark`: erzwingt dunkle Farbpalette

8. Optional: historische Daten importieren (Developer Tools -> Services):

```yaml
service: menstruation_gauge.set_cycle_history
data:
  entity_id: sensor.anna_zyklus
  dates:
    - "2026-01-14"
    - "2026-02-14"
```

- Grund: Erst mit Daten kann Prognose/Fenster sinnvoll berechnet werden.

Hinweis zur Periodenlogik:
- Mehrere aufeinanderfolgende Blutungstage werden als ein Block interpretiert.
- Für die Zyklusstart-Berechnung zählt nur der erste Tag eines Blocks.
- Die Periodendauer lernt aus historischen Blocklängen nur nach oben:
  wenn der langfristige Durchschnitt höher als dein Default ist, wird er verwendet;
  sonst bleibt dein Default aus `set_period_duration`.

9. Optional: komplette Historie sicher löschen (Developer Tools -> Services):

```yaml
service: menstruation_gauge.erase_all_history
data:
  entity_id: sensor.anna_zyklus
  erase_all: true
```

Template-Variante (bewusst mit explizitem true):

```yaml
service: menstruation_gauge.erase_all_history
data:
  entity_id: sensor.anna_zyklus
  erase_all: "{{ true }}"
```

- Grund: Der Service führt nur aus, wenn `erase_all` exakt `true` ist, um versehentliche Löschaktionen zu verhindern.
- Zusatzschutz: `entity_id` ist verpflichtend, damit ein Aufruf ohne konkretes Sensor-Ziel abgewiesen wird.
- Hinweis: Unterstützung zur Datenwiederherstellung nach Löschung kann nicht gegeben werden.

10. Optional: Historie lokal exportieren (Developer Tools -> Services):

CSV (Standard):

```yaml
service: menstruation_gauge.export_history
data:
  entity_id: sensor.anna_zyklus
  format: csv
  filename: "cycle_backup"
```

TXT:

```yaml
service: menstruation_gauge.export_history
data:
  entity_id: sensor.anna_zyklus
  format: txt
  filename: "cycle_backup_txt"
```

- Zielordner: `<config>/menstruation_gauge_exports/`
- Grund: So kannst du zyklische Backups lokal speichern und außerhalb von HA archivieren.

## Migration deiner vorhandenen Dateien

- `menstruation-gauge-card.js` wurde als Lovelace-Card übernommen.
- `menstruationdata.js` kann als Quelle dienen, indem du die Datumswerte einmalig per Service importierst.
- `menstruation-gauge.integration.js` war ein Frontend-Helfer; die Kernfunktion ist jetzt serverseitig als HA-Integration umgesetzt.

## Medizinischer Hinweis

Siehe [DISCLAIMER.md](./DISCLAIMER.md). Die Berechnung ist nur eine Näherung und nicht zur sicheren Verhütung geeignet.

## Usage Scope

This integration/card is intended for visual pattern recognition only.
It is not designed for reliable automation logic, medical decisions, contraception, or conception planning.
Use it as an optical aid, not as a safety-critical decision system.
