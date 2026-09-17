import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | null = null;

export function getDb(url?: string): Database {
  if (cached) return cached;
  const connectionString = url ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = neon(connectionString);
  cached = drizzle(client, { schema });
  return cached;
}
