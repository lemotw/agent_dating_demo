import { DurableObject } from 'cloudflare:workers';
import { isClientId, PEER_PROTOCOL_VERSION } from '../src/shared/constants';
import type { LobbyServerMessage } from '../src/shared/protocol';
import type { LobbySocketAttachment } from '../src/shared/types';

export class Lobby extends DurableObject<Env> {
  // Connection state is reconstructed after hibernation; no transcript/database storage.
  private readonly presence = new Map<WebSocket, LobbySocketAttachment>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const socket of ctx.getWebSockets()) {
      const metadata: LobbySocketAttachment | null = socket.deserializeAttachment();
      if (metadata) this.presence.set(socket, metadata);
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'websocket_required' }, { status: 426, headers: { Upgrade: 'websocket' } });
    }
    const clientId = new URL(request.url).searchParams.get('clientId') ?? '';
    if (!isClientId(clientId)) return Response.json({ error: 'invalid_client_id' }, { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const metadata: LobbySocketAttachment = {
      clientId, socketId: crypto.randomUUID(), joinedAt: Date.now(), status: 'connected',
    };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(metadata);
    this.presence.set(server, metadata);
    this.send(server, { v: PEER_PROTOCOL_VERSION, type: 'connected', socketId: metadata.socketId });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || new TextEncoder().encode(message).byteLength > 4096) {
      socket.close(1009, 'Expected a small JSON control message');
      this.presence.delete(socket);
      return;
    }
    let input: unknown;
    try { input = JSON.parse(message); }
    catch { this.send(socket, { v: PEER_PROTOCOL_VERSION, type: 'error', code: 'invalid_message' }); return; }
    if (!input || typeof input !== 'object' || !('v' in input) || input.v !== PEER_PROTOCOL_VERSION || !('type' in input) || typeof input.type !== 'string') {
      this.send(socket, { v: PEER_PROTOCOL_VERSION, type: 'error', code: 'invalid_message' });
      return;
    }
    if (input.type === 'ping') this.send(socket, { v: PEER_PROTOCOL_VERSION, type: 'pong' });
    else this.send(socket, { v: PEER_PROTOCOL_VERSION, type: 'error', code: 'not_implemented' });
  }

  webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.presence.delete(socket);
  }

  webSocketError(socket: WebSocket, _error: unknown): void {
    this.presence.delete(socket);
    socket.close(1011, 'Lobby connection error');
  }

  private send(socket: WebSocket, message: LobbyServerMessage): void {
    socket.send(JSON.stringify(message));
  }
}
