ALTER TABLE "drivers" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "returned" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled" jsonb;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "interrupted" jsonb;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "active" boolean DEFAULT true NOT NULL;