export type AppStage =
  | "connect"
  | "interview"
  | "publish"
  | "lobby"
  | "match-proposal"
  | "connecting"
  | "exchange"
  | "summary";

export type LobbyStatus = "connected" | "waiting" | "reserved" | "consent_pending" | "connecting" | "in_match" | "paused";
export type MatchConsent = "pending" | "accepted" | "declined";
export interface ActiveMatch {
  matchId: string;
  aClientId: string;
  bClientId: string;
  aSessionId: string;
  bSessionId: string;
  offererClientId: string;
  createdAt: number;
  expiresAt: number;
  aConsent: MatchConsent;
  bConsent: MatchConsent;
  phase: "consent" | "connecting" | "active";
  aReady?: boolean;
  bReady?: boolean;
}
export interface LobbySocketAttachment {
  clientId: string;
  socketId: string;
  lobbySessionId: string;
  joinedAt: number;
  status: LobbyStatus;
  matchId?: string;
  turnRequests?: number;
  lastTurnRequestAt?: number;
}

export type ProfileSectionId = "people" | "topics" | "context" | "experience" | "conversation_style" | "boundaries";
export interface ProfileCandidate {
  displaySummary: string;
  topics: string[];
  lookingFor: string[];
  sections: Array<{ id: ProfileSectionId; label: string; text: string }>;
}
export interface LocalAgentProfile {
  clientId: string;
  displayName: string;
  agentName: string;
  publicSummary: string;
  topics: string[];
  lookingFor: string[];
  shareSections: Array<{ id: ProfileSectionId; label: string; text: string; enabled: boolean }>;
  updatedAt: number;
}
export interface LobbyAgentProfile {
  clientId: string;
  displayName: string;
  agentName: string;
  publicSummary: string;
  topics: string[];
  lookingFor: string[];
  sections: Array<{ id: ProfileSectionId; label: string; text: string }>;
  profileUpdatedAt: number;
}
