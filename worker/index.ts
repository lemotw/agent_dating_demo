import {
  API_ROUTES,
  GLOBAL_LOBBY_NAME,
  PEER_PROTOCOL_VERSION,
} from "../src/shared/constants";
export { Lobby } from "./lobby-do";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === API_ROUTES.health) {
      if (request.method !== "GET")
        return new Response(null, { status: 405, headers: { Allow: "GET" } });
      return Response.json({
        ok: true,
        protocolVersion: PEER_PROTOCOL_VERSION,
      });
    }
    if (url.pathname === API_ROUTES.lobby) {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin)
        return Response.json({ error: "origin_not_allowed" }, { status: 403 });
      return env.LOBBY.getByName(GLOBAL_LOBBY_NAME).fetch(request);
    }
    if (url.pathname === API_ROUTES.turnCredentials) {
      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { Allow: "POST" } });
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return Response.json({ error: "origin_not_allowed" }, { status: 403 });
      if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "json_required" }, { status: 415 });
      return env.LOBBY.getByName(GLOBAL_LOBBY_NAME).fetch(request);
    }
    if (url.pathname.startsWith("/api/"))
      return Response.json({ error: "not_found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
