# Agent Between

SolidJS + TypeScript staged application shell, served by a Cloudflare Worker with static assets and a global Lobby Durable Object. The original visual references remain in `prototype/`.

## Local development

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The Cloudflare Vite plugin runs the Worker and Durable Object locally alongside the client. No Cloudflare login or remote resources are needed for development.

```sh
npm run typecheck
npm run build
npm run preview
```

Type checking regenerates `worker-configuration.d.ts` from Wrangler configuration, then checks browser, Worker and Vite configuration separately. Build produces `dist/client` and `dist/agent_chat`; preview serves the built Worker and assets.

With dev running:

```sh
npm run test:smoke
```

For a preview server on a different port, set `SMOKE_BASE_URL` to its origin. Smoke checks exercise SPA fallback, API status/method boundaries, TURN's fail-closed placeholder, and a real Lobby WebSocket including malformed messages and size-limit closure.

## Phase 1 scope

The eight stages are explicit UI previews: connect, interview, publish/ready, lobby, match proposal, connecting, agent exchange, summary. Pedelec, profile publication, matchmaking, WebRTC and Agent orchestration are not enabled. The Lobby stage has a real connection check which transmits only the local client ID and never enters matchmaking. Leaving that stage closes the socket.

The browser creates one UUID in localStorage under `agent-chat.clientId` and restores it on reload. This is an identifier, not an authentication credential. Storage failure is shown on the connect screen.

- `src/features/`: feature surfaces and browser utilities, separated by domain.
- `src/shared/constants.ts`: the single source for the per-Agent sent-turn cap and protocol version.
- `src/shared/protocol.ts`: bootstrap Lobby control messages and the future TURN request/response contract.
- `worker/index.ts`: API routing and static asset fallback.
- `worker/lobby-do.ts`: hibernation sockets, attachments, reconstructed presence and close/error handling. Matching state belongs here in phase 3; no persistence or transcript collection is implemented.

## Route contract

| Route | Behavior |
| --- | --- |
| `GET /api/health` | `{ ok: true, protocolVersion }` |
| `GET /api/lobby?clientId=<UUID>` | WebSocket upgrade forwarded to `LOBBY.getByName('global')`; without upgrade returns 426 |
| `POST /api/turn-credentials` | 501 `not_implemented`, `Cache-Control: no-store`; phase 4 must validate an active accepted match before issuing credentials |
| Other `/api/*` | JSON 404 |
| Other paths | Static assets with SPA fallback |

Lobby control envelopes use `{ v, type }`. The server sends `connected` with a socket ID, answers `ping` with `pong`, and reports `invalid_message` or `not_implemented`. Non-text or oversized control messages close with code 1009. Socket attachments preserve connection metadata across hibernation; no Durable Object storage APIs are used. The SQLite-class migration provisions the class only.

## Deployment

When ready to deploy to your Cloudflare account, authenticate Wrangler and run `npm run deploy`. This builds the app and deploys the generated Worker/assets configuration, including the Lobby class migration. Phase 1 verification does not deploy remote resources. Future TURN secrets belong in Worker secrets, never in browser/Vite environment variables.

The integration follows the official [Workers Vite plugin guide](https://developers.cloudflare.com/workers/vite-plugin/get-started/) and [Durable Object WebSocket hibernation example](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/).
