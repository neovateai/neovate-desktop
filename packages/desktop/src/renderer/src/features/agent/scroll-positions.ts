// Module-level map: sessionId -> scrollTop
// In-memory only, lost on app quit
export const scrollPositions = new Map<string, number>();
