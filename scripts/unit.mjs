// Uses the existing Vite TypeScript loader and Node runner; no extra test framework.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createServer } from "vite";
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] }, appType: "custom" });
after(() => vite.close());
const profileModule = await vite.ssrLoadModule("/src/features/profile/profile.ts");
const { getOrCreateClientId } = await vite.ssrLoadModule("/src/features/onboarding/identity.ts");
const { parsePeerEnvelope, isSignalingMessage, isLobbyAgentProfile } = await vite.ssrLoadModule("/src/shared/protocol.ts");
const { PeerConnection } = await vite.ssrLoadModule("/src/features/rtc/peer.ts");
const { createExchange, parseAgentReply } = await vite.ssrLoadModule("/src/features/exchange/exchange.ts");
const { createLobbyConnection } = await vite.ssrLoadModule("/src/features/lobby/lobby.ts");
const { createRoot } = await import("solid-js");
const { Pedelec } = await import("@kaoruisaac/pedelec");
const { createInterview } = await vite.ssrLoadModule("/src/features/onboarding/interview.ts");
const { LOBBY_RECONNECT_DELAYS_MS, MAX_PEER_TEXT_LENGTH } = await vite.ssrLoadModule("/src/shared/constants.ts");
const { parseTurnRequest, readBoundedJson, issueTurnCredentials } = await vite.ssrLoadModule("/worker/turn.ts");
const id = () => crypto.randomUUID();
const card = (clientId = id()) => ({ clientId, displayName: "Test", agentName: "Test Agent", publicSummary: "Approved summary", topics: ["Ideas"], lookingFor: [], sections: [{ id: "topics", label: "Topics", text: "Public topic" }], profileUpdatedAt: Date.now() });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const localProfile = () => {
  const publicCard = card();
  return { ...publicCard, shareSections: [...publicCard.sections.map(s => ({ ...s, enabled: true })), { id: "boundaries", label: "Private", text: "PRIVATE_SENTINEL", enabled: false }], updatedAt: publicCard.profileUpdatedAt, privateTranscript: "TRANSCRIPT_SENTINEL" };
};

test("only sanitized public profile survives storage/reload; identity stays distinct", () => {
  const store = storage(), profile = localProfile();
  const saved = profileModule.saveProfile(profile, store);
  const raw = store.getItem(profileModule.PROFILE_KEY);
  assert.ok(!raw.includes("PRIVATE_SENTINEL") && !raw.includes("TRANSCRIPT_SENTINEL"));
  assert.ok(isLobbyAgentProfile(profileModule.toLobbyAgentProfile(saved)));
  assert.deepEqual(profileModule.restoreProfile(profile.clientId, store), saved);
  assert.equal(profileModule.restoreProfile(id(), store), null);
  // Older or externally modified storage also passes through the persistence allowlist.
  store.setItem(profileModule.PROFILE_KEY, JSON.stringify(profile));
  assert.equal(profileModule.restoreProfile(profile.clientId, store).privateTranscript, undefined);
  assert.equal(profileModule.restoreProfile(profile.clientId, store).shareSections.length, 1);
  const identity = getOrCreateClientId(store);
  assert.equal(getOrCreateClientId(store), identity);
  assert.notEqual(getOrCreateClientId(storage()), identity);
  store.setItem(profileModule.PROFILE_KEY, "{broken");
  assert.equal(profileModule.restoreProfile(profile.clientId, store), null);
  const oversized = localProfile();
  oversized.shareSections = ["people", "topics", "context", "experience", "conversation_style", "boundaries"].map(sectionId => ({ id: sectionId, enabled: true, label: "中".repeat(4000), text: "中".repeat(4000) }));
  assert.throws(() => profileModule.toLobbyAgentProfile(oversized), /傳送限制/);
});

test("public card, signaling and peer envelope reject private, oversized and malformed fields", () => {
  const publicCard = card();
  assert.equal(isLobbyAgentProfile({ ...publicCard, transcript: "private" }), false);
  assert.equal(isLobbyAgentProfile({ ...publicCard, topics: Array(21).fill("topic") }), false);
  assert.equal(isLobbyAgentProfile({ ...publicCard, publicSummary: "x".repeat(4001) }), false);
  const signal = { v: 1, type: "signal", matchId: id(), senderClientId: id(), lobbySessionId: id(), payload: { kind: "offer", sdp: "v=0" } };
  assert.ok(isSignalingMessage(signal));
  assert.equal(isSignalingMessage({ ...signal, payload: { kind: "offer", sdp: "x".repeat(65537) } }), false);
  assert.equal(isSignalingMessage({ ...signal, payload: { kind: "ice", candidate: { candidate: "x", sdpMid: null, sdpMLineIndex: -1 } } }), false);
  const envelope = { v: 1, matchId: id(), messageId: id(), senderClientId: id(), sentAt: Date.now(), type: "summary", text: "Real peer summary" };
  const parse = value => parsePeerEnvelope(value, envelope.matchId, envelope.senderClientId);
  assert.deepEqual(parse(envelope), envelope);
  for (const value of [null, [], { ...envelope, v: 2 }, { ...envelope, matchId: id() }, { ...envelope, senderClientId: id() }, { ...envelope, extra: "private" }, { ...envelope, text: "x".repeat(MAX_PEER_TEXT_LENGTH + 1) }]) assert.equal(parse(value), null);
  const turn = { ...envelope, type: "agent_message", intent: "continue", senderTurn: 1 };
  assert.ok(parse(turn));
  assert.equal(parse({ ...turn, senderTurn: 51 }), null);
  assert.equal(parse({ ...turn, senderTurn: 1.5 }), null);
});

test("DataChannel dedupes IDs and rejects out-of-order/wrong-match messages before listeners", () => {
  const matchId = id(), peerClientId = id(), delivered = [];
  const connection = new PeerConnection({ matchId, clientId: id(), peerClientId, lobbySessionId: id(), expiresAt: Date.now() + 1000, role: "answerer", sendControl: () => true, onState: () => {} });
  const channel = { close() {} };
  // Exercise the actual transport handler with a small in-memory DataChannel.
  connection.attachChannel(channel);
  connection.subscribe(message => delivered.push(message));
  const envelope = { v: 1, matchId, messageId: id(), senderClientId: peerClientId, sentAt: Date.now(), type: "agent_message", senderTurn: 1, intent: "continue", text: "Hello" };
  for (const data of ["{broken", JSON.stringify({ ...envelope, matchId: id() }), JSON.stringify({ ...envelope, senderTurn: 2 }), JSON.stringify(envelope), JSON.stringify(envelope), JSON.stringify({ ...envelope, messageId: id() })]) channel.onmessage({ data });
  assert.equal(delivered.length, 1);
  channel.onmessage({ data: JSON.stringify({ ...envelope, senderTurn: 2, messageId: id() }) });
  assert.equal(delivered.length, 2);
  connection.teardown();
});

test("structured completed Agent replies never extract JSON from prose or accept blank/huge text", () => {
  assert.deepEqual(parseAgentReply('{"action":"reply","message":" Hello "}'), { action: "reply", message: "Hello" });
  assert.equal(parseAgentReply('{"action":"finish","message":"Goodbye"}').action, "finish");
  for (const raw of ["prose {}", "```json\n{}\n```", '{"action":"reply","message":" "}', '{"action":"reply","message":"x","extra":1}', JSON.stringify({ action: "reply", message: "x".repeat(MAX_PEER_TEXT_LENGTH + 1) })]) assert.throws(() => parseAgentReply(raw));
});

function fakeSession(reply = { action: "reply", message: "Reply" }) {
  const chats = new Set(), errors = new Set();
  const stats = { calls: [], active: 0, peak: 0, ended: 0 };
  return {
    stats,
    getStatus: () => stats.active ? "running" : "idle",
    onChat: fn => { chats.add(fn); return () => chats.delete(fn); },
    onError: fn => { errors.add(fn); return () => errors.delete(fn); },
    error: () => { for (const fn of errors) fn({ message: "Runtime failed" }); },
    async sendText(prompt) {
      stats.active++; stats.peak = Math.max(stats.peak, stats.active); stats.calls.push(prompt);
      try {
        await new Promise(resolve => setTimeout(resolve, 2));
        const parsed = JSON.parse(prompt);
        const text = parsed.kind === "final_summary" ? JSON.stringify({ summary: "Summary from this Agent" }) : JSON.stringify(reply);
        for (const fn of chats) fn(text, { turnId: id(), turnKind: "chat" });
      } finally { stats.active--; }
    },
    async end() { stats.ended++; },
  };
}
function fakeConnection() {
  const listeners = new Set(), sent = [];
  return { sent, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, send(message) { sent.push(message); return message; }, receive(message) { for (const fn of [...listeners]) fn(message); } };
}
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error("Test flow timed out"); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function flow(connection, session, extra = {}) {
  return createExchange({ local: card(), peer: card(), role: "offerer", connection, createSession: async config => { assert.ok(!JSON.stringify(config).includes("PRIVATE_SENTINEL")); return session; }, onStage() {}, onComplete() {}, ...extra });
}
test("two separate sessions alternate, stop exactly at injected cap and exchange actual summaries", async () => {
  const a = fakeConnection(), b = fakeConnection(), sa = fakeSession(), sb = fakeSession();
  a.send = message => { a.sent.push(message); queueMicrotask(() => b.receive(message)); return message; };
  b.send = message => { b.sent.push(message); queueMicrotask(() => a.receive(message)); return message; };
  const fa = flow(a, sa, { turnLimit: 2 }), fb = flow(b, sb, { turnLimit: 2, role: "answerer" });
  try {
    await Promise.all([fa.start(), fb.start()]);
    fa.connectionChanged("connected"); fb.connectionChanged("connected");
    await until(() => fa.summaryDone() && fb.summaryDone() && fa.peerSummary() && fb.peerSummary());
    const localMessages = a.sent.filter(m => m.type === "agent_message"), peerMessages = b.sent.filter(m => m.type === "agent_message");
    assert.deepEqual(localMessages.map(m => m.senderTurn), [1, 2]);
    assert.deepEqual(peerMessages.map(m => m.senderTurn), [1, 2]);
    assert.equal(fa.reason(), "turn_limit"); assert.equal(fb.reason(), "turn_limit");
    assert.equal(sa.stats.peak, 1); assert.equal(sb.stats.peak, 1);
    assert.equal(sa.stats.calls.length, 3); assert.equal(sb.stats.calls.length, 3);
    assert.equal(fa.peerSummary(), "Summary from this Agent");
    assert.equal(sa.stats.ended, 1); assert.equal(sb.stats.ended, 1);
  } finally { fa.dispose(); fb.dispose(); }
});

for (const mode of ["natural", "manual", "failure", "disconnect"]) test(`${mode} ending stops normal generation; missing summary stays unavailable`, async () => {
  const connection = fakeConnection(), session = fakeSession(mode === "natural" ? { action: "finish", message: "Goodbye" } : undefined);
  const f = flow(connection, session, { summaryTimeoutMs: 30 });
  try {
    await f.start(); f.connectionChanged("connected");
    connection.receive({ type: "control", action: "session_ready" });
    if (mode === "manual") f.end();
    if (mode === "failure") session.error();
    if (mode === "disconnect") f.connectionChanged("failed");
    await until(() => f.summaryUnavailable());
    assert.equal(f.peerSummary(), "");
    if (mode !== "natural") assert.equal(connection.sent.filter(m => m.type === "agent_message").length, 0);
    if (mode === "failure" || mode === "disconnect") assert.equal(session.stats.calls.length, 1);
    else assert.equal(session.stats.calls.length, 2);
    assert.equal(session.stats.peak, 1);
    assert.equal(session.stats.ended, 1);
    if (mode === "failure") { assert.equal(f.reason(), "local_agent_error"); assert.match(f.error(), /Runtime failed/); }
  } finally { f.dispose(); }
});

test("rejected transmission retries the same completed reply without another model call or turn increment", async () => {
  const connection = fakeConnection(), session = fakeSession();
  let reject = true;
  const send = connection.send;
  connection.send = message => message.type === "agent_message" && reject ? null : send(message);
  const f = flow(connection, session);
  try {
    await f.start(); f.connectionChanged("connected");
    connection.receive({ type: "control", action: "session_ready" });
    await until(() => !f.busy() && f.error());
    assert.equal(f.sentTurns(), 0); assert.equal(session.stats.calls.length, 1);
    reject = false; f.retry();
    await until(() => f.sentTurns() === 1);
    assert.equal(session.stats.calls.length, 1);
    assert.equal(connection.sent.filter(m => m.type === "agent_message").length, 1);
  } finally { f.dispose(); }
});

test("Lobby retries bounded backoff, republishes on fresh sockets and cleans up timers", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const oldSocket = globalThis.WebSocket, oldLocation = globalThis.location;
  const sockets = [];
  class FakeSocket {
    static OPEN = 1;
    readyState = 0;
    sent = [];
    constructor() { sockets.push(this); }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  globalThis.WebSocket = FakeSocket; globalThis.location = { origin: "http://localhost" };
  let dispose, lobby;
  try {
    createRoot(cleanup => { dispose = cleanup; lobby = createLobbyConnection(() => card(), () => {}); });
    lobby.connect();
    sockets[0].close();
    for (const delay of LOBBY_RECONNECT_DELAYS_MS) {
      assert.equal(lobby.status(), "reconnecting");
      t.mock.timers.tick(delay);
      sockets.at(-1).close();
    }
    assert.equal(sockets.length, 5); assert.equal(lobby.status(), "disconnected");
    lobby.connect();
    const current = sockets.at(-1);
    current.readyState = 1; current.onopen();
    assert.equal(current.sent[0].type, "hello"); assert.ok(isLobbyAgentProfile(current.sent[0].profile));
    current.onmessage({ data: JSON.stringify({ v: 1, type: "published", lobbySessionId: id(), status: "waiting" }) });
    assert.equal(lobby.status(), "waiting");
    current.close(); assert.equal(lobby.status(), "reconnecting");
    dispose(); t.mock.timers.tick(100_000);
    assert.equal(sockets.length, 6);
  } finally { dispose?.(); globalThis.WebSocket = oldSocket; globalThis.location = oldLocation; }
});

test("TURN body/request bounds and upstream credential shape", async t => {
  assert.equal(parseTurnRequest({ matchId: id(), clientId: id(), lobbySessionId: id(), extra: true }), null);
  assert.ok(parseTurnRequest({ matchId: id(), clientId: id(), lobbySessionId: id() }));
  await assert.rejects(() => readBoundedJson(new Response("x".repeat(100)).body, 10));
  assert.deepEqual(await readBoundedJson(new Response('{"ok":true}').body, 100), { ok: true });
  t.mock.method(globalThis, "fetch", async (_url, request) => {
    assert.equal(JSON.parse(request.body).ttl, 3600);
    return Response.json({ iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:5349?transport=tcp"], username: "temporary", credential: "temporary" }] });
  });
  const credentials = await issueTurnCredentials({ TURN_KEY_ID: "test-key", TURN_KEY_API_TOKEN: "test-token" });
  assert.equal(credentials.iceServers.length, 2); assert.ok(credentials.expiresAt > Date.now());
});

test("interview operation timeout allows exit without overlapping a still-running SDK operation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const session = fakeSession();
  session.sendText = prompt => { session.stats.calls.push(prompt); return new Promise(() => {}); };
  t.mock.method(Pedelec.prototype, "checkAvailability", async () => ({ available: true, extension: { available: true }, desktop: { available: true }, approval: { approved: true } }));
  t.mock.method(Pedelec.prototype, "createSession", async () => session);
  let interview, dispose;
  try {
    createRoot(cleanup => { dispose = cleanup; interview = createInterview(); });
    assert.equal(await interview.start(), true);
    const answer = interview.answer("Fictional test answer");
    t.mock.timers.tick(120_000);
    assert.equal(await answer, false);
    assert.match(interview.error(), /逾時/);
    assert.equal(interview.busy(), false);
    assert.equal(await interview.answer("Do not overlap"), false);
    assert.equal(session.stats.calls.length, 1);
    await interview.end();
    assert.equal(interview.active(), false);
  } finally { dispose?.(); }
});
