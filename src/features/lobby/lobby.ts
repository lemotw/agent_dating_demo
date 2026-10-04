import { createSignal, onCleanup, onMount } from "solid-js";
import { API_ROUTES, isClientId, LOBBY_HELLO_TIMEOUT_MS, LOBBY_RECONNECT_DELAYS_MS, MATCH_ACTIVE_TIMEOUT_MS, MAX_LOBBY_MESSAGE_BYTES, PEER_PROTOCOL_VERSION } from "../../shared/constants";
import { isLobbyAgentProfile, isObject, isForwardedSignalingMessage, type LobbyClientMessage, type LobbyServerMessage } from "../../shared/protocol";
import type { AppStage, LobbyAgentProfile } from "../../shared/types";
import { PeerConnection, type PeerConnectionState } from "../rtc/peer";
import { createExchange, type ExchangeFlow } from "../exchange/exchange";

type Proposal = Extract<LobbyServerMessage, { type: "match_proposed" }>;
export function createLobbyConnection(profile: () => LobbyAgentProfile, onStage: (stage: AppStage) => void) {
  const [status, setStatus] = createSignal<"publishing" | "reconnecting" | "waiting" | "proposal" | "peer-decision" | "connecting" | "paused" | "disconnected">("publishing");
  const [notice, setNotice] = createSignal("");
  const [proposal, setProposal] = createSignal<Proposal>();
  const [peerAccepted, setPeerAccepted] = createSignal(false);
  const [decisionPending, setDecisionPending] = createSignal(false);
  const [lobbySessionId, setLobbySessionId] = createSignal("");
  const [socketId, setSocketId] = createSignal("");
  const [peerState, setPeerState] = createSignal<PeerConnectionState>("closed");
  const [peerDetail, setPeerDetail] = createSignal("");
  const [peerConnection, setPeerConnection] = createSignal<PeerConnection>();
  const [exchange, setExchange] = createSignal<ExchangeFlow>();
  let activeDeadline: ReturnType<typeof setTimeout> | undefined;
  const closePeer = () => {
    clearTimeout(activeDeadline); activeDeadline = undefined;
    exchange()?.dispose(); setExchange(undefined);
    peerConnection()?.teardown(); setPeerConnection(undefined);
  };
  let socket: WebSocket | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let disposed = false;
  let retryable = true;
  const clear = () => { clearTimeout(timeout); timeout = undefined; };
  const fail = (message: string) => {
    clear(); setNotice(message); setStatus("disconnected"); setDecisionPending(false);
    if (peerConnection()) { peerConnection()!.fail(message, false); return; }
    setProposal(undefined); onStage("lobby");
  };
  const send = (message: LobbyClientMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  };
  const connect = (automatic = false) => {
    if (disposed) return;
    clearTimeout(reconnectTimer); reconnectTimer = undefined;
    if (!automatic) reconnectAttempt = 0;
    retryable = true;
    clear();
    closePeer(); setPeerDetail("");
    // Detach callbacks so an old close event cannot overwrite the new connection.
    if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.onopen = null; socket.close(1000, "Reconnect"); }
    setStatus("publishing"); setNotice(""); setProposal(undefined); setPeerAccepted(false); setDecisionPending(false); setLobbySessionId(""); setSocketId(""); onStage("lobby");
    let published: LobbyAgentProfile;
    try { published = profile(); } catch { retryable = false; fail("公開名片無效，請回到名片頁修正。"); return; }
    const url = new URL(API_ROUTES.lobby, location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("clientId", published.clientId);
    try { socket = new WebSocket(url); } catch { fail("無法建立 Lobby 連線，請重試。"); scheduleReconnect(); return; }
    const current = socket;
    timeout = setTimeout(() => { fail("發佈名片逾時，請重新連線。"); current.close(); }, LOBBY_HELLO_TIMEOUT_MS);
    current.onopen = () => { if (!send({ v: PEER_PROTOCOL_VERSION, type: "hello", profile: published })) { fail("Lobby 已離線，請重新連線。"); current.close(); } };
    current.onmessage = event => {
      try {
        if (typeof event.data !== "string" || new TextEncoder().encode(event.data).byteLength > MAX_LOBBY_MESSAGE_BYTES) throw new Error();
        const input: unknown = JSON.parse(event.data);
        if (!isObject(input) || input.v !== PEER_PROTOCOL_VERSION) throw new Error();
        switch (input.type) {
          case "connected":
            if (typeof input.socketId !== "string" || !isClientId(input.socketId)) throw new Error();
            setSocketId(input.socketId); break;
          case "published":
            if (typeof input.lobbySessionId !== "string" || !isClientId(input.lobbySessionId) || input.status !== "waiting") throw new Error();
            clear(); reconnectAttempt = 0; setLobbySessionId(input.lobbySessionId); setStatus("waiting"); break;
          case "waiting":
            setStatus("waiting");
            if (!peerConnection()) onStage("lobby");
            break;
          case "signal":
            if (!isForwardedSignalingMessage(input)) throw new Error();
            peerConnection()?.receiveSignal(input); break;
          case "match_active":
            if (input.matchId !== proposal()?.matchId || typeof input.expiresAt !== "number" || !Number.isFinite(input.expiresAt)) break;
            clearTimeout(activeDeadline);
            activeDeadline = setTimeout(() => peerConnection()?.fail("這次交流已達連線時間上限，請返回 Lobby。"), Math.max(1, input.expiresAt - Date.now()));
            break;
          case "match_proposed": {
            if (typeof input.matchId !== "string" || !isClientId(input.matchId) || !isLobbyAgentProfile(input.peer) || input.peer.clientId === published.clientId || ![published.clientId, input.peer.clientId].includes(String(input.offererClientId)) || input.role !== (input.offererClientId === published.clientId ? "offerer" : "answerer") || typeof input.expiresAt !== "number" || !Number.isFinite(input.expiresAt)) throw new Error();
            closePeer(); setPeerDetail("");
            setProposal({ v: 1, type: "match_proposed", matchId: input.matchId, peer: input.peer, offererClientId: String(input.offererClientId), role: input.offererClientId === published.clientId ? "offerer" : "answerer", expiresAt: input.expiresAt });
            setPeerAccepted(false); setDecisionPending(false); setNotice(""); setStatus("proposal"); onStage("match-proposal"); break;
          }
          case "consent_updated":
            if (input.matchId !== proposal()?.matchId || !["pending", "accepted"].includes(String(input.ownConsent)) || !["pending", "accepted"].includes(String(input.peerConsent))) throw new Error();
            setPeerAccepted(input.peerConsent === "accepted"); setDecisionPending(false);
            if (input.ownConsent === "accepted") setStatus("peer-decision");
            break;
          case "match_ready": {
            if (input.matchId !== proposal()?.matchId || input.offererClientId !== proposal()?.offererClientId || input.status !== "connecting" || typeof input.expiresAt !== "number" || !Number.isFinite(input.expiresAt)) throw new Error();
            if (peerConnection()) break;
            setDecisionPending(false); setStatus("connecting"); onStage("connecting");
            const match = proposal()!;
            const connection = new PeerConnection({
              matchId: match.matchId, clientId: published.clientId, peerClientId: match.peer.clientId,
              lobbySessionId: lobbySessionId(), role: match.role, expiresAt: input.expiresAt,
              sendControl: send,
              onState: (state, detail) => {
                setPeerState(state); if (detail) setPeerDetail(detail);
                exchange()?.connectionChanged(state);
                // Bound the peer session even if the control socket drops before match_active.
                if (state === "connected" && !activeDeadline) activeDeadline = setTimeout(() => peerConnection()?.fail("這次交流已達連線時間上限，請返回 Lobby。"), MATCH_ACTIVE_TIMEOUT_MS);
                if (state === "failed") { clearTimeout(activeDeadline); activeDeadline = undefined; }
              },
            });
            setPeerConnection(connection);
            const chat = createExchange({ local: published, peer: match.peer, role: match.role, connection, onStage,
              onComplete: () => {
                clearTimeout(activeDeadline); activeDeadline = undefined;
                connection.teardown();
                send({ v: 1, type: "leave_match", matchId: match.matchId, senderClientId: published.clientId, lobbySessionId: lobbySessionId() });
                setProposal(undefined); setPeerAccepted(false); setDecisionPending(false); setStatus("paused");
              },
            });
            setExchange(chat); void chat.start();
            void connection.start();
            break;
          }
          case "match_cancelled":
            if (input.matchId !== proposal()?.matchId) break;
            if (!["declined", "peer_left", "expired", "connection_failed", "ended"].includes(String(input.reason))) throw new Error();
            if (peerConnection()) {
              clearTimeout(activeDeadline);
              peerConnection()!.fail(input.reason === "expired" ? "配對連線已逾時，請返回 Lobby。" : input.reason === "ended" ? "對方已結束這次連線。" : "配對連線已中斷，請返回 Lobby 重試。", false);
              setDecisionPending(false); setPeerAccepted(false); setStatus("paused");
              break;
            }
            setProposal(undefined); setDecisionPending(false); setPeerAccepted(false);
            setNotice(input.reason === "declined" ? "邀請已婉拒，正在等待其他交流夥伴。" : input.reason === "peer_left" ? "對方已離開，正在等待其他交流夥伴。" : "邀請或連線已逾時，正在等待其他交流夥伴。");
            setStatus("waiting"); onStage("lobby"); break;
          case "error":
            if (input.code === "duplicate_client") { retryable = false; fail("此名片已在另一個分頁或交流中，請先離開該 Lobby 再重新連線。"); current.close(); }
            else if (input.code === "invalid_state" && lobbySessionId()) { setDecisionPending(false); setNotice("邀請狀態已更新，請依目前畫面繼續。"); }
            else if (input.code === "invalid_message" || input.code === "invalid_state") { retryable = false; fail("Lobby 無法處理這次操作，請重新連線。"); current.close(); }
            else throw new Error();
            break;
          case "pong": break;
          default: throw new Error();
        }
      } catch { retryable = false; fail("Lobby 回應格式異常，請重新連線。"); current.close(); }
    };
    current.onerror = () => { fail("Lobby 連線失敗，請重新連線。"); current.close(); };
    current.onclose = () => { fail("Lobby 已離線，請重新連線。"); scheduleReconnect(); };
  };
  function scheduleReconnect() {
    if (disposed || !retryable || peerConnection() || reconnectTimer) return;
    const delay = LOBBY_RECONNECT_DELAYS_MS[reconnectAttempt++];
    if (delay === undefined) { setNotice("Lobby 自動重連已達上限，請檢查網路後手動重試。"); return; }
    setStatus("reconnecting"); setNotice(`Lobby 已離線，${delay / 1000} 秒後重連（${reconnectAttempt}/${LOBBY_RECONNECT_DELAYS_MS.length}）。`);
    reconnectTimer = setTimeout(() => connect(true), delay);
  }
  const decide = (accept: boolean) => {
    const match = proposal();
    if (!match || decisionPending() || !["proposal", "peer-decision"].includes(status()) || (accept && status() === "peer-decision")) return;
    setDecisionPending(true);
    if (!send({ v: 1, type: accept ? "accept_match" : "decline_match", matchId: match.matchId })) fail("Lobby 已離線，請重新連線。");
  };
  const returnToLobby = () => {
    const match = proposal();
    if (!exchange() && match && lobbySessionId()) send({ v: 1, type: "leave_match", matchId: match.matchId, senderClientId: profile().clientId, lobbySessionId: lobbySessionId() });
    closePeer(); setProposal(undefined); setPeerDetail(""); setNotice("");
    if (!socket || socket.readyState !== WebSocket.OPEN) connect();
    else {
      if (!send({ v: 1, type: "resume_lobby", senderClientId: profile().clientId, lobbySessionId: lobbySessionId() })) { fail("Lobby 已離線，請重新連線。"); return; }
      setStatus("waiting"); onStage("lobby");
    }
  };
  onMount(() => connect());
  onCleanup(() => {
    disposed = true; clearTimeout(reconnectTimer);
    const match = proposal();
    if (!exchange() && peerConnection() && match) send({ v: 1, type: "leave_match", matchId: match.matchId, senderClientId: profile().clientId, lobbySessionId: lobbySessionId() });
    closePeer(); clear(); if (socket) { socket.onclose = null; socket.onerror = null; socket.onmessage = null; socket.onopen = null; socket.close(1000, "Leaving Lobby"); }
  });
  return { status, notice, proposal, peerAccepted, decisionPending, lobbySessionId, socketId, connect: () => connect(), decide, peerState, peerDetail, peerConnection, exchange, returnToLobby };
}
