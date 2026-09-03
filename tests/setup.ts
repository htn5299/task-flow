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
