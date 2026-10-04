import { CLOUDFLARE_STUN_URL, isClientId, TURN_CREDENTIAL_TTL_SECONDS, TURN_UPSTREAM_TIMEOUT_MS } from "../src/shared/constants";
import { isObject, type TurnCredentialsRequest, type TurnCredentialsResponse } from "../src/shared/protocol";

/** Bound request/upstream bodies before parsing; never log credentials or network metadata. */
export async function readBoundedJson(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<unknown> {
  if (!body) throw new Error("Missing body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function parseTurnRequest(value: unknown): TurnCredentialsRequest | null {
  if (!isObject(value) || Object.keys(value).some(key => !["matchId", "clientId", "lobbySessionId"].includes(key))) return null;
  if (![value.matchId, value.clientId, value.lobbySessionId].every(id => typeof id === "string" && isClientId(id))) return null;
  return { matchId: String(value.matchId), clientId: String(value.clientId), lobbySessionId: String(value.lobbySessionId) };
}

export async function issueTurnCredentials(env: Env): Promise<TurnCredentialsResponse> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) throw new Error("TURN unavailable");
  const issuedAt = Date.now();
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS, TURN_UPSTREAM_TIMEOUT_MS }),
    signal: AbortSignal.timeout(TURN_UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("TURN upstream failed"); }
  const value = await readBoundedJson(response.body, 16 * 1024);
  if (!isObject(value) || !Array.isArray(value.iceServers) || value.iceServers.length > 10) throw new Error("Invalid TURN response");
  const iceServers: TurnCredentialsResponse["iceServers"] = [{ urls: [CLOUDFLARE_STUN_URL] }];
  for (const server of value.iceServers) {
    if (!isObject(server)) throw new Error("Invalid ICE server");
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
    if (!Array.isArray(urls) || urls.length > 20 || !urls.every(url => typeof url === "string" && url.length <= 256)) throw new Error("Invalid ICE URLs");
    const turnUrls = urls.filter((url: string) => /^turns?:turn\.cloudflare\.com:(3478|443|80|5349)\?transport=(udp|tcp)$/.test(url));
    if (!turnUrls.length) continue;
    if (typeof server.username !== "string" || typeof server.credential !== "string" || !server.username || !server.credential || server.username.length > 2048 || server.credential.length > 2048) throw new Error("Invalid TURN credentials");
    iceServers.push({ urls: turnUrls, username: server.username, credential: server.credential });
  }
  if (iceServers.length < 2) throw new Error("TURN missing");
  return { iceServers, expiresAt: issuedAt + TURN_CREDENTIAL_TTL_SECONDS * 1000 };
}
