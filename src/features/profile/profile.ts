import { isClientId, MAX_PROFILE_TEXT_LENGTH, MAX_PROFILE_ITEM_LENGTH, MAX_PROFILE_ITEMS, MAX_LOBBY_MESSAGE_BYTES } from "../../shared/constants";
import type { LocalAgentProfile, LobbyAgentProfile, ProfileCandidate, ProfileSectionId } from "../../shared/types";

export const PROFILE_KEY = "agent-chat:profile:v1";
export const SECTION_IDS: ProfileSectionId[] = ["people", "topics", "context", "experience", "conversation_style", "boundaries"];
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_PROFILE_TEXT_LENGTH;
const items = (v: unknown): v is string[] => Array.isArray(v) && v.length <= MAX_PROFILE_ITEMS && v.every(x => text(x) && !!x.trim() && x.length <= MAX_PROFILE_ITEM_LENGTH);
function sections(v: unknown, local = false): boolean {
  return Array.isArray(v) && v.length <= 6 && v.every(s => object(s) && SECTION_IDS.includes(s.id as ProfileSectionId) && text(s.label) && !!s.label.trim() && text(s.text) && (!local || typeof s.enabled === "boolean")) && new Set(v.map(s => s.id)).size === v.length;
}
export function parseProfileCandidate(response: string): ProfileCandidate {
  // A strict, whole-response contract; never extract JSON from arbitrary prose.
  if (response.length > 100_000) throw new Error("Agent 回傳的名片過長，請重新產生。");
  const value: unknown = JSON.parse(response.trim());
  if (!object(value) || !text(value.displaySummary) || !items(value.topics) || !items(value.lookingFor) || !sections(value.sections) || (value.sections as unknown[]).length !== 6) {
    throw new Error("Agent 回傳的名片格式不完整，請重新產生。未填寫的段落也應保留空字串。");
  }
  return value as unknown as ProfileCandidate;
}
export function isLocalProfile(value: unknown): value is LocalAgentProfile {
  return object(value) && text(value.clientId) && isClientId(value.clientId) && text(value.displayName) && !!value.displayName.trim() && text(value.agentName) && !!value.agentName.trim() && text(value.publicSummary) && !!value.publicSummary.trim() && items(value.topics) && items(value.lookingFor) && (value.topics.length + value.lookingFor.length > 0) && sections(value.shareSections, true) && (value.shareSections as LocalAgentProfile["shareSections"]).some(s => s.enabled && !!s.text.trim()) && typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) && value.updatedAt > 0;
}
// This allowlist is the sole boundary for future Lobby and peer publication.
export function toLobbyAgentProfile(profile: LocalAgentProfile): LobbyAgentProfile {
  if (!isLocalProfile(profile)) throw new Error("請填寫稱呼、公開摘要、至少一個話題或交流期待，並啟用一個有內容的段落。");
  const published: LobbyAgentProfile = {
    clientId: profile.clientId, displayName: profile.displayName.trim(), agentName: profile.agentName.trim(),
    publicSummary: profile.publicSummary.trim(), topics: profile.topics.map(s => s.trim()), lookingFor: profile.lookingFor.map(s => s.trim()),
    sections: profile.shareSections.filter(s => s.enabled && s.text.trim()).map(s => ({ id: s.id, label: s.label.trim(), text: s.text.trim() })),
    profileUpdatedAt: profile.updatedAt,
  };
  if (new TextEncoder().encode(JSON.stringify({ v: 1, type: "hello", profile: published })).byteLength > MAX_LOBBY_MESSAGE_BYTES) {
    throw new Error("公開名片總長度超過傳送限制，請縮短摘要與段落內容。");
  }
  return published;
}
export function saveProfile(profile: LocalAgentProfile, storage: Storage = localStorage): LocalAgentProfile {
  const published = toLobbyAgentProfile(profile);
  // Disabled candidate content is discarded even from local persistence.
  const final: LocalAgentProfile = { clientId: published.clientId, displayName: published.displayName, agentName: published.agentName, publicSummary: published.publicSummary, topics: published.topics, lookingFor: published.lookingFor, shareSections: published.sections.map(s => ({ ...s, enabled: true })), updatedAt: published.profileUpdatedAt };
  storage.setItem(PROFILE_KEY, JSON.stringify(final));
  return final;
}
export function restoreProfile(clientId: string, storage: Storage = localStorage): LocalAgentProfile | null {
  const raw = storage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isLocalProfile(value) && value.clientId === clientId ? saveProfile(value, storage) : null;
  } catch { return null; }
}
