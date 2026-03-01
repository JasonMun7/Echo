"""GitHub integration connector."""
import httpx

METHODS = {
    "create_issue": {
        "description": "Create a new GitHub issue",
        "args": {"owner": "string", "repo": "string", "title": "string", "body": "string (optional)", "labels": "array (optional)"},
    },
    "list_issues": {
        "description": "List open issues in a repository",
        "args": {"owner": "string", "repo": "string", "state": "string (open/closed/all)"},
    },
    "list_prs": {
        "description": "List pull requests in a repository",
        "args": {"owner": "string", "repo": "string", "state": "string (open/closed/all)"},
    },
    "create_pr": {
        "description": "Create a pull request",
        "args": {"owner": "string", "repo": "string", "title": "string", "head": "string", "base": "string", "body": "string (optional)"},
    },
}

BASE_URL = "https://api.github.com"


async def execute(method: str, args: dict, token: str) -> dict:
    """Execute a GitHub API call."""
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        if method == "create_issue":
            owner = args.get("owner", "")
            repo = args.get("repo", "")
            body = {
                "title": args.get("title", ""),
                "body": args.get("body", ""),
            }
            if args.get("labels"):
                body["labels"] = args["labels"]
            resp = await client.post(
                f"{BASE_URL}/repos/{owner}/{repo}/issues",
                headers=headers,
                json=body,
            )
            data = resp.json()
            return {"ok": resp.status_code == 201, "issue_number": data.get("number"), "url": data.get("html_url")}

        elif method == "list_issues":
            owner = args.get("owner", "")
            repo = args.get("repo", "")
            state = args.get("state", "open")
            resp = await client.get(
                f"{BASE_URL}/repos/{owner}/{repo}/issues",
                headers=headers,
                params={"state": state, "per_page": 20},
            )
            issues = [{"number": i["number"], "title": i["title"], "state": i["state"]} for i in resp.json()]
            return {"ok": True, "issues": issues}

        elif method == "list_prs":
            owner = args.get("owner", "")
            repo = args.get("repo", "")
            state = args.get("state", "open")
            resp = await client.get(
                f"{BASE_URL}/repos/{owner}/{repo}/pulls",
                headers=headers,
                params={"state": state, "per_page": 20},
            )
            prs = [{"number": p["number"], "title": p["title"], "state": p["state"]} for p in resp.json()]
            return {"ok": True, "pull_requests": prs}

        elif method == "create_pr":
            owner = args.get("owner", "")
            repo = args.get("repo", "")
            resp = await client.post(
                f"{BASE_URL}/repos/{owner}/{repo}/pulls",
                headers=headers,
                json={
                    "title": args.get("title", ""),
                    "head": args.get("head", ""),
                    "base": args.get("base", "main"),
                    "body": args.get("body", ""),
                },
            )
            data = resp.json()
            return {"ok": resp.status_code == 201, "pr_number": data.get("number"), "url": data.get("html_url")}

        else:
            return {"ok": False, "error": f"Unknown method: {method}"}
