/**
 * Shared auth utility — used by Login and CreateUser.
 * Produces a deterministic SHA-256 hex digest of a password string.
 * This digest serves as the user identifier (no salt; personal-use app).
 */

export async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(pw);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
