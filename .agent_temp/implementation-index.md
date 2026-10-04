# Agent Chat MVP — Implementation Index

## Goal

Turn the existing prototype into a real, runnable MVP while keeping the product flow and visual rhythm as close to the prototype as practical.

The MVP must use:
- SolidJS + Vite for the browser app.
- Pedelec for all local Agent execution.
- Cloudflare free-plan-compatible services for deployment and coordination.
- WebRTC DataChannel for Agent-to-Agent realtime message transport.
- Cloudflare STUN + TURN for ICE connectivity.
- A very simple online Lobby matcher: when a new waiting user arrives, match them with the most recently joined compatible waiting user.

## Product authority

Primary product/interaction reference:
- `prototype/index.html`
- `prototype/docs/product-direction.md`
- `prototype/docs/demo-guide.md`

Secondary historical/technical reference only:
- `prototype/agent-lounge.html`

Do not blindly copy Dating-specific text or romance-specific semantics from `prototype/index.html`. The implementation should preserve the prototype's staged interaction model, consent rhythm, chat presentation, and summary/report style, while adapting the content to the current Agent networking product.

The agreed MVP flow is:
1. Establish a local Pedelec connection.
2. Agent interviews the user and helps create an Agent profile.
3. User reviews/edits what may be published.
4. Publish the Agent to the Lobby.
5. Lobby automatically pairs online waiting users using the simple recency rule.
6. Both users independently accept or decline the proposed match.
7. If both accept, establish WebRTC.
8. Each browser creates a fresh Pedelec match-chat session with only the approved profile context.
9. Agents alternate messages over WebRTC DataChannel.
10. Each Agent may send at most `MAX_SENT_TURNS_PER_AGENT` completed messages. Default is 50.
11. At natural completion or the turn cap, each local Agent generates one final summary; the summary is sent to the peer over DataChannel.
12. Present the received summary in a prototype-style final screen.

MVP ends at the Agent summary screen. Human-to-human chat is out of scope for this implementation.

## Phase files

- `phase-0-shared-contract.md` — common product, architecture, data, protocol, privacy, and constant definitions.
- `phase-1-app-cloudflare-bootstrap.md` — create the real SolidJS/Vite/Workers application shell and Cloudflare deployment structure.
- `phase-2-pedelec-profile-flow.md` — Pedelec readiness, interview, profile generation, shareable profile review, local persistence.
- `phase-3-lobby-matchmaking-consent.md` — Durable Object presence, recency matchmaking, consent, reconnect/cancel behavior.
- `phase-4-webrtc-signaling-turn.md` — signaling, STUN/TURN, RTCPeerConnection, DataChannel protocol.
- `phase-5-agent-exchange-summary.md` — fresh match sessions, turn orchestration, hard turn cap, summary exchange, final UI.
- `phase-6-end-to-end-hardening.md` — integrate the full flow, failure states, acceptance coverage, Cloudflare/Pedelec/WebRTC polish.

## Execution guidance

Read `phase-0-shared-contract.md` before any implementation phase.

Each later phase should implement only its own assigned scope against the contracts in phase 0. Do not audit whether earlier phases were completed correctly; a separate final check will handle cross-phase completeness.

Do not modify files under `prototype/` unless a later task explicitly asks for it. They are references, not production source.

Do not reset or restore the repository because the current working tree intentionally contains moved prototype material. Preserve the user's existing git state.
