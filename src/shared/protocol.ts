import { PEER_PROTOCOL_VERSION } from './constants';

export type LobbyClientMessage = { v: typeof PEER_PROTOCOL_VERSION; type: 'ping' };
export type LobbyServerMessage =
  | { v: typeof PEER_PROTOCOL_VERSION; type: 'connected'; socketId: string }
  | { v: typeof PEER_PROTOCOL_VERSION; type: 'pong' }
  | { v: typeof PEER_PROTOCOL_VERSION; type: 'error'; code: 'invalid_message' | 'not_implemented' };

/** Phase 4: authorize against an active, mutually accepted match before issuing credentials. */
export interface TurnCredentialsRequest {
  matchId: string;
  socketToken: string;
}
export interface TurnCredentialsResponse {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  expiresAt: number;
}
