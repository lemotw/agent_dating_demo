# Phase 3 — Lobby Presence, Recency Matchmaking, and User Consent

Read `phase-0-shared-contract.md` first.

## Objective

Implement the real online Lobby using one Cloudflare Durable Object.

At the end:
- publishing a profile opens a persistent Lobby/control WebSocket;
- online waiting users are represented by live sockets;
- matching follows the exact simple recency rule;
- a match proposal is delivered to both users;
- both users independently accept/decline;
- decline/cancel behavior returns clients to the Lobby without immediately rematching the same pair;
- no Agent chat text flows through the Lobby server.

## Durable Object topology

Use one logical global Lobby Durable Object for the MVP.

The Worker route `/api/lobby` should forward WebSocket upgrades to the same named Durable Object instance, e.g. `global`.

Do not create one Durable Object per user or per match in this MVP unless the existing implementation structure absolutely requires it.

## WebSocket Hibernation

Use Cloudflare Durable Object WebSocket Hibernation API.

Each accepted socket should have serializable attachment metadata sufficient to restore identity after hibernation, such as:
- `clientId`;
- ephemeral Lobby session ID;
- current match ID if any;
- current status.

Do not rely only on in-memory maps that disappear across hibernation.

## Client hello

After socket open, client sends a validated hello/publish message containing only the sanitized `LobbyAgentProfile`.

Server returns:
- protocol version;
- ephemeral `lobbySessionId` or equivalent token;
- current status.

Reject invalid/oversized payloads.

Do not trust browser timestamps as the authoritative `joinedAt`; set it on the Durable Object.

## Presence model

Suggested statuses:

```ts
type LobbyStatus =
  | "waiting"
  | "reserved"
  | "consent_pending"
  | "connecting"
  | "in_match";
```

A live Lobby socket represents online presence.

A disconnected waiting socket must no longer be matchable.

## Matchmaking rule

The rule is intentionally simple and must stay simple.

When a client becomes eligible/waiting:
1. list all other online clients with `status === "waiting"`;
2. exclude the same `clientId`;
3. exclude peers rejected during the current Lobby session;
4. sort candidates by server-side `joinedAt` descending;
5. select the most recently joined eligible peer;
6. atomically create one match and reserve both participants.

The selected pair becomes unavailable to all later match attempts before proposal events are emitted.

Do not:
- score topics;
- use vector similarity;
- use AI matching;
- randomly pick a candidate;
- pick the oldest waiter.

## Match record

Maintain a simple server-side active match record.

Recommended conceptual shape:

```ts
type ActiveMatch = {
  matchId: string;
  aClientId: string;
  bClientId: string;
  offererClientId: string;
  createdAt: number;
  aConsent: "pending" | "accepted" | "declined";
  bConsent: "pending" | "accepted" | "declined";
  phase: "consent" | "connecting" | "active";
};
```

The newer Lobby entrant should be the deterministic WebRTC offerer unless there is a better deterministic reason already encoded by the actual flow.

## Match proposal event

Both clients receive the peer's sanitized Lobby Agent card plus:
- `matchId`;
- role/offerer information;
- proposal state.

The match proposal UI should visually follow the prototype's pre-exchange consent step rather than immediately starting a connection.

No private interview data may be present.

## Consent messages

Client -> Durable Object:
- accept match;
- decline match.

Validate:
- sender belongs to the match;
- match is still in consent phase;
- each client changes only its own consent.

When both accepted:
- transition match to `connecting`;
- notify both clients that WebRTC signaling may begin.

Do not initiate WebRTC after only one accept.

## Decline behavior

If either side declines:
- mark the proposal cancelled;
- notify both clients;
- remove the active match;
- return still-connected participants to waiting;
- remember the rejected pair for each participant's current Lobby session;
- run matchmaking again against other eligible clients.

This reject memory is ephemeral. It does not need database persistence.

Prevent:
```text
A declines B
-> both wait
-> A immediately matches B again
```

## Disconnect behavior

Before match activation:
- if one participant disconnects, cancel the proposal/connection attempt;
- notify the still-connected participant;
- return that participant to waiting;
- rematch if another eligible peer exists.

During an active WebRTC chat, phase 4/5 may treat the DataChannel as the conversation transport. Lobby socket loss alone should not be allowed to duplicate/reassign a user while an active match is still known.

Use bounded cleanup/expiry for stale reserved/consent/connecting records.

## Client Lobby UI

Keep the prototype's focused staged UI.

Required user-visible states:
- publishing Agent;
- waiting in Lobby;
- proposed match with peer Agent card;
- accept;
- decline;
- waiting for peer decision;
- match accepted / preparing connection;
- match cancelled / peer left;
- Lobby disconnected / reconnect.

Do not show a complex room browser.

## Protocol separation

Lobby/control WebSocket may carry:
- hello/publish;
- waiting state;
- match proposal;
- consent;
- WebRTC signaling messages;
- connection/control state.

It must not carry normal Agent conversation messages or summaries after DataChannel is usable.

## Acceptance

- two browser clients can enter the Lobby.
- a newly waiting client matches the most recently joined eligible waiting client.
- the same client cannot be reserved by two matches.
- both users receive the same `matchId`.
- WebRTC phase does not start until both accept.
- decline returns clients to waiting and prevents immediate same-pair rematch.
- socket close removes waiting presence.
- no raw/private interview content enters DO state.
- no Agent conversation transcript is stored in the Durable Object.

## Implementation handoff (2026-10-04)

Phase 3 implementation is complete; acceptance verification is deferred to Phase 6 per the shared contract. No tests, typecheck, build or browser/manual acceptance were run in this phase.

- `worker/lobby-do.ts`: one global hibernating Lobby; attachment identity/status restoration; strictly validated hello/publication; server-assigned join order; synchronous newest-eligible reservations; persisted short-lived match records; independent session-bound consent; deterministic newer-entrant offerer; two-sided readiness; bilateral per-session rejection memory; duplicate-client exclusion; close/error cancellation/rematch; earliest-deadline alarm cleanup.
- DO SQLite holds only approved public profiles and temporary control/rejection records. Attachments hold compact metadata, not full cards. Closed sessions and orphan rows are deleted. No Pedelec identifiers, private interview objects, Agent messages or summaries are admitted by the protocol.
- `src/shared/types.ts`, `protocol.ts`, `constants.ts`: shared public-card validator, explicit consent/control envelopes, match/session types and payload/expiry constants. Unknown and extra fields are rejected rather than forwarded.
- `src/features/lobby/lobby.ts`: browser-only persistent socket controller, sanitized hello, validated server events, decisions and explicit reconnect. `LobbyConnection.tsx` renders real public peer cards, accept/decline, peer-decision wait, cancellation and offline states.
- `src/App.tsx`: publishing/continuing enters the live Lobby; one grouped stage branch retains the socket through waiting/proposal/connecting. Later-stage navigation cannot bypass the server consent gate. Returning to setup tears down the Lobby.
- `scripts/lobby-smoke.mjs` and `npm run test:lobby`: deferred Phase 6 control-flow acceptance coverage. Existing smoke expectations now match the strict protocol and 96 KiB control limit.

Phase 4 integration points:
- Extend `LobbyClientMessage`/`LobbyServerMessage` with allowlisted SDP/ICE/control messages; authorize sender by socket attachment and match session membership, and forward only to its peer.
- Use `lobbySessionId` (and/or issued socket identity) for accepted-match TURN authorization. `ActiveMatch` carries both client IDs, session IDs, consents, offerer, phase and expiry.
- Only the `match_ready` event may initiate WebRTC. The controller exposes proposal, readiness status, session ID and socket ID; socket ownership currently remains inside the controller.
- Transition matches from connecting to active when DataChannel readiness is established. Give active records a bounded expiry/renewal policy and a completion cleanup path. The current disconnect branch preserves active reservations; activation itself belongs to Phase 4.
- Connecting times out after 60 seconds in this phase because WebRTC is not yet implemented; the UI explicitly identifies this next-stage boundary and then returns to waiting on expiry.

Phase 6 verification:
- Run accumulated typecheck/build, `test:smoke` and `test:lobby` against an empty local Lobby.
- Use two independent browser identities for publish, identical proposals, one-sided acceptance wait, both-sided readiness, decline and no immediate same-pair repeat, explicit reconnect, leave and duplicate-tab handling.
- Verify recency with multiple eligible waiters (including equal-millisecond publication order), reservations under concurrent input, stale/foreign match decisions, wrong profile identity, disabled/private/extra fields, oversized/binary input and unsupported Agent transcript messages.
- Verify hibernation with waiting, one-sided accepted consent, rejected pairs and connecting matches. Check attachments, public profiles, consent and deterministic roles restore; no participant becomes available twice.
- Exercise hello/consent/connecting alarms, pre-activation close and error cleanup, orphan profile/rejection deletion and send-failure cleanup.
- Once Phase 4 is implemented, verify active DataChannel conversation survives Lobby socket loss without duplicate matching, and active expiry/completion eventually releases records.
