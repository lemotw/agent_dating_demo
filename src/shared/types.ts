export type AppStage =
  | 'connect' | 'interview' | 'publish' | 'lobby'
  | 'match-proposal' | 'connecting' | 'exchange' | 'summary';

export interface LobbySocketAttachment {
  clientId: string;
  socketId: string;
  joinedAt: number;
  status: 'connected';
}
