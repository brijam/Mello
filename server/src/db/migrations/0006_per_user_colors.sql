CREATE TABLE IF NOT EXISTS "board_backgrounds" (
	"board_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"background_type" varchar(20) NOT NULL,
	"background_value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_backgrounds_board_id_user_id_pk" PRIMARY KEY("board_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "list_colors" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"color" varchar(20) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_colors_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "board_backgrounds" ADD CONSTRAINT "board_backgrounds_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "board_backgrounds" ADD CONSTRAINT "board_backgrounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "list_colors" ADD CONSTRAINT "list_colors_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "list_colors" ADD CONSTRAINT "list_colors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
