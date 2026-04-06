"""Linear integration connector (GraphQL API)."""
import httpx

METHODS = {
    "create_issue": {
        "description": "Create a new Linear issue",
        "args": {"team_id": "string", "title": "string", "description": "string (optional)", "priority": "integer 0-4 (optional)"},
    },
    "list_issues": {
        "description": "List issues assigned to the user",
        "args": {"team_id": "string (optional)", "state": "string (optional)"},
    },
    "update_issue": {
        "description": "Update a Linear issue status or title",
        "args": {"issue_id": "string", "state_id": "string (optional)", "title": "string (optional)"},
    },
}

BASE_URL = "https://api.linear.app/graphql"


async def _gql(query: str, variables: dict, token: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            BASE_URL,
            headers={"Authorization": token, "Content-Type": "application/json"},
            json={"query": query, "variables": variables},
        )
        return resp.json()


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a Linear API call."""
    if method == "create_issue":
        query = """
        mutation CreateIssue($teamId: String!, $title: String!, $description: String, $priority: Int) {
            issueCreate(input: {teamId: $teamId, title: $title, description: $description, priority: $priority}) {
                success
                issue { id identifier url }
            }
        }
        """
        result = await _gql(query, {
            "teamId": args.get("team_id", ""),
            "title": args.get("title", ""),
            "description": args.get("description"),
            "priority": args.get("priority"),
        }, token)
        issue_data = result.get("data", {}).get("issueCreate", {})
        issue = issue_data.get("issue", {})
        return {"ok": issue_data.get("success", False), "issue_id": issue.get("id"), "identifier": issue.get("identifier"), "url": issue.get("url")}

    elif method == "list_issues":
        query = """
        query ListIssues($teamId: String) {
            issues(filter: {team: {id: {eq: $teamId}}}, first: 20) {
                nodes { id identifier title state { name } }
            }
        }
        """
        result = await _gql(query, {"teamId": args.get("team_id")}, token)
        issues = result.get("data", {}).get("issues", {}).get("nodes", [])
        return {"ok": True, "issues": [{"id": i["id"], "identifier": i["identifier"], "title": i["title"], "state": i.get("state", {}).get("name")} for i in issues]}

    elif method == "update_issue":
        query = """
        mutation UpdateIssue($issueId: String!, $stateId: String, $title: String) {
            issueUpdate(id: $issueId, input: {stateId: $stateId, title: $title}) {
                success
                issue { id identifier }
            }
        }
        """
        result = await _gql(query, {
            "issueId": args.get("issue_id", ""),
            "stateId": args.get("state_id"),
            "title": args.get("title"),
        }, token)
        return {"ok": result.get("data", {}).get("issueUpdate", {}).get("success", False)}

    else:
        return {"ok": False, "error": f"Unknown method: {method}"}
