"""Google Sheets integration connector."""
import httpx

METHODS = {
    "read_range": {
        "description": "Read data from a spreadsheet range",
        "args": {"spreadsheet_id": "string", "range": "string (e.g. 'Sheet1!A1:D10')"},
    },
    "write_range": {
        "description": "Write data to a spreadsheet range",
        "args": {"spreadsheet_id": "string", "range": "string", "values": "array of arrays"},
    },
    "append_row": {
        "description": "Append a row to a spreadsheet",
        "args": {"spreadsheet_id": "string", "range": "string", "values": "array"},
    },
}

BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets"


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a Google Sheets API call."""
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        if method == "read_range":
            spreadsheet_id = args.get("spreadsheet_id", "")
            range_ = args.get("range", "Sheet1")
            resp = await client.get(
                f"{BASE_URL}/{spreadsheet_id}/values/{range_}",
                headers=headers,
            )
            data = resp.json()
            return {"ok": resp.status_code == 200, "values": data.get("values", []), "range": data.get("range")}

        elif method == "write_range":
            spreadsheet_id = args.get("spreadsheet_id", "")
            range_ = args.get("range", "Sheet1")
            values = args.get("values", [])
            resp = await client.put(
                f"{BASE_URL}/{spreadsheet_id}/values/{range_}",
                headers={**headers, "Content-Type": "application/json"},
                json={"values": values},
                params={"valueInputOption": "USER_ENTERED"},
            )
            return {"ok": resp.status_code == 200, "result": resp.json()}

        elif method == "append_row":
            spreadsheet_id = args.get("spreadsheet_id", "")
            range_ = args.get("range", "Sheet1")
            values = args.get("values", [])
            resp = await client.post(
                f"{BASE_URL}/{spreadsheet_id}/values/{range_}:append",
                headers={**headers, "Content-Type": "application/json"},
                json={"values": [values]},
                params={"valueInputOption": "USER_ENTERED", "insertDataOption": "INSERT_ROWS"},
            )
            return {"ok": resp.status_code == 200, "result": resp.json()}

        else:
            return {"ok": False, "error": f"Unknown method: {method}"}
