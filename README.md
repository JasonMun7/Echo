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

Echo can use **Auth0 for AI Agents Token Vault** so third-party API tokens stay in Auth0: users **link Auth0** once (Firebase remains Echo login), then connect Slack, GitHub, or Google via **Connected Accounts**; the backend exchanges an Auth0 refresh token for a short-lived provider token ([refresh token exchange](https://auth0.com/docs/secure/tokens/token-vault/refresh-token-exchange-with-token-vault)).

1. In Auth0: create a **Regular Web Application**, register an **API** (audience), enable **Token Vault** / **Connected Accounts** on your Social connections (Slack, GitHub, and **Google**), and add callback URL `https://<your-backend>/api/auth0/callback` (local: `http://localhost:8000/api/auth0/callback`).
2. **Google (Gmail / Calendar / Drive-style APIs):** In [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** (Web application). Set **Authorized redirect URI** to `https://<AUTH0_DOMAIN>/login/callback` and **Authorized JavaScript origin** to `https://<AUTH0_DOMAIN>` (not the Echo backend). In Auth0 → **Authentication → Social → Google**, paste the Google client ID/secret. Under **Purpose**, enable **Connected Accounts for Token Vault** (required for Google API calls). Under **Permissions**, enable **Offline Access** so Google can issue refresh tokens for Token Vault. If Echo uses **Firebase** for app login and you want Google **only** for Token Vault (not as an Auth0 login method), set Purpose to **Connected Accounts for Token Vault** only—**after** you enable another authentication connection for **Link Auth0** (see [Firebase vs Auth0 and Google connection Purpose](#firebase-vs-auth0-and-google-connection-purpose)). Otherwise you may use “Authentication and Connected Accounts for Token Vault” if Google should also appear on Universal Login. Attach the connection to your Echo application. Echo uses integration id `google`, mapped to Auth0 connection `google-oauth2` by default (`AUTH0_CONNECTION_GOOGLE` overrides the Auth0 connection name).
3. Set environment variables on the **backend** (and **Echo Prism agent** if it runs `api_call` with Firestore): `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`. Users **Link Auth0** with any **authentication** connection enabled on the Echo Regular Web Application (see step 2 if Google is vault-only), then **Connect Google** from Integrations so Token Vault stores a Google refresh token for API calls—see troubleshooting below if the vault probe fails. See `scripts/doppler-env-reference.md`.
4. Local backend: `pnpm run dev:backend` sets `PYTHONPATH=../agent` so integration connectors load from `echo_prism_agent/integrations/`.
5. In the web app **Integrations** page: **Link Auth0 for integrations**, then **Connect (Token Vault)** per provider.

#### Firebase vs Auth0 and Google connection Purpose

- **Firebase** authenticates users to the Echo web app; protected API calls use a Firebase ID token.
- **Auth0** is for **integrations only**: **Link Auth0** (`GET /api/auth0/link-url`) stores an Auth0 refresh token on the user document; **Connect Google / Slack / GitHub** runs the federated OAuth that populates [Token Vault](https://auth0.com/ai/docs/intro/token-vault).

**Link Auth0** opens Auth0 Universal Login. By default the URL has **no** `connection` parameter, so the login screen only offers connections whose **Purpose** includes **Authentication**. To **force** email/password (or another IdP) for Link—recommended when Google is **Token Vault only**—set backend env **`AUTH0_LINK_CONNECTION`** to `Username-Password-Authentication` (or pass **`?connection=`** on `GET /api/auth0/link-url`), or set **`NEXT_PUBLIC_AUTH0_LINK_CONNECTION`** on the web app. If Google is set to **Connected Accounts for Token Vault** only, Google will **not** appear on Universal Login unless you use a separate Google connection for authentication.

**Operator order when switching Google to Token Vault–only:**

1. In Auth0 → **Authentication**, enable a non-Google **authentication** connection on the same Regular Web Application Echo uses (for example **Username-Password-Authentication**, GitHub, or Microsoft).
2. Under **Applications** → your Echo Regular Web Application → **Connections**, confirm that connection is enabled.
3. Set **`AUTH0_LINK_CONNECTION=Username-Password-Authentication`** (or your database connection name) on the **backend** so **Link Auth0** skips the Google IdP, or rely on Universal Login only showing non-Google auth connections after step 5.
4. In the Echo app, run **Link Auth0** (email/password) and confirm an Auth0 refresh token is stored (Integrations list shows **Auth0 linked** / diagnostics show `has_auth0_refresh_token`).
5. Edit **Authentication** → **Social** → **Google** → **Purpose**: choose **Connected Accounts for Token Vault** only (not “Authentication and Connected Accounts…”). Keep **Offline Access** enabled. Save.
6. **Connect Google** from Integrations; run **`GET /api/auth0/diagnostics?integration=google`** to verify the vault probe.

**Connectors (Echo Prism agent + `/api/integrations/{id}/call`):** Slack — `list_channels`, `post_message`. GitHub — `list_repos`, `create_issue`. Google — `userinfo`, `calendar_list`, `gmail_list_labels`, `drive_list_files`. Enable the relevant **Google Cloud APIs** and consent **OAuth scopes** for what you call; otherwise Google returns 403. Integrations are **Auth0 Token Vault only** (no classic Slack/GitHub OAuth redirect to Echo). Legacy Firestore-stored OAuth tokens are ignored unless `ECHO_INTEGRATIONS_TOKEN_VAULT_ONLY=0` (see `scripts/doppler-env-reference.md`).

**Google — maximum OAuth scope surface (Auth0 / Google Cloud):** If you enable *everything* in the Google connection and consent screen, Echo aligns with at most the scope groups in [`agent/echo_prism_agent/integrations/google_scopes.py`](agent/echo_prism_agent/integrations/google_scopes.py) — **Calendar** (full / read / events / settings / add-ons), **Gmail** (labels through full mailbox), **Drive** (metadata through full Drive), **Sheets**, **Slides**, **Contacts** (including directory read-only), and **Tasks**. In practice, enable only the toggles your product needs; tokens only carry scopes the user consented to.

**Troubleshooting:** `access_denied` on return to Echo usually means the user cancelled the provider screen, or the Social connection is not enabled for your Auth0 app (**Authentication → Social → [Slack/GitHub/Google] → Applications** → enable your Regular Web Application).

**`OAuth error (invalid_request): the connection is not enabled`:** The **Connect** authorize URL uses `connection=github` or `connection=google-oauth2` (or overrides from `AUTH0_CONNECTION_*`). In Auth0, open **Authentication → Social → [GitHub/Google] → Applications** and toggle **on** your Echo Regular Web Application—the same app whose **Client ID** matches backend `AUTH0_CLIENT_ID`. If your connection uses a custom name, set `AUTH0_CONNECTION_GITHUB` / `AUTH0_CONNECTION_GOOGLE` to that exact name.

**`OAuth error (invalid_request): The connection is not active for authentication`:** Echo **Connect** uses Auth0’s **`/authorize`** endpoint with `connection=` — Auth0 treats that as an **authentication** transaction. If the social connection’s **Purpose** is **Connected Accounts for Token Vault** only (Authentication **off**), that connection is **not** allowed for `/authorize`, so Connect fails even when the connection is enabled for your app. **Fix for Echo’s current flow:** set **Google / GitHub** to **Authentication and Connected Accounts for Token Vault** (both on). Keep **Link Auth0** on email/password only by setting **`AUTH0_LINK_CONNECTION`** / **`NEXT_PUBLIC_AUTH0_LINK_CONNECTION`** so Universal Login does not rely on Google/GitHub for linking. (Auth0’s **My Account API** `connected-accounts/connect` path is vault-only without authentication; Echo does not implement that flow yet.)

**`Federated connection Refresh Token not found` (401 on `/oauth/token`):** Auth0 has no Google (etc.) refresh token in Token Vault for this user—even though Echo may show connected. Auth0 treats **Connect Account** (delegated access for Token Vault) as **separate from authentication**—Universal Login alone does not populate Token Vault. You must complete the **Connect** step (Echo: **Integrations → Connect Google** after Link Auth0), which opens Auth0’s authorize URL with `connection=<your-google-connection>`—the same purpose as Auth0’s documented “connect account” / step-up flow ([get-started: call others’ APIs on users’ behalf](https://auth0.com/ai/docs/get-started/call-others-apis-on-users-behalf), [FastAPI sample](https://github.com/auth0-samples/auth0-ai-samples/tree/main/call-apis-on-users-behalf/others-api/langchain-fastapi-py) uses `auth0-fastapi` with `mount_connected_account_routes=True` for equivalent routing). **Verify in Dashboard:** **User Management → Users → [user] → Connected Accounts**—if empty, Token Vault has nothing to exchange yet. Signing into Auth0 with Google (`auth0_sub` like `google-oauth2|…`) is still not the same as that vault link unless that flow completed. Also ensure **Social → Google** has **Connected Accounts for Token Vault** + **Offline Access**; **Grant types** on **Echo Web** include **Authorization Code**, **Refresh Token**, **Token Vault**. If you enabled Token Vault after an earlier Google consent, revoke the app under Google **Third-party access** and run **Connect Google** again. Confirm with Management API `GET /api/v2/users/{auth0_user_id}/connected-accounts` when unsure. **Note:** `GET .../users/{id}/federated-connections-tokensets` may return **403** with `deprecated` / `feature_not_enabled` on some tenants—in that case ignore it and use Dashboard + **`GET /api/auth0/diagnostics?integration=google`** (vault_probe) as the practical check.

**Diagnostics:** On the web app **Integrations** page, use the **Auth0 diagnostics (debug)** button, or call **`GET /api/auth0/diagnostics?integration=google`** with Firebase **`Authorization: Bearer <ID token>`**. Response includes env/Firestore snapshot and a **vault probe** (never returns raw provider tokens). If `auth0_sub` starts with `google-oauth2|`, the JSON includes **`token_vault_hint`**.

If you see **`Access denied: Service not found: …`**, the **`AUTH0_AUDIENCE`** env var does not match any **API** in Auth0. In the dashboard go to **APIs**, open your API (or **Create API**), and set **`AUTH0_AUDIENCE` to that API’s Identifier** exactly (often a URL like `https://echo-api` — not the hex id shown in the error). Recreate the API if it was deleted, then restart the backend so the new value loads.

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
