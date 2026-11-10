CREATE TABLE "clients" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"neighborhood" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text NOT NULL,
	"reference" text NOT NULL,
	"consent" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departures" (
	"time" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_locations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "driver_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"route_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" real,
	"speed" real,
	"heading" real,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"name" text PRIMARY KEY NOT NULL,
	"zone" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint NOT NULL,
	"route_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"status" text NOT NULL,
	"key" text,
	"event" text NOT NULL,
	"created" text NOT NULL,
	"message" text NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"neighborhood" text NOT NULL,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text NOT NULL,
	"reference" text NOT NULL,
	"consent" boolean NOT NULL,
	"window" text NOT NULL,
	"notes" text NOT NULL,
	"boxes" jsonb NOT NULL,
	"box_details" jsonb,
	"cold" integer NOT NULL,
	"frozen" integer NOT NULL,
	"gas" integer NOT NULL,
	"storage" text NOT NULL,
	"status" text NOT NULL,
	"route_id" integer,
	"created" text NOT NULL,
	"completed" text,
	"receiver" text,
	"occurrence" jsonb,
	"returned" jsonb,
	"cancelled" jsonb,
	"history" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_forms" (
	"id" text PRIMARY KEY NOT NULL,
	"sheet_number" text NOT NULL,
	"mode" text NOT NULL,
	"photo" text,
	"photo_name" text,
	"status" text NOT NULL,
	"values" jsonb NOT NULL,
	"order_id" integer,
	"created_at" text NOT NULL,
	"imported_at" text
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" integer PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"driver_id" integer,
	"orders" jsonb NOT NULL,
	"status" text NOT NULL,
	"departure" text NOT NULL,
	"created" text NOT NULL,
	"checked" jsonb,
	"claimed_at" text,
	"confirmed" jsonb,
	"audit" jsonb,
	"signatures" jsonb,
	"finished" text,
	"interrupted" jsonb
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"capacity" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"name" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_zone_zones_name_fk" FOREIGN KEY ("zone") REFERENCES "public"."zones"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_locations_route_time_idx" ON "driver_locations" USING btree ("route_id","recorded_at");--> statement-breakpoint
CREATE INDEX "driver_locations_time_idx" ON "driver_locations" USING btree ("recorded_at");