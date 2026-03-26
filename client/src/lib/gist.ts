/**
 * Owner-PAT GitHub Gist sync for HyperGains.
 * The PAT is baked in at build time — users never see or touch it.
 * One master private Gist holds all users' data as separate files.
 */
import type { UserDataPayload } from "@/lib/storage";
import type { CustomFood } from "@shared/schema";

const PAT = import.meta.env.VITE_GITHUB_PAT as string;
const GIST_DESCRIPTION = "hypergains-data";
const GIST_ID_KEY = "hg_gist_id";

/** Debounce delay for background sync, in ms. */
const SYNC_DEBOUNCE_MS = 3000;

// ── Gist ID cache ─────────────────────────────────────────────────────────────

function getGistId(): string {
  return localStorage.getItem(GIST_ID_KEY) ?? "";
}

function saveGistId(id: string): void {
  localStorage.setItem(GIST_ID_KEY, id);
}

// ── GitHub API types — minimal shapes matching the GitHub Gist API v3 ──────────

interface GistFile {
  content: string;
}

interface GistItem {
  id: string;
  description: string;
  files: Record<string, GistFile>;
}

// ── GitHub API wrapper ────────────────────────────────────────────────────────

async function ghApi(
  method: string,
  path: string,
  body?: object
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { message?: string }).message ?? `GitHub API error ${res.status}`
    );
  }
  return res.json();
}

// ── Master Gist bootstrap ─────────────────────────────────────────────────────

/**
 * Finds or creates the single master HyperGains gist.
 * Result is cached in localStorage so subsequent calls are instant.
 */
async function getMasterGistId(): Promise<string> {
  const cached = getGistId();
  if (cached) return cached;

  let page = 1;
  while (true) {
    const list = (await ghApi("GET", `/gists?per_page=100&page=${page}`)) as GistItem[];
    if (!Array.isArray(list) || list.length === 0) break;
    const found = list.find((g) => g.description === GIST_DESCRIPTION);
    if (found) {
      saveGistId(found.id);
      return found.id;
    }
    if (list.length < 100) break;
    page++;
  }

  // First run — create the master gist with a placeholder file
  const created = (await ghApi("POST", "/gists", {
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      "README.md": { content: "HyperGains user data store. Do not edit manually." },
    },
  })) as GistItem;
  saveGistId(created.id);
  return created.id;
}

// ── Per-user file helpers ─────────────────────────────────────────────────────

function userFilename(userId: string): string {
  return `user_${userId}.json`;
}

const GLOBAL_FOODS_FILENAME = "global_foods.json";

/** Returns the set of community-shared foods. */
export async function getGlobalFoods(): Promise<CustomFood[]> {
  try {
    const gistId = await getMasterGistId();
    const raw = (await ghApi("GET", `/gists/${gistId}`)) as GistItem;
    const file = raw?.files?.[GLOBAL_FOODS_FILENAME];
    if (!file?.content) return [];
    return JSON.parse(file.content) as CustomFood[];
  } catch {
    return [];
  }
}

/** 
 * Merges a list of custom foods into the global shared library.
 * Using a simple merge strategy: existing IDs are overwritten.
 */
export async function updateGlobalFoods(foods: CustomFood[]): Promise<void> {
  const gistId = await getMasterGistId();
  const existing = await getGlobalFoods();
  
  // Create a map by ID for merging
  const map = new Map<string, CustomFood>();
  existing.forEach(f => map.set(f.id, f));
  foods.forEach(f => map.set(f.id, f));

  const updated = Array.from(map.values());

  await ghApi("PATCH", `/gists/${gistId}`, {
    files: {
      [GLOBAL_FOODS_FILENAME]: {
        content: JSON.stringify(updated, null, 2),
      },
    },
  });
}

/** Returns the parsed payload for this userId, or null if not found. */
export async function getUserData(userId: string): Promise<UserDataPayload | null> {
  try {
    const gistId = await getMasterGistId();
    const raw = (await ghApi("GET", `/gists/${gistId}`)) as GistItem;
    const file = raw?.files?.[userFilename(userId)];
    if (!file?.content) return null;
    return JSON.parse(file.content) as UserDataPayload;
  } catch {
    return null;
  }
}

/** Returns true if a data file exists for this userId. */
export async function userExists(userId: string): Promise<boolean> {
  const data = await getUserData(userId);
  return data !== null;
}

/** Writes (creates or overwrites) the data file for this userId. */
export async function setUserData(
  userId: string,
  payload: UserDataPayload
): Promise<void> {
  const gistId = await getMasterGistId();
  await ghApi("PATCH", `/gists/${gistId}`, {
    files: {
      [userFilename(userId)]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  });
}

// ── Debounced background sync ─────────────────────────────────────────────────

let _syncTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSync(payload: UserDataPayload): void {
  if (!PAT) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    try {
      await setUserData(payload.userId, payload);
    } catch (err) {
      console.warn("[HyperGains] background gist sync failed", err);
    }
  }, SYNC_DEBOUNCE_MS);
}

export async function flushSync(payload: UserDataPayload): Promise<void> {
  if (!PAT) return;

  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
  try {
    await setUserData(payload.userId, payload);
  } catch (err) {
    console.warn("[HyperGains] flush gist sync failed", err);
  }
}
