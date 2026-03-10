# Echo Integrations

App connectors for the EchoPrism `api_call` action. Each connector implements `execute(method, args, access_token)` and returns `{"ok": bool, ...}`.

## Connectors

- **slack.py** — Slack
- **gmail.py** — Gmail
- **github.py** — GitHub
- **google_sheets.py** — Google Sheets
- **google_calendar.py** — Google Calendar
- **notion.py** — Notion
- **linear.py** — Linear

## Usage

The `PlaywrightOperator` and `ApiCallOperator` in `echo_prism/subagents/runner/operator.py` route `api_call` steps to these connectors via `importlib.import_module(f"integrations.{integration}")`. Tokens are fetched from Firestore `users/{uid}/integrations/{integration}`.
