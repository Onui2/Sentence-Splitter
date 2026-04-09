import { materials, sentences, categories, type InsertMaterial, type InsertSentence, type Material, type Sentence, type MaterialWithSentences, type Category, type InsertCategory } from "@shared/schema";
import { db } from "./db";
import { asc, eq, inArray, isNull, sql } from "drizzle-orm";

export interface IStorage {
  getCategories(): Promise<Category[]>;
  createCategory(category: InsertCategory): Promise<Category>;
  deleteCategory(id: number): Promise<void>;
  bulkDeleteCategories(ids: number[]): Promise<void>;
  reorderCategories(orders: { id: number; orderIndex: number }[]): Promise<void>;
  getMaterials(categoryId?: number): Promise<Material[]>;
  getMaterialWithSentences(id: number): Promise<MaterialWithSentences | undefined>;
  createMaterial(material: InsertMaterial): Promise<Material>;
  createSentence(sentence: InsertSentence & { materialId: number }): Promise<Sentence>;
  bulkCreateSentences(materialId: number, sentencesList: { originalText: string; translation: string }[]): Promise<Sentence[]>;
}

export class DatabaseStorage implements IStorage {
  async getCategories(): Promise<Category[]> {
    return await db.select().from(categories).orderBy(categories.parentId, categories.orderIndex, categories.id);
  }

  async createCategory(insertCategory: InsertCategory): Promise<Category> {
    const parentId = insertCategory.parentId ?? null;
    const maxResult = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(${categories.orderIndex}), -1)` })
      .from(categories)
      .where(parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId));
    const nextOrder = (maxResult[0]?.maxOrder ?? -1) + 1;
    const [category] = await db.insert(categories).values({ ...insertCategory, orderIndex: nextOrder }).returning();
    return category;
  }

  async deleteCategory(id: number): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  async bulkDeleteCategories(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(categories).where(inArray(categories.id, ids));
  }

  async reorderCategories(orders: { id: number; orderIndex: number }[]): Promise<void> {
    for (const order of orders) {
      await db.update(categories).set({ orderIndex: order.orderIndex }).where(eq(categories.id, order.id));
    }
  }

  async getMaterials(categoryId?: number): Promise<Material[]> {
    if (categoryId) {
      return await db.select().from(materials).where(eq(materials.categoryId, categoryId));
    }
    return await db.select().from(materials);
  }

  async getMaterialWithSentences(id: number): Promise<MaterialWithSentences | undefined> {
    const [material] = await db.select().from(materials).where(eq(materials.id, id));
    if (!material) return undefined;

    const materialSentences = await db
      .select()
      .from(sentences)
      .where(eq(sentences.materialId, id))
      .orderBy(asc(sentences.orderIndex));

    return {
      ...material,
      sentences: materialSentences,
    };
  }

  async createMaterial(insertMaterial: InsertMaterial): Promise<Material> {
    const [material] = await db.insert(materials).values(insertMaterial).returning();
    return material;
  }

  async createSentence(insertSentence: InsertSentence & { materialId: number }): Promise<Sentence> {
    const [sentence] = await db.insert(sentences).values(insertSentence).returning();
    return sentence;
  }

  async bulkCreateSentences(materialId: number, sentencesList: { originalText: string; translation: string }[]): Promise<Sentence[]> {
    // Get current max order index
    const existing = await this.getMaterialWithSentences(materialId);
    let lastIndex = existing?.sentences.length || 0;

    const values = sentencesList.map((s, i) => ({
      ...s,
      materialId,
      orderIndex: lastIndex + i
    }));

    return await db.insert(sentences).values(values).returning();
  }
}

export const storage = new DatabaseStorage();
