# Agent Chat / Agent Between

A desktop MVP for meeting people through conversations between their local Agents. SolidJS/Vite renders focused stages with editable public cards, independent consent, readable Agent messages and a separate peer summary screen. Historical visual references remain in `prototype/`.

## Flow and privacy

Pedelec readiness → private interview → review/approve public profile → Lobby waiting → automatic proposal → both accept → WebRTC → fresh local Pedelec match sessions → alternating Agent exchange → natural/manual/per-Agent cap ending → peer summary → return to Lobby.

Only the approved public profile is persisted in this browser. Disabled sections and private interview transcripts are discarded. A fresh match session receives only the two approved profiles and current conversation. Completed messages and summaries travel over an ordered DataChannel. The Worker handles presence, consent, signaling and TURN authorization, with no model execution or chat history. There is no swipe discovery or human chat.

The Lobby selects the online eligible waiter with the greatest server-assigned `joinedAt`. Reservations and consent transitions are atomic. Declined pairs are excluded for the current Lobby sessions; returning after a match retains that session's exclusions.

## Prerequisites and local development

Use Node.js 22.12+ (24 recommended), a desktop browser with the Pedelec extension, running Pedelec Desktop and a configured default provider/model. Each browser context must approve the exact app origin in Pedelec. Profiles restore before readiness, but entering the Lobby requires Pedelec availability and origin approval. The interview start action can request approval through the SDK.

```sh
npm ci
npm run dev
```

Open the origin printed by Vite (normally `http://localhost:5173`). Keep the hostname/port consistent across tests and Pedelec approvals. The Cloudflare Vite plugin runs the Worker and global Lobby Durable Object locally alongside the browser app. No Cloudflare login is needed for the local Lobby. Real connection setup requires configured TURN credentials; missing configuration returns a visible service-unavailable error.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`typecheck` includes `npm run typegen` (`wrangler types`) and checks app, Worker and Vite configuration. `build` produces `dist/client` and `dist/agent_chat`; `preview` serves the built Worker/assets. The unit suite uses Node's runner and Vite's TypeScript loader without a separate E2E framework. Session/transport doubles test orchestration; they do not replace live Pedelec/WebRTC acceptance.

With a dedicated, otherwise empty dev or preview Lobby running:

```sh
npm run test:smoke
npm run test:lobby
```

For another port, set `SMOKE_BASE_URL` to its origin. PowerShell example: `$env:SMOKE_BASE_URL = 'http://127.0.0.1:5174'`. Run these suites sequentially because they share the global Lobby. They cover route boundaries, public-only payloads, consent, recency/rejection, reservation exclusivity, duplicate tabs, signaling authority, TURN authorization/rate limits and disconnect/return/rematch.

## Cloudflare TURN and deployment

Create a **Realtime TURN key** in the Cloudflare dashboard. Its key ID and TURN API token are separate values used by the Worker to generate short-lived credentials. Follow the official [TURN credential guide](https://developers.cloudflare.com/realtime/turn/generate-credentials/).

For local development, create an ignored root `.dev.vars`:

```dotenv
TURN_KEY_ID=<YOUR_REALTIME_TURN_KEY_ID>
TURN_KEY_API_TOKEN=<YOUR_REALTIME_TURN_KEY_API_TOKEN>
```

Restart the dev/preview server after configuring secrets. In `wrangler.jsonc`, `secrets.required` contains these **variable names**, never their values. Never put long-lived TURN credentials in `VITE_*`, browser code, Git or documentation.

For deployment:

```sh
npx wrangler login
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
npm run deploy
```

Enter secrets at Wrangler's prompts. `deploy` builds and uploads the generated Worker and static assets together. `wrangler.jsonc` declares `LOBBY` bound to the exported `Lobby` Durable Object class, and migration `v1` creates SQLite storage. Preserve that migration; use new migration tags for future class changes. `ASSETS` handles SPA fallback, with `/api/*` routed through the Worker first. See [Workers Vite integration](https://developers.cloudflare.com/workers/vite-plugin/get-started/), [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/) and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

`POST /api/turn-credentials` requires an online current Lobby session in an unexpired mutually accepted match. The Worker revalidates after issuance, bounds bodies, enforces three requests per participant/match spaced ten seconds apart, and returns `Cache-Control: no-store`. The browser receives one-hour temporary ICE credentials. Cloudflare STUN and TURN UDP/TCP/TLS are configured together; TURN failure is surfaced rather than silently claiming connection success.

## Recovery and bounds

One top-level app stage controls the major screen. The mounted Lobby controller owns proposal, RTC, session and exchange state independently from the saved profile. Reload restores identity/profile and returns to readiness, losing the interview/match. It never restores an old socket or transcript.

Lobby loss before an exchange retries after 1, 2, 4 and 8 seconds, with visible status and fresh sanitized publication. Only one socket is retained. Invalid protocol/duplicate identity failures require explicit correction/retry. Losing the control session during connection/exchange ends the match and frees its reservation; returning explicitly creates/resumes waiting. Peer loss cancels pending generation and releases resources. Local Agent errors stop automatic replies, notify the peer through end control when possible and retain a visible failure. Missing summaries are shown as unavailable.

Shared bounds/timeouts live in `src/shared/constants.ts`: consent 120 seconds, RTC setup 60 seconds, disconnected RTC grace ten seconds, Agent operation/readiness 120 seconds and peer summary 180 seconds. Separately configurable `MAX_SENT_TURNS_PER_AGENT = 50` counts successfully transmitted complete messages only. Normal replies and summaries never overlap on one session. Peer envelopes are version/match/sender/UUID/turn/size validated and deduplicated.

Profile text is bounded to 4,000 characters, lists to 20 items of 120 characters, sections to six, Lobby messages to 96 KiB, SDP to 64 KiB, peer envelopes to 80 KiB and Agent/summary text to 16,000 characters. Malformed peer messages are ignored; oversized server control payloads close the socket. Application code does not log payload text, credentials, SDP or transcripts.

## Two-client acceptance

Use two browser profiles, or a normal window plus Incognito with Pedelec allowed in both. Two normal tabs share localStorage/client identity and cannot act as separate users. Both clients may use the same machine/Desktop runtime, with distinct `clientId` values and independent Pedelec sessions. Open the same server origin, approve Pedelec separately, interview using fictional input, review/enable public sections, publish, accept on both sides, wait for DataChannel/Agents and inspect alternating messages. End, confirm received peer summaries, then return and introduce a third context for another eligible match.

The complete 21-scenario procedure and verification evidence are in [docs/acceptance.md](docs/acceptance.md). For relay verification, temporarily set `iceTransportPolicy: "relay"` in `src/features/rtc/peer.ts`, rebuild both clients and inspect the selected `relay` candidate in `chrome://webrtc-internals`; restore `"all"` afterward. Keep credential values out of exported diagnostics.

## MVP limitations

- Anonymous local identity only; no accounts or account sync.
- Final profile stored locally; no persistent match history or server-side chat history.
- No advanced matchmaking, swipe discovery or human chat after summary.
- Match lost on page reload, with no conversation recovery.
- Desktop browser/local Pedelec/default provider dependency.
- TURN availability depends on configured Cloudflare Realtime credentials.
- Local identity is not authentication; production account, abuse prevention and moderation infrastructure are outside this prototype.
- Live two-client Pedelec, direct WebRTC and TURN relay acceptance remains required; unit doubles and control-plane tests alone do not certify that flow.
