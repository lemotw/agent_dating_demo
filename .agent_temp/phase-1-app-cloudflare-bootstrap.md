# Phase 1 — SolidJS/Vite + Cloudflare Application Bootstrap

Read `phase-0-shared-contract.md` first.

## Objective

Create the real production application shell beside the preserved `prototype/` folder.

At the end of this phase:
- the repository has a working SolidJS + TypeScript + Vite app;
- local development works;
- Cloudflare Worker + static asset integration is configured;
- a Durable Object binding exists and can be reached through the Worker;
- the visual shell is recognizably derived from the prototype;
- no real Pedelec/WebRTC/chat implementation is required yet.

## Required stack

Use:
- `solid-js`;
- Vite;
- TypeScript;
- current Cloudflare Workers Vite integration;
- Wrangler configuration;
- one Durable Object class for Lobby coordination.

Do not introduce:
- SSR;
- React;
- Next.js;
- TanStack Start;
- D1;
- KV;
- a separate Node backend.

## Preserve prototype

Do not edit or delete:
- `prototype/index.html`;
- `prototype/agent-lounge.html`;
- `prototype/docs/*`.

Do not clean/reset the existing dirty git state.

## Suggested production structure

Exact filenames may vary if there is a clear reason, but keep domains separated.

```text
src/
  App.tsx
  main.tsx
  styles/
  shared/
    constants.ts
    protocol.ts
    types.ts
  features/
    onboarding/
    profile/
    lobby/
    rtc/
    exchange/

worker/
  index.ts
  lobby-do.ts

vite.config.ts
wrangler.jsonc
package.json
```

## Shared constants

Create a browser-safe shared constant module and define:

```ts
export const MAX_SENT_TURNS_PER_AGENT = 50;
```

Do not hardcode 50 elsewhere. Later UI labels and orchestration must import this constant.

Also create a protocol version constant, for example:

```ts
export const PEER_PROTOCOL_VERSION = 1 as const;
```

## Worker routes

Prepare at minimum:

- normal SPA/static asset handling;
- `/api/lobby` for WebSocket upgrade/forwarding to the global Lobby Durable Object;
- a placeholder route contract for short-lived TURN credential retrieval, implemented fully in phase 4;
- optional `/api/health` for smoke checks.

Use one stable Durable Object name such as `global`.

## Lobby Durable Object skeleton

Provide the class and WebSocket-upgrade plumbing, but phase 1 does not need matching logic.

Use the Hibernation-capable Durable Object WebSocket API from the beginning so later phases do not need a transport rewrite.

The class should be structured to support:
- accepting client sockets;
- serializing socket attachment metadata;
- handling messages;
- handling close/error;
- internal presence/match state.

Do not build database persistence.

## UI shell

Use `prototype/index.html` as the visual language reference:
- light background;
- restrained cards/panels;
- staged progress/step indication;
- clear primary/secondary actions;
- chat/report surfaces that can later be reused.

Adapt the branding/content to Agent networking rather than copying Dating copy verbatim.

Create top-level staged application states/components for the eventual flow:
- connect;
- interview/profile;
- publish/ready;
- lobby;
- match proposal;
- connecting;
- agent exchange;
- summary.

These may contain placeholders in this phase.

Avoid building a generic dashboard that changes the prototype's focused staged flow.

## Client identity groundwork

Create a small local identity utility:
- generate `crypto.randomUUID()` once;
- store `clientId` in localStorage;
- restore it on reload.

Do not create accounts.

## Acceptance

- `npm run dev` launches the app.
- TypeScript checks pass.
- production build succeeds.
- Worker entry and Durable Object binding compile.
- opening the root URL shows the prototype-derived staged shell.
- `MAX_SENT_TURNS_PER_AGENT` exists as one shared constant with default 50.
- no files in `prototype/` are modified.
- no D1/KV/account system is introduced.
