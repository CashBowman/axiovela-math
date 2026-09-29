// Keep the last measured context while a follow-up is starting, but never cross
// a provider/model change or a different native session (including review turns).
export function conversationUsage(chat) {
  if (!chat) return null;
  let session = chat.sessionId, fallback = null;
  for (const turn of [...chat.turns].reverse()) {
    if (turn.selection?.adapterId !== chat.selection?.adapterId || turn.selection?.modelId !== chat.selection?.modelId) break;
    if (session && turn.sessionId && session !== turn.sessionId) break;
    session ||= turn.sessionId;
    if (turn.usage && Object.hasOwn(turn.usage, "contextUsage")) return turn.usage;
    fallback ||= turn.usage;
  }
  return fallback;
}
