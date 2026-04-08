import { z } from "zod";
import { insertMaterialSchema, insertSentenceSchema, materials, sentences, type MaterialWithSentences } from "./schema";

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  categories: {
    list: {
      method: "GET" as const,
      path: "/api/categories" as const,
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/categories" as const,
      input: z.object({ name: z.string(), parentId: z.number().optional() }),
      responses: {
        201: z.custom<any>(),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/categories/:id" as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
    bulkDelete: {
      method: "POST" as const,
      path: "/api/categories/bulk-delete" as const,
      input: z.object({ ids: z.array(z.number()) }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    reorder: {
      method: "POST" as const,
      path: "/api/categories/reorder" as const,
      input: z.object({ orders: z.array(z.object({ id: z.number(), orderIndex: z.number() })) }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  materials: {
    list: {
      method: "GET" as const,
      path: "/api/materials" as const,
      input: z.object({ categoryId: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof materials.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/materials/:id" as const,
      responses: {
        200: z.custom<MaterialWithSentences>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/materials" as const,
      input: insertMaterialSchema,
      responses: {
        201: z.custom<typeof materials.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  shadowing: {
    create: {
      method: "POST" as const,
      path: "/api/shadowing/create" as const,
      input: z.object({
        title: z.string().min(1),
        categoryId: z.number().optional(),
        sentences: z.array(z.object({
          originalText: z.string(),
          translation: z.string(),
          question: z.string().optional(),
        })),
      }),
      responses: {
        201: z.custom<any>(),
        400: errorSchemas.validation,
      },
    },
  },
  sentences: {
    create: {
      method: "POST" as const,
      path: "/api/materials/:materialId/sentences" as const,
      input: insertSentenceSchema.omit({ materialId: true }),
      responses: {
        201: z.custom<typeof sentences.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    bulkCreate: {
      method: "POST" as const,
      path: "/api/materials/:materialId/sentences/bulk" as const,
      input: z.object({
        sentences: z.array(z.object({
          originalText: z.string(),
          translation: z.string(),
        })),
      }),
      responses: {
        201: z.array(z.custom<typeof sentences.$inferSelect>()),
        400: errorSchemas.validation,
      },
    },
  },
  flipPapers: {
    list: {
      method: "GET" as const,
      path: "/api/flip-papers" as const,
      responses: {
        200: z.object({
          totalPages: z.number(),
          totalElementsCnt: z.number(),
          size: z.number(),
          page: z.number(),
          elementsCntOfPage: z.number(),
          contents: z.array(z.object({
            shadowingPaperNo: z.number(),
            name: z.string(),
            shadowingCnt: z.number(),
            classify: z.string().optional(),
            writeInfo: z.object({
              createdAt: z.string().optional(),
              createdByNm: z.string().optional(),
              updatedAt: z.string().optional(),
              updatedByNm: z.string().optional(),
            }).optional(),
          })),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    detail: {
      method: "GET" as const,
      path: "/api/flip-papers/:paperNo" as const,
      responses: {
        200: z.object({
          shadowingPaperNo: z.number(),
          name: z.string(),
          shadowingCnt: z.number(),
          shadowings: z.array(z.object({
            ordering: z.number(),
            shadowing: z.object({
              shadowingNo: z.number(),
              body: z.array(z.object({
                ordering: z.number(),
                type: z.string(),
                contents: z.string().nullable(),
              })),
              aiSound: z.string().nullable(),
            }),
          })),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/flip-papers/:paperNo" as const,
      input: z.object({
        name: z.string().optional(),
        classifyNo: z.number().optional(),
        edits: z.array(z.object({
          shadowingNo: z.number(),
          english: z.string(),
          korean: z.string(),
        })).optional(),
        deleteShadowingNos: z.array(z.number()).optional(),
        addSentences: z.array(z.object({
          english: z.string(),
          question: z.string(),
        })).optional(),
      }),
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/flip-papers/:paperNo" as const,
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
  },
  flipCategories: {
    list: {
      method: "GET" as const,
      path: "/api/flip-categories" as const,
      responses: {
        200: z.array(z.any()),
        401: z.object({ message: z.string() }),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/flip-categories" as const,
      input: z.object({
        name: z.string().min(1),
        parentNo: z.number().optional(),
      }),
      responses: {
        201: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/flip-categories/:classifyNo" as const,
      input: z.object({
        name: z.string().min(1),
      }),
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/flip-categories/:classifyNo" as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
      },
    },
  },
  questionPapers: {
    list: {
      method: "GET" as const,
      path: "/api/question-papers" as const,
      responses: {
        200: z.object({
          totalPages: z.number(),
          totalElementsCnt: z.number(),
          size: z.number(),
          page: z.number(),
          elementsCntOfPage: z.number(),
          contents: z.array(z.any()),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    detail: {
      method: "GET" as const,
      path: "/api/question-papers/:paperNo" as const,
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/question-papers/:paperNo" as const,
      input: z.object({
        title: z.string().min(1),
        categoryId: z.number().optional(),
        questions: z.array(z.object({
          questionType: z.enum(["CHOICE", "SHORT_ANSWER"]),
          question: z.string().min(1),
          body: z.string().optional(),
          choices: z.array(z.string()).optional(),
          correctAnswer: z.number().optional(),
          answerText: z.string().optional(),
          gradingCaseSensitive: z.boolean().optional(),
          gradingSpecialChars: z.boolean().optional(),
          gradingSpacing: z.boolean().optional(),
          gradingOr: z.boolean().optional(),
          explanation: z.string().optional(),
          tags: z.array(z.string()).optional(),
          categoryId: z.number().optional(),
          score: z.number().optional(),
        })),
      }),
      responses: {
        200: z.any(),
        400: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/question-papers/:paperNo" as const,
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
  },
  questionPaperCategories: {
    list: {
      method: "GET" as const,
      path: "/api/question-paper-categories" as const,
      responses: {
        200: z.array(z.any()),
        401: z.object({ message: z.string() }),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/question-paper-categories" as const,
      input: z.object({
        name: z.string().min(1),
        parentNo: z.number().optional(),
      }),
      responses: {
        201: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/question-paper-categories/:classifyNo" as const,
      input: z.object({ name: z.string().min(1) }),
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/question-paper-categories/:classifyNo" as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
      },
    },
  },
  questionPaperCreate: {
    create: {
      method: "POST" as const,
      path: "/api/question-papers" as const,
      input: z.object({
        title: z.string().min(1),
        categoryId: z.number().optional(),
        shared: z.boolean().optional(),
        questions: z.array(z.object({
          questionType: z.enum(["CHOICE", "SHORT_ANSWER"]),
          question: z.string().min(1),
          body: z.string().optional(),
          choices: z.array(z.string()).optional(),
          correctAnswer: z.number().optional(),
          answerText: z.string().optional(),
          gradingCaseSensitive: z.boolean().optional(),
          gradingSpecialChars: z.boolean().optional(),
          gradingSpacing: z.boolean().optional(),
          gradingOr: z.boolean().optional(),
          explanation: z.string().optional(),
          tags: z.array(z.string()).optional(),
          categoryId: z.number().optional(),
          score: z.number().optional(),
        })),
      }),
      responses: {
        201: z.any(),
        400: errorSchemas.validation,
        401: z.object({ message: z.string() }),
      },
    },
  },
  videos: {
    list: {
      method: "GET" as const,
      path: "/api/videos" as const,
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/videos" as const,
      responses: {
        201: z.any(),
        400: z.object({ message: z.string() }),
        401: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/videos/:videoNo" as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
      },
    },
  },
  videoCategories: {
    list: {
      method: "GET" as const,
      path: "/api/video-categories" as const,
      responses: {
        200: z.array(z.any()),
        401: z.object({ message: z.string() }),
      },
    },
    create: {
      method: "POST" as const,
      path: "/api/video-categories" as const,
      input: z.object({
        name: z.string().min(1),
        parentNo: z.number().optional(),
      }),
      responses: {
        201: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    update: {
      method: "PUT" as const,
      path: "/api/video-categories/:classifyNo" as const,
      input: z.object({ name: z.string().min(1) }),
      responses: {
        200: z.any(),
        401: z.object({ message: z.string() }),
      },
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/video-categories/:classifyNo" as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
      },
    },
  },
  auth: {
    searchAcademy: {
      method: "GET" as const,
      path: "/api/auth/partners" as const,
      responses: {
        200: z.object({ brandNo: z.string(), logo: z.string().nullable() }),
        404: z.object({ message: z.string() }),
      },
    },
    branches: {
      method: "GET" as const,
      path: "/api/auth/branches" as const,
      responses: {
        200: z.array(z.object({ value: z.string(), label1: z.string(), label2: z.string().optional() })),
      },
    },
    login: {
      method: "POST" as const,
      path: "/api/auth/login" as const,
      input: z.object({
        brandNo: z.string().min(1),
        branchNo: z.string().min(1),
        username: z.string().min(1),
        credential: z.string().min(1),
        brandName: z.string().optional(),
        branchName: z.string().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
      },
    },
    me: {
      method: "GET" as const,
      path: "/api/auth/me" as const,
      responses: {
        200: z.object({ authenticated: z.boolean(), username: z.string().optional(), academyName: z.string().optional(), brandName: z.string().optional(), branchName: z.string().optional() }),
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/auth/logout" as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
