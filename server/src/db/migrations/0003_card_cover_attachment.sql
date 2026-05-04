ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "cover_attachment_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cards" ADD CONSTRAINT "cards_cover_attachment_id_fk"
   FOREIGN KEY ("cover_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
