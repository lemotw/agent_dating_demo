import { DurableObject } from "cloudflare:workers";
import { API_ROUTES, isClientId, LOBBY_HELLO_TIMEOUT_MS, MATCH_CONNECT_TIMEOUT_MS, MATCH_CONSENT_TIMEOUT_MS, MATCH_ACTIVE_TIMEOUT_MS, MAX_LOBBY_MESSAGE_BYTES, TURN_REQUEST_INTERVAL_MS } from "../src/shared/constants";
import { parseLobbyClientMessage, type LobbyServerMessage, type MatchCancellationReason } from "../src/shared/protocol";
import type { ActiveMatch, LobbyAgentProfile, LobbySocketAttachment } from "../src/shared/types";
import { issueTurnCredentials, parseTurnRequest, readBoundedJson } from "./turn";

export class Lobby extends DurableObject<Env> {
  private readonly presence = new Map<WebSocket, LobbySocketAttachment>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Only short-lived public/control state; never interview sessions or transcripts.
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS lobby_profiles (session_id TEXT PRIMARY KEY, profile TEXT NOT NULL)`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS lobby_rejections (session_id TEXT NOT NULL, peer_client_id TEXT NOT NULL, PRIMARY KEY(session_id, peer_client_id))`);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS lobby_matches (match_id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, record TEXT NOT NULL)`);
    for (const socket of ctx.getWebSockets()) {
      const metadata: LobbySocketAttachment | null = socket.deserializeAttachment();
      if (metadata && socket.readyState === WebSocket.OPEN) this.presence.set(socket, metadata);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === API_ROUTES.turnCredentials) return this.turnCredentials(request);
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return Response.json({ error: "websocket_required" }, { status: 426, headers: { Upgrade: "websocket" } });
    const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
    if (!isClientId(clientId)) return Response.json({ error: "invalid_client_id" }, { status: 400 });
    this.cleanup();
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    // Reject through the socket too, so browsers can explain the conflict.
    if ([...this.presence.values()].some(peer => peer.clientId === clientId) || this.matches().some(match => match.aClientId === clientId || match.bClientId === clientId)) {
      this.send(server, { v: 1, type: "error", code: "duplicate_client" });
      server.close(1008, "Client already in Lobby or match");
    } else {
      const metadata: LobbySocketAttachment = { clientId, socketId: crypto.randomUUID(), lobbySessionId: crypto.randomUUID(), joinedAt: Date.now(), status: "connected" };
      this.save(server, metadata);
      this.send(server, { v: 1, type: "connected", socketId: metadata.socketId });
    }
    await this.scheduleCleanup();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.cleanup();
    try {
      const metadata = this.presence.get(socket);
      if (!metadata) return;
      if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_LOBBY_MESSAGE_BYTES) {
        this.disconnect(socket);
        socket.close(1009, "Control payload too large or binary");
        return;
      }
      let value: unknown;
      try { value = JSON.parse(message); } catch { this.error(socket, "invalid_message"); return; }
      const input = parseLobbyClientMessage(value);
      if (!input) { this.error(socket, "invalid_message"); return; }
      if (input.type === "ping") { this.send(socket, { v: 1, type: "pong" }); return; }
      if (input.type === "hello") {
        if (metadata.status !== "connected" || input.profile.clientId !== metadata.clientId) { this.error(socket, "invalid_state"); return; }
        this.ctx.storage.sql.exec("INSERT INTO lobby_profiles (session_id, profile) VALUES (?, ?)", metadata.lobbySessionId, JSON.stringify(input.profile));
        // joinedAt is assigned at publication by the server; strictly ordered even within one ms.
        metadata.joinedAt = Math.max(Date.now(), ...[...this.presence.values()].map(peer => peer.joinedAt + 1));
        metadata.status = "waiting";
        this.save(socket, metadata);
        this.send(socket, { v: 1, type: "published", lobbySessionId: metadata.lobbySessionId, status: "waiting" });
        this.match(socket);
        return;
      }
      if (input.type === "resume_lobby") {
        if (metadata.status !== "paused" || metadata.matchId || metadata.clientId !== input.senderClientId || metadata.lobbySessionId !== input.lobbySessionId) { this.error(socket, "invalid_state"); return; }
        metadata.status = "waiting"; this.save(socket, metadata);
        this.send(socket, { v: 1, type: "waiting" }); this.match(socket); return;
      }
      const match = this.getMatch(input.matchId);
      if (input.type === "signal" || input.type === "connection_ready" || input.type === "match_failed" || input.type === "leave_match") {
        if (!match || !this.authorized(match, metadata, input.senderClientId, input.lobbySessionId)) { this.error(socket, "invalid_state"); return; }
        if (input.type === "signal") {
          if ((input.payload.kind === "offer" && metadata.clientId !== match.offererClientId) || (input.payload.kind === "answer" && metadata.clientId === match.offererClientId)) { this.error(socket, "invalid_state"); return; }
          const peer = this.participants(match).find(([peerSocket]) => peerSocket !== socket);
          if (peer) this.send(peer[0], { v: 1, type: "signal", matchId: input.matchId, senderClientId: metadata.clientId, senderSocketId: metadata.socketId, payload: input.payload });
          else this.error(socket, "invalid_state");
        } else if (input.type === "match_failed" || input.type === "leave_match") {
          this.cancel(match, input.type === "match_failed" ? "connection_failed" : "ended");
          this.rematch();
        } else if (match.phase === "connecting") {
          if (metadata.lobbySessionId === match.aSessionId) match.aReady = true;
          else match.bReady = true;
          if (match.aReady && match.bReady) {
            match.phase = "active";
            match.expiresAt = Date.now() + MATCH_ACTIVE_TIMEOUT_MS;
          }
          this.storeMatch(match);
          if (match.phase === "active") for (const [peer, data] of this.participants(match)) {
            data.status = "in_match"; this.save(peer, data);
            this.send(peer, { v: 1, type: "match_active", matchId: match.matchId, expiresAt: match.expiresAt });
          }
        }
        return;
      }
      if (!match || match.phase !== "consent" || metadata.matchId !== match.matchId || ![match.aSessionId, match.bSessionId].includes(metadata.lobbySessionId)) { this.error(socket, "invalid_state"); return; }
      const own = metadata.lobbySessionId === match.aSessionId ? "aConsent" : "bConsent";
      if (input.type === "decline_match") {
        match[own] = "declined";
        this.cancel(match, "declined");
        this.rematch();
        return;
      }
      match[own] = "accepted";
      if (match.aConsent === "accepted" && match.bConsent === "accepted") {
        match.phase = "connecting";
        match.expiresAt = Date.now() + MATCH_CONNECT_TIMEOUT_MS;
        this.storeMatch(match);
        for (const [peer, data] of this.participants(match)) {
          data.status = "connecting";
          this.save(peer, data);
          this.send(peer, { v: 1, type: "match_ready", matchId: match.matchId, offererClientId: match.offererClientId, status: "connecting", expiresAt: match.expiresAt });
        }
      } else {
        this.storeMatch(match);
        for (const [peer, data] of this.participants(match)) this.send(peer, { v: 1, type: "consent_updated", matchId: match.matchId, ownConsent: data.lobbySessionId === match.aSessionId ? match.aConsent : match.bConsent, peerConsent: data.lobbySessionId === match.aSessionId ? match.bConsent : match.aConsent });
      }
    } finally { await this.scheduleCleanup(); }
  }

  async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.disconnect(socket);
    socket.close(1000, "Lobby closed");
    await this.scheduleCleanup();
  }
  async webSocketError(socket: WebSocket, _error: unknown): Promise<void> {
    this.disconnect(socket);
    socket.close(1011, "Lobby connection error");
    await this.scheduleCleanup();
  }
  async alarm(): Promise<void> {
    this.cleanup();
    await this.scheduleCleanup();
  }

  private save(socket: WebSocket, data: LobbySocketAttachment): void {
    socket.serializeAttachment(data);
    this.presence.set(socket, data);
  }
  private authorized(match: ActiveMatch, data: LobbySocketAttachment, clientId: string, sessionId: string): boolean {
    return data.matchId === match.matchId && data.clientId === clientId && data.lobbySessionId === sessionId &&
      ((match.aClientId === clientId && match.aSessionId === sessionId) || (match.bClientId === clientId && match.bSessionId === sessionId)) &&
      match.aConsent === "accepted" && match.bConsent === "accepted" && match.phase !== "consent" && match.expiresAt > Date.now();
  }
  private async turnCredentials(request: Request): Promise<Response> {
    const reply = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
    if (request.method !== "POST") return reply("method_not_allowed", 405);
    let input;
    try { input = parseTurnRequest(await readBoundedJson(request.body, 1024)); } catch { return reply("invalid_request", 400); }
    if (!input) return reply("invalid_request", 400);
    this.cleanup();
    const participant = [...this.presence].find(([socket, data]) => socket.readyState === WebSocket.OPEN && data.clientId === input.clientId && data.lobbySessionId === input.lobbySessionId);
    const match = this.getMatch(input.matchId);
    if (!participant || !match || !this.authorized(match, participant[1], input.clientId, input.lobbySessionId) || this.participants(match).length !== 2) return reply("match_not_authorized", 403);
    const [socket, data] = participant;
    if ((data.turnRequests ?? 0) >= 3 || Date.now() - (data.lastTurnRequestAt ?? 0) < TURN_REQUEST_INTERVAL_MS) return reply("rate_limited", 429);
    // Reserve quota before external I/O, including failed attempts; survives hibernation.
    data.turnRequests = (data.turnRequests ?? 0) + 1;
    data.lastTurnRequestAt = Date.now();
    this.save(socket, data);
    try {
      const credentials = await issueTurnCredentials(this.env);
      const currentMatch = this.getMatch(input.matchId), current = this.presence.get(socket);
      if (!current || socket.readyState !== WebSocket.OPEN || !currentMatch || !this.authorized(currentMatch, current, input.clientId, input.lobbySessionId)) return reply("match_not_authorized", 403);
      return Response.json(credentials, { headers: { "Cache-Control": "no-store" } });
    } catch { return reply("turn_unavailable", 503); }
    finally { await this.scheduleCleanup(); }
  }
  private profile(sessionId: string): LobbyAgentProfile | undefined {
    const row = this.ctx.storage.sql.exec<{ profile: string }>("SELECT profile FROM lobby_profiles WHERE session_id = ?", sessionId).toArray()[0];
    return row ? JSON.parse(row.profile) as LobbyAgentProfile : undefined;
  }
  private matches(): ActiveMatch[] {
    return this.ctx.storage.sql.exec<{ record: string }>("SELECT record FROM lobby_matches").toArray().map(row => JSON.parse(row.record) as ActiveMatch);
  }
  private getMatch(id: string): ActiveMatch | undefined {
    const row = this.ctx.storage.sql.exec<{ record: string }>("SELECT record FROM lobby_matches WHERE match_id = ?", id).toArray()[0];
    return row ? JSON.parse(row.record) as ActiveMatch : undefined;
  }
  private storeMatch(match: ActiveMatch): void {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO lobby_matches (match_id, expires_at, record) VALUES (?, ?, ?)", match.matchId, match.expiresAt, JSON.stringify(match));
  }
  private participants(match: ActiveMatch): Array<[WebSocket, LobbySocketAttachment]> {
    return [...this.presence].filter(([, data]) => data.lobbySessionId === match.aSessionId || data.lobbySessionId === match.bSessionId);
  }
  private rejected(sessionId: string, clientId: string): boolean {
    return this.ctx.storage.sql.exec("SELECT 1 FROM lobby_rejections WHERE session_id = ? AND peer_client_id = ?", sessionId, clientId).toArray().length > 0;
  }
  private match(socket: WebSocket): void {
    const data = this.presence.get(socket);
    if (!data || data.status !== "waiting" || socket.readyState !== WebSocket.OPEN) return;
    const candidate = [...this.presence].filter(([peer, info]) => peer.readyState === WebSocket.OPEN && info.status === "waiting" && info.clientId !== data.clientId && !this.rejected(data.lobbySessionId, info.clientId) && !this.rejected(info.lobbySessionId, data.clientId)).sort((a, b) => b[1].joinedAt - a[1].joinedAt)[0];
    if (!candidate) return;
    const [peer, peerData] = candidate;
    const ownProfile = this.profile(data.lobbySessionId), peerProfile = this.profile(peerData.lobbySessionId);
    if (!ownProfile || !peerProfile) return;
    const now = Date.now();
    const match: ActiveMatch = { matchId: crypto.randomUUID(), aClientId: data.clientId, bClientId: peerData.clientId, aSessionId: data.lobbySessionId, bSessionId: peerData.lobbySessionId, offererClientId: data.joinedAt > peerData.joinedAt ? data.clientId : peerData.clientId, createdAt: now, expiresAt: now + MATCH_CONSENT_TIMEOUT_MS, aConsent: "pending", bConsent: "pending", phase: "consent" };
    // No await in any transition: both reservations and the record precede all proposals.
    this.storeMatch(match);
    for (const [participant, info] of [[socket, data], [peer, peerData]] as const) {
      info.status = "reserved";
      info.matchId = match.matchId;
      info.turnRequests = 0;
      info.lastTurnRequestAt = 0;
      this.save(participant, info);
    }
    for (const [participant, info] of [[socket, data], [peer, peerData]] as const) {
      info.status = "consent_pending";
      this.save(participant, info);
    }
    this.send(socket, { v: 1, type: "match_proposed", matchId: match.matchId, peer: peerProfile, offererClientId: match.offererClientId, role: match.offererClientId === data.clientId ? "offerer" : "answerer", expiresAt: match.expiresAt });
    this.send(peer, { v: 1, type: "match_proposed", matchId: match.matchId, peer: ownProfile, offererClientId: match.offererClientId, role: match.offererClientId === peerData.clientId ? "offerer" : "answerer", expiresAt: match.expiresAt });
  }
  private rematch(): void {
    // Newest eligibility is processed first; each attempt still selects newest eligible peer.
    for (const [socket] of [...this.presence].sort((a, b) => b[1].joinedAt - a[1].joinedAt)) this.match(socket);
  }
  private cancel(match: ActiveMatch, reason: MatchCancellationReason): void {
    this.ctx.storage.sql.exec("DELETE FROM lobby_matches WHERE match_id = ?", match.matchId);
    // Also suppress repeated timeouts/disconnect churn within the surviving session.
    this.ctx.storage.sql.exec("INSERT OR IGNORE INTO lobby_rejections VALUES (?, ?), (?, ?)", match.aSessionId, match.bClientId, match.bSessionId, match.aClientId);
    for (const [socket, data] of this.participants(match)) {
      delete data.matchId;
      // Connection failures remain visible until the user explicitly resumes the Lobby.
      data.status = match.phase === "consent" ? "waiting" : "paused";
      this.save(socket, data);
      this.send(socket, { v: 1, type: "match_cancelled", matchId: match.matchId, reason });
      if (data.status === "waiting") this.send(socket, { v: 1, type: "waiting" });
    }
  }
  private disconnect(socket: WebSocket): void {
    const data: LobbySocketAttachment | null | undefined = this.presence.get(socket) ?? socket.deserializeAttachment();
    this.presence.delete(socket);
    if (!data) return;
    const match = data.matchId ? this.getMatch(data.matchId) : undefined;
    // A lost control session ends the match too. Reloads must not leave a 30-minute reservation.
    if (match) this.cancel(match, "peer_left");
    this.removeSession(data.lobbySessionId);
    this.rematch();
  }
  private removeSession(sessionId: string): void {
    this.ctx.storage.sql.exec("DELETE FROM lobby_profiles WHERE session_id = ?", sessionId);
    this.ctx.storage.sql.exec("DELETE FROM lobby_rejections WHERE session_id = ?", sessionId);
  }
  private cleanup(): void {
    for (const [socket, data] of [...this.presence]) {
      if (socket.readyState !== WebSocket.OPEN || (data.status === "connected" && data.joinedAt + LOBBY_HELLO_TIMEOUT_MS <= Date.now())) {
        this.disconnect(socket);
        socket.close(1008, "Lobby presence expired");
      }
    }
    for (const match of this.matches()) {
      const participants = this.participants(match);
      if (match.expiresAt <= Date.now() || (match.phase !== "active" && participants.length !== 2)) this.cancel(match, match.expiresAt <= Date.now() ? "expired" : "peer_left");
    }
    const retained = new Set([...this.presence.values()].map(data => data.lobbySessionId));
    for (const match of this.matches()) { retained.add(match.aSessionId); retained.add(match.bSessionId); }
    for (const row of this.ctx.storage.sql.exec<{ session_id: string }>("SELECT session_id FROM lobby_profiles UNION SELECT session_id FROM lobby_rejections").toArray()) if (!retained.has(row.session_id)) this.removeSession(row.session_id);
    this.rematch();
  }
  private async scheduleCleanup(): Promise<void> {
    const deadlines = this.matches().map(match => match.expiresAt);
    for (const data of this.presence.values()) if (data.status === "connected") deadlines.push(data.joinedAt + LOBBY_HELLO_TIMEOUT_MS);
    if (deadlines.length) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, Math.min(...deadlines)));
    else await this.ctx.storage.deleteAlarm();
  }
  private error(socket: WebSocket, code: Extract<LobbyServerMessage, { type: "error" }>["code"]): void {
    this.send(socket, { v: 1, type: "error", code });
  }
  private send(socket: WebSocket, message: LobbyServerMessage): void {
    try { socket.send(JSON.stringify(message)); }
    catch { socket.close(1011, "Lobby send failed"); }
  }
}
