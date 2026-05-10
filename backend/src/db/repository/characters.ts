import { eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Character } from "../../domain/index";

type CharRow = typeof schema.characters.$inferSelect;

export function rowToCharacter(c: CharRow): Character {
  return {
    id: c.id, worldId: c.worldId, name: c.name,
    avatar: c.avatar ?? undefined, age: c.age,
    gender: c.gender as Character["gender"],
    profession: c.profession as Character["profession"],
    money: c.money, incomeLevel: c.incomeLevel,
    expenseExempt: !!c.expenseExempt,
    personalProfile: JSON.parse(c.personalProfileJson) as { past: string; present: string },
    origin: c.origin as Character["origin"], locationId: c.locationId,
    personality: JSON.parse(c.personalityJson),
    vitals: JSON.parse(c.vitalsJson),
    emotion: JSON.parse(c.emotionJson),
    abilities: JSON.parse(c.abilitiesJson),
    shortMemory: JSON.parse(c.shortMemoryJson),
    dailyMemory: JSON.parse(c.dailyMemoryJson),
    longMemory: JSON.parse(c.longMemoryJson),
    impressionBook: JSON.parse(c.impressionBookJson ?? "{}") as Record<string, string>,
    shortTermGoal: c.shortTermGoalJson ? JSON.parse(c.shortTermGoalJson) : null,
    longTermGoal: c.longTermGoalJson ? JSON.parse(c.longTermGoalJson) : null,
    liked: c.liked ?? "", disliked: c.disliked ?? "",
    relations: JSON.parse(c.relationsJson),
    currentAction: c.currentActionJson ? JSON.parse(c.currentActionJson) : undefined,
    lastSleepTick: c.lastSleepTick,
    appearance: c.appearance, intelligence: c.intelligence, health: c.health,
    sickness: c.sicknessJson ? JSON.parse(c.sicknessJson) : undefined,
    speakingStyle: c.speakingStyle ?? undefined,
    activeConversationIds: JSON.parse(c.activeConversationIdsJson),
    notebook: [],
  };
}

export function characterToRow(c: Character) {
  return {
    id: c.id, worldId: c.worldId, name: c.name,
    avatar: c.avatar ?? null, age: c.age,
    gender: c.gender, profession: c.profession,
    money: c.money, incomeLevel: c.incomeLevel,
    expenseExempt: c.expenseExempt, incomeMultiplier: 1.0,
    appearance: c.appearance, intelligence: c.intelligence, health: c.health,
    sicknessJson: c.sickness ? JSON.stringify(c.sickness) : null,
    activeConversationIdsJson: JSON.stringify(c.activeConversationIds),
    speakingStyle: c.speakingStyle ?? null,
    personalProfileJson: JSON.stringify(c.personalProfile),
    origin: c.origin, locationId: c.locationId,
    personalityJson: JSON.stringify(c.personality),
    vitalsJson: JSON.stringify(c.vitals),
    emotionJson: JSON.stringify(c.emotion),
    abilitiesJson: JSON.stringify(c.abilities),
    shortMemoryJson: JSON.stringify(c.shortMemory),
    dailyMemoryJson: JSON.stringify(c.dailyMemory),
    longMemoryJson: JSON.stringify(c.longMemory),
    impressionBookJson: JSON.stringify(c.impressionBook),
    shortTermGoalJson: c.shortTermGoal ? JSON.stringify(c.shortTermGoal) : null,
    longTermGoalJson: c.longTermGoal ? JSON.stringify(c.longTermGoal) : null,
    liked: c.liked, disliked: c.disliked,
    relationsJson: JSON.stringify(c.relations),
    currentActionJson: c.currentAction ? JSON.stringify(c.currentAction) : null,
    lastSleepTick: c.lastSleepTick,
  };
}

export function findCharactersByWorld(worldId: string): Character[] {
  return db.select().from(schema.characters)
    .where(eq(schema.characters.worldId, worldId)).all().map(rowToCharacter);
}

export function updateCharacter(c: Character): void {
  const row = characterToRow(c);
  db.update(schema.characters).set({
    avatar: row.avatar,
    locationId: row.locationId, money: row.money,
    incomeLevel: row.incomeLevel, expenseExempt: row.expenseExempt,
    vitalsJson: row.vitalsJson, emotionJson: row.emotionJson,
    shortMemoryJson: row.shortMemoryJson, dailyMemoryJson: row.dailyMemoryJson,
    longMemoryJson: row.longMemoryJson, impressionBookJson: row.impressionBookJson,
    shortTermGoalJson: row.shortTermGoalJson, longTermGoalJson: row.longTermGoalJson,
    liked: row.liked, disliked: row.disliked, relationsJson: row.relationsJson,
    activeConversationIdsJson: row.activeConversationIdsJson,
    currentActionJson: row.currentActionJson, lastSleepTick: row.lastSleepTick,
    sicknessJson: row.sicknessJson, updatedAt: new Date(),
  }).where(eq(schema.characters.id, c.id)).run();
}

export function saveAllCharacters(characters: Character[]): void {
  db.transaction((tx) => {
    for (const c of characters) {
      const row = characterToRow(c);
      tx.update(schema.characters).set({
        avatar: row.avatar,
        locationId: row.locationId, money: row.money,
        incomeLevel: row.incomeLevel, expenseExempt: row.expenseExempt,
        vitalsJson: row.vitalsJson, emotionJson: row.emotionJson,
        shortMemoryJson: row.shortMemoryJson, dailyMemoryJson: row.dailyMemoryJson,
        longMemoryJson: row.longMemoryJson, impressionBookJson: row.impressionBookJson,
        shortTermGoalJson: row.shortTermGoalJson, longTermGoalJson: row.longTermGoalJson,
        liked: row.liked, disliked: row.disliked, relationsJson: row.relationsJson,
        activeConversationIdsJson: row.activeConversationIdsJson,
        currentActionJson: row.currentActionJson, lastSleepTick: row.lastSleepTick,
        sicknessJson: row.sicknessJson, updatedAt: new Date(),
      }).where(eq(schema.characters.id, c.id)).run();
    }
  });
}

export function insertCharacter(c: Character): void {
  db.insert(schema.characters).values(characterToRow(c)).run();
}
