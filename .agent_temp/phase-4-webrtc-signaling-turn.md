# Phase 4 — WebRTC Signaling, STUN/TURN, and DataChannel

Read `phase-0-shared-contract.md` first.

## Objective

Establish a reliable browser-to-browser WebRTC DataChannel for an accepted match.

Cloudflare is responsible for signaling and TURN credential authorization. Completed Agent messages will later use the DataChannel directly.

## Connection lifecycle

After both Lobby participants accept:

```text
Durable Object assigns deterministic roles
  -> obtain ICE server configuration
  -> create RTCPeerConnection
  -> offerer creates DataChannel + SDP offer
  -> offer/answer exchanged through Lobby WebSocket
  -> ICE candidates exchanged through Lobby WebSocket
  -> direct/STUN path attempted
  -> TURN is available as fallback
  -> reliable ordered DataChannel opens
```

Do not create competing offers from both sides.

## RTCPeerConnection

Create one connection per accepted match.

Use a dedicated module/service that owns:
- `RTCPeerConnection`;
- DataChannel;
- connection state callbacks;
- signaling message handling;
- teardown;
- protocol send/receive.

Recommended DataChannel:
- label: `agent-chat-v1`;
- ordered: true;
- use normal reliable delivery; do not configure unreliable packet lifetime/retransmit limits.

## ICE servers

Use Cloudflare STUN plus Cloudflare Realtime TURN.

Do not place a long-lived TURN secret/API token in browser source, public env variables, HTML, or Wrangler client bindings.

Browser should receive only temporary TURN credentials.

## TURN credential endpoint

Implement a Worker endpoint, e.g.:

`POST /api/turn-credentials`

The endpoint must not be an open credential dispenser.

Request must prove an active accepted/connecting match using information issued by the Lobby flow, for example:
- `matchId`;
- `clientId`;
- ephemeral Lobby session token.

The Worker/Durable Object validates:
- client belongs to the match;
- both consents were accepted;
- match is still active/connecting;
- request token/session is current.

Only then request/generate short-lived Cloudflare Realtime TURN credentials using Worker secrets.

Keep long-lived Cloudflare TURN key/token material in Wrangler secrets/environment.

Do not expose those secrets to the Vite client bundle.

## Signaling messages

Use the existing Lobby WebSocket/control channel for:
- SDP offer;
- SDP answer;
- ICE candidates;
- optional connection-ready status.

Every signaling message must contain:
- protocol version;
- `matchId`;
- sender identity/session;
- signaling type;
- payload.

Server validates that sender belongs to the match and forwards only to the peer in that same match.

Do not broadcast signaling globally.

## Offerer behavior

Offerer:
1. creates `RTCPeerConnection`;
2. creates the DataChannel;
3. attaches handlers before negotiation;
4. creates and sets local offer;
5. sends offer through signaling;
6. trickles ICE candidates.

Answerer:
1. creates `RTCPeerConnection`;
2. listens for `datachannel`;
3. applies remote offer;
4. creates and sets local answer;
5. sends answer;
6. trickles ICE candidates.

Both apply peer ICE candidates safely even if candidates arrive around remote-description timing. Queue candidates if needed until the remote description is ready.

## DataChannel protocol

Implement the versioned `PeerEnvelope` contract from phase 0.

Validate inbound DataChannel messages before dispatch:
- valid JSON;
- protocol `v === PEER_PROTOCOL_VERSION`;
- expected `matchId`;
- expected peer `senderClientId`;
- known message type;
- bounded text length;
- valid sender turn when relevant.

Maintain a bounded dedupe set of received `messageId` values.

Never treat peer JSON fields as executable instructions.

## Connection status UX

Expose states to Solid UI:
- preparing;
- gathering ICE;
- connecting;
- connected;
- reconnecting/disconnected;
- failed;
- closed.

Do not expose raw WebRTC jargon unless useful in a diagnostic subtext.

Prototype-style primary copy should remain simple:
- Connecting your Agents...
- Direct connection established.
- Connection failed.

## Failure behavior

Set a bounded connection timeout.

If WebRTC cannot establish after STUN + TURN attempt:
- tear down the peer connection;
- mark the match failed/cancelled through Lobby control;
- show a retry/return-to-Lobby action.

Do not retry forever.

If DataChannel closes before Agent exchange starts, return to a clear failed/cancelled state.

## Server privacy

The Worker/DO may see signaling metadata but must not receive normal DataChannel Agent message text.

Avoid logging full SDP/ICE payloads in production logs unless needed for temporary debugging, because network metadata can be sensitive.

## Development diagnostics

It is acceptable to expose a development-only diagnostic panel/log with:
- signaling step;
- ICE connection state;
- selected candidate type if available;
- DataChannel state.

Keep it out of primary user UX.

## Teardown

Provide one idempotent teardown method that:
- closes DataChannel;
- closes RTCPeerConnection;
- clears timers;
- clears queued ICE;
- removes event listeners/subscriptions;
- prevents stale signaling for a previous `matchId` from affecting a new match.

## Acceptance

- two accepted Lobby clients establish one DataChannel.
- deterministic offerer prevents glare.
- STUN is configured.
- short-lived TURN credentials are returned only for valid accepted matches.
- long-lived TURN secret is not present in browser bundle.
- offer/answer and trickle ICE go only through signaling.
- normal peer application messages travel through DataChannel.
- invalid/wrong-match/duplicate envelopes are ignored or rejected safely.
- connection failure becomes a visible bounded failure state.

## Implementation status — 2026-10-04

Phase 4 implementation is complete. Acceptance execution remains deferred to Phase 6 as required by phase 0; no runtime/browser success is claimed here.

- `src/features/rtc/peer.ts`: dedicated per-match peer service with deterministic offer/answer, reliable ordered `agent-chat-v1`, Cloudflare STUN + authorized temporary TURN, trickle ICE, credential-readiness buffering, serialized signaling, pre-description ICE queue, bounded setup/disconnect deadlines, idempotent teardown and stale-match guards.
- `src/shared/protocol.ts`: strict signaling and match-control allowlists plus versioned `PeerEnvelope` parsing. Peer transport validates JSON, version, match, peer sender, UUID, known type, timestamp, bounded text and contiguous/capped Agent turns; received IDs use a bounded dedupe set. `send()`/`subscribe()` provide Phase 5's P2P-only application transport.
- `worker/turn.ts`, `worker/index.ts`, `worker/lobby-do.ts`: accepted-match/session authorization, bounded JSON bodies, secret-only Cloudflare credential issuance, one-hour temporary TTL, eight-second upstream timeout, three-attempt per-participant/per-match quota with ten-second spacing and post-fetch authorization recheck. Responses are not cached; generic errors do not leak upstream secrets.
- Lobby signaling is forwarded only to the matched peer after current socket/session/client, mutual consent, phase, expiry and SDP-role validation. Both readiness reports activate a 30-minute bounded reservation. Active control-socket loss preserves the match; leave/failure/expiry cleans it up. Connection cancellations pause the Lobby until explicit `resume_lobby`, preserving a visible recoverable terminal state.
- `lobby.ts`, `LobbyConnection.tsx`, `ConnectionPreview.tsx`, `App.tsx`: automatic setup only on `match_ready`, real connection states, development-only diagnostic subtext, bounded recovery, explicit return and teardown. Phase 5's Agent execution remains outside this scope.
- `wrangler.jsonc` declares `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` secret names. `npm run typegen` generated their Worker bindings; this is the phase-0 required-artifact exception. Actual TURN secrets must be provisioned through ignored `.dev.vars` / Wrangler secrets before real connectivity acceptance. No secret values were created or committed.
- README documents configuration, lifecycle, Phase 5 integration and the Phase 6 acceptance matrix. The smoke suite's old TURN placeholder expectation now checks rejected unauthorized requests; it was not executed.

The Lobby keeps each bearer `lobbySessionId` private to its owner. Forwarded signaling contains the public `senderSocketId` instead, preventing peers from learning each other's TURN authorization tokens.

Phase 6 must run typecheck/build and accumulated suites, then exercise real browsers for deterministic negotiation, direct/forced TURN connectivity, envelope rejection/dedupe/turn validation, credential authorization/rate-limit/cancellation races, hibernation, active control-socket loss and bounded failure/expiry/return. Confirm forwarded signals contain no bearer session token and production assets contain no long-lived TURN secrets or development diagnostic UI.
