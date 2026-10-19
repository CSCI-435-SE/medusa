import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261006225401 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "subscription" ("id" text not null, "customer_id" text not null, "variant_id" text not null, "quantity" integer not null, "interval" text check ("interval" in ('weekly', 'monthly', 'yearly')) not null, "status" text check ("status" in ('active', 'canceled', 'failed')) not null default 'active', "next_billing_at" timestamptz not null, "payment_provider_id" text not null, "payment_method_id" text null, "canceled_at" timestamptz null, "failed_at" timestamptz null, "failure_reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "subscription_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_deleted_at" ON "subscription" ("deleted_at") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_customer_id" ON "subscription" ("customer_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_subscription_status_next_billing_at" ON "subscription" ("status", "next_billing_at") WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "subscription" cascade;`)
  }
}
