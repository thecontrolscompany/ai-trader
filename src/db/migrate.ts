import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Must use the direct (non-pooled) connection URL for migrations
const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

migrate(db, { migrationsFolder: "./drizzle" }).then(() => {
  console.log("Migrations applied.");
  process.exit(0);
});
