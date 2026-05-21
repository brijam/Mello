ALTER TABLE "lists" ADD COLUMN IF NOT EXISTS "color" varchar(20);
--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "accent_color" varchar(20);
