CREATE TABLE "push_subscription" (
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"expires_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"last_used_at" timestamp with time zone,
	"p256dh" text NOT NULL,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_idx" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_idx" ON "push_subscription" USING btree ("user_id");