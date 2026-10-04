import { isClientId } from "../../shared/constants";

const CLIENT_ID_KEY = "agent-chat.clientId";

export function getOrCreateClientId(storage: Storage = localStorage): string {
  const stored = storage.getItem(CLIENT_ID_KEY);
  if (stored && isClientId(stored)) return stored;
  const clientId = crypto.randomUUID();
  storage.setItem(CLIENT_ID_KEY, clientId);
  return clientId;
}
