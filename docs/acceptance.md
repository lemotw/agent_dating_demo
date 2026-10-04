# Phase 6 acceptance and verification

Recorded on 2026-10-04 (Asia/Taipei). Executed code/control tests are distinguished from live browser/Pedelec acceptance. **Full two-user completion criteria remain pending until the live rows below are executed.**

## Executed verification

- `npm run typecheck` including Wrangler type generation: passed.
- `npm test`: 13 focused tests passed: privacy/storage identity, profile/signaling/envelope bounds, actual DataChannel dedupe/order handler, strict reply parsing, two independent simulated sessions alternating to a two-turn cap and exchanging summaries, natural/manual/failure/disconnect termination, missing summary, Lobby reconnect bounds/cleanup TURN body/upstream parsing safe interview operation timeout and retry of rejected transmission without regeneration.
- `npm run build`: production Worker/client build passed.
- `npm run test:smoke` against `http://127.0.0.1:5174`: passed.
- `npm run test:lobby` against the same local Worker/DO: passed. Includes newest eligible waiter, independent consent, rejected pair, waiting/consent/active disconnects, duplicate tabs, signal role/session privacy, TURN pre-consent/wrong-session/released-match denial, rate limit and clean resume/new match.
- Browser observation in Chrome and Codex in-app browser: startup renders the calm staged UI and Pedelec origin-not-approved state. No Pedelec approval/session or real peer exchange was performed.

The verification server had no `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` at execution time. Authorized issuance returned 503; credential shape was separately tested with a bounded upstream double. Live TURN issuance/relay remains pending. The user is configuring `.dev.vars`. No credentials were added to Git and no remote deployment was performed.

Prototype fidelity was checked against `prototype/index.html`, `prototype/docs/demo-guide.md` and `prototype/docs/product-direction.md`: focused stages, progress, public-sharing controls, independent consent, readable exchange and distinct report are retained. Historical Dating/swipe/human-chat stages are excluded under the shared MVP contract. Prototype files were not edited.

## Prepare live clients

1. Start Pedelec Desktop with its default provider/model configured. Use fictional names/interests for acceptance input.
2. Configure ignored `.dev.vars` from README and restart `npm run dev`. Use the exact printed origin throughout; hostname/port changes require separate Pedelec approval.
3. Open clients A and B in different storage contexts: two profiles, or normal and Incognito. Allow Pedelec in Incognito if needed. Verify DevTools Application/localStorage `agent-chat.clientId` differs. Two tabs in one profile intentionally share identity.
4. Approve the origin in each context. Interview and every accepted match must have separate managed runtime sessions. No Workspace/filesystem tools are requested.
5. Use a dedicated empty Lobby. Close other test clients between scenarios. A third independent context C is needed for recency/rematch tests.

## Required manual matrix

Automated evidence exercises code/control behavior, and does **not** mark a live UI row passed. All live rows remain pending except the unapproved startup observation. Record browser versions, date, pass/fail and failure details after execution.

| # | Scenario/procedure | Expected result | Current evidence |
|---|---|---|---|
| 1 | Stop Desktop/disable extension and reload; restore and recheck. Separately revoke origin approval. | Specific unavailable/unapproved status; no interview/Lobby until ready. | Unapproved state observed in both browsers; missing-runtime branch pending. |
| 2 | Complete six checkpoints including a skip; generate/edit candidate, enable public sections, confirm publication. | Only approved fields reach Lobby; skipped/disabled/private text excluded. | Sanitizer/storage tests passed; live interview pending. |
| 3 | Reload after publication; inspect localStorage and readiness. | Same clientId/public profile; no transcript, socket, match or conversation restoration. | Identity/profile tests passed; live reload pending. |
| 4 | Publish only A. | Waiting status, no fake peer or conversation. | Real DO single waiter passed; UI pending. |
| 5 | Publish B while A waits. | Same match ID; real public cards; newer entrant is offerer. | Real proposal test passed; UI pending. |
| 6 | Pair A/B and decline so both wait but exclude each other; introduce C. | C chooses newer B, leaving A waiting. | Real recency/rejection test passed; UI pending. |
| 7 | Decline A/B once and leave both online. | Both wait; same pair is not immediately proposed again during those Lobby sessions. | Real DO test passed; UI pending. |
| 8 | Close a waiting tab, introduce another client. | Closed user removed from candidates. | Socket-close test passed; browser tab pending. |
| 9 | Close during consent, including after survivor accepted. | Proposal cancelled; survivor waits; no RTC/Agent starts. | Real consent-close passed; UI pending. |
| 10 | Both accept with normal network and transport policy `all`. | Reliable DataChannel opens; direct candidate when network permits; fresh independent Agents start. | Consent/signaling passed; actual RTC/session pending. |
| 11 | Temporarily set RTC policy `relay`, rebuild both clients, accept fresh match. | Temporary credentials returned; selected candidate is relay. Restore `all`. | Authorization/rate-limit/upstream shape passed; live credentials/relay pending. |
| 12 | Observe turns and runtime requests. | Alternating complete replies; one active sendText per session; no peer streaming deltas. | Two-session doubles passed; real runtime pending. |
| 13 | Replay a received envelope with same UUID using DevTools in isolated development. | No duplicate bubble/turn; wrong match/sender/order rejected too. | Actual DataChannel handler passed; live replay pending. |
| 14 | Let Agents reach natural finish. | Final reply then summary on both sides; no further normal replies. | Natural finish passed; live model pending. |
| 15 | End manually while idle and during generation. | End control; pending draft discarded; one serialized summary request. | In-flight manual end passed; live UI pending. |
| 16 | Temporarily set shared MAX_SENT_TURNS_PER_AGENT to 2 for both clients, rebuild/reload; use continuing replies until cap. Restore 50. | At most two completed transmitted replies per Agent, never a third. | Injected limit sends exactly two per side; live cap pending. |
| 17 | Close peer tab during exchange; separately temporarily interrupt network. | Generation stops; failure/disconnection shown; resources cleaned; no invented peer summary. | Controller/real active control-close passed; RTC/UI pending. |
| 18 | Stop local provider/Desktop during a normal reply. | Local failure visible; automatic replies stop; end notification where possible; return available. | Runtime-error double passed; live provider pending. |
| 19 | Complete summaries on both clients. | Each displays the other Agent's actual summary and identity; resources release once. | Two-session summary/ack passed; real text/UI pending. |
| 20 | Temporarily lower PEER_SUMMARY_TIMEOUT_MS; prevent peer summary transmission using a DevTools breakpoint while RTC remains open. Restore timeout. | Explicit peer summary unavailable; no local replacement attributed to peer. | Missing-summary tests passed; live UI pending. |
| 21 | Return after normal end/failure/peer close; introduce another eligible client. | New session/RTC/match with saved profile; no old transcript/turns/envelopes. Reload cannot retain a 30-minute reservation. | Real resume/rematch/restored-identity passed; full session/UI pending. |

Also disconnect the network while waiting. Check visible retries after 1/2/4/8 seconds and manual recovery after exhaustion; one fresh socket republishes sanitized profile. Leaving during retry must cancel all scheduled attempts. Unit tests exercise these controller timers; the live network/UI pass remains pending.

Inspect WebRTC with `chrome://webrtc-internals` or connection stats. TURN-only acceptance requires a selected relay candidate, not just credential retrieval. Avoid sharing transcripts, Lobby bearer session IDs or temporary credentials in exported diagnostics.
