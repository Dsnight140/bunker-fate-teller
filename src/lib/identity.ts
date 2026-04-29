const KEY = "bunker_identity_v1";

export type Identity = {
  playerId: string;
  token: string;
  roomId: string;
  roomCode: string;
  nickname: string;
  isHost: boolean;
};

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(id: Identity) {
  localStorage.setItem(KEY, JSON.stringify(id));
}

export function clearIdentity() {
  localStorage.removeItem(KEY);
}

export function generateToken() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}