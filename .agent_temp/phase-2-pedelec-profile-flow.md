# Phase 2 — Pedelec Readiness, Interview, and Publishable Agent Profile

Read `phase-0-shared-contract.md` first.

## Objective

Replace the prototype's fake interview/profile behavior with a real local Pedelec-driven profile flow while preserving the prototype's staged conversation and editable-summary UX.

At the end:
- the browser can detect Pedelec readiness;
- a user can complete a guided Agent interview;
- the interview uses a real local Pedelec session;
- the app produces a reviewable publishable Agent profile;
- private interview text is not uploaded to Cloudflare;
- final publishable profile can be restored locally.

## Pedelec integration constraints

Use the current `@kaoruisaac/pedelec` browser SDK.

The SDK runs in the browser and talks to the installed Pedelec extension/Desktop runtime. Do not put Pedelec code in the Worker.

Use readiness APIs from the SDK rather than custom extension probing:
- `checkAvailability()` for a complete non-interactive readiness probe;
- `getApprovalStatus()` when the UI needs installed/approved/appConnected detail.

When unavailable, show a clear prototype-style blocking panel with an actionable explanation.

Do not:
- call `openWorkspace()`;
- ask the user to pick a local folder;
- register filesystem tools;
- add provider/model selectors to the MVP.

Use a managed `pedelec.createSession(...)` session with the user's default Pedelec provider/profile configuration.

## Interview session

Create one private interview/profile session.

Its guidance should state that the Agent is interviewing the user to create a networking profile, not dating compatibility and not a psychological assessment.

Preserve the prototype's progressive six-part interview rhythm, adapted to the current product.

Recommended six checkpoints:

1. **People** — What kinds of people does the user want to meet or exchange ideas with?
2. **Topics** — Which topics, industries, technologies, hobbies, or questions are interesting now?
3. **Current context** — What is the user building, learning, researching, or working on?
4. **Shareable experience** — Which experiences, skills, viewpoints, or stories are useful to bring into a conversation?
5. **Conversation style** — What kind of interaction feels useful: exploratory, technical, casual, debate, collaboration, etc.?
6. **Boundaries** — What should the Agent avoid revealing or avoid steering conversations toward?

The UI may still present these as six steps even though the Agent response itself is dynamic.

Users must be able to skip a checkpoint.

## Agent turn behavior

For each interview checkpoint:
- browser sends the checkpoint context plus user answer to the Pedelec interview session;
- render `onChatDelta` for live local Agent presentation if useful;
- treat `onChat` as the completed assistant message;
- prevent double-send while the Pedelec session is busy;
- show errors explicitly rather than silently discarding a failed turn.

Do not upload the completed transcript to Cloudflare.

## Publishable profile generation

After the interview, ask the same private interview session to create structured candidate profile content.

Do not parse arbitrary prose if avoidable. Prompt the Agent to return a single machine-readable JSON object enclosed in a predictable response contract.

Recommended candidate shape:

```ts
type ProfileCandidate = {
  displaySummary: string;
  topics: string[];
  lookingFor: string[];
  sections: Array<{
    id:
      | "people"
      | "topics"
      | "context"
      | "experience"
      | "conversation_style"
      | "boundaries";
    label: string;
    text: string;
  }>;
};
```

Validate the JSON in the browser.

If parsing fails:
- show a generation failure state;
- allow the user to retry profile generation;
- do not fabricate fields.

## Review / sharing UX

Follow the privacy rhythm of the prototype's consent page.

Each generated section must be:
- visible to the user;
- editable;
- individually enabled/disabled for publication.

Default sharing state should be conservative. Do not infer that private interview participation equals permission to publish.

Require at least enough publishable information to make a meaningful Lobby card before continuing.

Recommended minimum:
- non-empty display/public summary;
- at least one topic or looking-for item;
- at least one enabled section.

The user may edit Agent-generated text before publishing.

## Local profile model

Build a final `LocalAgentProfile` using the shared contract.

Add:
- `displayName` from user input;
- `agentName` from user input or a simple default;
- stable `clientId` from local identity utility;
- only user-approved publishable content.

Store the final profile in localStorage.

Recommended key:
`agent-chat:profile:v1`

Do not store raw private interview transcript in localStorage unless technically necessary. Prefer ephemeral in-memory transcript state.

If an existing valid profile is restored, provide a way to:
- continue to Lobby;
- edit/re-run profile setup.

## Publishable Lobby payload

Create a function that derives a sanitized public payload from `LocalAgentProfile`.

Example:

```ts
type LobbyAgentProfile = {
  clientId: string;
  displayName: string;
  agentName: string;
  publicSummary: string;
  topics: string[];
  lookingFor: string[];
  sections: Array<{
    id: string;
    label: string;
    text: string;
  }>;
  profileUpdatedAt: number;
};
```

Only enabled sections may appear.

Keep this conversion centralized. Later Lobby code should never serialize the raw local profile object directly.

## Prototype fidelity

Reuse the prototype's ideas:
- conversational interview panel;
- progress indicator;
- editable summary/review page;
- explicit sharing consent;
- calm light visual language.

Do not copy:
- 18+ declaration;
- dating/relationship-specific copy;
- swipe-card discovery;
- claims about compatibility.

## Session cleanup

When leaving profile creation:
- end the interview session when it is no longer needed;
- do not keep the private session alive for Lobby or match chat;
- final Lobby/match flow should depend only on the sanitized published profile.

## Acceptance

- Pedelec unavailable state is visible and blocks Agent-dependent actions.
- A real Pedelec interview session is used.
- Six adapted interview checkpoints exist and may be skipped.
- Completed Agent messages are rendered without duplicate deltas.
- Profile candidate generation is structured and validated.
- User can edit and toggle publishable sections.
- Raw interview transcript never enters Lobby payload.
- Valid profile persists locally and can be restored.
- Match chat does not reuse the interview session.
