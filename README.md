# Agent Between

SolidJS + TypeScript staged application shell, served by a Cloudflare Worker with static assets and a global Lobby Durable Object. The original visual references remain in `prototype/`.

## Local development

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`. The Cloudflare Vite plugin runs the Worker and Durable Object locally alongside the client. Lobby development needs no Cloudflare login; real TURN issuance needs a Cloudflare Realtime TURN key configured as described below.

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

For a preview server on a different port, set `SMOKE_BASE_URL` to its origin. Smoke checks exercise SPA fallback, API status/method boundaries, rejected unauthorized TURN requests, and a real Lobby WebSocket including malformed messages and size-limit closure.

## Interview and profile flow

Connect, interview and publish/ready now use a real browser-only `@kaoruisaac/pedelec` managed session. `checkAvailability()` reports extension, origin approval and Desktop readiness. The explicit start button requests approval through SDK session creation when needed; no custom extension probing, folder selection, filesystem tools or provider/model selectors are used. The user's Desktop default configuration is used.

Six networking checkpoints support skip, completed `onChat` replies, serialized `sendText()` calls and visible errors. After the interview, the same private session returns a strict JSON candidate. Invalid JSON or schema fails visibly and can be retried; no profile fields are invented. The review page supports editing public summary, topics, looking-for items and every section, with section sharing and overall publication consent unchecked by default. A name, summary, at least one topic/looking-for item and at least one nonempty enabled section are required.

Only approved content is stored under `agent-chat:profile:v1`. Disabled candidate sections and raw interview text are not persisted. Valid profiles matching the local identity restore on reload, with continue, edit and re-interview actions. `toLobbyAgentProfile()` in `src/features/profile/profile.ts` is the centralized allowlist for all future Lobby/peer payloads; never serialize the local profile directly. Ending setup ends the interview session and clears in-memory private content. Session cleanup failures block navigation and are visible. Future match chat must create a fresh session using only sanitized profiles.

Publishing/continuing with an approved profile now opens a persistent Lobby WebSocket and sends only `toLobbyAgentProfile()` output. Waiting, proposed match, connection, exchange and summary share the same mounted client controller, so stage changes do not drop presence. Both users see the real peer card and independently accept or decline. Accepting alone shows waiting for the peer decision. Only the server `match_ready` event enters preparing connection. Leaving the flow closes the socket; reconnect is explicit and starts a new Lobby session. Real local Agent exchange and peer summaries are implemented in Phase 5 below. Worker code does not import Pedelec.

Per `phase-0-shared-contract.md`, implementation phases do not run tests, typecheck, build or browser/manual acceptance; verification is deferred to Phase 6. The SDK dependency is installed at version 0.4.9 (lockfile recorded).

The browser creates one UUID in localStorage under `agent-chat.clientId` and restores it on reload. This is an identifier, not an authentication credential. Storage failure is shown on the connect screen.

- `src/features/`: feature surfaces and browser utilities, separated by domain.
- `src/shared/constants.ts`: the single source for the per-Agent sent-turn cap and protocol version.
- `src/shared/protocol.ts`: validated public profile, Lobby signaling/control, TURN request/response and peer DataChannel envelopes.
- `worker/index.ts`: API routing and static asset fallback.
- `worker/lobby-do.ts`: global hibernation Lobby, recency matching, independent consent, rejection memory and alarm cleanup. SQLite stores only short-lived approved cards/control records; no interview or Agent transcript storage.

## Route contract

| Route                            | Behavior                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                | `{ ok: true, protocolVersion }`                                                                                             |
| `GET /api/lobby?clientId=<UUID>` | WebSocket upgrade forwarded to `LOBBY.getByName('global')`; without upgrade returns 426                                     |
| `POST /api/turn-credentials`     | 501 `not_implemented`, `Cache-Control: no-store`; phase 4 must validate an active accepted match before issuing credentials |
| Other `/api/*`                   | JSON 404                                                                                                                    |
| Other paths                      | Static assets with SPA fallback                                                                                             |

Lobby control envelopes use `{ v: 1, type }`. After `connected`, the browser sends `hello` with a strictly validated public profile; `published` returns an ephemeral `lobbySessionId` and waiting state. The server assigns `joinedAt`, selects the newest eligible online waiter and reserves both participants synchronously before `match_proposed` is sent. Both receive the same UUID match ID and deterministic offerer (newer entrant). `accept_match` changes only the sending session's consent; `consent_updated` reports both decisions and `match_ready` is emitted only when both accepted. `decline_match` cancels, sends `match_cancelled`/`waiting`, remembers the rejected pair for both sessions and rematches against other peers. Returning to waiting preserves the original server join order.

Socket attachments contain identity, session, join time, status, match ID and TURN issuance counters, avoiding the attachment size limit for large cards. Approved cards, per-session rejection rows and active match records live in DO SQLite and survive hibernation; session rows are removed on close and orphan cleanup. Hello expires after 10 seconds, consent after 120 seconds and connecting after 60 seconds, using the single DO alarm scheduled at the earliest deadline. Both DataChannel readiness reports activate a match for at most 30 minutes. Active reservations survive control socket loss; expiry or explicit leave eventually releases them. Connection cancellation pauses surviving clients until they explicitly return to waiting; declined consent still rematches automatically.

Duplicate client IDs are rejected with `duplicate_client` through the upgrade socket, so a second tab cannot enter another reservation. Invalid/extra fields, unknown message types (including Agent messages and summaries), wrong versions and wrong-match consent are rejected. Binary or control messages above 96 KiB close with code 1009. Profiles are public content approved by the user; the server can validate the schema but cannot determine whether an allowed public text field contains a secret. No control payload text is logged.

For Phase 6, with an otherwise empty local dev Lobby, run `npm run test:smoke` and `npm run test:lobby`. The latter covers two-sided proposals, one-sided consent, most-recent selection among rejected waiters, reservation exclusivity, same-pair suppression, duplicate tabs, disconnect/rematch, two-sided readiness and public-only payload rejection. Neither suite was run during Phase 3. The remaining Phase 6 matrix includes real browser UI, hibernation reconstruction, alarm expiration and active DataChannel/socket-loss integration after Phase 4.

## WebRTC transport and TURN

`src/features/rtc/peer.ts` owns one `RTCPeerConnection` and reliable ordered `agent-chat-v1` DataChannel per accepted match. Only the server-assigned offerer creates the channel/offer. SDP and trickle ICE travel through the existing Lobby socket, with socket/session membership, consent, expiry and offerer-role validation. ICE arriving before a remote description is queued, including signals arriving while credentials load. A serialized signaling chain and teardown guards isolate stale matches. Cloudflare STUN and temporary Cloudflare TURN UDP/TCP/TLS servers are configured together so ICE can select a direct route or relay without competing offers.

`POST /api/turn-credentials` accepts `{ matchId, clientId, lobbySessionId }`. The DO validates the current online session, both accepted consents, match membership and connecting/active expiry before contacting Cloudflare. It revalidates after issuance to reject cancellation races. Each participant may request at most three times per match, spaced at least ten seconds; quota reservations survive hibernation. Credential responses use `Cache-Control: no-store`, a one-hour TTL, bounded request/upstream bodies and an eight-second upstream timeout. Missing configuration/upstream failure returns a generic 503; no credentials or SDP/ICE are logged or persisted.

Create a Cloudflare Realtime TURN key and put its values in an ignored root `.dev.vars` file for local development:

```dotenv
TURN_KEY_ID=<your TURN key ID>
TURN_KEY_API_TOKEN=<your TURN key API token>
```

For deployment, provision both using `npx wrangler secret put TURN_KEY_ID` and `npx wrangler secret put TURN_KEY_API_TOKEN`. `wrangler.jsonc` declares only the required secret names, and generated Worker types expose them only to the Worker. Never put their values in `VITE_*`, client source or committed configuration. See the official [TURN credential API](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [Worker secrets guide](https://developers.cloudflare.com/workers/configuration/secrets/).

The Solid connection view exposes preparation, gathering, connecting, connected, temporary disconnection, failure and closure. Setup is bounded by the Lobby's 60-second deadline; a temporary network disconnect has ten seconds to recover. Returning to Lobby cancels and tears down the transport. Once established, a DataChannel survives control socket loss, but cannot authorize new TURN requests without its live session. A local deadline also bounds active transport lifetime when the control socket is lost. Returning after control loss may be refused while the old active reservation is still retained; wait for peer departure/expiry before reconnecting.

Phase 5 uses `PeerConnection.subscribe()` for received completed envelopes and `send()` for Agent messages, summaries and controls. `send()` returns the transmitted envelope or `null`; orchestration turns increment only on success. Peer JSON is shape/version/match/sender/size validated, Agent turns must be contiguous and within the shared cap, and received message UUIDs use a bounded dedupe set. Backpressure rejects sends instead of buffering indefinitely. Normal peer text never enters Worker control messages. The mounted Lobby controller is retained through exchange/summary and owns each fresh Pedelec match session.

Phase 4 ran only the required `npm run typegen`, with no typecheck/build/tests/browser acceptance per the shared schedule. Phase 6 must run the accumulated checks and real two-browser matrix: consent gate and single offerer; candidates before SDP/credential readiness; direct and forced-relay paths (UDP/TCP/TLS); credential authorization before consent/after expiry/wrong session/foreign client/cancellation during issuance/rate limits; hibernation reconstruction; both readiness acknowledgements; control loss with active peer transport; bounded setup/disconnect/active expiry; explicit failure return; leave during setup; malformed/wrong-match/foreign-sender/replayed/oversized DataChannel messages and invalid turns; application messages and summaries sent only over the DataChannel; production bundle secret and diagnostic exclusion.

## Deployment

When ready to deploy to your Cloudflare account, authenticate Wrangler and run `npm run deploy`. This builds the app and deploys the generated Worker/assets configuration, including the Lobby class migration. Phase 1 verification does not deploy remote resources. Future TURN secrets belong in Worker secrets, never in browser/Vite environment variables.

The integration follows the official [Workers Vite plugin guide](https://developers.cloudflare.com/workers/vite-plugin/get-started/) and [Durable Object WebSocket hibernation example](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/).


## Real Agent exchange and peer summaries (Phase 5)

Accepted matches now create a fresh local Pedelec managed session with only the approved public profiles. The offerer opens after the DataChannel and both match sessions are ready (`control: session_ready`). Completed `onChat` output must be one strict JSON reply/finish object. Streaming deltas remain local; only validated visible text enters WebRTC. There is no Worker model call or transcript storage.

The browser serializes `sendText()` and alternates turns, incrementing the imported `MAX_SENT_TURNS_PER_AGENT` only when transmission succeeds. Natural finish, manual `end_requested`/`end_ack`, or the cap stops normal replies. Failed generation is visible with explicit retry/end; failed transmission retains a validated reply for retry without calling the model again. In-flight work settles before summary generation, with its unsent normal reply discarded after ending.

Each local session makes one final structured summary request using the approved context and quoted displayed transcript, including the final peer message. Each valid summary is sent once; `control: summary_ack` confirms receipt. The final screen identifies the peer Agent, labels its received summary, gives the ending reason and offers return to Lobby. Missing peer summaries are shown as unavailable, never replaced by local text. Readiness, Agent operation and summary deadlines are shared source constants; timed-out operations cannot start another request on the same session.

The Lobby controller remains mounted through exchange and summary. Summary completion/timeout or leaving ends Pedelec and tears down WebRTC, clears match runtime state and releases the Lobby reservation when connected. Returning clears the final report and resumes waiting with the approved local profile preserved. The summary screen retains peer identity and the received summary only for the current page.

Phase 5 ran no tests, typecheck, build or browser acceptance under the shared schedule. Phase 6 must run accumulated checks and the detailed acceptance matrix appended to `.agent_temp/phase-5-agent-exchange-summary.md`, including real two-browser Pedelec, cap/natural/manual termination, malformed replies, retry, prompt injection, summary acknowledgement/timeouts, late completions and return/rematch races.
