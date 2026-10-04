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
