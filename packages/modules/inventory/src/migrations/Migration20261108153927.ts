import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261108153927 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "inventory_item" add column if not exists "low_stock_threshold" integer not null default 10;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "inventory_item" drop column if exists "low_stock_threshold";`
    )
  }
}
