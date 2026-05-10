import { eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Shop } from "../../domain/index";

type ShopRow = typeof schema.shops.$inferSelect;

function rowToShop(r: ShopRow): Shop {
  return {
    id: r.id,
    worldId: r.worldId,
    nodeId: r.nodeId,
    ownerCharacterId: r.ownerCharacterId,
    employeeCharacterId: r.employeeCharacterId ?? undefined,
    goods: JSON.parse(r.goodsJson) as string[],
    salary: r.salary,
  };
}

export function findShopsByWorld(worldId: string): Shop[] {
  return db.select().from(schema.shops)
    .where(eq(schema.shops.worldId, worldId)).all().map(rowToShop);
}

export function insertShops(shops: Shop[]): void {
  db.transaction((tx) => {
    for (const s of shops) {
      tx.insert(schema.shops).values({
        id: s.id,
        worldId: s.worldId,
        nodeId: s.nodeId,
        ownerCharacterId: s.ownerCharacterId,
        employeeCharacterId: s.employeeCharacterId ?? null,
        goodsJson: JSON.stringify(s.goods),
        salary: s.salary,
      }).run();
    }
  });
}

export function updateShopEmployment(shopId: string, employeeId: string | null): void {
  db.update(schema.shops)
    .set({ employeeCharacterId: employeeId })
    .where(eq(schema.shops.id, shopId))
    .run();
}
