CREATE TABLE "agent_usage" (
	"day" text NOT NULL,
	"agent_id" integer NOT NULL,
	"model" text NOT NULL,
	"chats" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"instructions" text NOT NULL,
	"model" text NOT NULL,
	"effort" text DEFAULT 'medium' NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"knowledge" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_usage" ADD CONSTRAINT "agent_usage_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_usage_day_agent_model_idx" ON "agent_usage" USING btree ("day","agent_id","model");