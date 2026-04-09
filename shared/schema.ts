import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id").references((): any => categories.id),
  orderIndex: integer("order_index").notNull().default(0),
});

export const materials = pgTable("materials", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  categoryId: integer("category_id"),
});

export const sentences = pgTable("sentences", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").references(() => materials.id).notNull(),
  originalText: text("original_text").notNull(),
  translation: text("translation").notNull(),
  question: text("question").default(""),
  orderIndex: integer("order_index").notNull(),
});

export const categoriesRelations = relations(categories, ({ many }) => ({
  materials: many(materials),
}));

export const materialsRelations = relations(materials, ({ one, many }) => ({
  sentences: many(sentences),
  category: one(categories, {
    fields: [materials.categoryId],
    references: [categories.id],
  }),
}));

export const sentencesRelations = relations(sentences, ({ one }) => ({
  material: one(materials, {
    fields: [sentences.materialId],
    references: [materials.id],
  }),
}));

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertMaterialSchema = createInsertSchema(materials).omit({ id: true });
export const insertSentenceSchema = createInsertSchema(sentences).omit({ id: true });

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Material = typeof materials.$inferSelect;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Sentence = typeof sentences.$inferSelect;
export type InsertSentence = z.infer<typeof insertSentenceSchema>;

export type MaterialWithSentences = Material & { sentences: Sentence[] };

export const bulkInsertSentencesSchema = z.object({
  sentences: z.array(insertSentenceSchema.omit({ materialId: true, orderIndex: true })),
});

export type BulkInsertSentencesRequest = z.infer<typeof bulkInsertSentencesSchema>;

export const questionSubjectMap = pgTable("question_subject_map", {
  questionNo: integer("question_no").primaryKey(),
  subjectId: integer("subject_id").notNull(),
  subjectName: text("subject_name"),
});

export * from "./models/chat";
