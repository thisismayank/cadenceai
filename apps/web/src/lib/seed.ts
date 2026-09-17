import { eq } from "drizzle-orm";
import { users, workspaces } from "@cadenceai/db";
import { SINGLE_USER_WORKSPACE_NAME } from "@cadenceai/shared";
import { getDb } from "./db";

let cachedIds: { workspaceId: string; userId: string } | null = null;

// Phase 0 is single-user. Ensure there is exactly one workspace + user so every
// subsequent DB write has valid foreign keys.
export async function ensureSingleUserWorkspace(): Promise<{
  workspaceId: string;
  userId: string;
}> {
  if (cachedIds) return cachedIds;

  const db = getDb();

  const existingWorkspaces = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, SINGLE_USER_WORKSPACE_NAME))
    .limit(1);

  let workspaceId = existingWorkspaces[0]?.id;
  if (!workspaceId) {
    const inserted = await db
      .insert(workspaces)
      .values({ name: SINGLE_USER_WORKSPACE_NAME })
      .returning({ id: workspaces.id });
    workspaceId = inserted[0]!.id;
  }

  const existingUsers = await db
    .select()
    .from(users)
    .where(eq(users.workspaceId, workspaceId))
    .limit(1);

  let userId = existingUsers[0]?.id;
  if (!userId) {
    const inserted = await db
      .insert(users)
      .values({ workspaceId, email: "you@localhost", name: "You" })
      .returning({ id: users.id });
    userId = inserted[0]!.id;
  }

  cachedIds = { workspaceId, userId };
  return cachedIds;
}
