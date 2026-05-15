export function getMySession(): { name: string; color: string } | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('travel_session');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setMySession(name: string, color: string) {
  localStorage.setItem('travel_session', JSON.stringify({ name, color }));
}

export function getRecentTrips(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('recent_trips');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function addRecentTrip(tripId: string) {
  const trips = getRecentTrips();
  const updated = [tripId, ...trips.filter((id) => id !== tripId)].slice(0, 10);
  localStorage.setItem('recent_trips', JSON.stringify(updated));
}

export function removeRecentTrip(tripId: string) {
  const trips = getRecentTrips();
  localStorage.setItem('recent_trips', JSON.stringify(trips.filter((id) => id !== tripId)));
}
