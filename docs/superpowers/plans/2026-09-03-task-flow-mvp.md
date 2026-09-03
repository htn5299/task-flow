# Task Flow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Task Flow MVP — a Next.js fullstack task/project management app with JWT auth (httpOnly cookies), project-scoped roles (owner/admin/member/viewer), a Kanban board with comments, per the approved spec.

**Architecture:** Next.js 15 App Router as a single fullstack app — Server Actions + one Route Handler as the backend, PostgreSQL via Drizzle ORM as the only datastore. No separate backend service, no Workspace layer above Project. AI assistant integration is explicitly out of scope for this plan (see spec's Future Work).

**Tech Stack:** Next.js 15 (App Router, TypeScript), PostgreSQL, Drizzle ORM + drizzle-kit, `jose` (JWT), `bcryptjs` (password hashing), Zod, Tailwind CSS + shadcn/ui, `@dnd-kit` (drag-and-drop), Vitest (unit/integration tests), Docker Compose (local Postgres).

**Spec:** `docs/superpowers/specs/2026-09-03-task-flow-mvp-design.md`

## Global Constraints

- Next.js fullstack only — no separate backend service (spec §Tech stack).
- Access token: JWT, 15 minute expiry. Refresh token: random 32-byte token, 30 day expiry. Both stored in httpOnly, `Secure` (prod), `SameSite=Lax` cookies (spec §Auth flow).
- Role is one of exactly `owner | admin | member | viewer`, fixed per project via `project_members.role` — this is the only source of truth for permission checks, never `projects.owner_id` (spec §Data model).
- Every server action touching a project must re-derive the caller's role from the DB and check it against the permission matrix — never trust a role passed from the client (spec §Permission model).
- All input into server actions is validated with Zod, even if already validated client-side (spec §Error handling).
- Cascade delete: deleting a project deletes its `project_members`, `tasks`, `task_comments` (spec §Data model).
- Inviting a member only works for emails that already have an account — no email-invite-link flow (spec §Non-goals).
- No Workspace/Organization layer, no AI assistant code, no E2E tests in this plan (spec §Non-goals).
- Testing: Vitest unit tests for `lib/permissions` and `lib/auth`; Vitest integration tests (real Postgres test DB) for server actions; no component/E2E tests (spec §Testing).

---

## Task 1: Project scaffolding & dev environment

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.eslintrc.json` (or `eslint.config.mjs`, whatever `create-next-app` generates)
- Create: `lib/env.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `requireEnv(name: string): string` from `lib/env.ts`, used by every task that reads an environment variable.

- [ ] **Step 1: Scaffold the Next.js app**

Run from the repo root (`/home/htn/dev/web-app/task-flow`):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```

When prompted about the existing `docs/` directory / non-empty folder, confirm continuing in the current directory.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install drizzle-orm pg jose bcryptjs zod @dnd-kit/core @dnd-kit/sortable
npm install -D drizzle-kit @types/pg @types/bcryptjs vitest vite-tsconfig-paths dotenv
```

- [ ] **Step 3: Initialize shadcn/ui**

```bash
npx shadcn@latest init -d
```

Accept the defaults (this creates `components.json`, `lib/utils.ts`, and the CSS variable setup in `app/globals.css`).

- [ ] **Step 4: Create `lib/env.ts`**

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
```

- [ ] **Step 5: Create `.env.example`**

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/task_flow
JWT_SECRET=change-me-to-a-long-random-string
```

Copy it to `.env.local` (gitignored) with the same values for local dev.

- [ ] **Step 6: Verify the app builds and runs**

```bash
npm run build
npm run dev &
sleep 3
curl -sf http://localhost:3000 > /dev/null && echo "OK: dev server responded"
kill %1
```

Expected: build succeeds, dev server responds with `OK: dev server responded`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, shadcn/ui, base deps"
```

---

## Task 2: Database schema, client & test infrastructure

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/client.ts`
- Create: `drizzle.config.ts`
- Create: `docker-compose.yml`
- Create: `.env.test`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/db.smoke.test.ts`
- Modify: `package.json` (add scripts)

**Interfaces:**
- Consumes: `requireEnv` from `lib/env.ts` (Task 1).
- Produces: `db` (Drizzle instance) from `lib/db/client.ts`; tables `users`, `projects`, `projectMembers`, `tasks`, `taskComments`, `refreshTokens` and types `User`, `NewUser`, `Project`, `NewProject`, `ProjectMember`, `Task`, `NewTask`, `TaskComment`, `RefreshToken` from `lib/db/schema.ts` — every later task imports from here.

- [ ] **Step 1: Write `lib/db/schema.ts`**

```ts
import { pgTable, pgEnum, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['owner', 'admin', 'member', 'viewer']);
export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueMember: unique().on(table.projectId, table.userId),
}));

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('todo'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  assigneeId: uuid('assignee_id').references(() => users.id),
  dueDate: timestamp('due_date', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const taskComments = pgTable('task_comments', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
```

- [ ] **Step 2: Write `lib/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { requireEnv } from '@/lib/env';
import * as schema from './schema';

const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

export const db = drizzle(pool, { schema });
```

- [ ] **Step 3: Write `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: task_flow
    ports:
      - '5432:5432'
    volumes:
      - task_flow_data:/var/lib/postgresql/data

  db-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: task_flow_test
    ports:
      - '5433:5432'

volumes:
  task_flow_data:
```

- [ ] **Step 5: Write `.env.test`**

```
DATABASE_URL=postgres://postgres:postgres@localhost:5433/task_flow_test
JWT_SECRET=test-secret-not-for-production
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig, loadEnv } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    env: loadEnv('test', process.cwd(), ''),
  },
});
```

- [ ] **Step 7: Write `tests/setup.ts`**

```ts
import { afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';

afterEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      task_comments, tasks, project_members, refresh_tokens, projects, users
    RESTART IDENTITY CASCADE
  `);
});
```

- [ ] **Step 8: Add `package.json` scripts**

Add to the `"scripts"` section:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Start Postgres and run migrations against both databases**

```bash
docker compose up -d
sleep 3
npm run db:generate
DATABASE_URL=postgres://postgres:postgres@localhost:5432/task_flow npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@localhost:5433/task_flow_test npm run db:migrate
```

Expected: `drizzle-kit generate` creates a migration under `./drizzle`; both `db:migrate` runs apply it without error.

- [ ] **Step 10: Write `tests/db.smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

describe('database connectivity', () => {
  it('inserts and reads a user', async () => {
    const [user] = await db.insert(users).values({
      email: 'smoke@test.dev',
      passwordHash: 'x',
      name: 'Smoke Test',
    }).returning();

    expect(user.id).toBeTruthy();
    expect(user.email).toBe('smoke@test.dev');
  });
});
```

- [ ] **Step 11: Run the test suite**

```bash
npm test
```

Expected: `tests/db.smoke.test.ts` passes (1 test).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle schema, DB client, and Vitest test infrastructure"
```

---

## Task 3: Password hashing & access-token JWT utilities

**Files:**
- Create: `lib/auth/password.ts`
- Create: `lib/auth/jwt.ts`
- Test: `lib/auth/password.test.ts`
- Test: `lib/auth/jwt.test.ts`

**Interfaces:**
- Consumes: `requireEnv` from `lib/env.ts` (Task 1).
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>` from `lib/auth/password.ts`; `signAccessToken(payload: { userId: string }): Promise<string>`, `verifyAccessToken(token: string): Promise<{ userId: string } | null>` from `lib/auth/jwt.ts` — consumed by Tasks 4–6.

- [ ] **Step 1: Write the failing password tests**

`lib/auth/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx vitest run lib/auth/password.test.ts
```

Expected: FAIL — `./password` module not found.

- [ ] **Step 3: Write `lib/auth/password.ts`**

```ts
import bcrypt from 'bcryptjs';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx vitest run lib/auth/password.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing JWT tests**

`lib/auth/jwt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './jwt';

describe('access token JWT', () => {
  it('signs and verifies a token round-trip', async () => {
    const token = await signAccessToken({ userId: 'user-123' });
    const payload = await verifyAccessToken(token);
    expect(payload).toEqual({ userId: 'user-123' });
  });

  it('rejects a garbage token', async () => {
    const payload = await verifyAccessToken('not-a-real-token');
    expect(payload).toBeNull();
  });
});
```

- [ ] **Step 6: Run it, confirm it fails**

```bash
npx vitest run lib/auth/jwt.test.ts
```

Expected: FAIL — `./jwt` module not found.

- [ ] **Step 7: Write `lib/auth/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';
import { requireEnv } from '@/lib/env';

const secret = new TextEncoder().encode(requireEnv('JWT_SECRET'));

export interface AccessTokenPayload {
  userId: string;
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== 'string') return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run it, confirm it passes**

```bash
npx vitest run lib/auth/jwt.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/auth/password.ts lib/auth/password.test.ts lib/auth/jwt.ts lib/auth/jwt.test.ts
git commit -m "feat: add password hashing and access-token JWT utilities"
```

---

## Task 4: Refresh tokens, cookies & session helpers

**Files:**
- Create: `lib/auth/refresh-token.ts`
- Create: `lib/auth/cookies.ts`
- Create: `lib/auth/session.ts`
- Test: `lib/auth/refresh-token.test.ts`

**Interfaces:**
- Consumes: `db`, `refreshTokens` from `lib/db/client.ts` / `lib/db/schema.ts` (Task 2); `verifyAccessToken` from `lib/auth/jwt.ts` (Task 3).
- Produces: `createRefreshToken(userId: string): Promise<string>`, `verifyRefreshToken(rawToken: string): Promise<{ tokenId: string; userId: string } | null>`, `revokeRefreshToken(tokenId: string): Promise<void>`, `rotateRefreshToken(tokenId: string, userId: string): Promise<string>` from `lib/auth/refresh-token.ts`; `ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE`, `setAuthCookies(accessToken: string, refreshToken: string): Promise<void>`, `clearAuthCookies(): Promise<void>`, `getAccessTokenCookie(): Promise<string | undefined>`, `getRefreshTokenCookie(): Promise<string | undefined>` from `lib/auth/cookies.ts`; `getCurrentUser(): Promise<{ userId: string } | null>`, `requireCurrentUser(): Promise<{ userId: string }>`, `AuthError` from `lib/auth/session.ts` — consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Write the failing refresh-token tests**

`lib/auth/refresh-token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { createRefreshToken, verifyRefreshToken, revokeRefreshToken, rotateRefreshToken } from './refresh-token';

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

describe('refresh tokens', () => {
  it('creates and verifies a token', async () => {
    const user = await makeUser();
    const rawToken = await createRefreshToken(user.id);
    const result = await verifyRefreshToken(rawToken);
    expect(result?.userId).toBe(user.id);
  });

  it('rejects an unknown token', async () => {
    const result = await verifyRefreshToken('does-not-exist');
    expect(result).toBeNull();
  });

  it('rejects a revoked token', async () => {
    const user = await makeUser();
    const rawToken = await createRefreshToken(user.id);
    const record = await verifyRefreshToken(rawToken);
    await revokeRefreshToken(record!.tokenId);
    expect(await verifyRefreshToken(rawToken)).toBeNull();
  });

  it('rotates a token: old is revoked, new one verifies', async () => {
    const user = await makeUser();
    const rawToken = await createRefreshToken(user.id);
    const record = await verifyRefreshToken(rawToken);
    const newRawToken = await rotateRefreshToken(record!.tokenId, user.id);

    expect(await verifyRefreshToken(rawToken)).toBeNull();
    const newResult = await verifyRefreshToken(newRawToken);
    expect(newResult?.userId).toBe(user.id);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx vitest run lib/auth/refresh-token.test.ts
```

Expected: FAIL — `./refresh-token` module not found.

- [ ] **Step 3: Write `lib/auth/refresh-token.ts`**

```ts
import crypto from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { refreshTokens } from '@/lib/db/schema';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  return rawToken;
}

export interface RefreshTokenResult {
  tokenId: string;
  userId: string;
}

export async function verifyRefreshToken(rawToken: string): Promise<RefreshTokenResult | null> {
  const tokenHash = hashToken(rawToken);
  const [record] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!record) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  return { tokenId: record.id, userId: record.userId };
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, tokenId));
}

export async function rotateRefreshToken(tokenId: string, userId: string): Promise<string> {
  await revokeRefreshToken(tokenId);
  return createRefreshToken(userId);
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx vitest run lib/auth/refresh-token.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Write `lib/auth/cookies.ts`**

```ts
import { cookies } from 'next/headers';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

const isProd = process.env.NODE_ENV === 'production';

export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });
  cookieStore.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}

export async function getAccessTokenCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getRefreshTokenCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
}
```

- [ ] **Step 6: Write `lib/auth/session.ts`**

```ts
import { getAccessTokenCookie } from '@/lib/auth/cookies';
import { verifyAccessToken } from '@/lib/auth/jwt';

export class AuthError extends Error {}

export async function getCurrentUser(): Promise<{ userId: string } | null> {
  const token = await getAccessTokenCookie();
  if (!token) return null;
  return verifyAccessToken(token);
}

export async function requireCurrentUser(): Promise<{ userId: string }> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Not authenticated');
  return user;
}
```

`cookies.ts` and `session.ts` call `next/headers`, which only works inside a request context (Server Actions / Route Handlers) — they have no standalone unit test; they're exercised end-to-end starting in Task 5.

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/auth/refresh-token.ts lib/auth/refresh-token.test.ts lib/auth/cookies.ts lib/auth/session.ts
git commit -m "feat: add refresh token store, auth cookies, and session helpers"
```

---

## Task 5: Auth server actions — register / login / logout

**Files:**
- Create: `lib/validation/flatten-zod-errors.ts`
- Create: `lib/validation/auth.ts`
- Create: `actions/auth.ts`
- Test: `actions/auth.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` (Task 3); `signAccessToken` (Task 3); `createRefreshToken`, `verifyRefreshToken`, `revokeRefreshToken` (Task 4); `setAuthCookies`, `clearAuthCookies`, `getRefreshTokenCookie` (Task 4); `db`, `users` (Task 2).
- Produces: `ActionResult<T = undefined>` (`{ data？: T; error?: string; fieldErrors?: Record<string,string> }`) from `actions/auth.ts` — imported by every later action file; `flattenZodErrors(error: ZodError): Record<string,string>` from `lib/validation/flatten-zod-errors.ts` — imported (not re-exported) by every later action file; `register(input: unknown): Promise<ActionResult>`, `login(input: unknown): Promise<ActionResult>`, `logout(): Promise<void>` from `actions/auth.ts`.

`actions/auth.ts` has `'use server'` at the top — Next.js only allows async function exports from such files, so `ActionResult` (a type, erased at compile time) is fine to export, but no other non-async value may be added to this file later.

- [ ] **Step 1: Write `lib/validation/flatten-zod-errors.ts`**

```ts
import type { ZodError } from 'zod';

export function flattenZodErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
```

- [ ] **Step 2: Write `lib/validation/auth.ts`**

```ts
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  name: z.string().min(1, 'Tên không được để trống'),
});

export const loginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(1, 'Mật khẩu không được để trống'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 3: Write the failing test for `register`/`login`**

Server Actions call `next/headers`' `cookies()`, which throws outside a request scope. Mock it so the action logic (validation, hashing, DB writes) can be tested directly.

`actions/auth.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
  })),
}));

const { register, login } = await import('./auth');

describe('register', () => {
  it('creates a user with a hashed password', async () => {
    const result = await register({ email: 'new@test.dev', password: 'password123', name: 'New User' });
    expect(result.error).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();

    const [user] = await db.select().from(users).where(eq(users.email, 'new@test.dev')).limit(1);
    expect(user).toBeTruthy();
    expect(user.passwordHash).not.toBe('password123');
  });

  it('rejects a duplicate email', async () => {
    await register({ email: 'dup@test.dev', password: 'password123', name: 'First' });
    const result = await register({ email: 'dup@test.dev', password: 'password123', name: 'Second' });
    expect(result.fieldErrors?.email).toBeTruthy();
  });

  it('rejects an invalid input shape', async () => {
    const result = await register({ email: 'not-an-email', password: '123', name: '' });
    expect(result.fieldErrors).toBeTruthy();
  });
});

describe('login', () => {
  it('succeeds with correct credentials', async () => {
    await register({ email: 'login@test.dev', password: 'password123', name: 'Login User' });
    const result = await login({ email: 'login@test.dev', password: 'password123' });
    expect(result.error).toBeUndefined();
  });

  it('fails with wrong password', async () => {
    await register({ email: 'login2@test.dev', password: 'password123', name: 'Login User 2' });
    const result = await login({ email: 'login2@test.dev', password: 'wrong' });
    expect(result.error).toBeTruthy();
  });

  it('fails for an unknown email', async () => {
    const result = await login({ email: 'nobody@test.dev', password: 'password123' });
    expect(result.error).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run it, confirm it fails**

```bash
npx vitest run actions/auth.test.ts
```

Expected: FAIL — `./auth` module not found.

- [ ] **Step 5: Write `actions/auth.ts`**

```ts
'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { signAccessToken } from '@/lib/auth/jwt';
import { createRefreshToken, verifyRefreshToken, revokeRefreshToken } from '@/lib/auth/refresh-token';
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from '@/lib/auth/cookies';
import { registerSchema, loginSchema } from '@/lib/validation/auth';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';

export interface ActionResult<T = undefined> {
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function register(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };
  const { email, password, name } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { fieldErrors: { email: 'Email đã được sử dụng' } };

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash, name }).returning();

  const accessToken = await signAccessToken({ userId: user.id });
  const refreshToken = await createRefreshToken(user.id);
  await setAuthCookies(accessToken, refreshToken);

  return {};
}

export async function login(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: 'Email hoặc mật khẩu không đúng' };
  }

  const accessToken = await signAccessToken({ userId: user.id });
  const refreshToken = await createRefreshToken(user.id);
  await setAuthCookies(accessToken, refreshToken);

  return {};
}

export async function logout(): Promise<void> {
  const rawToken = await getRefreshTokenCookie();
  if (rawToken) {
    const record = await verifyRefreshToken(rawToken);
    if (record) await revokeRefreshToken(record.tokenId);
  }
  await clearAuthCookies();
}
```

- [ ] **Step 6: Run it, confirm it passes**

```bash
npx vitest run actions/auth.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/validation/flatten-zod-errors.ts lib/validation/auth.ts actions/auth.ts actions/auth.test.ts
git commit -m "feat: add register/login/logout server actions"
```

---

## Task 6: Refresh route handler & auth middleware

**Files:**
- Create: `app/api/auth/refresh/route.ts`
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `verifyRefreshToken`, `rotateRefreshToken` (Task 4); `signAccessToken` (Task 3); `setAuthCookies`, `clearAuthCookies`, `getRefreshTokenCookie`, `ACCESS_TOKEN_COOKIE`, `REFRESH_TOKEN_COOKIE` (Task 4).
- Produces: `POST /api/auth/refresh`; `middleware.ts` protecting `/projects/:path*`.

This task requires Next.js's Node.js middleware runtime (`export const runtime = 'nodejs'`), since refresh-token verification hits Postgres via the `pg` driver, which is not Edge-compatible. Step 3 verifies the installed Next.js version supports it — if `next build` errors on the `runtime` export, stop and check the installed `next` version in `package.json` before proceeding (do not silently drop DB-backed refresh from middleware).

- [ ] **Step 1: Write `app/api/auth/refresh/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { verifyRefreshToken, rotateRefreshToken } from '@/lib/auth/refresh-token';
import { signAccessToken } from '@/lib/auth/jwt';
import { setAuthCookies, clearAuthCookies, getRefreshTokenCookie } from '@/lib/auth/cookies';

export async function POST() {
  const rawToken = await getRefreshTokenCookie();
  if (!rawToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const record = await verifyRefreshToken(rawToken);
  if (!record) {
    await clearAuthCookies();
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }

  const newRefreshToken = await rotateRefreshToken(record.tokenId, record.userId);
  const newAccessToken = await signAccessToken({ userId: record.userId });
  await setAuthCookies(newAccessToken, newRefreshToken);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, signAccessToken } from '@/lib/auth/jwt';
import { verifyRefreshToken, rotateRefreshToken } from '@/lib/auth/refresh-token';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth/cookies';

export const runtime = 'nodejs';

const isProd = process.env.NODE_ENV === 'production';

function setAuthCookiesOnResponse(response: NextResponse, accessToken: string, refreshToken: string) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken && (await verifyAccessToken(accessToken))) {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    const record = await verifyRefreshToken(refreshToken);
    if (record) {
      const newRefreshToken = await rotateRefreshToken(record.tokenId, record.userId);
      const newAccessToken = await signAccessToken({ userId: record.userId });
      const response = NextResponse.next();
      setAuthCookiesOnResponse(response, newAccessToken, newRefreshToken);
      return response;
    }
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/projects/:path*'],
};
```

- [ ] **Step 3: Verify the build accepts Node.js middleware runtime**

```bash
npx tsc --noEmit
npm run build
```

Expected: both succeed with no errors about the `runtime` export in `middleware.ts`.

- [ ] **Step 4: Manual verification**

```bash
docker compose up -d
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/projects
kill %1
```

Expected: `307` (or `302`) redirecting to `/login?from=%2Fprojects` — there's no logged-in user yet, so the protected route bounces to login.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/refresh/route.ts middleware.ts
git commit -m "feat: add refresh token route handler and auth middleware"
```

---

## Task 7: Permission matrix & guard helpers

**Files:**
- Create: `lib/permissions/index.ts`
- Create: `lib/permissions/guard.ts`
- Test: `lib/permissions/index.test.ts`
- Test: `lib/permissions/guard.test.ts`

**Interfaces:**
- Consumes: `db`, `projectMembers` (Task 2); `requireCurrentUser` (Task 4).
- Produces: `type Role`, `type Action`, `can(role: Role, action: Action): boolean` from `lib/permissions/index.ts`; `getProjectRole(projectId: string, userId: string): Promise<Role | null>`, `requirePermission(projectId: string, action: Action): Promise<{ userId: string; role: Role }>`, `requireMembership(projectId: string): Promise<{ userId: string; role: Role }>`, `PermissionError`, `NotAMemberError` from `lib/permissions/guard.ts` — every project-scoped action in Tasks 8–11 opens with a call to `requirePermission` or `requireMembership`.

- [ ] **Step 1: Write the failing permission matrix test**

`lib/permissions/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { can } from './index';

describe('permission matrix', () => {
  it('only owner can update or delete a project', () => {
    expect(can('owner', 'project:update')).toBe(true);
    expect(can('admin', 'project:update')).toBe(false);
    expect(can('owner', 'project:delete')).toBe(true);
    expect(can('admin', 'project:delete')).toBe(false);
  });

  it('owner and admin can invite/remove members, only owner can change roles', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(can(role, 'member:invite')).toBe(true);
      expect(can(role, 'member:remove')).toBe(true);
    }
    expect(can('member', 'member:invite')).toBe(false);
    expect(can('viewer', 'member:invite')).toBe(false);
    expect(can('owner', 'member:changeRole')).toBe(true);
    expect(can('admin', 'member:changeRole')).toBe(false);
  });

  it('owner, admin, member can create/update/comment on tasks; only owner/admin can delete', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(can(role, 'task:create')).toBe(true);
      expect(can(role, 'task:update')).toBe(true);
      expect(can(role, 'task:comment')).toBe(true);
    }
    expect(can('viewer', 'task:create')).toBe(false);
    expect(can('viewer', 'task:update')).toBe(false);
    expect(can('viewer', 'task:comment')).toBe(false);

    expect(can('owner', 'task:delete')).toBe(true);
    expect(can('admin', 'task:delete')).toBe(true);
    expect(can('member', 'task:delete')).toBe(false);
    expect(can('viewer', 'task:delete')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

```bash
npx vitest run lib/permissions/index.test.ts
```

Expected: FAIL — `./index` module not found.

- [ ] **Step 3: Write `lib/permissions/index.ts`**

```ts
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type Action =
  | 'project:update'
  | 'project:delete'
  | 'member:invite'
  | 'member:remove'
  | 'member:changeRole'
  | 'task:create'
  | 'task:update'
  | 'task:delete'
  | 'task:comment';

const CAN = {
  'project:update': ['owner'],
  'project:delete': ['owner'],
  'member:invite': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
  'member:changeRole': ['owner'],
  'task:create': ['owner', 'admin', 'member'],
  'task:update': ['owner', 'admin', 'member'],
  'task:delete': ['owner', 'admin'],
  'task:comment': ['owner', 'admin', 'member'],
} as const satisfies Record<Action, readonly Role[]>;

export function can(role: Role, action: Action): boolean {
  return (CAN[action] as readonly Role[]).includes(role);
}
```

- [ ] **Step 4: Run it, confirm it passes**

```bash
npx vitest run lib/permissions/index.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing guard test**

`lib/permissions/guard.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers } from '@/lib/db/schema';

let currentUserId: string | null = null;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => {
    if (!currentUserId) throw new Error('no user set for test');
    return { userId: currentUserId };
  }),
}));

const { requirePermission, requireMembership, getProjectRole, PermissionError, NotAMemberError } = await import('./guard');

async function makeUser(email: string) {
  const [user] = await db.insert(users).values({ email, passwordHash: 'x', name: email }).returning();
  return user;
}

async function makeProjectWithMember(role: 'owner' | 'admin' | 'member' | 'viewer') {
  const owner = await makeUser(`owner-${crypto.randomUUID()}@test.dev`);
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });

  const member = await makeUser(`member-${crypto.randomUUID()}@test.dev`);
  await db.insert(projectMembers).values({ projectId: project.id, userId: member.id, role });

  return { project, member };
}

describe('requirePermission', () => {
  it('resolves when the caller has permission', async () => {
    const { project, member } = await makeProjectWithMember('admin');
    currentUserId = member.id;
    const result = await requirePermission(project.id, 'member:invite');
    expect(result.role).toBe('admin');
  });

  it('throws PermissionError when the caller lacks permission', async () => {
    const { project, member } = await makeProjectWithMember('viewer');
    currentUserId = member.id;
    await expect(requirePermission(project.id, 'task:create')).rejects.toBeInstanceOf(PermissionError);
  });

  it('throws NotAMemberError when the caller is not on the project', async () => {
    const { project } = await makeProjectWithMember('member');
    const outsider = await makeUser(`outsider-${crypto.randomUUID()}@test.dev`);
    currentUserId = outsider.id;
    await expect(requirePermission(project.id, 'task:comment')).rejects.toBeInstanceOf(NotAMemberError);
  });
});

describe('requireMembership', () => {
  it('resolves for any member regardless of role', async () => {
    const { project, member } = await makeProjectWithMember('viewer');
    currentUserId = member.id;
    const result = await requireMembership(project.id);
    expect(result.role).toBe('viewer');
  });
});

describe('getProjectRole', () => {
  it('returns null for a non-member', async () => {
    const { project } = await makeProjectWithMember('member');
    const outsider = await makeUser(`outsider2-${crypto.randomUUID()}@test.dev`);
    expect(await getProjectRole(project.id, outsider.id)).toBeNull();
  });
});
```

- [ ] **Step 6: Run it, confirm it fails**

```bash
npx vitest run lib/permissions/guard.test.ts
```

Expected: FAIL — `./guard` module not found.

- [ ] **Step 7: Write `lib/permissions/guard.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projectMembers } from '@/lib/db/schema';
import { can, type Action, type Role } from '@/lib/permissions';
import { requireCurrentUser } from '@/lib/auth/session';

export class PermissionError extends Error {}
export class NotAMemberError extends Error {}

export async function getProjectRole(projectId: string, userId: string): Promise<Role | null> {
  const [record] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return record?.role ?? null;
}

export async function requireMembership(projectId: string): Promise<{ userId: string; role: Role }> {
  const { userId } = await requireCurrentUser();
  const role = await getProjectRole(projectId, userId);
  if (!role) throw new NotAMemberError('Not a member of this project');
  return { userId, role };
}

export async function requirePermission(
  projectId: string,
  action: Action,
): Promise<{ userId: string; role: Role }> {
  const { userId, role } = await requireMembership(projectId);
  if (!can(role, action)) throw new PermissionError(`Role ${role} cannot perform ${action}`);
  return { userId, role };
}
```

- [ ] **Step 8: Run it, confirm it passes**

```bash
npx vitest run lib/permissions/guard.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add lib/permissions
git commit -m "feat: add permission matrix and project role guard helpers"
```

---

## Task 8: Projects server actions

**Files:**
- Create: `lib/validation/projects.ts`
- Create: `actions/projects.ts`
- Test: `actions/projects.test.ts`

**Interfaces:**
- Consumes: `ActionResult` (Task 5); `flattenZodErrors` (Task 5); `requireCurrentUser` (Task 4); `requirePermission` (Task 7); `db`, `projects`, `projectMembers` (Task 2).
- Produces: `ProjectSummary { id: string; name: string; description: string | null; role: Role }`, `createProject(input: unknown): Promise<ActionResult<{ id: string }>>`, `updateProject(projectId: string, input: unknown): Promise<ActionResult>`, `deleteProject(projectId: string): Promise<ActionResult>`, `listProjectsForUser(): Promise<ProjectSummary[]>` from `actions/projects.ts` — consumed by Tasks 13–15.

- [ ] **Step 1: Write `lib/validation/projects.ts`**

```ts
import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Tên project không được để trống').max(120),
  description: z.string().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1, 'Tên project không được để trống').max(120),
  description: z.string().max(2000).optional(),
});
```

- [ ] **Step 2: Write the failing test**

`actions/projects.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projectMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { createProject, updateProject, deleteProject, listProjectsForUser } = await import('./projects');

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  currentUserId = user.id;
  return user;
}

describe('createProject', () => {
  it('creates a project and makes the creator its owner', async () => {
    await makeUser();
    const result = await createProject({ name: 'My Project', description: 'desc' });
    expect(result.data?.id).toBeTruthy();

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, result.data!.id), eq(projectMembers.userId, currentUserId)));
    expect(membership.role).toBe('owner');
  });

  it('rejects an empty name', async () => {
    await makeUser();
    const result = await createProject({ name: '' });
    expect(result.fieldErrors?.name).toBeTruthy();
  });
});

describe('updateProject / deleteProject', () => {
  it('owner can update and delete; non-owner cannot', async () => {
    await makeUser();
    const created = await createProject({ name: 'Original' });
    const projectId = created.data!.id;

    const updateResult = await updateProject(projectId, { name: 'Renamed' });
    expect(updateResult.error).toBeUndefined();

    const outsider = await makeUser(); // switches currentUserId to a non-member
    await expect(updateProject(projectId, { name: 'Hijacked' })).rejects.toThrow();
    await expect(deleteProject(projectId)).rejects.toThrow();
  });
});

describe('listProjectsForUser', () => {
  it('returns only projects the user is a member of, with role', async () => {
    await makeUser();
    await createProject({ name: 'Mine' });
    const list = await listProjectsForUser();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Mine', role: 'owner' });
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npx vitest run actions/projects.test.ts
```

Expected: FAIL — `./projects` module not found.

- [ ] **Step 4: Write `actions/projects.ts`**

```ts
'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { projects, projectMembers } from '@/lib/db/schema';
import { requireCurrentUser } from '@/lib/auth/session';
import { requirePermission } from '@/lib/permissions/guard';
import { createProjectSchema, updateProjectSchema } from '@/lib/validation/projects';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';
import type { Role } from '@/lib/permissions';

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  role: Role;
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { userId } = await requireCurrentUser();
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [project] = await db.insert(projects).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    ownerId: userId,
  }).returning();

  await db.insert(projectMembers).values({ projectId: project.id, userId, role: 'owner' });

  return { data: { id: project.id } };
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'project:update');
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  await db.update(projects).set({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  }).where(eq(projects.id, projectId));

  return {};
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'project:delete');
  await db.delete(projects).where(eq(projects.id, projectId));
  return {};
}

export async function listProjectsForUser(): Promise<ProjectSummary[]> {
  const { userId } = await requireCurrentUser();

  return db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.userId, userId));
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npx vitest run actions/projects.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/validation/projects.ts actions/projects.ts actions/projects.test.ts
git commit -m "feat: add project server actions (create/update/delete/list)"
```

---

## Task 9: Members server actions

**Files:**
- Create: `lib/validation/members.ts`
- Create: `actions/members.ts`
- Test: `actions/members.test.ts`

**Interfaces:**
- Consumes: `ActionResult` (Task 5); `flattenZodErrors` (Task 5); `requirePermission`, `requireMembership` (Task 7); `db`, `users`, `projectMembers` (Task 2); `Role` (Task 7).
- Produces: `MemberSummary { userId: string; email: string; name: string; role: Role }`, `inviteMember(projectId: string, input: unknown): Promise<ActionResult>`, `removeMember(projectId: string, userId: string): Promise<ActionResult>`, `changeMemberRole(projectId: string, userId: string, input: unknown): Promise<ActionResult>`, `listMembers(projectId: string): Promise<MemberSummary[]>` from `actions/members.ts` — consumed by Tasks 14–16.

- [ ] **Step 1: Write `lib/validation/members.ts`**

```ts
import { z } from 'zod';

export const roleValues = ['owner', 'admin', 'member', 'viewer'] as const;

export const inviteMemberSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  role: z.enum(['admin', 'member', 'viewer']),
});

export const changeRoleSchema = z.object({
  role: z.enum(roleValues),
});
```

- [ ] **Step 2: Write the failing test**

`actions/members.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { inviteMember, removeMember, changeMemberRole, listMembers } = await import('./members');

async function makeUser(email?: string) {
  const [user] = await db.insert(users).values({
    email: email ?? `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

async function makeOwnedProject() {
  const owner = await makeUser();
  currentUserId = owner.id;
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });
  return { owner, project };
}

describe('inviteMember', () => {
  it('adds an existing user to the project with the given role', async () => {
    const { project } = await makeOwnedProject();
    const invitee = await makeUser('invitee@test.dev');

    const result = await inviteMember(project.id, { email: 'invitee@test.dev', role: 'member' });
    expect(result.error).toBeUndefined();
    expect(result.fieldErrors).toBeUndefined();

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, invitee.id)));
    expect(membership.role).toBe('member');
  });

  it('rejects an email with no account', async () => {
    const { project } = await makeOwnedProject();
    const result = await inviteMember(project.id, { email: 'nobody@test.dev', role: 'member' });
    expect(result.fieldErrors?.email).toBeTruthy();
  });

  it('rejects when caller is not owner/admin', async () => {
    const { project } = await makeOwnedProject();
    const nonAdmin = await makeUser();
    await db.insert(projectMembers).values({ projectId: project.id, userId: nonAdmin.id, role: 'member' });
    currentUserId = nonAdmin.id;

    await expect(inviteMember(project.id, { email: 'x@test.dev', role: 'member' })).rejects.toThrow();
  });
});

describe('changeMemberRole', () => {
  it('only owner can change roles', async () => {
    const { project } = await makeOwnedProject();
    const target = await makeUser();
    await db.insert(projectMembers).values({ projectId: project.id, userId: target.id, role: 'member' });

    const result = await changeMemberRole(project.id, target.id, { role: 'admin' });
    expect(result.error).toBeUndefined();

    const [membership] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, target.id)));
    expect(membership.role).toBe('admin');
  });
});

describe('removeMember and listMembers', () => {
  it('removes a member and reflects it in listMembers', async () => {
    const { project } = await makeOwnedProject();
    const target = await makeUser();
    await db.insert(projectMembers).values({ projectId: project.id, userId: target.id, role: 'viewer' });

    await removeMember(project.id, target.id);
    const members = await listMembers(project.id);
    expect(members.find((m) => m.userId === target.id)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npx vitest run actions/members.test.ts
```

Expected: FAIL — `./members` module not found.

- [ ] **Step 4: Write `actions/members.ts`**

```ts
'use server';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, projectMembers } from '@/lib/db/schema';
import { requirePermission, requireMembership } from '@/lib/permissions/guard';
import { inviteMemberSchema, changeRoleSchema } from '@/lib/validation/members';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';
import type { Role } from '@/lib/permissions';

export interface MemberSummary {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export async function inviteMember(projectId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'member:invite');
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user) return { fieldErrors: { email: 'Email này chưa có tài khoản' } };

  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)))
    .limit(1);
  if (existing) return { fieldErrors: { email: 'Người dùng đã là thành viên' } };

  await db.insert(projectMembers).values({ projectId, userId: user.id, role: parsed.data.role });
  return {};
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'member:remove');
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  return {};
}

export async function changeMemberRole(projectId: string, userId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'member:changeRole');
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  await db.update(projectMembers).set({ role: parsed.data.role }).where(
    and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
  );
  return {};
}

export async function listMembers(projectId: string): Promise<MemberSummary[]> {
  await requireMembership(projectId);

  return db
    .select({ userId: users.id, email: users.email, name: users.name, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npx vitest run actions/members.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/validation/members.ts actions/members.ts actions/members.test.ts
git commit -m "feat: add member server actions (invite/remove/changeRole/list)"
```

---

## Task 10: Tasks server actions

**Files:**
- Create: `lib/validation/tasks.ts`
- Create: `actions/tasks.ts`
- Test: `actions/tasks.test.ts`

**Interfaces:**
- Consumes: `ActionResult` (Task 5); `flattenZodErrors` (Task 5); `requirePermission`, `requireMembership` (Task 7); `db`, `tasks`, `Task` (Task 2).
- Produces: `createTask(projectId: string, input: unknown): Promise<ActionResult<Task>>`, `updateTask(projectId: string, taskId: string, input: unknown): Promise<ActionResult>`, `deleteTask(projectId: string, taskId: string): Promise<ActionResult>`, `listTasksByProject(projectId: string): Promise<Task[]>` from `actions/tasks.ts` — consumed by Tasks 15–16.

- [ ] **Step 1: Write `lib/validation/tasks.ts`**

```ts
import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});
```

- [ ] **Step 2: Write the failing test**

`actions/tasks.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers } from '@/lib/db/schema';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { createTask, updateTask, deleteTask, listTasksByProject } = await import('./tasks');

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

async function makeProjectAs(role: 'owner' | 'admin' | 'member' | 'viewer') {
  const owner = await makeUser();
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });

  if (role === 'owner') {
    currentUserId = owner.id;
    return project;
  }
  const other = await makeUser();
  await db.insert(projectMembers).values({ projectId: project.id, userId: other.id, role });
  currentUserId = other.id;
  return project;
}

describe('createTask', () => {
  it('creates a task with default status todo', async () => {
    const project = await makeProjectAs('member');
    const result = await createTask(project.id, { title: 'Do the thing', priority: 'high' });
    expect(result.data?.status).toBe('todo');
    expect(result.data?.priority).toBe('high');
  });

  it('viewer cannot create a task', async () => {
    const project = await makeProjectAs('viewer');
    await expect(createTask(project.id, { title: 'Nope' })).rejects.toThrow();
  });
});

describe('updateTask / deleteTask', () => {
  it('member can update but not delete; admin can delete', async () => {
    const project = await makeProjectAs('member');
    const created = await createTask(project.id, { title: 'T' });
    const taskId = created.data!.id;

    const updateResult = await updateTask(project.id, taskId, { status: 'in_progress' });
    expect(updateResult.error).toBeUndefined();
    await expect(deleteTask(project.id, taskId)).rejects.toThrow();
  });
});

describe('listTasksByProject', () => {
  it('lists tasks for any member', async () => {
    const project = await makeProjectAs('viewer');
    const list = await listTasksByProject(project.id);
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npx vitest run actions/tasks.test.ts
```

Expected: FAIL — `./tasks` module not found.

- [ ] **Step 4: Write `actions/tasks.ts`**

```ts
'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks, type Task } from '@/lib/db/schema';
import { requirePermission, requireMembership } from '@/lib/permissions/guard';
import { createTaskSchema, updateTaskSchema } from '@/lib/validation/tasks';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';

export async function createTask(projectId: string, input: unknown): Promise<ActionResult<Task>> {
  const { userId } = await requirePermission(projectId, 'task:create');
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [task] = await db.insert(tasks).values({
    projectId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    status: 'todo',
    priority: parsed.data.priority,
    assigneeId: parsed.data.assigneeId ?? null,
    dueDate: parsed.data.dueDate ?? null,
    createdBy: userId,
  }).returning();

  return { data: task };
}

export async function updateTask(projectId: string, taskId: string, input: unknown): Promise<ActionResult> {
  await requirePermission(projectId, 'task:update');
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  await db.update(tasks).set({ ...parsed.data, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  return {};
}

export async function deleteTask(projectId: string, taskId: string): Promise<ActionResult> {
  await requirePermission(projectId, 'task:delete');
  await db.delete(tasks).where(eq(tasks.id, taskId));
  return {};
}

export async function listTasksByProject(projectId: string): Promise<Task[]> {
  await requireMembership(projectId);
  return db.select().from(tasks).where(eq(tasks.projectId, projectId));
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npx vitest run actions/tasks.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/validation/tasks.ts actions/tasks.ts actions/tasks.test.ts
git commit -m "feat: add task server actions (create/update/delete/list)"
```

---

## Task 11: Comments server actions

**Files:**
- Create: `lib/validation/comments.ts`
- Create: `actions/comments.ts`
- Test: `actions/comments.test.ts`

**Interfaces:**
- Consumes: `ActionResult` (Task 5); `flattenZodErrors` (Task 5); `requirePermission`, `requireMembership` (Task 7); `db`, `tasks`, `taskComments`, `TaskComment` (Task 2).
- Produces: `createComment(taskId: string, input: unknown): Promise<ActionResult<TaskComment>>`, `listCommentsByTask(taskId: string): Promise<TaskComment[]>` from `actions/comments.ts` — consumed by Task 16.

- [ ] **Step 1: Write `lib/validation/comments.ts`**

```ts
import { z } from 'zod';

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Nội dung không được để trống').max(2000),
});
```

- [ ] **Step 2: Write the failing test**

`actions/comments.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { users, projects, projectMembers, tasks } from '@/lib/db/schema';

let currentUserId: string;
vi.mock('@/lib/auth/session', () => ({
  requireCurrentUser: vi.fn(async () => ({ userId: currentUserId })),
}));

const { createComment, listCommentsByTask } = await import('./comments');

async function makeUser() {
  const [user] = await db.insert(users).values({
    email: `${crypto.randomUUID()}@test.dev`,
    passwordHash: 'x',
    name: 'Test User',
  }).returning();
  return user;
}

async function makeTaskAs(role: 'owner' | 'admin' | 'member' | 'viewer') {
  const owner = await makeUser();
  const [project] = await db.insert(projects).values({ name: 'P', ownerId: owner.id }).returning();
  await db.insert(projectMembers).values({ projectId: project.id, userId: owner.id, role: 'owner' });
  const [task] = await db.insert(tasks).values({ projectId: project.id, title: 'T', createdBy: owner.id }).returning();

  if (role === 'owner') {
    currentUserId = owner.id;
    return task;
  }
  const other = await makeUser();
  await db.insert(projectMembers).values({ projectId: project.id, userId: other.id, role });
  currentUserId = other.id;
  return task;
}

describe('createComment', () => {
  it('member can comment on a task', async () => {
    const task = await makeTaskAs('member');
    const result = await createComment(task.id, { content: 'Looks good' });
    expect(result.data?.content).toBe('Looks good');
  });

  it('viewer cannot comment', async () => {
    const task = await makeTaskAs('viewer');
    await expect(createComment(task.id, { content: 'Nope' })).rejects.toThrow();
  });
});

describe('listCommentsByTask', () => {
  it('lists comments in creation order for any member', async () => {
    const task = await makeTaskAs('member');
    await createComment(task.id, { content: 'first' });
    await createComment(task.id, { content: 'second' });
    const comments = await listCommentsByTask(task.id);
    expect(comments.map((c) => c.content)).toEqual(['first', 'second']);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
npx vitest run actions/comments.test.ts
```

Expected: FAIL — `./comments` module not found.

- [ ] **Step 4: Write `actions/comments.ts`**

```ts
'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { tasks, taskComments, type TaskComment } from '@/lib/db/schema';
import { requirePermission, requireMembership } from '@/lib/permissions/guard';
import { createCommentSchema } from '@/lib/validation/comments';
import { flattenZodErrors } from '@/lib/validation/flatten-zod-errors';
import type { ActionResult } from '@/actions/auth';

async function getTaskProjectId(taskId: string): Promise<string> {
  const [task] = await db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error('Task not found');
  return task.projectId;
}

export async function createComment(taskId: string, input: unknown): Promise<ActionResult<TaskComment>> {
  const projectId = await getTaskProjectId(taskId);
  const { userId } = await requirePermission(projectId, 'task:comment');
  const parsed = createCommentSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: flattenZodErrors(parsed.error) };

  const [comment] = await db.insert(taskComments).values({
    taskId,
    authorId: userId,
    content: parsed.data.content,
  }).returning();

  return { data: comment };
}

export async function listCommentsByTask(taskId: string): Promise<TaskComment[]> {
  const projectId = await getTaskProjectId(taskId);
  await requireMembership(projectId);
  return db.select().from(taskComments).where(eq(taskComments.taskId, taskId));
}
```

- [ ] **Step 5: Run it, confirm it passes**

```bash
npx vitest run actions/comments.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests across every task so far pass.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/comments.ts actions/comments.ts actions/comments.test.ts
git commit -m "feat: add comment server actions (create/list)"
```

---

## Task 12: UI — Auth pages (login/register)

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `register`, `login` from `actions/auth.ts` (Task 5); shadcn/ui `Button`, `Input`, `Label` (installed this task).

- [ ] **Step 1: Install shadcn/ui components used by these pages**

```bash
npx shadcn@latest add button input label
```

- [ ] **Step 2: Write `app/(auth)/login/page.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await login({ email, password });
      if (result.error) return setError(result.error);
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      router.push('/projects');
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Chưa có tài khoản? <a href="/register" className="underline">Đăng ký</a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Write `app/(auth)/register/page.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { register } from '@/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    startTransition(async () => {
      const result = await register({ name, email, password });
      if (result.fieldErrors) return setFieldErrors(result.fieldErrors);
      router.push('/projects');
      router.refresh();
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Đăng ký</h1>
        <div className="space-y-2">
          <Label htmlFor="name">Tên</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          {fieldErrors.name && <p className="text-sm text-red-600">{fieldErrors.name}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {fieldErrors.email && <p className="text-sm text-red-600">{fieldErrors.email}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {fieldErrors.password && <p className="text-sm text-red-600">{fieldErrors.password}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Đang đăng ký...' : 'Đăng ký'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Đã có tài khoản? <a href="/login" className="underline">Đăng nhập</a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
docker compose up -d
npm run dev &
sleep 3
```

In a browser, open `http://localhost:3000/register`, create an account with a real-looking email/password/name, confirm it redirects to `/projects` (blank page is fine — built in Task 13). Then open `http://localhost:3000/login` in a private window and log in with the same credentials, confirm the same redirect.

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)
git commit -m "feat: add login and register pages"
```

---

## Task 13: UI — Projects list page

**Files:**
- Create: `app/(dashboard)/projects/page.tsx`
- Create: `components/project/create-project-dialog.tsx`

**Interfaces:**
- Consumes: `listProjectsForUser`, `createProject`, `ProjectSummary` from `actions/projects.ts` (Task 8); shadcn/ui `Badge`, `Dialog`, `Textarea` (installed this task) plus `Button`/`Input`/`Label` (Task 12).

- [ ] **Step 1: Install shadcn/ui components used by this page**

```bash
npx shadcn@latest add badge dialog textarea
```

- [ ] **Step 2: Write `components/project/create-project-dialog.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProject } from '@/actions/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProject({ name, description: description || undefined });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      setOpen(false);
      setName('');
      setDescription('');
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Tạo project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo project mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">Tên project</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả (tuỳ chọn)</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Đang tạo...' : 'Tạo project'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `app/(dashboard)/projects/page.tsx`**

```tsx
import Link from 'next/link';
import { listProjectsForUser } from '@/actions/projects';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { Badge } from '@/components/ui/badge';

export default async function ProjectsPage() {
  const projects = await listProjectsForUser();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects của bạn</h1>
        <CreateProjectDialog />
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">Chưa có project nào. Tạo project đầu tiên của bạn.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent"
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
                </div>
                <Badge variant="secondary">{project.role}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

```bash
docker compose up -d
npm run dev &
sleep 3
```

Log in (from Task 12), land on `/projects`, click "Tạo project", fill the dialog, submit, confirm the new project appears in the list with an `owner` badge.

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/projects/page.tsx components/project/create-project-dialog.tsx
git commit -m "feat: add projects list page with create-project dialog"
```

---

## Task 14: UI — Project settings page (members)

**Files:**
- Create: `app/(dashboard)/projects/[projectId]/settings/page.tsx`
- Create: `components/project/invite-member-form.tsx`
- Create: `components/project/member-list.tsx`

**Interfaces:**
- Consumes: `listMembers`, `inviteMember`, `removeMember`, `changeMemberRole`, `MemberSummary` from `actions/members.ts` (Task 9); `getCurrentUser` from `lib/auth/session.ts` (Task 4); `NotAMemberError`, `PermissionError` from `lib/permissions/guard.ts` (Task 7); shadcn/ui `Select` (installed this task).

- [ ] **Step 1: Install shadcn/ui components used by this page**

```bash
npx shadcn@latest add select
```

- [ ] **Step 2: Write `components/project/invite-member-form.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteMember } from '@/actions/members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function InviteMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(projectId, { email, role });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      setEmail('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <Input type="email" placeholder="Email thành viên" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
          <SelectItem value="member">member</SelectItem>
          <SelectItem value="viewer">viewer</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" disabled={isPending}>{isPending ? 'Đang mời...' : 'Mời'}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Write `components/project/member-list.tsx`**

```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeMember, changeMemberRole, type MemberSummary } from '@/actions/members';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Role } from '@/lib/permissions';

export function MemberList({
  projectId,
  members,
  currentUserRole,
}: {
  projectId: string;
  members: MemberSummary[];
  currentUserRole?: Role;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove(userId: string) {
    startTransition(async () => {
      await removeMember(projectId, userId);
      router.refresh();
    });
  }

  function handleRoleChange(userId: string, role: Role) {
    startTransition(async () => {
      await changeMemberRole(projectId, userId, { role });
      router.refresh();
    });
  }

  return (
    <ul className="mt-4 space-y-2">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="font-medium">{member.name}</p>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {currentUserRole === 'owner' && member.role !== 'owner' ? (
              <Select defaultValue={member.role} onValueChange={(v) => handleRoleChange(member.userId, v as Role)} disabled={isPending}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="viewer">viewer</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm">{member.role}</span>
            )}
            {member.role !== 'owner' && (
              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => handleRemove(member.userId)}>
                Xoá
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Write `app/(dashboard)/projects/[projectId]/settings/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { listMembers } from '@/actions/members';
import { getCurrentUser } from '@/lib/auth/session';
import { NotAMemberError, PermissionError } from '@/lib/permissions/guard';
import { MemberList } from '@/components/project/member-list';
import { InviteMemberForm } from '@/components/project/invite-member-form';

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  try {
    const [members, currentUser] = await Promise.all([listMembers(projectId), getCurrentUser()]);
    const myRole = members.find((m) => m.userId === currentUser?.userId)?.role;
    if (myRole !== 'owner' && myRole !== 'admin') notFound();

    return (
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">Cài đặt project</h1>
        <section>
          <h2 className="mb-3 text-lg font-medium">Thành viên</h2>
          <InviteMemberForm projectId={projectId} />
          <MemberList projectId={projectId} members={members} currentUserRole={myRole} />
        </section>
      </div>
    );
  } catch (err) {
    if (err instanceof NotAMemberError || err instanceof PermissionError) notFound();
    throw err;
  }
}
```

- [ ] **Step 5: Manual verification**

```bash
docker compose up -d
npm run dev &
sleep 3
```

As the project owner, open `/projects/<projectId>/settings`, invite a second registered account by email as `member`, confirm it appears in the list; change its role to `admin` via the select, confirm it persists after refresh; remove it, confirm it disappears.

```bash
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/projects/[projectId]/settings" components/project/invite-member-form.tsx components/project/member-list.tsx
git commit -m "feat: add project settings page for member management"
```

---

## Task 15: UI — Kanban board

**Files:**
- Create: `app/(dashboard)/projects/[projectId]/page.tsx`
- Create: `components/board/kanban-board.tsx`
- Create: `components/board/column.tsx`
- Create: `components/board/task-card.tsx`
- Create: `components/board/create-task-dialog.tsx`

**Interfaces:**
- Consumes: `listTasksByProject`, `createTask`, `updateTask` from `actions/tasks.ts` (Task 10); `listMembers`, `MemberSummary` from `actions/members.ts` (Task 9); `getCurrentUser` from `lib/auth/session.ts` (Task 4); `Task` from `lib/db/schema.ts` (Task 2); `Role` from `lib/permissions` (Task 7).
- Produces: `KanbanBoard` props `{ projectId: string; initialTasks: Task[]; members: MemberSummary[]; myRole: Role }`; `Column` calls `onTaskClick: (task: Task) => void` — consumed by Task 16's `TaskDetailModal`, rendered from `KanbanBoard`'s `openTask` state.

- [ ] **Step 1: Write `components/board/task-card.tsx`**

```tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import type { Task } from '@/lib/db/schema';

const PRIORITY_VARIANT: Record<Task['priority'], 'default' | 'secondary' | 'destructive'> = {
  low: 'secondary',
  medium: 'default',
  high: 'destructive',
  urgent: 'destructive',
};

export function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className="cursor-pointer rounded border bg-background p-3 shadow-sm hover:shadow"
    >
      <p className="font-medium">{task.title}</p>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
        {task.dueDate && <span className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleDateString('vi-VN')}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/board/column.tsx`**

```tsx
'use client';

import { useDroppable } from '@dnd-kit/core';
import { TaskCard } from '@/components/board/task-card';
import type { Task } from '@/lib/db/schema';

export function Column({
  id,
  title,
  tasks,
  onTaskClick,
}: {
  id: string;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className={`min-h-[200px] rounded-lg border p-3 ${isOver ? 'bg-accent' : ''}`}>
      <h2 className="mb-3 font-medium">{title} ({tasks.length})</h2>
      <div className="space-y-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/board/create-task-dialog.tsx`**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { createTask } from '@/actions/tasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { Task } from '@/lib/db/schema';
import type { MemberSummary } from '@/actions/members';

export function CreateTaskDialog({
  projectId,
  members,
  onCreated,
}: {
  projectId: string;
  members: MemberSummary[];
  onCreated: (task: Task) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTask(projectId, {
        title,
        description: description || undefined,
        priority,
        assigneeId: assigneeId || null,
      });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      if (result.data) onCreated(result.data);
      setOpen(false);
      setTitle('');
      setDescription('');
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Tạo task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo task mới</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="title">Tiêu đề</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">low</SelectItem>
                <SelectItem value="medium">medium</SelectItem>
                <SelectItem value="high">high</SelectItem>
                <SelectItem value="urgent">urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Assignee</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger><SelectValue placeholder="Chưa gán" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Đang tạo...' : 'Tạo task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write `components/board/kanban-board.tsx`**

`TaskDetailModal` is created in Task 16 — this file imports it now so Task 16 can drop the file in without touching this one again.

```tsx
'use client';

import { useState, useTransition } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { updateTask } from '@/actions/tasks';
import type { Task } from '@/lib/db/schema';
import type { MemberSummary } from '@/actions/members';
import type { Role } from '@/lib/permissions';
import { Column } from '@/components/board/column';
import { CreateTaskDialog } from '@/components/board/create-task-dialog';
import { TaskDetailModal } from '@/components/task/task-detail-modal';

const STATUSES = ['todo', 'in_progress', 'done'] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
};

export function KanbanBoard({
  projectId,
  initialTasks,
  members,
  myRole,
}: {
  projectId: string;
  initialTasks: Task[];
  members: MemberSummary[];
  myRole: Role;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const canEdit = myRole === 'owner' || myRole === 'admin' || myRole === 'member';

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !canEdit) return;
    const taskId = active.id as string;
    const newStatus = over.id as (typeof STATUSES)[number];
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
    startTransition(async () => {
      await updateTask(projectId, taskId, { status: newStatus });
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Board</h1>
        {canEdit && (
          <CreateTaskDialog projectId={projectId} members={members} onCreated={(task) => setTasks((prev) => [...prev, task])} />
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          {STATUSES.map((status) => (
            <Column
              key={status}
              id={status}
              title={STATUS_LABELS[status]}
              tasks={tasks.filter((t) => t.status === status)}
              onTaskClick={setOpenTask}
            />
          ))}
        </div>
      </DndContext>
      {openTask && (
        <TaskDetailModal
          projectId={projectId}
          task={openTask}
          members={members}
          canEdit={canEdit}
          onClose={() => setOpenTask(null)}
          onUpdated={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setOpenTask(updated);
          }}
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id));
            setOpenTask(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `app/(dashboard)/projects/[projectId]/page.tsx`**

```tsx
import { listTasksByProject } from '@/actions/tasks';
import { listMembers } from '@/actions/members';
import { getCurrentUser } from '@/lib/auth/session';
import { KanbanBoard } from '@/components/board/kanban-board';

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [tasks, members, currentUser] = await Promise.all([
    listTasksByProject(projectId),
    listMembers(projectId),
    getCurrentUser(),
  ]);
  const myRole = members.find((m) => m.userId === currentUser?.userId)?.role ?? 'viewer';

  return (
    <div className="p-6">
      <KanbanBoard projectId={projectId} initialTasks={tasks} members={members} myRole={myRole} />
    </div>
  );
}
```

This task depends on `components/task/task-detail-modal.tsx`, which is created in Task 16. The app will not type-check or build until Task 16 lands — that's expected; do not stub the modal here.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/projects/[projectId]/page.tsx" components/board
git commit -m "feat: add Kanban board with drag-and-drop status columns"
```

---

## Task 16: UI — Task detail modal (edit + comments)

**Files:**
- Create: `components/task/task-detail-modal.tsx`

**Interfaces:**
- Consumes: `updateTask`, `deleteTask` from `actions/tasks.ts` (Task 10); `createComment`, `listCommentsByTask` from `actions/comments.ts` (Task 11); `Task`, `TaskComment` from `lib/db/schema.ts` (Task 2); `MemberSummary` from `actions/members.ts` (Task 9); rendered by `KanbanBoard` (Task 15) with props `{ projectId, task, members, canEdit, onClose, onUpdated, onDeleted }`.

- [ ] **Step 1: Write `components/task/task-detail-modal.tsx`**

```tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { updateTask, deleteTask } from '@/actions/tasks';
import { createComment, listCommentsByTask } from '@/actions/comments';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Task, TaskComment } from '@/lib/db/schema';
import type { MemberSummary } from '@/actions/members';

export function TaskDetailModal({
  projectId,
  task,
  members,
  canEdit,
  onClose,
  onUpdated,
  onDeleted,
}: {
  projectId: string;
  task: Task;
  members: MemberSummary[];
  canEdit: boolean;
  onClose: () => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
}) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [description, setDescription] = useState(task.description ?? '');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listCommentsByTask(task.id).then(setComments);
  }, [task.id]);

  function handleStatusChange(status: Task['status']) {
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { status });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, status });
    });
  }

  function handlePriorityChange(priority: Task['priority']) {
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { priority });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, priority });
    });
  }

  function handleAssigneeChange(value: string) {
    const assigneeId = value || null;
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { assigneeId });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, assigneeId });
    });
  }

  function handleDueDateChange(value: string) {
    const dueDate = value ? new Date(value) : null;
    startTransition(async () => {
      const result = await updateTask(projectId, task.id, { dueDate });
      if (!result.error && !result.fieldErrors) onUpdated({ ...task, dueDate });
    });
  }

  function handleDescriptionBlur() {
    if (description === (task.description ?? '')) return;
    startTransition(async () => {
      await updateTask(projectId, task.id, { description });
      onUpdated({ ...task, description });
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTask(projectId, task.id);
      onDeleted(task.id);
    });
  }

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    startTransition(async () => {
      const result = await createComment(task.id, { content: newComment });
      if (result.data) {
        setComments((prev) => [...prev, result.data!]);
        setNewComment('');
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            disabled={!canEdit}
            placeholder="Mô tả..."
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Status</p>
              <Select value={task.status} onValueChange={(v) => handleStatusChange(v as Task['status'])} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">todo</SelectItem>
                  <SelectItem value="in_progress">in_progress</SelectItem>
                  <SelectItem value="done">done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Priority</p>
              <Select value={task.priority} onValueChange={(v) => handlePriorityChange(v as Task['priority'])} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Assignee</p>
              <Select value={task.assigneeId ?? ''} onValueChange={handleAssigneeChange} disabled={!canEdit}>
                <SelectTrigger><SelectValue placeholder="Chưa gán" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-sm text-muted-foreground">Due date</p>
              <Input
                type="date"
                defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ''}
                onChange={(e) => handleDueDateChange(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {canEdit && (
            <Button variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>
              Xoá task
            </Button>
          )}

          <div>
            <h3 className="mb-2 font-medium">Bình luận</h3>
            <ul className="mb-3 space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded border p-2 text-sm">{c.content}</li>
              ))}
            </ul>
            <form onSubmit={handleAddComment} className="flex gap-2">
              <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Viết bình luận..." />
              <Button type="submit" disabled={isPending}>Gửi</Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check and build the whole app**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors — this is the first point where every page's imports resolve (Task 15's board page imports this modal).

- [ ] **Step 3: Run the full automated test suite**

```bash
npm test
```

Expected: every unit and integration test from Tasks 3–11 passes.

- [ ] **Step 4: Manual end-to-end verification**

```bash
docker compose up -d
npm run dev &
sleep 3
```

Walk the full golden path in a browser:
1. Register two accounts (A and B).
2. As A: create a project, open it, create a task with a priority and an assignee (A).
3. Drag the task from Todo to In Progress — confirm it persists after a page refresh.
4. Open the task, change its status/priority/assignee/due date via the modal, add a comment — confirm all persist after refresh.
5. Go to project settings, invite B as `member` — confirm B appears.
6. Log in as B (separate browser/private window), open the project, confirm B can see and drag tasks but the settings page 404s for B.
7. As A, change B's role to `viewer` in settings; as B, confirm the board no longer lets viewer drag/create tasks (buttons hidden, drag has no effect) and the task modal fields are disabled.
8. As A, delete the task; confirm it disappears from the board for both A and B (after refresh).

```bash
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add components/task/task-detail-modal.tsx
git commit -m "feat: add task detail modal with field editing and comments"
```

---

## Self-Review Notes

- **Spec coverage:** users/auth (Tasks 3–6), roles & permission matrix (Task 7), projects CRUD (Task 8), members/invite/roles (Task 9), tasks CRUD (Task 10), comments (Task 11), all 5 pages from the spec's "Tính năng & màn hình" section (Tasks 12–16), unit tests for `lib/permissions` and `lib/auth` (Tasks 3, 4, 7), integration tests for server actions (Tasks 5, 8–11), cascade delete (enforced at the schema level in Task 2), httpOnly cookie JWT with 15m/30d expiry and auto-refresh middleware (Tasks 4–6). AI assistant, Workspace layer, email-invite-link, and E2E tests are intentionally absent per spec Non-goals.
- **Type consistency verified across task boundaries:** `ActionResult<T>` defined once in Task 5, imported everywhere; `Task`/`TaskComment`/`ProjectMember` types flow from Task 2's schema through every action and component; `Role`/`Action` from Task 7 used consistently in guards, actions, and UI; `Column`/`TaskDetailModal` pass whole `Task` objects (not bare ids) end-to-end, matching what `KanbanBoard` produces in Task 15 and what Task 16 consumes.
- **Known ordering dependency:** Task 15 imports `components/task/task-detail-modal.tsx`, which only exists after Task 16 — the app will not build in between. This is called out explicitly in Task 15 so an executor doesn't mistake it for a bug.
