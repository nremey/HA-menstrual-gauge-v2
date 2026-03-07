# Publish TODO (HACS)

Dieser Ordner ist der aktuelle Publish-Clone:
`HomeAssistant/hacs_test/github_ready/ha-menstruation-gauge-clone-20260307`

## Was noch zu ergänzen ist

1. `custom_components/menstruation_gauge/manifest.json`
- Ergänzen: `codeowners`, `documentation`, optional `issue_tracker`, optional `loggers`.
- Warum: Nicht zwingend für HACS-Installation, aber Best Practice für Wartung/Support und bessere Qualität.

2. `README.md`
- Prüfen/ergänzen: Heatmap-Card (`menstruation-cycle-heatmap-card.js`) und neue Optionen dokumentieren (`cycle_alignment`, `symptom_entities`, `period_duration_days: learnt`).
- Warum: HACS-Nutzer brauchen korrekte Card-Konfiguration direkt aus der README.

3. Repository-Releases (GitHub)
- Nach Push: Tag + Release erstellen (z. B. `v1.0.1`).
- Warum: HACS kann Versionen sauber erkennen; Updates sind klar nachvollziehbar.

4. HACS-Eintrag (Nutzung)
- In HA: `HACS -> Custom repositories -> URL -> Kategorie: Integration`.
- Warum: Erst dann erscheint das Repo bei dir in HACS zur Installation.

5. HACS Default Store (optional)
- Falls allgemeine HACS-Suche gewünscht: PR an `hacs/default`.
- Warum: Nur so taucht das Repo für alle Nutzer in `Explore` ohne manuelles Custom-Repo auf.

## Optional bereinigen

6. `custom_components/menstruation_gauge/brands/*.PLACEHOLDER.txt`
- Entfernen, falls echte Assets final sind.
- Warum: Nur kosmetisch/Repo-Sauberkeit; funktional nicht kritisch.

7. Root-Duplikate
- Sicherstellen, dass nur der Integrationspfad gepflegt wird (`custom_components/...`).
- Warum: Vermeidet Versionsdrift zwischen Testdateien und eigentlicher HACS-Quelle.

## Bereits vorhanden (gut)
- `hacs.json`
- `custom_components/menstruation_gauge/manifest.json`
- `config_flow.py`, `services.yaml`, `translations`
- `www/menstruation-gauge-card.js`
- `www/menstruation-cycle-heatmap-card.js`
- `LICENSE`, `README.md`, Workflow-Datei
