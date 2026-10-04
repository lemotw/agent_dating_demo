import { API_ROUTES, CLOUDFLARE_STUN_URL, DATA_CHANNEL_LABEL, MATCH_CONNECT_TIMEOUT_MS, MAX_ICE_CANDIDATES, MAX_PEER_DEDUPE_IDS, MAX_PEER_MESSAGE_BYTES, PEER_PROTOCOL_VERSION, RTC_DISCONNECT_TIMEOUT_MS } from "../../shared/constants";
import { isObject, isForwardedSignalingMessage, parsePeerEnvelope, type LobbyClientMessage, type PeerEnvelope, type PeerMessage, type ForwardedSignalingMessage, type SignalPayload, type TurnCredentialsResponse } from "../../shared/protocol";

export type PeerConnectionState = "preparing" | "gathering" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
export interface PeerConnectionOptions {
  matchId: string;
  clientId: string;
  peerClientId: string;
  lobbySessionId: string;
  role: "offerer" | "answerer";
  expiresAt: number;
  sendControl: (message: LobbyClientMessage) => boolean;
  onState: (state: PeerConnectionState, detail?: string) => void;
  onEnvelope?: (message: PeerEnvelope) => void;
}

/** One match owns one reliable DataChannel. Only SDP/ICE/control enter the Lobby. */
export class PeerConnection {
  private pc?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private disposed = false;
  private started = false;
  private opened = false;
  private deadline?: ReturnType<typeof setTimeout>;
  private disconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly abort = new AbortController();
  private queuedIce: RTCIceCandidateInit[] = [];
  private iceCount = 0;
  private pendingSignals = 0;
  private signalChain: Promise<void> = Promise.resolve();
  private resolveInitialized!: () => void;
  private readonly initialized = new Promise<void>(resolve => { this.resolveInitialized = resolve; });
  private readonly receivedIds = new Set<string>();
  private receivedTurn = 0;
  private sentTurn = 0;
  private readonly listeners = new Set<(message: PeerEnvelope) => void>();

  constructor(private readonly options: PeerConnectionOptions) {}

  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    this.state("preparing");
    this.deadline = setTimeout(() => this.fail("連線逾時，請返回 Lobby 再試一次。"), Math.max(1, Math.min(MATCH_CONNECT_TIMEOUT_MS, this.options.expiresAt - Date.now())));
    try {
      if (typeof RTCPeerConnection === "undefined") throw new Error("此瀏覽器不支援點對點連線。");
      const response = await fetch(API_ROUTES.turnCredentials, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: this.options.matchId, clientId: this.options.clientId, lobbySessionId: this.options.lobbySessionId }),
        signal: this.abort.signal,
      });
      if (this.disposed) return;
      if (!response.ok) throw new Error(response.status === 503 ? "連線服務暫時無法使用，請稍後重試。" : "配對授權已失效，請返回 Lobby。");
      const credentials: unknown = await response.json();
      if (this.disposed) return;
      if (!this.validCredentials(credentials)) throw new Error("連線設定無效，請返回 Lobby。");
      const pc = this.pc = new RTCPeerConnection({ iceServers: [{ urls: CLOUDFLARE_STUN_URL }, ...credentials.iceServers], iceTransportPolicy: "all" });
      pc.onicecandidate = event => {
        if (!this.disposed && event.candidate) {
          const c = event.candidate.toJSON();
          this.signal({ kind: "ice", candidate: { candidate: c.candidate ?? "", sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null, usernameFragment: c.usernameFragment } });
        }
      };
      pc.onicegatheringstatechange = () => { if (!this.opened && !this.disposed) this.state(pc.iceGatheringState === "gathering" ? "gathering" : "connecting"); };
      pc.onconnectionstatechange = () => this.connectionChanged();
      pc.oniceconnectionstatechange = () => this.connectionChanged();
      pc.ondatachannel = event => {
        if (this.options.role !== "answerer" || this.channel || event.channel.label !== DATA_CHANNEL_LABEL || !event.channel.ordered || event.channel.maxPacketLifeTime !== null || event.channel.maxRetransmits !== null) {
          event.channel.close(); this.fail("對方的連線通道無效。"); return;
        }
        this.attachChannel(event.channel);
      };
      if (this.options.role === "offerer") this.attachChannel(pc.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true }));
      this.state("connecting");
      if (this.options.role === "offerer") {
        const offer = await pc.createOffer();
        if (this.disposed) return;
        await pc.setLocalDescription(offer);
        if (this.disposed) return;
        this.signal({ kind: "offer", sdp: pc.localDescription!.sdp });
      }
      this.resolveInitialized();
    } catch (error) {
      if (!this.disposed) this.fail(error instanceof Error ? error.message : "無法建立連線。");
    }
  }

  receiveSignal(message: ForwardedSignalingMessage): void {
    if (this.disposed || !isForwardedSignalingMessage(message) || message.matchId !== this.options.matchId || message.senderClientId !== this.options.peerClientId) return;
    if (++this.pendingSignals > MAX_ICE_CANDIDATES + 2) { this.fail("對方傳送了過多連線訊息。"); return; }
    this.signalChain = this.signalChain.then(async () => {
      await this.initialized;
      if (this.disposed || !this.pc) return;
      const pc = this.pc, payload = message.payload;
      if (payload.kind === "ice") {
        if (++this.iceCount > MAX_ICE_CANDIDATES) throw new Error("Too many candidates");
        if (!pc.remoteDescription) this.queuedIce.push(payload.candidate);
        else await pc.addIceCandidate(payload.candidate);
        return;
      }
      if (pc.remoteDescription) throw new Error("Repeated description");
      if ((payload.kind === "offer" && this.options.role !== "answerer") || (payload.kind === "answer" && (this.options.role !== "offerer" || pc.signalingState !== "have-local-offer"))) throw new Error("Unexpected description");
      await pc.setRemoteDescription({ type: payload.kind, sdp: payload.sdp });
      if (this.disposed) return;
      for (const candidate of this.queuedIce.splice(0)) {
        await pc.addIceCandidate(candidate);
        if (this.disposed) return;
      }
      if (payload.kind === "offer") {
        const answer = await pc.createAnswer();
        if (this.disposed) return;
        await pc.setLocalDescription(answer);
        if (!this.disposed) this.signal({ kind: "answer", sdp: pc.localDescription!.sdp });
      }
    }).catch(() => { if (!this.disposed) this.fail("無法完成連線協商，請返回 Lobby 重試。"); }).finally(() => { this.pendingSignals--; });
  }

  /** Phase 5 subscribes to complete messages; streaming deltas are never transmitted. */
  subscribe(listener: (message: PeerEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  send(message: PeerMessage): PeerEnvelope | null {
    if (this.disposed || !this.channel || this.channel.readyState !== "open" || this.channel.bufferedAmount > 256 * 1024) return null;
    const envelope: PeerEnvelope = { ...message, v: PEER_PROTOCOL_VERSION, matchId: this.options.matchId, messageId: crypto.randomUUID(), senderClientId: this.options.clientId, sentAt: Date.now() };
    if (!parsePeerEnvelope(envelope, this.options.matchId, this.options.clientId) || (envelope.type === "agent_message" && envelope.senderTurn !== this.sentTurn + 1)) return null;
    const data = JSON.stringify(envelope);
    if (new TextEncoder().encode(data).byteLength > MAX_PEER_MESSAGE_BYTES) return null;
    try { this.channel.send(data); }
    catch { this.fail("訊息通道已中斷。"); return null; }
    if (envelope.type === "agent_message") this.sentTurn = envelope.senderTurn;
    return envelope;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      if (this.disposed || this.opened) return;
      this.opened = true;
      clearTimeout(this.deadline);
      if (!this.control("connection_ready")) { this.fail("Lobby 控制連線已中斷。"); return; }
      this.state("connected");
    };
    channel.onclose = () => { if (!this.disposed) this.fail("對方的訊息通道已關閉，請返回 Lobby。"); };
    channel.onerror = () => { if (!this.disposed) this.fail("訊息通道發生錯誤，請返回 Lobby。"); };
    channel.onmessage = event => {
      if (this.disposed || typeof event.data !== "string" || new TextEncoder().encode(event.data).byteLength > MAX_PEER_MESSAGE_BYTES) return;
      let value: unknown;
      try { value = JSON.parse(event.data); } catch { return; }
      const envelope = parsePeerEnvelope(value, this.options.matchId, this.options.peerClientId);
      if (!envelope || this.receivedIds.has(envelope.messageId) || (envelope.type === "agent_message" && envelope.senderTurn !== this.receivedTurn + 1)) return;
      this.receivedIds.add(envelope.messageId);
      if (this.receivedIds.size > MAX_PEER_DEDUPE_IDS) this.receivedIds.delete(this.receivedIds.values().next().value!);
      if (envelope.type === "agent_message") this.receivedTurn = envelope.senderTurn;
      this.options.onEnvelope?.(envelope);
      for (const listener of this.listeners) listener(envelope);
    };
  }
  private connectionChanged(): void {
    if (this.disposed || !this.pc) return;
    const pc = this.pc;
    if (pc.connectionState === "failed" || pc.iceConnectionState === "failed") { this.fail("連線失敗，請返回 Lobby 重試。"); return; }
    if (pc.connectionState === "disconnected" || pc.iceConnectionState === "disconnected") {
      this.state("disconnected");
      this.disconnectTimer ??= setTimeout(() => this.fail("對方已離線，請返回 Lobby。"), RTC_DISCONNECT_TIMEOUT_MS);
    } else {
      clearTimeout(this.disconnectTimer); this.disconnectTimer = undefined;
      if (this.opened && this.channel?.readyState === "open") this.state("connected");
    }
  }
  private validCredentials(value: unknown): value is TurnCredentialsResponse {
    return isObject(value) && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) && value.expiresAt > Date.now() && Array.isArray(value.iceServers) && value.iceServers.length > 0 && value.iceServers.length <= 10 && value.iceServers.every(server => isObject(server) && Array.isArray(server.urls) && server.urls.length > 0 && server.urls.length <= 20 && server.urls.every(url => typeof url === "string" && /^(stun|turn|turns):/.test(url) && url.length <= 256) && (server.username === undefined || typeof server.username === "string") && (server.credential === undefined || typeof server.credential === "string")) && value.iceServers.some(server => server.urls.some((url: string) => /^turns?:/.test(url)) && typeof server.username === "string" && typeof server.credential === "string");
  }
  private signal(payload: SignalPayload): void {
    if (!this.disposed && !this.options.sendControl({ v: 1, type: "signal", matchId: this.options.matchId, senderClientId: this.options.clientId, lobbySessionId: this.options.lobbySessionId, payload })) this.fail("Lobby 控制連線已中斷。");
  }
  private control(type: "connection_ready" | "match_failed" | "leave_match"): boolean {
    return this.options.sendControl({ v: 1, type, matchId: this.options.matchId, senderClientId: this.options.clientId, lobbySessionId: this.options.lobbySessionId });
  }
  private state(state: PeerConnectionState, detail?: string): void { this.options.onState(state, detail); }
  fail(detail: string, notifyLobby = true): void {
    if (this.disposed) return;
    if (notifyLobby) this.control("match_failed");
    this.teardown("failed", detail);
  }
  /** Idempotent: detach before closing, abort pending setup, release queues/listeners/timers. */
  teardown(state: "closed" | "failed" = "closed", detail?: string): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort(); this.resolveInitialized();
    clearTimeout(this.deadline); clearTimeout(this.disconnectTimer);
    this.queuedIce = []; this.receivedIds.clear(); this.listeners.clear();
    this.receivedTurn = 0; this.sentTurn = 0;
    if (this.channel) { this.channel.onopen = null; this.channel.onclose = null; this.channel.onerror = null; this.channel.onmessage = null; this.channel.close(); }
    if (this.pc) { this.pc.onicecandidate = null; this.pc.onicegatheringstatechange = null; this.pc.onconnectionstatechange = null; this.pc.oniceconnectionstatechange = null; this.pc.ondatachannel = null; this.pc.close(); }
    this.channel = undefined; this.pc = undefined;
    this.state(state, detail);
  }
}
