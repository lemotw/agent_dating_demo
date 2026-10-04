export const MAX_SENT_TURNS_PER_AGENT = 50;
export const AGENT_OPERATION_TIMEOUT_MS = 120_000;
export const PEER_SUMMARY_TIMEOUT_MS = 180_000;
export const MATCH_SESSION_READY_TIMEOUT_MS = 120_000;
export const PEER_PROTOCOL_VERSION = 1 as const;
export const GLOBAL_LOBBY_NAME = "global";
export const MAX_LOBBY_MESSAGE_BYTES = 96 * 1024;
export const LOBBY_HELLO_TIMEOUT_MS = 10_000;
export const LOBBY_RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000] as const;
export const TURN_UPSTREAM_TIMEOUT_MS = 8_000;
export const TURN_REQUEST_INTERVAL_MS = 10_000;
export const MAX_PROFILE_TEXT_LENGTH = 4_000;
export const MAX_PROFILE_ITEM_LENGTH = 120;
export const MAX_PROFILE_ITEMS = 20;
export const MAX_SDP_LENGTH = 64 * 1024;
export const MATCH_CONSENT_TIMEOUT_MS = 120_000;
export const MATCH_CONNECT_TIMEOUT_MS = 60_000;
export const MATCH_ACTIVE_TIMEOUT_MS = 30 * 60_000;
export const TURN_CREDENTIAL_TTL_SECONDS = 60 * 60;
export const RTC_DISCONNECT_TIMEOUT_MS = 10_000;
export const DATA_CHANNEL_LABEL = "agent-chat-v1";
export const MAX_PEER_TEXT_LENGTH = 16_000;
export const MAX_PEER_MESSAGE_BYTES = 80 * 1024;
export const MAX_PEER_DEDUPE_IDS = 512;
export const MAX_ICE_CANDIDATES = 256;
export const CLOUDFLARE_STUN_URL = "stun:stun.cloudflare.com:3478";
export const API_ROUTES = {
  health: "/api/health",
  lobby: "/api/lobby",
  turnCredentials: "/api/turn-credentials",
} as const;

export const isClientId = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
