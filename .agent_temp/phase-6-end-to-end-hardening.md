# Phase 6 — End-to-End MVP Integration and Hardening

Read `phase-0-shared-contract.md` first.

## Objective

Make the completed phases behave as one coherent runnable MVP and close the practical gaps needed for a real prototype deployment.

Do not redesign the product. This phase is integration, failure handling, validation, and deployment polish.

## Full expected flow

Verify the implementation presents one continuous flow:

```text
Open app
-> Pedelec readiness
-> profile exists? continue / create profile
-> private Agent interview
-> edit publishable profile
-> enter Lobby
-> waiting
-> automatic match proposal
-> both users consent
-> WebRTC connecting
-> DataChannel connected
-> fresh Pedelec match session
-> alternating Agent exchange
-> natural/manual/cap ending
-> summary exchange
-> peer summary screen
-> return to Lobby
```

No swipe discovery and no human chat should appear in the MVP path.

## Prototype fidelity pass

Compare the real application against:
- `prototype/index.html`;
- `prototype/docs/demo-guide.md`;
- `prototype/docs/product-direction.md`.

Preserve useful prototype qualities:
- focused single-task stages;
- visible progress;
- calm light layout;
- readable chat bubbles;
- explicit consent before Agent exchange;
- report/summary as a distinct final stage;
- clear status language.

Do not reintroduce Dating-specific requirements solely because they exist in the historical prototype.

## State machine cleanup

Centralize top-level application state enough to prevent impossible combinations.

Expected conceptual states may include:

```ts
type AppStage =
  | "pedelec_required"
  | "profile_interview"
  | "profile_review"
  | "lobby_waiting"
  | "match_consent"
  | "rtc_connecting"
  | "agent_exchange"
  | "summary"
  | "error";
```

Names can differ, but avoid scattered booleans that allow multiple major screens to be active at once.

Match/exchange substate should remain isolated from persistent local profile state.

## Recovery / lifecycle

Handle at minimum:

### Reload before match
- restore `clientId`;
- restore valid publishable profile;
- return user to a safe pre-Lobby/ready state;
- do not pretend an old socket/match survived.

### Lobby disconnect
- show reconnecting/disconnected state;
- use bounded reconnect with backoff;
- republish sanitized profile after a fresh successful socket;
- do not create duplicate simultaneous Lobby sockets.

### Reload during match
MVP may treat the current match as lost.
- clear local match runtime;
- do not claim conversation recovery;
- return to profile-ready/Lobby entry after Pedelec readiness.

### Peer disconnect
- stop normal Agent generation;
- show peer-disconnected state;
- tear down match resources;
- do not generate fake peer messages or summary.

### Local Pedelec failure
- stop automatic orchestration;
- tell peer through a control/end path if possible;
- show local failure;
- allow ending and returning to Lobby.

## Timeouts

Use named constants for important timeouts rather than scattered literals.

Recommended categories:
- Lobby reconnect delay/backoff;
- match consent timeout;
- WebRTC connection timeout;
- peer summary timeout.

Values may be chosen pragmatically, but all should be centralized.

The Agent turn cap remains:
`MAX_SENT_TURNS_PER_AGENT = 50`
and must remain separately configurable.

## Input / protocol bounds

Define pragmatic limits to prevent accidental huge peer/server payloads.

Validate:
- profile text lengths;
- topic list lengths/count;
- WebSocket message size;
- SDP/signaling shape;
- DataChannel Agent message text size;
- summary size.

Reject malformed messages without crashing the app.

## Browser multi-client testing

The MVP must be testable with two separate browser storage contexts against the same deployment/dev server.

Examples:
- normal window + Incognito;
- two browser profiles.

Because Pedelec is local, both browser clients may use the same machine/runtime for development as long as they receive separate Pedelec sessions and separate browser `clientId` values.

Document the manual test procedure.

## Required manual acceptance matrix

Test at least these scenarios:

1. Pedelec unavailable at startup.
2. Pedelec available; complete interview and publish profile.
3. Reload restores final profile but not private transcript.
4. One client waits alone in Lobby.
5. Two clients match.
6. Three clients verify the newest eligible waiter rule.
7. One user declines; same pair is not immediately proposed again.
8. One user closes tab while waiting.
9. One user closes tab during consent.
10. Both accept; direct WebRTC succeeds.
11. Force TURN-only or otherwise verify TURN credential flow where practical.
12. Agent conversation alternates without overlapping local `sendText()`.
13. Duplicate peer envelope does not duplicate UI/turn count.
14. Natural Agent finish reaches summary.
15. Manual end reaches summary.
16. Lower `MAX_SENT_TURNS_PER_AGENT` locally for testing and confirm hard stop exactly at the configured cap.
17. Peer disconnect during Agent exchange.
18. Local Pedelec error during Agent exchange.
19. Peer summary received and displayed.
20. Peer summary timeout displays unavailable rather than fabricated text.
21. Return to Lobby can produce a new match without stale RTC/session state.

## Automated tests

Add focused tests where they give high value.

Recommended:
- public-profile sanitizer excludes disabled/private sections;
- matchmaking candidate selection uses `joinedAt DESC`;
- rejected pair exclusion;
- match consent transition;
- PeerEnvelope validation;
- message ID dedupe;
- turn counter/cap behavior using a small test constant or injected limit;
- structured Pedelec reply parsing;
- summary envelope parsing.

Do not spend the phase building an oversized E2E framework if it slows the MVP.

## Cloudflare configuration/documentation

Document required deployment bindings/secrets without checking secrets into git.

At minimum explain:
- Durable Object binding/migration;
- Worker/static asset deployment;
- Cloudflare Realtime TURN key setup;
- which Worker secrets must be configured for TURN credential issuance.

Use clear placeholder environment names. Long-lived TURN credentials must never be stored in Vite `VITE_*` variables.

## Production README

Create/update a production root README describing:
- what Agent Chat is;
- current MVP flow;
- Pedelec prerequisite;
- local development commands;
- Cloudflare development/deployment commands;
- TURN secret setup;
- how to run the two-client manual test;
- known MVP limitations.

Do not overwrite the prototype README inside `prototype/`.

## MVP limitations to state explicitly

- anonymous local identity only;
- no account sync;
- final profile stored locally;
- no persistent match history;
- no server-side chat history;
- no advanced matchmaking;
- no human chat after summary;
- match lost on page reload;
- desktop browser/Pedelec dependency;
- TURN availability depends on configured Cloudflare Realtime credentials.

## Final technical checks

Run the project's actual scripts and resolve issues caused by this implementation:
- typecheck;
- unit tests;
- production build;
- Worker/Cloudflare type generation if configured.

Do not change unrelated prototype files just to make git status clean.

## Completion criteria

The MVP is complete when two real users/storage contexts can:

1. create/restore publishable Agent profiles using local Pedelec;
2. enter the same Cloudflare-backed Lobby;
3. be automatically matched with the agreed recency rule;
4. independently consent;
5. establish WebRTC with STUN/TURN fallback;
6. let their separate Pedelec Agents alternate messages peer-to-peer;
7. stop at natural finish, manual end, or configurable per-Agent hard cap;
8. exchange final summaries;
9. see the peer Agent summary;
10. return to Lobby cleanly for another match.

Keep implementation close to the prototype instead of expanding scope.

## Implementation and verification status — 2026-10-04

The Phase 6 implementation and automated verification are complete. Full live two-user acceptance is still pending; this status does not certify the real Pedelec/WebRTC/TURN completion criteria above.

- Preserved the single top-level stage and mounted match controller. Restored profiles cannot bypass Pedelec readiness/approval; explicit Lobby entry rechecks availability, and publication returns safely to readiness if Pedelec is no longer available.
- Added bounded Lobby reconnect with 1/2/4/8-second backoff, visible status, sanitized republishing, old-socket handler detachment and timer cleanup. Invalid protocol/duplicate identity failures require manual correction. Match-time control disconnect terminates the match rather than recovering an old conversation.
- Released active DO reservations on control socket departure, avoiding a 30-minute stale match after tab close/reload. Peer failure cancels pending orchestration and tears down match resources. Local Agent errors poison the session, stop automatic replies, notify through end control when possible and remain visible on the summary screen.
- Centralized reconnect, TURN upstream/rate-limit and profile/SDP bounds alongside the existing consent/RTC/summary timeouts. The independent default per-Agent cap remains 50; focused orchestration tests inject a cap of two.
- Added a bounded private-interview operation timeout so a stalled SDK call does not permanently lock navigation or permit overlapping retries. Restored profile data is re-sanitized before persistence/use.
- Fixed TURN secret declarations to the variable names `TURN_KEY_ID` and `TURN_KEY_API_TOKEN`, regenerated Worker types, and kept credential values out of source/configuration. The user is moving their local values into ignored `.dev.vars`.
- Replaced historical phase-progress README text with the production MVP guide, including Cloudflare binding/migration/assets, local commands, TURN setup, two-context testing, recovery, bounds and explicit limitations. Prototype files were not changed.
- Added `npm test` using Node's runner and Vite's TypeScript loader. All 13 focused tests passed. Existing smoke and expanded real Worker/DO Lobby suites passed. Type generation/typecheck and production build passed.
- Browser inspection in Chrome and the in-app browser verified the unapproved Pedelec startup state and staged visual layout. The test origin was not approved for Pedelec; the verification server did not have TURN values configured. No real managed session exchange, direct RTC or forced-relay success is claimed.

See `docs/acceptance.md` for the 21-scenario live procedure, executed evidence and pending real-runtime rows. Remaining release acceptance: approve Pedelec in two independent browser contexts, configure/load TURN credentials, and execute the real interview → consent → direct/relay RTC → Agent exchange → peer summary → return/rematch matrix. No remote deployment was performed.
