import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

const client = postgres(connectionString, {
  prepare: false,     // required for transaction-mode pooler
  max: 1,             // 1 connection per serverless invocation — prevents pool exhaustion
  idle_timeout: 20,   // release idle connections after 20s
  max_lifetime: 60 * 10, // recycle connections every 10 min
});

export const db = drizzle(client, { schema });
