import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Transaction } from "@agw/domain";

export function insertTransaction(t: Omit<Transaction, "id">): void {
  db.insert(schema.transactions).values({
    worldId: t.worldId, tick: t.tick, characterId: t.characterId,
    amount: t.amount, category: t.category,
    description: t.description, counterpartyId: t.counterpartyId,
  }).run();
}

export function findTransactionsByCharacter(worldId: string, characterId: string): Transaction[] {
  return db.select().from(schema.transactions)
    .where(and(eq(schema.transactions.worldId, worldId), eq(schema.transactions.characterId, characterId)))
    .all() as Transaction[];
}
