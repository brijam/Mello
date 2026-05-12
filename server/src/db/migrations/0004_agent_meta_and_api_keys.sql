ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "agent_meta" jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cards_agent_status_idx"
  ON "cards" ((agent_meta->>'status'))
  WHERE agent_meta IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "prefix" varchar(16) NOT NULL,
  "key_hash" text NOT NULL UNIQUE,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_user_idx" ON "api_keys" ("user_id");
