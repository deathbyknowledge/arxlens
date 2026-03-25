import { PAPERS_TABLE } from "./papers";

declare global {
  interface Env {
    AUTH_LIMITER: RateLimit;
  }
}

const SESSION_COOKIE_NAME = "arxlens_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const PASSWORD_ITERATIONS = 600_000;
const PASSWORD_HASH_BYTES = 32;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;
const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;
const QUERY_CHUNK_SIZE = 200;

const RESERVED_USERNAMES = new Set([
  "about",
  "account",
  "admin",
  "api",
  "arxlens",
  "feed",
  "help",
  "invite",
  "join",
  "login",
  "logout",
  "new",
  "paper",
  "root",
  "settings",
  "signup",
  "support",
]);

let authTablesReady: Promise<void> | null = null;

export type UserRole = "admin" | "member";

export interface Viewer {
  userId: string;
  username: string;
  role: UserRole;
  canCreateInvites: boolean;
}

interface UserRow {
  id: string;
  username: string;
  username_normalized: string;
  password_salt: string;
  password_hash: string;
  password_iterations: number;
  role: UserRole;
  status: string;
  can_create_invites: number;
}

interface InviteRow {
  id: string;
  created_by_user_id: string;
  claimed_by_user_id: string | null;
  created_at: number;
  expires_at: number;
  used_at: number | null;
}

interface UserPaperStateRow {
  user_id: string;
  paper_id: string;
  saved_at: number | null;
  saved_changed_at: number;
  seen_at: number | null;
  read_at: number | null;
  read_changed_at: number;
  updated_at: number;
}

interface SavedPaperRow {
  id: string;
  version: string;
  versioned_id: string;
  title: string;
  authors: string;
  abstract: string;
  categories: string;
  published_at: string;
  arxiv_url: string;
  pdf_url: string;
  review_status: string;
  intro: string;
  fetched_at: number;
}

export interface SavedPaperSnapshot {
  id: string;
  version: string;
  versionedId: string;
  title: string;
  href: string;
  arxivUrl: string;
  pdfUrl: string;
  authors: string;
  publishedLabel: string;
  categories: string[];
  preview: string;
  reviewStatus: string;
  fetchedAt: number;
  savedAt: number;
}

export interface ReaderStateSnapshot {
  saved: Record<string, SavedPaperSnapshot>;
  seen: Record<string, number>;
  read: Record<string, number>;
  removedSaved: Record<string, number>;
  removedRead: Record<string, number>;
}

export type ReaderStateEvent =
  | { paperId: string; field: "saved"; value: boolean; ts: number }
  | { paperId: string; field: "read"; value: boolean; ts: number }
  | { paperId: string; field: "seen"; ts: number };

export interface InviteSummary {
  id: string;
  status: "available" | "claimed" | "expired";
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface InviteCodeStatus {
  kind: "ready" | "used" | "expired" | "invalid";
  message: string;
}

export interface AuthRegistrationResult {
  viewer: Viewer;
  sessionToken: string;
  bootstrap: boolean;
}

export interface VoteUpdate {
  votesUp: number;
  votesDown: number;
  userVote: "up" | "down" | null;
}

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isAuthError(value: unknown): value is AuthError {
  return value instanceof AuthError;
}

export async function ensureAuthTables(db: D1Database): Promise<void> {
  if (!authTablesReady) {
    authTablesReady = ensureAuthTablesImpl(db).catch((err) => {
      authTablesReady = null;
      throw err;
    });
  }

  return authTablesReady;
}

async function ensureAuthTablesImpl(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      username_normalized TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_iterations INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'active',
      can_create_invites INTEGER NOT NULL DEFAULT 0,
      inviter_user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      expires_at INTEGER NOT NULL
    )`,
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      created_by_user_id TEXT NOT NULL,
      claimed_by_user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    )`,
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS user_paper_state (
      user_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      saved_at INTEGER,
      saved_changed_at INTEGER NOT NULL DEFAULT 0,
      seen_at INTEGER,
      read_at INTEGER,
      read_changed_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (user_id, paper_id)
    )`,
  ).run();

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS user_votes (
      user_id TEXT NOT NULL,
      paper_id TEXT NOT NULL,
      dir TEXT NOT NULL CHECK(dir IN ('up', 'down')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (user_id, paper_id)
    )`,
  ).run();

  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)",
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_invites_creator ON invites(created_by_user_id, created_at DESC)",
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_user_paper_state_saved ON user_paper_state(user_id, saved_at DESC)",
  ).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS idx_user_votes_paper ON user_votes(paper_id, dir)",
  ).run();
}

export function emptyReaderState(): ReaderStateSnapshot {
  return {
    saved: {},
    seen: {},
    read: {},
    removedSaved: {},
    removedRead: {},
  };
}

export function sessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function validateUsername(input: string): string {
  const username = normalizeUsername(input);

  if (!USERNAME_PATTERN.test(username)) {
    throw new AuthError(
      400,
      "invalid_username",
      "Usernames must be 3-24 characters and use only lowercase letters, numbers, underscores, or hyphens.",
    );
  }

  if (RESERVED_USERNAMES.has(username)) {
    throw new AuthError(400, "reserved_username", "That username is reserved.");
  }

  return username;
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      400,
      "password_too_short",
      `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new AuthError(
      400,
      "password_too_long",
      `Passwords must be ${MAX_PASSWORD_LENGTH} characters or fewer.`,
    );
  }
}

export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback = "/account",
): string {
  const candidate = (raw ?? "").trim();
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;

  try {
    const parsed = new URL(candidate, "https://arxlens.invalid");
    if (parsed.origin !== "https://arxlens.invalid") return fallback;
    if (parsed.pathname === "/login" || parsed.pathname === "/signup") return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export function serializeSessionCookie(token: string, requestUrl: string | URL): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecureRequest(requestUrl),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function serializeClearSessionCookie(requestUrl: string | URL): string {
  return serializeCookie(SESSION_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecureRequest(requestUrl),
    maxAge: 0,
  });
}

export async function getViewerFromRequest(
  request: Request,
  db: D1Database,
): Promise<Viewer | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT
       users.id,
       users.username,
       users.role,
       users.status,
       users.can_create_invites,
       sessions.expires_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ?
     LIMIT 1`,
  ).bind(tokenHash).first<{
    id: string;
    username: string;
    role: UserRole;
    status: string;
    can_create_invites: number;
    expires_at: number;
  }>();

  if (!row) return null;

  if (row.expires_at <= Date.now() || row.status !== "active") {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }

  return {
    userId: row.id,
    username: row.username,
    role: row.role,
    canCreateInvites: row.can_create_invites === 1,
  };
}

export async function destroySessionFromRequest(
  request: Request,
  db: D1Database,
): Promise<void> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) return;

  const tokenHash = await sha256Hex(token);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function authenticateUser(
  db: D1Database,
  usernameInput: string,
  password: string,
): Promise<Viewer | null> {
  const username = normalizeUsername(usernameInput);
  if (!username || !password) return null;

  const row = await db.prepare(
    `SELECT
       id,
       username,
       username_normalized,
       password_salt,
       password_hash,
       password_iterations,
       role,
       status,
       can_create_invites
     FROM users
     WHERE username_normalized = ?
     LIMIT 1`,
  ).bind(username).first<UserRow>();

  if (!row || row.status !== "active") return null;

  const valid = await verifyPassword(password, row);
  if (!valid) return null;

  return viewerFromUserRow(row);
}

export async function createSession(
  db: D1Database,
  userId: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + SESSION_TTL_MS;

  await db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), userId, tokenHash, expiresAt).run();

  return { token, expiresAt };
}

export async function getUserCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function isBootstrapOpen(db: D1Database): Promise<boolean> {
  return (await getUserCount(db)) === 0;
}

export async function registerUser(
  db: D1Database,
  input: { username: string; password: string; inviteCode?: string | null },
): Promise<AuthRegistrationResult> {
  const username = validateUsername(input.username);
  validatePassword(input.password);

  const bootstrap = await isBootstrapOpen(db);
  let inviteRow: InviteRow | null = null;

  if (!bootstrap) {
    const inviteCode = (input.inviteCode ?? "").trim();
    if (!inviteCode) {
      throw new AuthError(400, "invite_required", "Invite code required.");
    }

    inviteRow = await lookupActiveInviteByCode(db, inviteCode);
    if (!inviteRow) {
      throw new AuthError(400, "invalid_invite", "That invite is no longer valid.");
    }
  }

  const now = Date.now();
  const userId = crypto.randomUUID();
  const passwordSalt = randomHex(16);
  const passwordHash = await derivePasswordHash(
    input.password,
    passwordSalt,
    PASSWORD_ITERATIONS,
  );

  try {
    await db.prepare(
      `INSERT INTO users
         (id, username, username_normalized, password_salt, password_hash, password_iterations, role, status, can_create_invites, inviter_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
    ).bind(
      userId,
      username,
      username,
      passwordSalt,
      passwordHash,
      PASSWORD_ITERATIONS,
      bootstrap ? "admin" : "member",
      bootstrap ? 1 : 0,
      inviteRow?.created_by_user_id ?? null,
      now,
      now,
    ).run();
  } catch (err) {
    if (String(err).includes("username_normalized")) {
      throw new AuthError(400, "username_taken", "That username is not available.");
    }
    throw err;
  }

  if (inviteRow) {
    await db.prepare(
      `UPDATE invites
       SET claimed_by_user_id = ?, used_at = ?
       WHERE id = ?
         AND claimed_by_user_id IS NULL
         AND expires_at > ?`,
    ).bind(userId, now, inviteRow.id, now).run();

    const claimed = await db.prepare(
      "SELECT claimed_by_user_id FROM invites WHERE id = ? LIMIT 1",
    ).bind(inviteRow.id).first<{ claimed_by_user_id: string | null }>();

    if (claimed?.claimed_by_user_id !== userId) {
      await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      throw new AuthError(400, "invalid_invite", "That invite is no longer valid.");
    }
  }

  const session = await createSession(db, userId);

  return {
    viewer: {
      userId,
      username,
      role: bootstrap ? "admin" : "member",
      canCreateInvites: bootstrap,
    },
    sessionToken: session.token,
    bootstrap,
  };
}

export async function getInviteCodeStatus(
  db: D1Database,
  code: string,
): Promise<InviteCodeStatus | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const tokenHash = await sha256Hex(trimmed);
  const row = await db.prepare(
    `SELECT claimed_by_user_id, expires_at
     FROM invites
     WHERE token_hash = ?
     LIMIT 1`,
  ).bind(tokenHash).first<{ claimed_by_user_id: string | null; expires_at: number }>();

  if (!row) {
    return {
      kind: "invalid",
      message: "That invite code does not exist.",
    };
  }

  if (row.claimed_by_user_id) {
    return {
      kind: "used",
      message: "That invite has already been used.",
    };
  }

  if (row.expires_at <= Date.now()) {
    return {
      kind: "expired",
      message: "That invite has expired.",
    };
  }

  return {
    kind: "ready",
    message: "Invite ready. Pick a username and password to join.",
  };
}

export async function createInvite(
  db: D1Database,
  viewer: Viewer,
): Promise<{ code: string; expiresAt: number }> {
  if (!viewer.canCreateInvites) {
    throw new AuthError(403, "invite_forbidden", "This account cannot create invites.");
  }

  const code = randomHex(12);
  const tokenHash = await sha256Hex(code);
  const expiresAt = Date.now() + INVITE_TTL_MS;

  await db.prepare(
    `INSERT INTO invites (id, token_hash, created_by_user_id, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), tokenHash, viewer.userId, expiresAt).run();

  return { code, expiresAt };
}

export async function listInvitesForUser(
  db: D1Database,
  userId: string,
): Promise<InviteSummary[]> {
  const now = Date.now();
  const rows = await db.prepare(
    `SELECT id, claimed_by_user_id, created_at, expires_at, used_at
     FROM invites
     WHERE created_by_user_id = ?
     ORDER BY created_at DESC
     LIMIT 40`,
  ).bind(userId).all<{
    id: string;
    claimed_by_user_id: string | null;
    created_at: number;
    expires_at: number;
    used_at: number | null;
  }>();

  return rows.results.map((row) => ({
    id: row.id,
    status: row.claimed_by_user_id
      ? "claimed"
      : row.expires_at <= now
        ? "expired"
        : "available",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  }));
}

export async function loadReaderStateSnapshot(
  db: D1Database,
  userId: string,
): Promise<ReaderStateSnapshot> {
  const snapshot = emptyReaderState();
  const rows = await db.prepare(
    `SELECT user_id, paper_id, saved_at, saved_changed_at, seen_at, read_at, read_changed_at, updated_at
     FROM user_paper_state
     WHERE user_id = ?`,
  ).bind(userId).all<UserPaperStateRow>();

  const stateByPaper = new Map<string, UserPaperStateRow>();
  const savedIds: string[] = [];

  for (const row of rows.results) {
    stateByPaper.set(row.paper_id, row);

    if (row.saved_at !== null) {
      savedIds.push(row.paper_id);
    } else if (row.saved_changed_at > 0) {
      snapshot.removedSaved[row.paper_id] = row.saved_changed_at;
    }

    if (row.seen_at !== null) {
      snapshot.seen[row.paper_id] = row.seen_at;
    }

    if (row.read_at !== null) {
      snapshot.read[row.paper_id] = row.read_at;
    } else if (row.read_changed_at > 0) {
      snapshot.removedRead[row.paper_id] = row.read_changed_at;
    }
  }

  const savedPaperRows = await loadSavedPaperRows(db, savedIds);

  for (const paperId of savedIds) {
    const row = stateByPaper.get(paperId);
    if (!row || row.saved_at === null) continue;

    const paperRow = savedPaperRows.get(paperId);
    snapshot.saved[paperId] = paperRow
      ? buildSavedPaperSnapshot(paperRow, row.saved_at)
      : buildFallbackSavedPaperSnapshot(paperId, row.saved_at);
  }

  return snapshot;
}

export async function importReaderState(
  db: D1Database,
  userId: string,
  payload: unknown,
): Promise<ReaderStateSnapshot> {
  const snapshot = normalizeReaderStatePayload(payload);
  const paperIds = uniquePaperIdsFromState(snapshot);
  const currentRows = await loadUserPaperStateMap(db, userId, paperIds);
  const touched = new Set<string>();

  for (const saved of Object.values(snapshot.saved)) {
    const row = getMutableUserPaperState(currentRows, userId, saved.id);
    if (applySavedChange(row, true, saved.savedAt)) touched.add(saved.id);
  }

  for (const [paperId, ts] of Object.entries(snapshot.removedSaved)) {
    const row = getMutableUserPaperState(currentRows, userId, paperId);
    if (applySavedChange(row, false, ts)) touched.add(paperId);
  }

  for (const [paperId, ts] of Object.entries(snapshot.seen)) {
    const row = getMutableUserPaperState(currentRows, userId, paperId);
    if (applySeenChange(row, ts)) touched.add(paperId);
  }

  for (const [paperId, ts] of Object.entries(snapshot.read)) {
    const row = getMutableUserPaperState(currentRows, userId, paperId);
    if (applyReadChange(row, true, ts)) touched.add(paperId);
  }

  for (const [paperId, ts] of Object.entries(snapshot.removedRead)) {
    const row = getMutableUserPaperState(currentRows, userId, paperId);
    if (applyReadChange(row, false, ts)) touched.add(paperId);
  }

  await persistUserPaperStates(
    db,
    Array.from(touched).map((paperId) => currentRows.get(paperId)!).filter(Boolean),
  );

  return loadReaderStateSnapshot(db, userId);
}

export async function applyReaderStateEvents(
  db: D1Database,
  userId: string,
  payload: unknown,
): Promise<void> {
  const ops = normalizeReaderStateEvents(payload);
  if (ops.length === 0) return;

  const currentRows = await loadUserPaperStateMap(
    db,
    userId,
    uniqueStrings(ops.map((op) => op.paperId)),
  );
  const touched = new Set<string>();

  for (const op of ops) {
    const row = getMutableUserPaperState(currentRows, userId, op.paperId);
    const changed = op.field === "seen"
      ? applySeenChange(row, op.ts)
      : op.field === "saved"
        ? applySavedChange(row, op.value, op.ts)
        : applyReadChange(row, op.value, op.ts);

    if (changed) touched.add(op.paperId);
  }

  await persistUserPaperStates(
    db,
    Array.from(touched).map((paperId) => currentRows.get(paperId)!).filter(Boolean),
  );
}

export async function getReaderStateCounts(
  db: D1Database,
  userId: string,
): Promise<{ savedCount: number; seenCount: number; readCount: number }> {
  const row = await db.prepare(
    `SELECT
       SUM(CASE WHEN saved_at IS NOT NULL THEN 1 ELSE 0 END) AS saved_count,
       SUM(CASE WHEN seen_at IS NOT NULL THEN 1 ELSE 0 END) AS seen_count,
       SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count
     FROM user_paper_state
     WHERE user_id = ?`,
  ).bind(userId).first<{
    saved_count: number | null;
    seen_count: number | null;
    read_count: number | null;
  }>();

  return {
    savedCount: row?.saved_count ?? 0,
    seenCount: row?.seen_count ?? 0,
    readCount: row?.read_count ?? 0,
  };
}

export async function getUserVotesForPapers(
  db: D1Database,
  userId: string | null | undefined,
  paperIds: string[],
): Promise<Record<string, "up" | "down">> {
  if (!userId) return {};

  const normalizedPaperIds = uniqueStrings(paperIds.map(stablePaperId).filter(Boolean));
  if (normalizedPaperIds.length === 0) return {};

  const votes: Record<string, "up" | "down"> = {};

  for (const chunk of chunkArray(normalizedPaperIds, QUERY_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await db.prepare(
      `SELECT paper_id, dir
       FROM user_votes
       WHERE user_id = ?
         AND paper_id IN (${placeholders})`,
    ).bind(userId, ...chunk).all<{ paper_id: string; dir: "up" | "down" }>();

    for (const row of rows.results) {
      votes[row.paper_id] = row.dir;
    }
  }

  return votes;
}

export async function applyUserVote(
  db: D1Database,
  userId: string,
  paperId: string,
  requestedDir: "up" | "down",
): Promise<VoteUpdate> {
  const id = stablePaperId(paperId);
  const now = Date.now();

  const existing = await db.prepare(
    `SELECT dir
     FROM user_votes
     WHERE user_id = ? AND paper_id = ?
     LIMIT 1`,
  ).bind(userId, id).first<{ dir: "up" | "down" }>();

  const nextDir = existing?.dir === requestedDir ? null : requestedDir;

  if (!nextDir) {
    await db.prepare(
      "DELETE FROM user_votes WHERE user_id = ? AND paper_id = ?",
    ).bind(userId, id).run();
  } else if (existing) {
    await db.prepare(
      `UPDATE user_votes
       SET dir = ?, updated_at = ?
       WHERE user_id = ? AND paper_id = ?`,
    ).bind(nextDir, now, userId, id).run();
  } else {
    await db.prepare(
      `INSERT INTO user_votes (user_id, paper_id, dir, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(userId, id, nextDir, now, now).run();
  }

  const totals = await db.prepare(
    `SELECT
       SUM(CASE WHEN dir = 'up' THEN 1 ELSE 0 END) AS votes_up,
       SUM(CASE WHEN dir = 'down' THEN 1 ELSE 0 END) AS votes_down
     FROM user_votes
     WHERE paper_id = ?`,
  ).bind(id).first<{ votes_up: number | null; votes_down: number | null }>();

  return {
    votesUp: totals?.votes_up ?? 0,
    votesDown: totals?.votes_down ?? 0,
    userVote: nextDir,
  };
}

async function lookupActiveInviteByCode(
  db: D1Database,
  code: string,
): Promise<InviteRow | null> {
  const tokenHash = await sha256Hex(code.trim());
  const row = await db.prepare(
    `SELECT id, created_by_user_id, claimed_by_user_id, created_at, expires_at, used_at
     FROM invites
     WHERE token_hash = ?
     LIMIT 1`,
  ).bind(tokenHash).first<InviteRow>();

  if (!row) return null;
  if (row.claimed_by_user_id) return null;
  if (row.expires_at <= Date.now()) return null;
  return row;
}

function viewerFromUserRow(row: UserRow): Viewer {
  return {
    userId: row.id,
    username: row.username,
    role: row.role,
    canCreateInvites: row.can_create_invites === 1,
  };
}

function normalizeReaderStatePayload(value: unknown): ReaderStateSnapshot {
  const snapshot = emptyReaderState();
  if (!value || typeof value !== "object") return snapshot;

  const source = value as Record<string, unknown>;
  const savedMap = source.saved;
  if (savedMap && typeof savedMap === "object") {
    for (const [paperId, rawSaved] of Object.entries(savedMap as Record<string, unknown>)) {
      const saved = normalizeSavedPaperSnapshot(rawSaved, paperId);
      if (!saved) continue;
      snapshot.saved[saved.id] = saved;
    }
  }

  snapshot.seen = normalizeTimestampMap(source.seen);
  snapshot.read = normalizeTimestampMap(source.read);
  snapshot.removedSaved = normalizeTimestampMap(source.removedSaved);
  snapshot.removedRead = normalizeTimestampMap(source.removedRead);
  return snapshot;
}

function normalizeReaderStateEvents(value: unknown): ReaderStateEvent[] {
  const rawOps = Array.isArray((value as { ops?: unknown[] } | null)?.ops)
    ? ((value as { ops: unknown[] }).ops)
    : [];
  const events: ReaderStateEvent[] = [];

  for (const rawOp of rawOps) {
    if (!rawOp || typeof rawOp !== "object") continue;
    const op = rawOp as Record<string, unknown>;
    const paperId = stablePaperId(stringValue(op.paperId));
    const ts = normalizeTimestamp(op.ts);
    const field = op.field;

    if (!paperId || !ts) continue;

    if (field === "seen") {
      events.push({ paperId, field: "seen", ts });
      continue;
    }

    if ((field === "saved" || field === "read") && typeof op.value === "boolean") {
      events.push({
        paperId,
        field,
        value: op.value,
        ts,
      });
    }
  }

  return events;
}

function normalizeSavedPaperSnapshot(
  raw: unknown,
  fallbackId: string,
): SavedPaperSnapshot | null {
  if (!raw || typeof raw !== "object") return null;

  const source = raw as Record<string, unknown>;
  const id = stablePaperId(stringValue(source.id) || fallbackId);
  const savedAt = normalizeTimestamp(source.savedAt);

  if (!id || !savedAt) return null;

  const versionedId = stringValue(source.versionedId) || id;
  const version = stringValue(source.version) || extractVersion(versionedId) || "v1";

  return {
    id,
    version,
    versionedId,
    title: stringValue(source.title) || id,
    href: stringValue(source.href) || `/paper/${encodeURIComponent(id)}`,
    arxivUrl: stringValue(source.arxivUrl),
    pdfUrl: stringValue(source.pdfUrl),
    authors: stringValue(source.authors),
    publishedLabel: stringValue(source.publishedLabel),
    categories: stringArray(source.categories, 8),
    preview: stringValue(source.preview, 600),
    reviewStatus: stringValue(source.reviewStatus),
    fetchedAt: normalizeTimestamp(source.fetchedAt),
    savedAt,
  };
}

function normalizeTimestampMap(value: unknown): Record<string, number> {
  const normalized: Record<string, number> = {};
  if (!value || typeof value !== "object") return normalized;

  for (const [paperId, rawTimestamp] of Object.entries(value as Record<string, unknown>)) {
    const id = stablePaperId(paperId);
    const ts = normalizeTimestamp(rawTimestamp);
    if (!id || !ts) continue;
    normalized[id] = ts;
  }

  return normalized;
}

function uniquePaperIdsFromState(snapshot: ReaderStateSnapshot): string[] {
  return uniqueStrings([
    ...Object.keys(snapshot.saved),
    ...Object.keys(snapshot.seen),
    ...Object.keys(snapshot.read),
    ...Object.keys(snapshot.removedSaved),
    ...Object.keys(snapshot.removedRead),
  ].map(stablePaperId).filter(Boolean));
}

async function loadUserPaperStateMap(
  db: D1Database,
  userId: string,
  paperIds: string[],
): Promise<Map<string, UserPaperStateRow>> {
  const rowsByPaper = new Map<string, UserPaperStateRow>();
  const ids = uniqueStrings(paperIds.map(stablePaperId).filter(Boolean));
  if (ids.length === 0) return rowsByPaper;

  for (const chunk of chunkArray(ids, QUERY_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await db.prepare(
      `SELECT user_id, paper_id, saved_at, saved_changed_at, seen_at, read_at, read_changed_at, updated_at
       FROM user_paper_state
       WHERE user_id = ?
         AND paper_id IN (${placeholders})`,
    ).bind(userId, ...chunk).all<UserPaperStateRow>();

    for (const row of rows.results) {
      rowsByPaper.set(row.paper_id, row);
    }
  }

  return rowsByPaper;
}

function getMutableUserPaperState(
  rowsByPaper: Map<string, UserPaperStateRow>,
  userId: string,
  paperId: string,
): UserPaperStateRow {
  const normalizedId = stablePaperId(paperId);
  const existing = rowsByPaper.get(normalizedId);
  if (existing) return existing;

  const row: UserPaperStateRow = {
    user_id: userId,
    paper_id: normalizedId,
    saved_at: null,
    saved_changed_at: 0,
    seen_at: null,
    read_at: null,
    read_changed_at: 0,
    updated_at: Date.now(),
  };
  rowsByPaper.set(normalizedId, row);
  return row;
}

function applySavedChange(
  row: UserPaperStateRow,
  enabled: boolean,
  timestamp: number,
): boolean {
  if (!timestamp || timestamp < row.saved_changed_at) return false;

  row.saved_changed_at = timestamp;
  row.saved_at = enabled ? timestamp : null;
  row.updated_at = Date.now();
  return true;
}

function applyReadChange(
  row: UserPaperStateRow,
  enabled: boolean,
  timestamp: number,
): boolean {
  if (!timestamp || timestamp < row.read_changed_at) return false;

  row.read_changed_at = timestamp;
  row.read_at = enabled ? timestamp : null;
  if (enabled) {
    row.seen_at = Math.max(row.seen_at ?? 0, timestamp);
  }
  row.updated_at = Date.now();
  return true;
}

function applySeenChange(row: UserPaperStateRow, timestamp: number): boolean {
  if (!timestamp || timestamp <= (row.seen_at ?? 0)) return false;

  row.seen_at = timestamp;
  row.updated_at = Date.now();
  return true;
}

async function persistUserPaperStates(
  db: D1Database,
  rows: UserPaperStateRow[],
): Promise<void> {
  for (const row of rows) {
    if (!shouldKeepUserPaperState(row)) {
      await db.prepare(
        "DELETE FROM user_paper_state WHERE user_id = ? AND paper_id = ?",
      ).bind(row.user_id, row.paper_id).run();
      continue;
    }

    await db.prepare(
      `INSERT INTO user_paper_state
         (user_id, paper_id, saved_at, saved_changed_at, seen_at, read_at, read_changed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, paper_id) DO UPDATE SET
         saved_at = excluded.saved_at,
         saved_changed_at = excluded.saved_changed_at,
         seen_at = excluded.seen_at,
         read_at = excluded.read_at,
         read_changed_at = excluded.read_changed_at,
         updated_at = excluded.updated_at`,
    ).bind(
      row.user_id,
      row.paper_id,
      row.saved_at,
      row.saved_changed_at,
      row.seen_at,
      row.read_at,
      row.read_changed_at,
      row.updated_at,
    ).run();
  }
}

function shouldKeepUserPaperState(row: UserPaperStateRow): boolean {
  return row.saved_at !== null ||
    row.seen_at !== null ||
    row.read_at !== null ||
    row.saved_changed_at > 0 ||
    row.read_changed_at > 0;
}

async function loadSavedPaperRows(
  db: D1Database,
  paperIds: string[],
): Promise<Map<string, SavedPaperRow>> {
  const rowsById = new Map<string, SavedPaperRow>();
  const ids = uniqueStrings(paperIds.map(stablePaperId).filter(Boolean));
  if (ids.length === 0) return rowsById;

  for (const chunk of chunkArray(ids, QUERY_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await db.prepare(
      `SELECT
         id,
         version,
         versioned_id,
         title,
         authors,
         abstract,
         categories,
         published_at,
         arxiv_url,
         pdf_url,
         review_status,
         intro,
         fetched_at
       FROM ${PAPERS_TABLE}
       WHERE id IN (${placeholders})`,
    ).bind(...chunk).all<SavedPaperRow>();

    for (const row of rows.results) {
      rowsById.set(row.id, row);
    }
  }

  return rowsById;
}

function buildSavedPaperSnapshot(
  row: SavedPaperRow,
  savedAt: number,
): SavedPaperSnapshot {
  const authors = safeJsonStringArray(row.authors);
  const categories = safeJsonStringArray(row.categories);
  const authorLabel = authors.length > 3
    ? `${authors.slice(0, 3).join(", ")} et al.`
    : authors.join(", ");
  const safeIntro = looksLikeStructuredLeakish(row.intro) ? "" : row.intro;

  return {
    id: row.id,
    version: row.version,
    versionedId: row.versioned_id,
    title: row.title,
    href: `/paper/${encodeURIComponent(row.id)}`,
    arxivUrl: row.arxiv_url,
    pdfUrl: row.pdf_url,
    authors: authorLabel,
    publishedLabel: formatPublishedLabel(row.published_at),
    categories,
    preview: compactText(safeIntro || row.abstract, 420),
    reviewStatus: row.review_status,
    fetchedAt: row.fetched_at,
    savedAt,
  };
}

function buildFallbackSavedPaperSnapshot(
  paperId: string,
  savedAt: number,
): SavedPaperSnapshot {
  return {
    id: paperId,
    version: "v1",
    versionedId: paperId,
    title: paperId,
    href: `/paper/${encodeURIComponent(paperId)}`,
    arxivUrl: "",
    pdfUrl: "",
    authors: "",
    publishedLabel: "",
    categories: [],
    preview: "Open this paper to revisit it later.",
    reviewStatus: "",
    fetchedAt: 0,
    savedAt,
  };
}

function stablePaperId(value: string): string {
  return String(value).trim().replace(/(v\d+)$/i, "");
}

function stringValue(value: unknown, maxLength = 400): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function stringArray(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => stringValue(entry, 120))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTimestamp(value: unknown): number {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string"
      ? parseInt(value, 10)
      : 0;

  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}

function safeJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function compactText(text: string, maxLength: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLength) return flat;
  return `${flat.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
}

function looksLikeStructuredLeakish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return trimmed.includes("</think>") ||
    trimmed.includes('"sections":') ||
    trimmed.includes('"intro":') ||
    trimmed.includes('"stance":') ||
    (/^\{[\s\S]*\}$/.test(trimmed) && trimmed.includes('"key"'));
}

function formatPublishedLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function extractVersion(value: string): string {
  const match = value.trim().match(/(v\d+)$/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function isSecureRequest(requestUrl: string | URL): boolean {
  try {
    const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    path?: string;
    httpOnly?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
    maxAge?: number;
  },
): string {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${options.path ?? "/"}`);

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");

  return parts.join("; ");
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (!trimmed) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex);
    if (key !== name) continue;

    return trimmed.slice(equalsIndex + 1) || null;
  }

  return null;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function verifyPassword(password: string, row: UserRow): Promise<boolean> {
  const candidateHash = await derivePasswordHash(
    password,
    row.password_salt,
    row.password_iterations,
  );

  return timingSafeEqualHex(candidateHash, row.password_hash);
}

async function derivePasswordHash(
  password: string,
  saltHex: string,
  iterations: number,
): Promise<string> {
  const passwordBytes = new TextEncoder().encode(password);
  const saltBytes = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations,
    },
    key,
    PASSWORD_HASH_BYTES * 8,
  );

  return bytesToHex(new Uint8Array(bits));
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function timingSafeEqualHex(leftHex: string, rightHex: string): boolean {
  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, "0");
  }
  return output;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim();
  const bytes = new Uint8Array(Math.floor(normalized.length / 2));

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}
