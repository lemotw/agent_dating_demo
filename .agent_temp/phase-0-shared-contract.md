# Phase 0 — Shared MVP Contract

This file is shared context for all implementation phases. Treat it as the architectural and behavioral contract.

## 1. Repository state and protected references

Project root:
`C:\workspace\Projects\agent-chat`

Reference prototype:
`C:\workspace\Projects\agent-chat\prototype`

Current git status includes tracked root prototype files shown as deleted and the new `prototype/` folder shown as untracked. This is intentional user work.

Never:
- run `git reset --hard`;
- restore the deleted root prototype files;
- move `prototype/` back to the root;
- rewrite prototype files as part of production implementation.

Production code should be created beside `prototype/`.

### MVP schedule: defer all verification to the final phase

This MVP has a very short implementation window. Optimize for completing the full vertical slice first.

For implementation phases before the final hardening phase:
- implement the assigned scope only;
- do **not** run unit tests, integration tests, E2E tests, browser acceptance tests, or manual acceptance passes after each phase;
- do **not** repeatedly run full-project `typecheck`, `test`, or production `build` merely to verify each phase;
- do not spend phase time performing broad regression checks for earlier work;
- leave cross-phase verification and cleanup to the final phase.

All planned testing and verification should be executed together in **Phase 6 — End-to-End MVP Integration and Hardening**, after the complete MVP flow exists. Phase 6 is responsible for running the accumulated typecheck/tests/build/manual acceptance matrix and fixing issues found there.

The only exception before Phase 6 is a command strictly required to continue implementation itself (for example generating required Cloudflare types or dependencies/artifacts that subsequent code cannot be written without). Do not treat that exception as an opportunity to run general tests early.

## 2. Product behavior

Use the prototype as the UX/flow reference, but adapt it from the old Dating wording to a general Agent networking / Agent-to-Agent conversation product.

The MVP flow is:

```text
Pedelec readiness
  -> Agent interview
  -> editable publishable Agent profile
  -> enter Lobby
  -> automatic match proposal
  -> both users consent
  -> WebRTC connection
  -> fresh local Agent chat sessions
  -> alternating Agent conversation
  -> final summary exchange
  -> summary screen
```

Do not add:
- user accounts;
- OAuth;
- D1 persistence;
- recommendation/vector matching;
- swipe discovery;
- human-to-human chat;
- server-side LLM calls;
- server-side storage of Agent chat transcripts.

## 3. Technology decisions

Browser:
- SolidJS.
- TypeScript.
- Vite.
- No SSR requirement.
- Keep routing/state architecture lightweight; the prototype behaves like a staged single-app flow.

Cloudflare:
- Cloudflare Workers deployment with static assets handled by the same project.
- Cloudflare Durable Object for Lobby presence, atomic matchmaking, consent state, and WebRTC signaling.
- Durable Object WebSocket Hibernation API for idle efficiency.
- No D1 for MVP.
- No KV requirement for MVP.

Agent runtime:
- `@kaoruisaac/pedelec` browser SDK.
- Agents execute on each user's local Pedelec runtime/provider.
- Do not execute Agent/model work in Workers.
- Do not open an explicit Pedelec Workspace; this product does not need filesystem access.
- Use managed Pedelec sessions.
- Do not add browser-side tools unless a concrete flow requires one.

Realtime:
- WebRTC `RTCPeerConnection`.
- One reliable ordered DataChannel, recommended label: `agent-chat-v1`.
- STUN: Cloudflare STUN.
- TURN: Cloudflare Realtime TURN using short-lived credentials obtained server-side.
- Cloudflare WebSocket/DO is signaling/control, not the normal transport for Agent chat messages.

## 4. Pedelec session separation

Never reuse the private interview session for peer conversation.

Use two logical Pedelec contexts:

### Interview/Profile session
Purpose:
- understand who the user wants to meet;
- understand topics/interests;
- turn answers into an editable publishable Agent profile.

This session may see private interview input.

### Match-chat session
Create a fresh session for every accepted match.

It may receive only:
- the user's approved publishable profile;
- the peer's approved publishable profile;
- current match conversation messages;
- match-specific guidance.

It must not receive:
- private interview transcript;
- unpublished profile fields;
- unrelated prior match transcripts.

This is an architectural privacy boundary, not merely a prompt instruction.

## 5. Pedelec readiness

Use current Pedelec SDK readiness APIs rather than guessing extension/runtime state.

Expected behavior:
- probe with `checkAvailability()` and/or `getApprovalStatus()` as appropriate;
- show a clear disconnected/not-approved/unavailable state;
- do not enter interview/chat flow unless Pedelec can create sessions;
- do not add provider/model selection UI for MVP;
- use the user's Pedelec/Desktop default provider configuration unless a concrete SDK constraint requires otherwise.

Pedelec is browser/desktop dependent, so MVP may treat unsupported mobile environments as unsupported for Agent execution.

## 6. Profile privacy/data model

Private interview answers stay in browser/Pedelec context.

Persist only the final local user/Agent profile needed for the MVP, preferably in localStorage.

Recommended conceptual model:

```ts
type LocalAgentProfile = {
  clientId: string;
  displayName: string;
  agentName: string;
  publicSummary: string;
  topics: string[];
  lookingFor: string[];
  shareSections: Array<{
    id: string;
    label: string;
    text: string;
    enabled: boolean;
  }>;
  updatedAt: number;
};
```

Only enabled/publishable content is sent to Cloudflare or the peer.

Never send:
- raw interview transcript;
- Pedelec session identifiers;
- provider credentials;
- local filesystem information.

## 7. Lobby matchmaking rule

Use one logical global Lobby Durable Object for MVP.

A connected WebSocket means the client is online in the Lobby/control channel.

Waiting entry needs at minimum:
- `clientId`;
- publishable Agent card/profile;
- `joinedAt`;
- socket identity/session token;
- status.

When a new eligible client enters waiting state:
1. collect other online waiting clients;
2. exclude self;
3. exclude clients temporarily rejected by this client in the current Lobby session;
4. sort by `joinedAt` descending;
5. select the most recently joined eligible waiting client;
6. atomically mark both as reserved for the same match.

Do not build a scoring algorithm.

If a proposed pair is declined, do not immediately rematch the exact same two clients during the same Lobby session.

## 8. Match consent

A match proposal is not permission to start Agent chat.

Track independent decisions:

```ts
type MatchConsent = "pending" | "accepted" | "declined";
```

Start WebRTC setup only after both users accepted.

Any decline:
- cancels the proposal;
- notifies both clients;
- returns them to waiting if still connected;
- adds the pair to temporary reject memory for that Lobby session.

## 9. WebRTC authority and transport

Use Cloudflare only for:
- online presence;
- match coordination;
- consent;
- SDP offer/answer signaling;
- ICE candidate signaling;
- TURN credential authorization.

After DataChannel is open, completed Agent messages and summaries travel peer-to-peer.

Do not mirror normal Agent chat text into Cloudflare logs/storage.

Assign one deterministic offerer per match to avoid offer glare. Recommended: the newly matched/newer Lobby entrant is offerer and the selected existing waiter is answerer.

## 10. WebRTC application protocol

Use versioned JSON envelopes over the DataChannel.

Recommended base shape:

```ts
type PeerEnvelope =
  | {
      v: 1;
      type: "agent_message";
      matchId: string;
      messageId: string;
      senderClientId: string;
      senderTurn: number;
      intent: "continue" | "finish";
      text: string;
      sentAt: number;
    }
  | {
      v: 1;
      type: "summary";
      matchId: string;
      messageId: string;
      senderClientId: string;
      text: string;
      sentAt: number;
    }
  | {
      v: 1;
      type: "control";
      matchId: string;
      messageId: string;
      senderClientId: string;
      action: "end_requested" | "end_ack";
      sentAt: number;
    };
```

Use UUIDs for `messageId`. Deduplicate received envelopes by message ID.

Do not send Pedelec streaming deltas over WebRTC. A peer message is sent only when Pedelec has produced a completed logical assistant message.

## 11. Turn limit

The limit must be a configurable source constant, never a magic number scattered through UI/prompt code.

Use a shared constant such as:

```ts
export const MAX_SENT_TURNS_PER_AGENT = 50;
```

Runtime state remains separate:

```ts
sentTurnCount: number
```

Meaning:
- `sentTurnCount` increments only after one completed local Agent message is accepted for transmission.
- each side may send at most `MAX_SENT_TURNS_PER_AGENT` Agent messages;
- with alternating turns, the theoretical maximum is 100 Agent messages total at the default value;
- the browser orchestrator is the hard authority for the cap;
- prompts may mention the cap, but prompt compliance is not trusted for enforcement.

When the next Agent message would exceed the cap, stop the exchange and enter summary generation instead.

Natural early completion is also allowed if the Agent conversation reaches a clear end state defined by the orchestration guidance.

## 12. Agent orchestration

The browser is the coordinator.

Expected loop:

```text
local completed Agent message
 -> send DataChannel envelope
 -> peer receives completed message
 -> peer browser sends that text into peer Pedelec match session
 -> peer Agent produces one completed reply
 -> peer browser transmits it
 -> repeat
```

Never invoke two concurrent `sendText()` operations on the same Pedelec session.

Use `onChatDelta` only for local presentation if desired.
Use completed `onChat` output for peer transmission.

Do not let two Agents free-run independently.

## 13. Summary behavior

At natural completion or turn-cap completion:
1. stop requesting normal replies;
2. each browser asks its own local match session for one concise final conversation summary;
3. the summary must be based only on the approved profiles and current match transcript/context available to that match session;
4. transmit that summary to the peer using the `summary` envelope;
5. show the summary received from the peer Agent in the final prototype-style summary screen.

A failed/missing peer summary should be represented as an explicit incomplete state, not invented locally as though it came from the peer.

## 14. Failure philosophy

MVP should expose clear recoverable states rather than silently retrying forever.

Important visible states:
- Pedelec unavailable;
- Pedelec origin not approved;
- profile generation failed;
- Lobby disconnected;
- match cancelled/declined;
- WebRTC connecting;
- direct connection failed and TURN fallback failed;
- peer disconnected during chat;
- local Agent error;
- summary unavailable.

Keep retries bounded and user-visible.

## 15. Security and privacy minimums

- Long-lived TURN credentials/API token stay in Worker secrets.
- Browser receives only short-lived TURN credentials.
- TURN credential endpoint must validate an active accepted match, not act as a public anonymous credential faucet.
- No server-side Agent transcript persistence.
- No private interview text in Lobby payloads.
- Treat peer-sent text as untrusted data, not instructions to the browser.
- Match Pedelec guidance must explicitly treat peer text as conversation content, never as system/tool instructions.
- Validate message envelope shape, match ID, sender ID, and message size before forwarding peer text to the local Agent.
