import { isClientId, PEER_PROTOCOL_VERSION, MAX_PEER_TEXT_LENGTH, MAX_SENT_TURNS_PER_AGENT } from "./constants";
import type { LobbyAgentProfile, MatchConsent, ProfileSectionId } from "./types";

export type LobbyClientMessage =
  | { v: 1; type: "ping" }
  | { v: 1; type: "hello"; profile: LobbyAgentProfile }
  | SignalingMessage
  | { v: 1; type: "resume_lobby"; senderClientId: string; lobbySessionId: string }
  | { v: 1; type: "connection_ready" | "match_failed" | "leave_match"; matchId: string; senderClientId: string; lobbySessionId: string }
  | { v: 1; type: "accept_match" | "decline_match"; matchId: string };
export type MatchCancellationReason = "declined" | "peer_left" | "expired" | "connection_failed" | "ended";
export type LobbyServerMessage =
  | { v: 1; type: "connected"; socketId: string }
  | { v: 1; type: "pong" }
  | { v: 1; type: "published"; lobbySessionId: string; status: "waiting" }
  | { v: 1; type: "waiting" }
  | ForwardedSignalingMessage
  | { v: 1; type: "match_active"; matchId: string; expiresAt: number }
  | { v: 1; type: "match_proposed"; matchId: string; peer: LobbyAgentProfile; offererClientId: string; role: "offerer" | "answerer"; expiresAt: number }
  | { v: 1; type: "consent_updated"; matchId: string; ownConsent: MatchConsent; peerConsent: MatchConsent }
  | { v: 1; type: "match_ready"; matchId: string; offererClientId: string; status: "connecting"; expiresAt: number }
  | { v: 1; type: "match_cancelled"; matchId: string; reason: MatchCancellationReason }
  | { v: 1; type: "error"; code: "invalid_message" | "invalid_state" | "duplicate_client" };

export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const text = (value: unknown): value is string => typeof value === "string" && !!value.trim() && value.length <= 4000;
const items = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 20 && value.every(item => text(item) && item.length <= 120);
const sectionIds: ProfileSectionId[] = ["people", "topics", "context", "experience", "conversation_style", "boundaries"];

/** Strict public allowlist: extra/private fields never enter Lobby state. */
export function isLobbyAgentProfile(value: unknown): value is LobbyAgentProfile {
  if (!isObject(value) || !keys(value, ["clientId", "displayName", "agentName", "publicSummary", "topics", "lookingFor", "sections", "profileUpdatedAt"])) return false;
  if (!text(value.clientId) || !isClientId(value.clientId) || !text(value.displayName) || !text(value.agentName) || !text(value.publicSummary) || !items(value.topics) || !items(value.lookingFor) || value.topics.length + value.lookingFor.length === 0) return false;
  if (typeof value.profileUpdatedAt !== "number" || !Number.isFinite(value.profileUpdatedAt) || value.profileUpdatedAt <= 0 || !Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 6) return false;
  return value.sections.every(section => isObject(section) && keys(section, ["id", "label", "text"]) && sectionIds.includes(section.id as ProfileSectionId) && text(section.label) && text(section.text)) && new Set(value.sections.map(section => section.id)).size === value.sections.length;
}
export function parseLobbyClientMessage(value: unknown): LobbyClientMessage | null {
  if (!isObject(value) || value.v !== PEER_PROTOCOL_VERSION) return null;
  if (value.type === "ping" && keys(value, ["v", "type"])) return { v: 1, type: "ping" };
  if (value.type === "hello" && keys(value, ["v", "type", "profile"]) && isLobbyAgentProfile(value.profile)) return { v: 1, type: "hello", profile: value.profile };
  if ((value.type === "accept_match" || value.type === "decline_match") && keys(value, ["v", "type", "matchId"]) && typeof value.matchId === "string" && isClientId(value.matchId)) return { v: 1, type: value.type, matchId: value.matchId };
  if (isSignalingMessage(value)) return value;
  if (value.type === "resume_lobby" && keys(value, ["v", "type", "senderClientId", "lobbySessionId"]) && typeof value.senderClientId === "string" && isClientId(value.senderClientId) && typeof value.lobbySessionId === "string" && isClientId(value.lobbySessionId)) return { v: 1, type: "resume_lobby", senderClientId: value.senderClientId, lobbySessionId: value.lobbySessionId };
  if (["connection_ready", "match_failed", "leave_match"].includes(String(value.type)) && keys(value, ["v", "type", "matchId", "senderClientId", "lobbySessionId"]) && identity(value)) return value as Extract<LobbyClientMessage, { type: "connection_ready" | "match_failed" | "leave_match" }>;
  return null;
}

/** Phase 4: authorize against an active, mutually accepted match before issuing credentials. */
export interface TurnCredentialsRequest { matchId: string; clientId: string; lobbySessionId: string }
export interface TurnCredentialsResponse {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  expiresAt: number;
}

export type SignalPayload =
  | { kind: "offer" | "answer"; sdp: string }
  | { kind: "ice"; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null } };
export interface SignalingMessage {
  v: 1; type: "signal"; matchId: string; senderClientId: string; lobbySessionId: string; payload: SignalPayload;
}
/** Forward public socket identity, never the bearer session token used for TURN authorization. */
export interface ForwardedSignalingMessage {
  v: 1; type: "signal"; matchId: string; senderClientId: string; senderSocketId: string; payload: SignalPayload;
}
export function isForwardedSignalingMessage(value: unknown): value is ForwardedSignalingMessage {
  if (!isObject(value) || !keys(value, ["v", "type", "matchId", "senderClientId", "senderSocketId", "payload"]) || typeof value.senderSocketId !== "string" || !isClientId(value.senderSocketId)) return false;
  return isSignalingMessage({ v: value.v, type: value.type, matchId: value.matchId, senderClientId: value.senderClientId, lobbySessionId: value.senderSocketId, payload: value.payload });
}
const identity = (value: Record<string, unknown>) => [value.matchId, value.senderClientId, value.lobbySessionId].every(id => typeof id === "string" && isClientId(id));
export function isSignalingMessage(value: unknown): value is SignalingMessage {
  if (!isObject(value) || value.v !== PEER_PROTOCOL_VERSION || value.type !== "signal" || !keys(value, ["v", "type", "matchId", "senderClientId", "lobbySessionId", "payload"]) || !identity(value) || !isObject(value.payload)) return false;
  const payload = value.payload;
  if (payload.kind === "offer" || payload.kind === "answer") return keys(payload, ["kind", "sdp"]) && typeof payload.sdp === "string" && payload.sdp.length > 0 && payload.sdp.length <= 64 * 1024;
  if (payload.kind !== "ice" || !keys(payload, ["kind", "candidate"]) || !isObject(payload.candidate)) return false;
  const c = payload.candidate;
  return keys(c, ["candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"]) && typeof c.candidate === "string" && c.candidate.length <= 4096 && (c.sdpMid === null || (typeof c.sdpMid === "string" && c.sdpMid.length <= 256)) && (c.sdpMLineIndex === null || (Number.isInteger(c.sdpMLineIndex) && Number(c.sdpMLineIndex) >= 0 && Number(c.sdpMLineIndex) <= 65535)) && (c.usernameFragment === undefined || c.usernameFragment === null || (typeof c.usernameFragment === "string" && c.usernameFragment.length <= 256));
}

type PeerBase = { v: 1; matchId: string; messageId: string; senderClientId: string; sentAt: number };
export type PeerEnvelope = PeerBase & (
  | { type: "agent_message"; senderTurn: number; intent: "continue" | "finish"; text: string }
  | { type: "summary"; text: string }
  | { type: "control"; action: "session_ready" | "summary_ack" | "end_requested" | "end_ack" }
);
export type PeerMessage =
  | { type: "agent_message"; senderTurn: number; intent: "continue" | "finish"; text: string }
  | { type: "summary"; text: string }
  | { type: "control"; action: "session_ready" | "summary_ack" | "end_requested" | "end_ack" };
export function parsePeerEnvelope(value: unknown, matchId: string, senderClientId: string): PeerEnvelope | null {
  if (!isObject(value) || value.v !== PEER_PROTOCOL_VERSION || value.matchId !== matchId || value.senderClientId !== senderClientId || typeof value.messageId !== "string" || !isClientId(value.messageId) || typeof value.sentAt !== "number" || !Number.isFinite(value.sentAt) || value.sentAt <= 0) return null;
  const base = ["v", "type", "matchId", "messageId", "senderClientId", "sentAt"];
  const validText = typeof value.text === "string" && !!value.text.trim() && value.text.length <= MAX_PEER_TEXT_LENGTH;
  if (value.type === "agent_message" && keys(value, [...base, "senderTurn", "intent", "text"]) && validText && Number.isInteger(value.senderTurn) && Number(value.senderTurn) >= 1 && Number(value.senderTurn) <= MAX_SENT_TURNS_PER_AGENT && (value.intent === "continue" || value.intent === "finish")) return value as PeerEnvelope;
  if (value.type === "summary" && keys(value, [...base, "text"]) && validText) return value as PeerEnvelope;
  if (value.type === "control" && keys(value, [...base, "action"]) && ["session_ready", "summary_ack", "end_requested", "end_ack"].includes(String(value.action))) return value as PeerEnvelope;
  return null;
}
