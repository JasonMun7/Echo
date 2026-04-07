<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>

<!-- PROJECT SHIELDS -->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/JasonMun7/echo">
    <img src="apps/web/public/echo_logo.png" alt="Echo Logo" width="100" height="100">
  </a>

<h3 align="center">Echo</h3>

  <p align="center">
    An AI-powered workflow automation platform — create, record, and run desktop & browser workflows using voice, chat, or visual recording, powered by the EchoPrism vision-language agent.
    <br />
    <a href="https://github.com/JasonMun7/echo"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://echo-frontend-607073095974.us-central1.run.app">View Demo</a>
    &middot;
    <a href="https://github.com/JasonMun7/echo/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/JasonMun7/echo/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#architecture">Architecture</a></li>
        <li><a href="#agent-diagram">Agent Diagram</a></li>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#phase-1-gcp-setup">Phase 1: GCP Setup</a></li>
        <li><a href="#phase-2-firebase-setup">Phase 2: Firebase Setup</a></li>
        <li><a href="#phase-3-service-accounts--iam">Phase 3: IAM</a></li>
        <li><a href="#phase-4-gemini-api-key">Phase 4: Gemini API Key</a></li>
        <li><a href="#phase-5-local-development">Phase 5: Local Development</a></li>
        <li><a href="#phase-6-deploy-to-cloud-run">Phase 6: Deploy</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

[![Echo Dashboard Screenshot][product-screenshot]](https://echo-frontend-607073095974.us-central1.run.app)

**Echo** is an AI-powered workflow automation platform. Create and edit desktop and browser workflows (from recordings, voice, or chat), then run them via the **EchoPrism** vision-language agent — which executes steps (navigate, click, type, scroll) on your desktop. Use the **web dashboard** to manage workflows and runs, and the **Electron desktop app** for voice-driven control and running your workflows locally.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Architecture

![Architecture Diagram][architecture-diagram]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Agent Diagram

![Agent Diagram][agent-diagram]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

[![Next][Next.js]][Next-url]
[![React][React.js]][React-url]
[![Python][Python]][Python-url]
[![FastAPI][FastAPI]][FastAPI-url]
[![Firebase][Firebase]][Firebase-url]
[![Google Cloud][GoogleCloud]][GoogleCloud-url]
[![Electron][Electron]][Electron-url]
[![Docker][Docker]][Docker-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

To run the full stack locally or deploy from scratch, follow the phases below.

### Prerequisites

Install the following tools before proceeding:

- **Node.js** 18+ — [nodejs.org](https://nodejs.org) or `nvm install 18`
- **pnpm** — `npm install -g pnpm`
- **Python** 3.11+ — [python.org](https://www.python.org) or `pyenv install 3.11`
- **Docker** — for building and deploying images
- **gcloud CLI** — [Install guide](https://cloud.google.com/sdk/docs/install)
  ```sh
  gcloud auth login
  gcloud auth application-default login
  ```
- **Firebase CLI**
  ```sh
  npm install -g firebase-tools
  firebase login
  ```
- **Doppler** (optional but recommended) — for secrets management
  ```sh
  brew install dopplerhq/cli/doppler
  doppler login
  ```

### Auth0 Token Vault (integrations)

Doc index: [https://auth0.com/llms.txt](https://auth0.com/llms.txt). Echo can use **Auth0 Token Vault** so third-party API tokens stay in Auth0: users **link Auth0** once (Firebase remains Echo login), then connect Slack, GitHub, or Google via **Connected Accounts**; the backend exchanges an Auth0 refresh token for a short-lived provider token ([refresh token exchange](https://auth0.com/docs/secure/tokens/token-vault/refresh-token-exchange-with-token-vault)).

**Official (Auth0 Docs):** [Connected Accounts for Token Vault](https://auth0.com/docs/secure/tokens/token-vault/connected-accounts-for-token-vault) — when **Connected Accounts** is enabled for a connection, Auth0 uses **`/me/v1/connected-accounts`** (My Account API) to store tokens in the vault, **not** the social **`/authorize`** login flow alone; **`identities`** vs **`connected_accounts`** on the user profile. [Configure Token Vault](https://auth0.com/docs/secure/tokens/token-vault/configure-token-vault), [My Account API](https://auth0.com/docs/manage-users/my-account-api), [MRRT](https://auth0.com/docs/secure/tokens/refresh-tokens/multi-resource-refresh-token).

**Auth0 AI (product):** [Token Vault overview](https://auth0.com/ai/docs/intro/token-vault), [Google integration](https://auth0.com/ai/docs/integrations/google), [Call others’ APIs quickstart](https://auth0.com/ai/docs/get-started/call-others-apis-on-users-behalf). Echo follows the **“applications with refresh tokens”** pattern (Regular Web Application + stored Auth0 refresh token), not the SPA “access-token-only” Token Vault variant.

| Authentication (Dashboard) | Connected Accounts for Token Vault | Behavior (per Auth0) |
|------------------------------|-------------------------------------|----------------------|
| On | Off | `/authorize` login only; **identities**. |
| Off | On | **My Account** Connected Accounts flow only; vault tokens; connection not a login IdP. |
| On | On | Both login and vault; Echo **Connect** defaults to My Account **`connect`/`complete`** (set **`AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`** for legacy **`/authorize`** Connect only). |

**Important:** **Link Auth0** stores an **Auth0** refresh token on the user document. **Provider** tokens (Google, etc.) are written to Token Vault only after the user completes a **Connect account** flow for that provider; Universal Login alone does not populate the vault ([how it works](https://auth0.com/ai/docs/intro/token-vault#how-it-works)).

**`/authorize` vs My Account Connected Accounts:** Auth0 documents **Connected Accounts for Token Vault** using the **My Account API** (`POST https://<tenant>/me/v1/connected-accounts/connect`, then `…/complete`). Echo’s **default** **Connect** path uses that flow (requires [My Account API](https://auth0.com/docs/manage-users/my-account-api) + MRRT for audience `https://<tenant>/me/`). Set **`AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`** only if you need the legacy **`/authorize?connection=<provider>`** path (requires the connection’s **Purpose** to include **Authentication**).

| | Universal Login (`/authorize`) | Connected Accounts (`/me/v1/connected-accounts/*`) |
|---|----------------|----------------------|
| **Purpose** | Identify the user (session). | Delegate access; **Token Vault** storage. |
| **Auth0 storage** | Session / **identities**. | **connected_accounts** (vault). |
| **Agent / Google APIs** | Not sufficient alone for vault RT. | **connect** → user consents → **`complete`** seals the vault. |

**My Account path in Echo:** `connect` returns `connect_uri` + `auth_session`; after redirect, **`GET /api/auth0/callback?connect_code=…&state=…`** runs **`…/connected-accounts/complete`** server-side (with PKCE **`code_verifier`**). Skipping callback (or a broken `state`) means the vault stays empty. The backend exchanges the user’s Auth0 refresh token for a My Account API access token using scopes **`openid profile offline_access create:me:connected_accounts read:me:connected_accounts delete:me:connected_accounts`** — align **MRRT** / Application Access on **Auth0 My Account API** with those Connected Accounts permissions. For **Connect Google**, Echo omits upstream **`scopes`** in the My Account request unless **`AUTH0_MY_ACCOUNT_GOOGLE_SCOPES`** is set, so Auth0 requests the Google permissions you enabled under **Social → Google** in the Dashboard (and your GCP OAuth consent screen). **`authorization_params`** uses **`prompt=consent`** only. Optional env override: comma-separated scope URLs; do **not** add **`offline_access`** unless it is on your GCP consent screen—use Auth0 **Offline Access** on the connection for federated refresh tokens.

1. In Auth0: create a **Regular Web Application**, register an **API** (audience), enable **Token Vault** / **Connected Accounts** on your Social connections (Slack, GitHub, and **Google**), and add callback URL `https://<your-backend>/api/auth0/callback` (local: `http://localhost:8000/api/auth0/callback`).
2. **Google (Gmail / Calendar / Drive-style APIs):** In [Google Cloud Console](https://console.cloud.google.com), enable each API you need (e.g. **Google Calendar API** for `calendar_list` / `calendar_freebusy`). → **APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** (Web application). Set **Authorized redirect URI** to `https://<AUTH0_DOMAIN>/login/callback` and **Authorized JavaScript origin** to `https://<AUTH0_DOMAIN>` (not the Echo backend). In Auth0 → **Authentication → Social → Google**, paste the Google client ID/secret. Under **Purpose**, choose **Authentication and Connected Accounts for Token Vault** (both)—Echo **Connect Google** defaults to the My Account connected-accounts flow; set **`AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`** only if you use legacy **`/authorize`** with `connection=google-oauth2`, which Auth0 only allows when **Authentication** is enabled on that connection (**Connected Accounts for Token Vault** alone causes *The connection is not active for authentication* on that legacy path). Under **Permissions**, enable **Offline Access** so Google can issue refresh tokens for Token Vault. For **free/busy** queries (`api_call` method `calendar_freebusy`), add scope **`https://www.googleapis.com/auth/calendar.freebusy`** on the connection (or a broader Calendar scope). To keep **Link Auth0** on email/password (so Universal Login does not offer Google), set **`AUTH0_LINK_CONNECTION`** to `Username-Password-Authentication` (or `?connection=` on `GET /api/auth0/link-url`). Do not rely on **`NEXT_PUBLIC_AUTH0_LINK_CONNECTION`** for the default web app—it is deprecated (see `scripts/doppler-env-reference.md`). Attach the connection to your Echo application. Echo uses integration id `google`, mapped to Auth0 connection `google-oauth2` by default (`AUTH0_CONNECTION_GOOGLE` overrides the Auth0 connection name).
3. Set environment variables on the **backend** (and **Echo Prism agent** if it runs `api_call` with Firestore): `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`. Users **Link Auth0** with any **authentication** connection enabled on the Echo Regular Web Application (step 2: Google must include **Authentication** in Purpose for **Connect** to work), then **Connect Google** from Integrations so Token Vault stores a Google refresh token for API calls—see troubleshooting below if exchange fails. See `scripts/doppler-env-reference.md`.
4. Local backend: `pnpm run dev:backend` sets `PYTHONPATH=../agent` so integration connectors load from `echo_prism_agent/integrations/`.
5. In the web app **Integrations** page: **Link Auth0 for integrations**, then **Connect (Token Vault)** per provider.

#### Firebase vs Auth0 and Google connection Purpose

- **Firebase** authenticates users to the Echo web app; protected API calls use a Firebase ID token.
- **Auth0** is for **integrations only**: **Link Auth0** (`GET /api/auth0/link-url`) stores an Auth0 refresh token on the user document; **Connect Google / Slack / GitHub** runs the federated OAuth that populates [Token Vault](https://auth0.com/ai/docs/intro/token-vault).

**Link Auth0** opens Auth0 Universal Login with **no** `connection` parameter by default, so users see every connection whose **Purpose** includes **Authentication**—typically **Google** for this project. Optional env **`AUTH0_LINK_CONNECTION`** (or **`?connection=`** on `GET /api/auth0/link-url`) forces a specific IdP for Link (use only if you need database login, a second Google connection, etc.).

**Recommended operator order (Firebase login + Auth0 Token Vault, Google for Link):**

1. In Auth0 → **Authentication** → **Social** → **Google**, enable **Authentication** (and **Connected Accounts for Token Vault** for API access). Under **Applications**, enable your Echo Regular Web Application on the Google connection.
2. In **Integrations**, press **Connect** on an integration (e.g. Google): sign in with **Google** at Universal Login to **Link Auth0**; confirm **Auth0 linked**.
3. Finish **Connect Google** for Token Vault (the app may open this automatically after link). Confirm Google shows **Connected**.
4. If Google is **Token Vault only** (no Authentication) and you cannot change it, keep **My Account Connect** enabled (default)—see troubleshooting below.

**Connectors (Echo Prism agent + `/api/integrations/{id}/call`):** Slack — `list_channels`, `post_message`. GitHub — `list_repos`, `create_issue`. Google — convenience methods: `userinfo`, `calendar_list`, `calendar_freebusy`, `gmail_list_labels`, `gmail_send`, `drive_list_files`; plus **`rest`** (alias **`google_rest`**) for any [Google API](https://developers.google.com/discovery) on a `*.googleapis.com` host (`verb`, `url`, optional `params`, `json`, `timeout_seconds`). Enable the **Google Cloud APIs** and matching **OAuth scopes** in Auth0 (Calendar, Gmail, Drive, Sheets, Slides, Contacts, Tasks, sign-in profile — see `google_scopes.py`); otherwise Google returns 403. **`calendar_freebusy`** expects `timeMin` and `timeMax` (RFC3339), optional `timeZone` (default `UTC`), optional `items` (default `[{"id":"primary"}]`). **`gmail_send`** expects `to` (recipient email), optional `subject`, `body` or `text`, optional `cc`, `bcc`, `html` (multipart if `html` is set); requires **Gmail.Send** scope. Integrations are **Auth0 Token Vault only** (no classic Slack/GitHub OAuth redirect to Echo). Legacy Firestore-stored OAuth tokens are ignored unless `ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY=0` (see `scripts/doppler-env-reference.md`).

**Google — maximum OAuth scope surface (Auth0 / Google Cloud):** If you enable *everything* in the Google connection and consent screen, Echo aligns with at most the scope groups in [`agent/echo_prism_agent/integrations/google_scopes.py`](agent/echo_prism_agent/integrations/google_scopes.py) — **Calendar** (full / read / events / settings / add-ons), **Gmail** (labels through full mailbox), **Drive** (metadata through full Drive), **Sheets**, **Slides**, **Contacts** (including directory read-only), and **Tasks**. In practice, enable only the toggles your product needs; tokens only carry scopes the user consented to.

**Troubleshooting:** `access_denied` on return to Echo usually means the user cancelled the provider screen, or the Social connection is not enabled for your Auth0 app (**Authentication → Social → [Slack/GitHub/Google] → Applications** → enable your Regular Web Application).

**`OAuth error (invalid_request): the connection is not enabled`:** The **Connect** authorize URL uses `connection=github` or `connection=google-oauth2` (or overrides from `AUTH0_CONNECTION_*`). In Auth0, open **Authentication → Social → [GitHub/Google] → Applications** and toggle **on** your Echo Regular Web Application—the same app whose **Client ID** matches backend `AUTH0_CLIENT_ID`. If your connection uses a custom name, set `AUTH0_CONNECTION_GITHUB` / `AUTH0_CONNECTION_GOOGLE` to that exact name.

**`OAuth error (invalid_request): The connection is not active for authentication`:** This applies to the **legacy** **`/authorize`** Connect path when **`AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`**. Auth0 treats **`/authorize`** with `connection=` as an **authentication** transaction, so vault-only social connections fail on that path. **Option A:** set **Google / GitHub** to **Authentication and Connected Accounts for Token Vault** (both on). **Option B (vault-only IdPs):** keep **My Account Connect** (default; do not set **`AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`**). Echo uses Auth0’s **My Account API** (`POST https://<tenant>/me/v1/connected-accounts/connect` per [Connected Accounts](https://auth0.com/docs/secure/tokens/token-vault/connected-accounts-for-token-vault)), matching `mount_connected_account_routes` / `start_connect_account` in [auth0-server-python `ConnectedAccounts.md`](https://github.com/auth0/auth0-server-python/blob/main/examples/ConnectedAccounts.md). You must [activate My Account API](https://auth0.com/docs/manage-users/my-account-api#activate-the-my-account-api), configure **MRRT** so the user’s Auth0 refresh token can request audience `https://<tenant>/me/` with scopes including `create:me:connected_accounts`, then **Link Auth0** again if needed. Optional: **`AUTH0_MY_ACCOUNT_GOOGLE_SCOPES`** (comma-separated Google scopes for the connect request).

**`Federated connection Refresh Token not found` (401 on `/oauth/token`):** Auth0 has no Google (etc.) federated refresh token in Token Vault for this user—even though Echo may show connected. Complete **Connect** after **Link Auth0** (**Integrations → Connect Google**). If your tenant is oriented around **Connected Accounts** only, avoid **`AUTH0_VAULT_USE_MY_ACCOUNT_CONNECT=0`** — the legacy **`/authorize?connection=`** path may not persist vault tokens the way the default **My Account** flow does (`POST …/me/v1/connected-accounts/connect` + callback `connect_code`; see troubleshooting for *not active for authentication*). **Verify in Dashboard:** **User Management → Users → [user] → Connected Accounts**—if empty, Token Vault has nothing to exchange yet. Also ensure **Social → Google** has **Connected Accounts for Token Vault** + **Offline Access**; **Grant types** on **Echo Web** include **Authorization Code**, **Refresh Token**, **Token Vault**. Revoke Google third-party access and re-run **Connect** if needed. Management API: `GET /api/v2/users/{auth0_user_id}/connected-accounts`.

If you see **`Access denied: Service not found: …`**, the **`AUTH0_AUDIENCE`** env var does not match any **API** in Auth0. In the dashboard go to **APIs**, open your API (or **Create API**), and set **`AUTH0_AUDIENCE` to that API’s Identifier** exactly (often a URL like `https://echo-api` — not the hex id shown in the error). Recreate the API if it was deleted, then restart the backend so the new value loads.

**`OAuth error (invalid_request): Client "…" is not authorized to access resource server "…"`:** The backend sends `audience=` on `/authorize` (from **`AUTH0_AUDIENCE`**). That value must be the **Identifier** of an API listed under **Applications → APIs** in Auth0, and your **Echo Regular Web Application** must be **authorized** for that API (**Applications → [your app] → APIs** → toggle the API on). If you used a placeholder like `https://<tenant>.auth0.com/me/`, create a **Custom API** (**APIs → Create API**) with a stable Identifier (e.g. `https://echo-api`), authorize the app, set **`AUTH0_AUDIENCE`** to that Identifier, and restart the backend. Alternatively, temporarily unset `AUTH0_AUDIENCE` only for local debugging (not recommended for production Token Vault flows).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Phase 1: GCP Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create or select a project with billing enabled.

2. In **APIs & Services → Enable APIs**, enable:
   - Cloud Run API
   - Cloud Scheduler API
   - Firestore API
   - Cloud Storage API
   - Gemini API

3. Go to **Cloud Storage → Buckets**, create a bucket with **Uniform bucket-level access**, and note the name (e.g. `echo-assets-prod`).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Phase 2: Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project or link your existing GCP project.

2. Enable authentication: **Authentication → Sign-in method** → enable **Email/Password** and **Google**.

3. Create Firestore: **Firestore Database → Create database** → choose **Native mode**.

4. Register your web app: **Project Settings → Your apps → Add web app (</>)** and copy the config object.

5. Deploy Firestore rules from the project root:
   ```sh
   cd firebase && firebase deploy --only firestore:rules
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Phase 3: Service Accounts & IAM

Use the default compute service account for Cloud Run and ensure it has:

- **Firestore**: Cloud Datastore User (or Firestore roles)
- **Storage**: Storage Object Admin
- **Cloud Run Jobs**: Run Jobs Executor

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Phase 4: Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in, select your GCP project, and create an API key
3. Copy the key — you'll need it for `GEMINI_API_KEY`

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Phase 5: Local Development

**Clone and install:**

```sh
git clone https://github.com/JasonMun7/echo.git
cd echo
pnpm install
pnpm run install:backend
```

**Option A: Doppler (recommended)**

```sh
doppler setup   # select project and dev config
```

Then run each service in a separate terminal:

```sh
# Terminal 1 – backend
pnpm run dev:backend

# Terminal 2 – frontend
pnpm run dev

# Terminal 3 – desktop app
pnpm run dev:desktop

# Terminal 4 – Echo Prism agent (LangGraph + OpenRouter + Gemini; `agent/`)
pnpm run dev:agent

# Terminal 5 – LiveKit voice worker (optional; run from repo root so `agent.*` imports resolve)
pnpm run dev:livekit-agent
```

Set `NEXT_PUBLIC_ECHO_AGENT_URL` (web) and `VITE_ECHO_AGENT_URL` (desktop) to `http://localhost:8083` in Doppler for local agent access. Set `OPENROUTER_API_KEY` for GUI inference (Kimi + muscle-mem); override with `ECHOPRISM_MUSCLE_MODEL` if needed. Install the sibling package: from `agent/` run `pip install -e ../muscle-mem-agent` (required for the Worker, semantic verification, and tool registry). See [agent/echo_prism_agent/muscle/MUSCLE_MIGRATION.md](agent/echo_prism_agent/muscle/MUSCLE_MIGRATION.md) for the migration map.

**Option B: .env files**

```sh
# Web app
cd apps/web && cp .env.local.example .env.local
# Edit .env.local with Firebase config and NEXT_PUBLIC_API_URL=http://localhost:8000

# Backend
cd backend && cp .env.example .env
# Edit .env with ECHO_GCP_PROJECT_ID, ECHO_GCS_BUCKET, GEMINI_API_KEY
```

**Local URLs:**
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)
- Echo Prism agent: [http://localhost:8083](http://localhost:8083)

**Environment Variables Reference:**

| Variable | Required | Description |
|---|---|---|
| `ECHO_GCP_PROJECT_ID` | Yes | GCP project ID |
| `ECHO_GCS_BUCKET` | Yes | GCS bucket name |
| `GEMINI_API_KEY` | Yes | Gemini API key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (web) |
| `NEXT_PUBLIC_ECHO_AGENT_URL` | Yes | Echo Prism agent URL (web) |
| `NEXT_PUBLIC_FIREBASE_*` | Yes | Firebase config (web) |
| `VITE_API_URL` | Yes | Backend URL (desktop) |
| `VITE_ECHO_AGENT_URL` | Yes | Echo Prism agent URL (desktop) |
| `OPENROUTER_API_KEY` | Recommended | OpenRouter key for LangGraph/UI-Tars inference |
| `LIVEKIT_URL` | Voice only | LiveKit server URL |
| `LIVEKIT_API_KEY` | Voice only | LiveKit API key |
| `LIVEKIT_API_SECRET` | Voice only | LiveKit API secret |
| `ECHO_CLOUD_RUN_REGION` | No | Default `us-central1` |

See [scripts/doppler-env-reference.md](scripts/doppler-env-reference.md) for the full reference.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Phase 6: Deploy to Cloud Run

```sh
pnpm run deploy
# or with explicit env:
GEMINI_API_KEY=your-key ECHO_GCS_BUCKET=your-bucket \
  ./scripts/deploy.sh YOUR_GCP_PROJECT_ID us-central1
```

The script builds and pushes Docker images, deploys frontend and backend as Cloud Run services, and deploys the Echo Prism agent (LangGraph) to Cloud Run (`pnpm run deploy:agent`).

**To deploy the LiveKit voice worker (optional):**

```sh
pnpm run deploy:livekit-agent
```

Requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_SECRET`, `ECHOPRISM_AGENT_URL`, and `GEMINI_API_KEY`.

**Forks:** use your GCP project and ensure Doppler **prd** includes `NEXT_PUBLIC_FIREBASE_*` (and optional desktop download URLs) so the full deploy builds a complete web image. See [scripts/deploy/README.md](scripts/deploy/README.md) and [scripts/doppler-env-reference.md](scripts/doppler-env-reference.md) (section *Fork / alternate GitHub*).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

Visit the [live demo](https://echo-frontend-607073095974.us-central1.run.app) to check out our web app. Make sure to follow the instructions in our [releases](https://github.com/JasonMun7/Echo/releases) page to ensure the desktop app can be ran.

1. **Create a workflow** — record a screen capture, describe steps via chat, or use voice on the desktop app
2. **Edit steps** — review and modify the auto-generated workflow steps in the dashboard
3. **Run** — trigger a run from the desktop app; EchoPrism executes each step via vision-language grounding
4. **Monitor** — watch the execution and click Ctrl + Shift + V to interrupt for user steering

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [ ] **Mobile app automation** — Allow Echo to automate tasks on phones as well
- [ ] **Fine tuning** — Improve model accuracy by training on user data with Vertex AI
- [ ] **Expanded integrations** — Add third-party app connectors like Slack, Notion, and G-Suite
- [ ] **Workflow marketplace** — Create a library of community-shared automations users can install and customize
- [ ] **Schedule workflows** — Allow users to schedule workflows to run at specific times
- [ ] **Reduce costs** — Optimize OpenRouter / Gemini calls for vision steps

See the [open issues](https://github.com/JasonMun7/echo/issues) for a full list of proposed features and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also open an issue with the tag "enhancement".
Don't forget to give the project a star!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top Contributors

<a href="https://github.com/JasonMun7/echo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=JasonMun7/echo" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

**Jason Mun** — jason.mun484@gmail.com · [LinkedIn](https://www.linkedin.com/in/jason-mun-25181b1b9/)

**Andrew Cheung** — andrewcheung360@gmail.com · [LinkedIn](https://www.linkedin.com/in/andrewcheung360/)

Project Link: [https://github.com/JasonMun7/echo](https://github.com/JasonMun7/echo)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [OpenRouter](https://openrouter.ai/) — UI-Tars–compatible models for LangGraph inference
* [LiveKit](https://livekit.io) — Real-time voice and video infrastructure
* [Gemini](https://deepmind.google/technologies/gemini/) — Vision-language model powering EchoPrism
* [UI-TARS](https://github.com/bytedance/UI-TARS) — GUI agent model for automated UI interaction
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/JasonMun7/echo.svg?style=for-the-badge
[contributors-url]: https://github.com/JasonMun7/echo/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/JasonMun7/echo.svg?style=for-the-badge
[forks-url]: https://github.com/JasonMun7/echo/network/members
[stars-shield]: https://img.shields.io/github/stars/JasonMun7/echo.svg?style=for-the-badge
[stars-url]: https://github.com/JasonMun7/echo/stargazers
[issues-shield]: https://img.shields.io/github/issues/JasonMun7/echo.svg?style=for-the-badge
[issues-url]: https://github.com/JasonMun7/echo/issues
[license-shield]: https://img.shields.io/github/license/JasonMun7/echo.svg?style=for-the-badge
[license-url]: https://github.com/JasonMun7/echo/blob/main/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://www.linkedin.com/in/jason-mun-25181b1b9/
[product-screenshot]: apps/web/public/dashboard-screenshot.png
[architecture-diagram]: architecture-diagram.png
[agent-diagram]: agent-diagram.png

[Next.js]: https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white
[Next-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Python]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
[FastAPI]: https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi
[FastAPI-url]: https://fastapi.tiangolo.com/
[Firebase]: https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white
[Firebase-url]: https://firebase.google.com/
[GoogleCloud]: https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white
[GoogleCloud-url]: https://cloud.google.com/
[Electron]: https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white
[Electron-url]: https://www.electronjs.org/
[Docker]: https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
