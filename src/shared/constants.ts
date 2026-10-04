export const MAX_SENT_TURNS_PER_AGENT = 50;
export const PEER_PROTOCOL_VERSION = 1 as const;
export const GLOBAL_LOBBY_NAME = 'global';
export const API_ROUTES = {
  health: '/api/health',
  lobby: '/api/lobby',
  turnCredentials: '/api/turn-credentials',
} as const;

export const isClientId = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
