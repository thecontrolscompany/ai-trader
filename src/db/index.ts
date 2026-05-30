import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Use connection pooler URL on Vercel (serverless), direct URL for migrations
const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
