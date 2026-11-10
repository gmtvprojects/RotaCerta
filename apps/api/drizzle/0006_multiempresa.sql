-- Multiempresa. As tabelas da operação saem do schema public: cada empresa passa a ter as suas, em `tenant_<id>`
-- (migrações em ./drizzle-tenant). Aqui ficam só as tabelas compartilhadas.
-- Trava de segurança: só migra se não houver dados de operação, porque eles não teriam a qual empresa pertencer.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "orders") OR EXISTS (SELECT 1 FROM "clients") OR EXISTS (SELECT 1 FROM "vehicles") OR EXISTS (SELECT 1 FROM "drivers") THEN
    RAISE EXCEPTION 'Este banco tem dados de operacao sem empresa. Esvazie ou recrie o banco antes de migrar para multiempresa.';
  END IF;
END $$;--> statement-breakpoint
DROP TABLE "driver_locations", "paper_forms", "notifications", "orders", "routes", "clients", "departures", "neighborhoods", "zones", "drivers", "vehicles" CASCADE;--> statement-breakpoint
CREATE TABLE "companies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "companies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_company_idx" ON "users" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "company_id" integer;--> statement-breakpoint
CREATE INDEX "audit_log_company_idx" ON "audit_log" USING btree ("company_id","id");--> statement-breakpoint
-- o primeiro usuário da gestão vira o administrador da plataforma; os demais pertenciam à empresa única anterior
-- (que não tem dados) e saem, porque agora todo usuário precisa de uma empresa
UPDATE "users" SET "role" = 'plataforma', "driver_id" = NULL WHERE "id" = (SELECT min("id") FROM "users" WHERE "role" = 'gestao');--> statement-breakpoint
DELETE FROM "users" WHERE "role" <> 'plataforma';
