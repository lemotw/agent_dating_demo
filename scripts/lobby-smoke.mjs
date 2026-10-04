// Phase 6 acceptance suite: run against a dedicated, otherwise empty local Lobby.
import assert from "node:assert/strict";
const base = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:5173";
const clients = [];
function open(clientId = crypto.randomUUID()) {
  const url = new URL("/api/lobby", base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("clientId", clientId);
  const socket = new WebSocket(url);
  const history = [], queued = [], subscribers = new Set();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    history.push(message); queued.push(message);
    for (const subscriber of [...subscribers]) subscriber();
  });
  const next = type => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { subscribers.delete(check); reject(new Error(`${clientId}: ${type} timed out`)); }, 8000);
    function check() {
      const index = queued.findIndex(message => message.type === type);
      if (index < 0) return;
      clearTimeout(timer); subscribers.delete(check); resolve(queued.splice(index, 1)[0]);
    }
    subscribers.add(check); check();
  });
  const send = (type, fields = {}) => socket.send(JSON.stringify({ v: 1, type, ...fields }));
  const profile = { clientId, displayName: "Acceptance user", agentName: "Acceptance Agent", publicSummary: "Public card only", topics: ["Ideas"], lookingFor: [], sections: [{ id: "topics", label: "Topics", text: "Public ideas" }], profileUpdatedAt: Date.now() };
  const client = { clientId, socket, next, send, history, profile };
  clients.push(client); return client;
}
async function join(client) {
  await client.next("connected");
  client.send("hello", { profile: client.profile });
  const published = await client.next("published");
  assert.equal(published.status, "waiting");
  assert.match(published.lobbySessionId, /^[0-9a-f-]{36}$/);
  client.lobbySessionId = published.lobbySessionId;
}
async function turn(client, matchId, fields = {}) {
  return fetch(new URL("/api/turn-credentials", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchId, clientId: client.clientId, lobbySessionId: client.lobbySessionId, ...fields }) });
}
const a = open();
try {
  await join(a);
  const b = open(); await join(b);
  const [abA, abB] = await Promise.all([a.next("match_proposed"), b.next("match_proposed")]);
  assert.equal(abA.matchId, abB.matchId);
  assert.deepEqual(abA.peer, b.profile);
  assert.deepEqual(abB.peer, a.profile);
  assert.equal(abA.role, "answerer"); assert.equal(abB.role, "offerer");

  // A cannot mutate an unrelated match; unknown/private fields are rejected.
  a.send("accept_match", { matchId: crypto.randomUUID() });
  assert.equal((await a.next("error")).code, "invalid_state");
  a.send("accept_match", { matchId: abA.matchId, privateTranscript: "must not be accepted" });
  assert.equal((await a.next("error")).code, "invalid_message");
  a.send("accept_match", { matchId: abA.matchId });
  const [decisionA, decisionB] = await Promise.all([a.next("consent_updated"), b.next("consent_updated")]);
  assert.equal(decisionA.ownConsent, "accepted"); assert.equal(decisionA.peerConsent, "pending");
  assert.equal(decisionB.ownConsent, "pending");
  assert.ok(!a.history.some(event => event.type === "match_ready"));
  assert.ok(!b.history.some(event => event.type === "match_ready"));
  assert.equal((await turn(a, abA.matchId)).status, 403);

  b.send("decline_match", { matchId: abB.matchId });
  const [cancelA, cancelB] = await Promise.all([a.next("match_cancelled"), b.next("match_cancelled")]);
  assert.equal(cancelA.reason, "declined"); assert.equal(cancelB.reason, "declined");
  await Promise.all([a.next("waiting"), b.next("waiting")]);

  // Both now wait but reject each other. New C must select newer B, leaving A free.
  const c = open(); await join(c);
  const [bcB, bcC] = await Promise.all([b.next("match_proposed"), c.next("match_proposed")]);
  assert.equal(bcB.matchId, bcC.matchId); assert.equal(bcC.peer.clientId, b.clientId);
  assert.equal(bcC.offererClientId, c.clientId);
  const d = open(); await join(d);
  const [adA, adD] = await Promise.all([a.next("match_proposed"), d.next("match_proposed")]);
  assert.equal(adA.matchId, adD.matchId); assert.equal(adD.peer.clientId, a.clientId);
  assert.notEqual(adA.matchId, bcB.matchId);
  assert.equal(a.history.filter(event => event.type === "match_proposed").length, 2);

  // A duplicate tab cannot steal an existing reservation.
  const duplicate = open(a.clientId);
  assert.equal((await duplicate.next("error")).code, "duplicate_client");

  c.socket.close();
  const peerLeft = await b.next("match_cancelled");
  assert.equal(peerLeft.matchId, bcB.matchId); assert.equal(peerLeft.reason, "peer_left");
  await b.next("waiting");
  const e = open(); await join(e);
  const [beB, beE] = await Promise.all([b.next("match_proposed"), e.next("match_proposed")]);
  assert.equal(beB.matchId, beE.matchId); assert.equal(beE.peer.clientId, b.clientId);
  b.send("accept_match", { matchId: beB.matchId });
  await Promise.all([b.next("consent_updated"), e.next("consent_updated")]);
  e.send("accept_match", { matchId: beE.matchId });
  const [readyB, readyE] = await Promise.all([b.next("match_ready"), e.next("match_ready")]);
  assert.equal(readyB.matchId, readyE.matchId); assert.equal(readyB.status, "connecting");
  b.send("agent_message", { matchId: beB.matchId, text: "Not a Lobby message" });
  assert.equal((await b.next("error")).code, "invalid_message");

  // A waiting socket close must remove it from candidate selection.
  d.send("decline_match", { matchId: adD.matchId });
  await Promise.all([a.next("match_cancelled"), d.next("match_cancelled")]);
  await Promise.all([a.next("waiting"), d.next("waiting")]);
  const closedD = new Promise(resolve => d.socket.addEventListener("close", resolve, { once: true }));
  d.socket.close(); await closedD;
  const f = open(); await join(f);
  const [afA, afF] = await Promise.all([a.next("match_proposed"), f.next("match_proposed")]);
  assert.equal(afA.matchId, afF.matchId); assert.equal(afF.peer.clientId, a.clientId);

  const invalid = open(); await invalid.next("connected");
  invalid.send("hello", { profile: { ...invalid.profile, interview: "Private" } });
  assert.equal((await invalid.next("error")).code, "invalid_message");
  invalid.send("hello", { profile: { ...invalid.profile, clientId: a.clientId } });
  assert.equal((await invalid.next("error")).code, "invalid_state");

  // Authorized signaling is public socket identity only; foreign session/role is rejected.
  assert.equal((await turn(b, beB.matchId, { lobbySessionId: crypto.randomUUID() })).status, 403);
  b.send("signal", { matchId: beB.matchId, senderClientId: b.clientId, lobbySessionId: b.lobbySessionId, payload: { kind: "offer", sdp: "v=0" } });
  assert.equal((await b.next("error")).code, "invalid_state");
  e.send("signal", { matchId: beE.matchId, senderClientId: e.clientId, lobbySessionId: e.lobbySessionId, payload: { kind: "offer", sdp: "v=0" } });
  const forwarded = await b.next("signal");
  assert.equal(forwarded.senderClientId, e.clientId);
  assert.equal(forwarded.lobbySessionId, undefined);
  assert.ok(forwarded.senderSocketId);
  const authorizedTurn = await turn(b, beB.matchId);
  assert.ok([200, 503].includes(authorizedTurn.status));
  assert.equal(authorizedTurn.headers.get("cache-control"), "no-store");
  assert.equal((await turn(b, beB.matchId)).status, 429);
  for (const client of [b, e]) client.send("connection_ready", { matchId: beB.matchId, senderClientId: client.clientId, lobbySessionId: client.lobbySessionId });
  await Promise.all([b.next("match_active"), e.next("match_active")]);
  e.socket.close();
  assert.equal((await b.next("match_cancelled")).reason, "peer_left");
  assert.equal((await turn(b, beB.matchId)).status, 403);
  b.send("resume_lobby", { senderClientId: b.clientId, lobbySessionId: b.lobbySessionId });
  await b.next("waiting");
  const g = open(); await join(g);
  const [newB, newG] = await Promise.all([b.next("match_proposed"), g.next("match_proposed")]);
  assert.equal(newB.matchId, newG.matchId); assert.notEqual(newB.matchId, beB.matchId);
  assert.equal(newG.peer.clientId, b.clientId);
  // The old identity may publish again, but the surviving session still excludes this pair.
  const restoredE = open(e.clientId); await join(restoredE);
  console.log("Lobby acceptance passed: publication, consent, recency, reservations, rejection memory, duplicate tabs, disconnect and protocol privacy.");
} finally {
  for (const client of clients) client.socket.close();
}
