import type { Express } from "express";
// Created At: 2026-04-08T17:53:10Z (Triggering fresh deployment - Fix)

import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { questionSubjectMap } from "@shared/schema";
import { inArray } from "drizzle-orm";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// In-memory cache to avoid FlipEdu rate limiting on category endpoints
const apiCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): any | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { apiCache.delete(key); return null; }
  return entry.data;
}
function setCache(key: string, data: any) {
  apiCache.set(key, { data, ts: Date.now() });
}
function clearCache(prefix: string) {
  for (const k of Array.from(apiCache.keys())) { if (k.startsWith(prefix)) apiCache.delete(k); }
}

// Build a FlipEdu question item:
//   body[]  → QUERY + EXAMPLE only (no CHOICE — Elem enum doesn't accept it in POST)
//   items[] → choices (separate field)
//   answer  → "1"-indexed string
//   commentary[] → explanation
function buildQuestionItem(q: any, subjectGroup: string) {
  const item: any = {
    questionType: "BASIC",
    subjectGroup,
    score: q.score || 1,
  };

  // body must be an ArrayList; fileType is required by FlipEdu validation
  // Only QUERY + EXAMPLE go here; CHOICE goes in items[] to avoid Elem enum error
  const bodyParts: any[] = [
    { ordering: 0, type: "QUERY", fileType: "TEXT", contents: q.question || "" },
  ];
  if (q.body?.trim()) {
    bodyParts.push({ ordering: 1, type: "EXAMPLE", fileType: "TEXT", contents: `<p>${q.body.trim()}</p>` });
  }
  item.body = bodyParts;

  if (q.questionType === "CHOICE" && q.choices?.length) {
    item.answerType = "OBJECTIVE";
    // choices sent separately as items[] — not inside body[]
    item.items = q.choices.map((c: string, i: number) => ({ ordering: i, contents: c }));
    const answerStr = String(q.correctAnswer ?? 1);
    item.answer = answerStr;
    item.correctForms = [{ corrects: [answerStr], inCorrects: null }];
  } else if (q.questionType === "SHORT_ANSWER") {
    item.answerType = "SUBJECTIVE";
    const answerStr = q.answerText || "";
    item.answer = answerStr;
    item.correctForms = [{ corrects: [answerStr], inCorrects: null }];
    const scoring: any = {};
    if (q.gradingCaseSensitive) scoring.sensitive = true;
    if (q.gradingSpecialChars) scoring.specialCharacter = true;
    if (q.gradingSpacing) scoring.spacingWord = true;
    if (q.gradingOr) scoring.orGrading = true;
    if (Object.keys(scoring).length > 0) item.gradingConditions = scoring;
  } else {
    item.answerType = "OBJECTIVE";
    item.answer = "1";
    item.correctForms = [{ corrects: ["1"], inCorrects: null }];
  }

  if (q.explanation?.trim()) {
    item.commentary = [{ type: "TEXT", contents: `<p>${q.explanation.trim()}</p>` }];
  }
  if (q.tags?.length) item.tags = q.tags;
  if (q.categoryId) item.subjectId = Number(q.categoryId);
  return item;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Helper: build auth headers for FlipEdu API calls
  function getAuthHeaders(session: any): { lms: Record<string, string>; editor: Record<string, string> } {
    const lms: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json" };
    const editor: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json" };
    if (session.authToken && session.authToken !== "authenticated") {
      lms["x-auth-token"] = session.authToken;
      editor["x-auth-token"] = session.authToken;
    }
    if (session.flipCookies) {
      editor["Cookie"] = session.flipCookies;
      lms["Cookie"] = session.flipCookies;
    }
    return { lms, editor };
  }

  // Helper: try multiple FlipEdu endpoints in order, return first success
  async function tryFlipEndpoints(
    endpoints: Array<{ url: string; method?: string; body?: any; headers: Record<string, string> }>
  ): Promise<{ response: Response; data: any } | null> {
    for (const ep of endpoints) {
      try {
        const opts: RequestInit = {
          method: ep.method || "GET",
          headers: ep.headers,
          redirect: 'follow',
        };
        if (ep.body !== undefined) opts.body = JSON.stringify(ep.body);
        const r = await fetch(ep.url, opts);
        console.log(`[FLIP] ${ep.method || "GET"} ${ep.url} → ${r.status}`);
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          return { response: r, data };
        }
      } catch (err) {
        console.log(`[FLIP] ${ep.url} failed:`, err);
      }
    }
    return null;
  }

  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
  });

  app.get(api.categories.list.path, async (req, res) => {
    const list = await storage.getCategories();
    res.json(list);
  });

  app.post(api.categories.create.path, async (req, res) => {
    const input = api.categories.create.input.parse(req.body);
    const category = await storage.createCategory(input);
    res.status(201).json(category);
  });

  app.get(api.materials.list.path, async (req, res) => {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const materialsList = await storage.getMaterials(categoryId);
    res.json(materialsList);
  });

  app.get(api.materials.get.path, async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const material = await storage.getMaterialWithSentences(id);
    if (!material) {
      return res.status(404).json({ message: "Material not found" });
    }
    res.json(material);
  });

  app.post(api.materials.create.path, async (req, res) => {
    try {
      const input = api.materials.create.input.parse(req.body);
      const material = await storage.createMaterial(input);
      res.status(201).json(material);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.sentences.create.path, async (req, res) => {
    try {
      const materialId = Number(req.params.materialId);
      if (isNaN(materialId)) {
        return res.status(400).json({ message: "Invalid material ID" });
      }
      const bodySchema = api.sentences.create.input.extend({
        orderIndex: z.coerce.number(),
      });
      const input = bodySchema.parse(req.body);
      const sentence = await storage.createSentence({ ...input, materialId });
      res.status(201).json(sentence);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.post(api.sentences.bulkCreate.path, async (req, res) => {
    try {
      const materialId = Number(req.params.materialId);
      if (isNaN(materialId)) {
        return res.status(400).json({ message: "Invalid material ID" });
      }
      const input = api.sentences.bulkCreate.input.parse(req.body);
      const sentencesList = await storage.bulkCreateSentences(materialId, input.sentences);
      res.status(201).json(sentencesList);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Seed data
  const existingMaterials = await storage.getMaterials();
  if (existingMaterials.length === 0) {
    const sampleMaterial = await storage.createMaterial({
      title: "Steve Jobs Stanford Commencement Speech",
      description: "Practice one of the most famous graduation speeches."
    });
    
    await storage.createSentence({
      materialId: sampleMaterial.id,
      originalText: "I am honored to be with you today at your commencement from one of the finest universities in the world.",
      translation: "세계 최고의 대학 중 하나인 이곳에서 여러분의 졸업식에 함께하게 되어 영광입니다.",
      orderIndex: 0
    });
    
    await storage.createSentence({
      materialId: sampleMaterial.id,
      originalText: "I never graduated from college.",
      translation: "저는 대학을 졸업하지 못했습니다.",
      orderIndex: 1
    });
    
    await storage.createSentence({
      materialId: sampleMaterial.id,
      originalText: "Truth be told, this is the closest I've ever gotten to a college graduation.",
      translation: "사실대로 말하자면, 이것이 제가 대학 졸업식에 가장 가까이 와 본 것입니다.",
      orderIndex: 2
    });
  }


  app.post(api.shadowing.create.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const input = api.shadowing.create.input.parse(req.body);
      const cookies = req.session.flipCookies || "";
      const authToken = req.session.authToken;

      const editorHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      };
      const lmsHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }

      const shadowingItems = input.sentences.map((s) => ({
        body: [
          { ordering: 0, type: "EXAMPLE", contents: `<p>${s.originalText}</p>` },
          { ordering: 1, type: "QUERY", contents: s.question || "이 문장을 듣고 따라 말해보세요." },
        ],
        aiSound: s.originalText + "\n",
        aiGrading: s.originalText + "\n",
      }));

      let createShadowingsRes = await fetch(
        "https://lms.flipedu.net/api/branch/shadowings",
        { method: "POST", headers: lmsHeaders, body: JSON.stringify(shadowingItems) }
      );
      console.log(`[DEBUG] LMS shadowings create: ${createShadowingsRes.status}`);

      if (!createShadowingsRes.ok) {
        console.log(`[DEBUG] LMS failed, trying editor API...`);
        createShadowingsRes = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/shadowings",
          { method: "POST", headers: editorHeaders, body: JSON.stringify(shadowingItems) }
        );
        console.log(`[DEBUG] Editor shadowings create: ${createShadowingsRes.status}`);
      }

      if (!createShadowingsRes.ok) {
        const errText = await createShadowingsRes.text();
        console.log(`[ERROR] Create shadowings failed: ${createShadowingsRes.status}: ${errText.substring(0, 300)}`);
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch {}
        return res.status(createShadowingsRes.status).json({
          message: errData?.message || errData?.error || "쉐도잉 항목 생성에 실패했습니다.",
        });
      }

      const createdShadowings = await createShadowingsRes.json();
      console.log(`[DEBUG] Created shadowings:`, JSON.stringify(createdShadowings).substring(0, 500));

      const shadowingNos: number[] = Array.isArray(createdShadowings)
        ? createdShadowings.map((s: any) => s.shadowingNo)
        : [createdShadowings.shadowingNo];

      const flipBody: any = {
        name: input.title,
        excellentValue: 20,
        goodValue: 10,
        soundCnt: 3,
        recordCnt: 3,
        shadowings: shadowingNos.map((no, i) => ({
          ordering: i,
          shadowingNo: no,
        })),
      };
      if (input.categoryId) {
        flipBody.classifyNo = input.categoryId;
      }

      let paperRes = await fetch(
        "https://lms.flipedu.net/api/branch/shadowing-paper",
        { method: "POST", headers: lmsHeaders, body: JSON.stringify(flipBody) }
      );
      console.log(`[DEBUG] LMS paper create: ${paperRes.status}`);

      if (!paperRes.ok) {
        console.log(`[DEBUG] LMS paper failed, trying editor API...`);
        paperRes = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper",
          { method: "POST", headers: editorHeaders, body: JSON.stringify(flipBody) }
        );
        console.log(`[DEBUG] Editor paper create: ${paperRes.status}`);
      }

      if (!paperRes.ok) {
        const errText = await paperRes.text();
        console.log(`[ERROR] Create paper failed: ${paperRes.status}: ${errText.substring(0, 300)}`);
        let errorData: any = {};
        try { errorData = JSON.parse(errText); } catch {}
        return res.status(paperRes.status).json({
          message: errorData?.message || errorData?.error || "FlipEdu 서버에 쉐도잉을 저장하지 못했습니다.",
        });
      }

      const data = await paperRes.json();
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.categories.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    await storage.deleteCategory(id);
    res.json({ success: true });
  });

  app.post(api.categories.bulkDelete.path, async (req, res) => {
    const input = api.categories.bulkDelete.input.parse(req.body);
    await storage.bulkDeleteCategories(input.ids);
    res.json({ success: true });
  });

  app.post(api.categories.reorder.path, async (req, res) => {
    const input = api.categories.reorder.input.parse(req.body);
    await storage.reorderCategories(input.orders);
    res.json({ success: true });
  });

  app.get(api.flipCategories.list.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }

      const cacheKey = `flipcat:${req.session.username}:${req.session.flipBranchNo || ''}`;
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);

      const { lms, editor } = getAuthHeaders(req.session);
      const result = await tryFlipEndpoints([
        { url: "https://lms.flipedu.net/api/branch/shadowing-paper/classifys/all", headers: lms },
        { url: "https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys/all", headers: editor },
        { url: "https://dev.mstr.flipedu.net/api/branch/shadowing-paper/classifys/all", headers: lms },
      ]);

      if (!result) {
        const stale = apiCache.get(cacheKey);
        if (stale) return res.json(stale.data);
        return res.status(500).json({ message: "카테고리를 불러올 수 없습니다." });
      }

      setCache(cacheKey, result.data);
      res.json(result.data);
    } catch {
      res.status(500).json({ message: "카테고리 조회 중 오류가 발생했습니다." });
    }
  });

  app.post(api.flipCategories.create.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const input = api.flipCategories.create.input.parse(req.body);
      const authToken = req.session.authToken;
      const cookies = req.session.flipCookies || "";
      const body: any = { name: input.name };
      if (input.parentNo) {
        body.parentNo = input.parentNo;
      }

      const editorHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      };
      const lmsHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      };
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }

      let flipResponse = await fetch(
        "https://lms.flipedu.net/api/branch/shadowing-paper/classifys",
        { method: "POST", headers: lmsHeaders, body: JSON.stringify(body) }
      );
      console.log(`[DEBUG] LMS create category: ${flipResponse.status}`);

      if (!flipResponse.ok) {
        const bodyWithSubject = { ...body, subjectGroup: "eng" };
        flipResponse = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys",
          { method: "POST", headers: editorHeaders, body: JSON.stringify([bodyWithSubject]) }
        );
        if (!flipResponse.ok) {
          const errText = await flipResponse.text();
          console.log(`[DEBUG] Editor create category fallback: ${flipResponse.status}: ${errText.substring(0, 500)}`);
          return res.status(flipResponse.status).json({ message: "카테고리 생성에 실패했습니다." });
        }
        console.log(`[DEBUG] Editor create category succeeded: ${flipResponse.status}`);
      }
      const data = await flipResponse.json();
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "카테고리 이름을 입력해주세요." });
      }
      res.status(500).json({ message: "카테고리 생성 중 오류가 발생했습니다." });
    }
  });

  app.put("/api/flip-categories/:classifyNo", async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const classifyNo = req.params.classifyNo;
      const input = api.flipCategories.update.input.parse(req.body);
      const authToken = req.session.authToken;
      const cookies = req.session.flipCookies || "";

      const editorHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      };
      const lmsHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Cookie": cookies,
      };
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }

      const updateBody = { classifyNo: Number(classifyNo), name: input.name };

      let flipResponse = await fetch(
        "https://lms.flipedu.net/api/branch/shadowing-paper/classifys",
        { method: "PUT", headers: lmsHeaders, body: JSON.stringify(updateBody) }
      );
      console.log(`[DEBUG] LMS update category: ${flipResponse.status}`);

      if (!flipResponse.ok) {
        flipResponse = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys",
          { method: "PUT", headers: editorHeaders, body: JSON.stringify([updateBody]) }
        );
        console.log(`[DEBUG] Editor update category fallback (array): ${flipResponse.status}`);
      }

      if (!flipResponse.ok) {
        flipResponse = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys",
          { method: "PUT", headers: editorHeaders, body: JSON.stringify(updateBody) }
        );
        console.log(`[DEBUG] Editor update category fallback2 (object): ${flipResponse.status}`);
      }

      if (!flipResponse.ok) {
        const errText = await flipResponse.text();
        console.log(`[ERROR] Update category failed: ${flipResponse.status}: ${errText.substring(0, 300)}`);
        return res.status(flipResponse.status).json({ message: "카테고리 이름 수정에 실패했습니다." });
      }
      const data = await flipResponse.json();
      res.json(data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "카테고리 이름을 입력해주세요." });
      }
      res.status(500).json({ message: "카테고리 수정 중 오류가 발생했습니다." });
    }
  });

  app.delete("/api/flip-categories/:classifyNo", async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const classifyNo = req.params.classifyNo;
      const authToken = req.session.authToken;
      const cookies = req.session.flipCookies || "";

      const lmsHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Cookie": cookies,
      };
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }

      let flipResponse = await fetch(
        `https://lms.flipedu.net/api/branch/shadowing-paper/classifys/${classifyNo}`,
        { method: "DELETE", headers: lmsHeaders }
      );
      console.log(`[DEBUG] LMS delete category: ${flipResponse.status}`);

      if (!flipResponse.ok) {
        flipResponse = await fetch(
          `https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys/${classifyNo}`,
          {
            method: "DELETE",
            headers: { "Accept": "application/json", "Cookie": cookies },
          }
        );
        console.log(`[DEBUG] Editor delete category fallback: ${flipResponse.status}`);
      }

      if (!flipResponse.ok) {
        flipResponse = await fetch(
          `https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/classifys?classifyNos=${classifyNo}`,
          {
            method: "DELETE",
            headers: { "Accept": "application/json", "Cookie": cookies },
          }
        );
        console.log(`[DEBUG] Editor delete category fallback2 (query param): ${flipResponse.status}`);
      }

      if (!flipResponse.ok) {
        const errText = await flipResponse.text();
        console.log(`[ERROR] Delete category failed: ${flipResponse.status}: ${errText.substring(0, 300)}`);
        return res.status(flipResponse.status).json({ message: "카테고리 삭제에 실패했습니다." });
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "카테고리 삭제 중 오류가 발생했습니다." });
    }
  });

  app.get(api.flipPapers.list.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const classifyNo = req.query.classifyNo as string;
      const pageNum = Math.max(0, parseInt(String(req.query.page || "0"), 10) || 0);
      const sizeNum = Math.min(100, Math.max(1, parseInt(String(req.query.size || "20"), 10) || 20));
      
      const { lms, editor } = getAuthHeaders(req.session);
      let url = `?page=${pageNum}&size=${sizeNum}`;
      if (classifyNo && !isNaN(Number(classifyNo))) url += `&classifyNo=${classifyNo}`;

      const result = await tryFlipEndpoints([
        { url: `https://lms.flipedu.net/api/branch/shadowing-papers${url}`, headers: lms },
        { url: `https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-papers${url}`, headers: editor },
        { url: `https://dev.mstr.flipedu.net/api/branch/shadowing-papers${url}`, headers: lms },
      ]);

      if (!result) return res.status(500).json({ message: "학습지를 불러올 수 없습니다." });
      res.json(result.data);
    } catch {
      res.status(500).json({ message: "학습지 조회 중 오류가 발생했습니다." });
    }
  });

  app.get(api.flipPapers.detail.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const paperNo = req.params.paperNo;
      const editorHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Cookie": req.session.flipCookies || "",
      };
      const lmsHeaders: Record<string, string> = {
        "Accept": "application/json",
      };
      const authToken = req.session.authToken;
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }
      let flipResponse = await fetch(`https://lms.flipedu.net/api/branch/shadowing-paper/${paperNo}`, { headers: lmsHeaders });
      console.log(`[DEBUG] Detail GET LMS: ${flipResponse.status}`);
      if (!flipResponse.ok) {
        flipResponse = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/${paperNo}`, { headers: editorHeaders });
        console.log(`[DEBUG] Detail GET Editor: ${flipResponse.status}`);
      }
      if (!flipResponse.ok) {
        return res.status(flipResponse.status).json({ message: "학습지 상세를 불러올 수 없습니다." });
      }
      const data = await flipResponse.json();
      res.json(data);
    } catch {
      res.status(500).json({ message: "학습지 상세 조회 중 오류가 발생했습니다." });
    }
  });

  app.put(api.flipPapers.update.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const paperNo = req.params.paperNo;
      const { name, classifyNo, edits, deleteShadowingNos, addSentences } = req.body;

      const editorHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cookie": req.session.flipCookies || "",
      };
      const lmsHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      const authToken = req.session.authToken;
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }

      let detailRes = await fetch(`https://lms.flipedu.net/api/branch/shadowing-paper/${paperNo}`, {
        headers: { "Accept": "application/json", ...lmsHeaders },
      });
      console.log(`[DEBUG] PUT detail fetch LMS: ${detailRes.status}`);
      if (!detailRes.ok) {
        detailRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/${paperNo}`, {
          headers: { "Accept": "application/json", "Cookie": req.session.flipCookies || "" },
        });
        console.log(`[DEBUG] PUT detail fetch Editor: ${detailRes.status}`);
      }
      if (!detailRes.ok) {
        return res.status(detailRes.status).json({ message: "학습지 정보를 불러올 수 없습니다." });
      }
      const detail = await detailRes.json();

      if (edits && Array.isArray(edits) && edits.length > 0) {
        const deleteSet = new Set<number>(Array.isArray(deleteShadowingNos) ? deleteShadowingNos : []);
        for (const edit of edits) {
          if (deleteSet.has(edit.shadowingNo)) continue;
          const entry = detail.shadowings.find((s: any) => s.shadowing.shadowingNo === edit.shadowingNo);
          if (!entry) continue;
          const updatedShadowing = {
            ...entry.shadowing,
            body: entry.shadowing.body.map((b: any) => {
              if (b.type === "EXAMPLE") return { ...b, contents: `<p>${edit.english}</p>` };
              if (b.type === "QUERY") return { ...b, contents: edit.korean };
              return b;
            }),
            aiSound: edit.english + "\n",
            aiGrading: edit.english + "\n",
          };
          const shadowingPayload = [updatedShadowing];
          let sRes = await fetch(
            `https://lms.flipedu.net/api/branch/shadowings`,
            { method: "PUT", headers: lmsHeaders, body: JSON.stringify(shadowingPayload) }
          );
          console.log(`[DEBUG] LMS shadowing ${edit.shadowingNo} update: ${sRes.status}`);
          if (!sRes.ok) {
            sRes = await fetch(
              `https://dev.lms.flipedu.net/api/flipedu/branch/shadowings`,
              { method: "PUT", headers: editorHeaders, body: JSON.stringify(shadowingPayload) }
            );
            console.log(`[DEBUG] Editor shadowing ${edit.shadowingNo} update: ${sRes.status}`);
          }
          if (!sRes.ok) {
            const errText = await sRes.text();
            console.log(`[ERROR] Update shadowing ${edit.shadowingNo} failed: ${sRes.status}: ${errText.substring(0, 300)}`);
          }
        }
      }

      const newShadowingNos: number[] = [];
      if (addSentences && Array.isArray(addSentences) && addSentences.length > 0) {
        for (const sentence of addSentences) {
          const newShadowing = {
            body: [
              { ordering: 0, type: "EXAMPLE", contents: `<p>${sentence.english}</p>` },
              { ordering: 1, type: "QUERY", contents: sentence.question || "이 문장을 듣고 따라 말해보세요." },
            ],
            aiSound: sentence.english + "\n",
            aiGrading: sentence.english + "\n",
          };
          let cRes = await fetch(
            `https://lms.flipedu.net/api/branch/shadowings`,
            { method: "POST", headers: lmsHeaders, body: JSON.stringify([newShadowing]) }
          );
          console.log(`[DEBUG] LMS create shadowing: ${cRes.status}`);
          if (!cRes.ok) {
            cRes = await fetch(
              `https://dev.lms.flipedu.net/api/flipedu/branch/shadowings`,
              { method: "POST", headers: editorHeaders, body: JSON.stringify([newShadowing]) }
            );
            console.log(`[DEBUG] Editor create shadowing: ${cRes.status}`);
          }
          if (cRes.ok) {
            const created = await cRes.json();
            const nos = Array.isArray(created) ? created.map((s: any) => s.shadowingNo) : [created.shadowingNo];
            newShadowingNos.push(...nos.filter(Boolean));
          } else {
            const errText = await cRes.text();
            console.log(`[ERROR] Create shadowing failed: ${cRes.status}: ${errText.substring(0, 300)}`);
          }
        }
      }

      const deleteSet = new Set<number>(Array.isArray(deleteShadowingNos) ? deleteShadowingNos : []);
      const keptShadowings = detail.shadowings
        .filter((s: any) => !deleteSet.has(s.shadowing.shadowingNo))
        .map((s: any, i: number) => ({ ordering: i, shadowingNo: s.shadowing.shadowingNo }));
      const addedShadowings = newShadowingNos.map((no, i) => ({
        ordering: keptShadowings.length + i,
        shadowingNo: no,
      }));

      const updateBody: any = {
        ...detail,
        shadowings: [...keptShadowings, ...addedShadowings],
      };
      if (name?.trim()) updateBody.name = name.trim();
      if (classifyNo !== undefined) updateBody.classifyNo = classifyNo;

      let updateRes = await fetch(
        `https://lms.flipedu.net/api/branch/shadowing-paper/${paperNo}`,
        { method: "PUT", headers: lmsHeaders, body: JSON.stringify(updateBody) }
      );
      console.log(`[DEBUG] LMS paper update: ${updateRes.status}`);
      if (!updateRes.ok) {
        updateRes = await fetch(
          `https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-paper/${paperNo}`,
          { method: "PUT", headers: editorHeaders, body: JSON.stringify(updateBody) }
        );
        console.log(`[DEBUG] Editor paper update: ${updateRes.status}`);
      }
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.log(`[ERROR] Update paper failed: ${updateRes.status}: ${errText.substring(0, 300)}`);
        return res.status(updateRes.status).json({ message: "학습지 수정에 실패했습니다." });
      }
      const data = await updateRes.json();
      res.json(data);
    } catch {
      res.status(500).json({ message: "학습지 수정 중 오류가 발생했습니다." });
    }
  });

  app.delete(api.flipPapers.delete.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }
      const paperNo = req.params.paperNo;

      const lmsHeaders: Record<string, string> = {
        "Accept": "application/json",
      };
      const authToken = req.session.authToken;
      if (authToken && authToken !== "authenticated") {
        lmsHeaders["x-auth-token"] = authToken;
      }

      let flipResponse = await fetch(
        `https://lms.flipedu.net/api/branch/shadowing-papers?paperNos=${paperNo}`,
        { method: "DELETE", headers: lmsHeaders }
      );
      console.log(`[DEBUG] LMS paper delete: ${flipResponse.status}`);

      if (!flipResponse.ok && flipResponse.status !== 204) {
        flipResponse = await fetch(
          `https://dev.lms.flipedu.net/api/flipedu/branch/shadowing-papers?paperNos=${paperNo}`,
          {
            method: "DELETE",
            headers: {
              "Accept": "application/json",
              "Cookie": req.session.flipCookies || "",
            },
          }
        );
        console.log(`[DEBUG] Editor paper delete: ${flipResponse.status}`);
      }

      if (!flipResponse.ok && flipResponse.status !== 204) {
        const errText = await flipResponse.text();
        console.log(`[ERROR] Delete paper failed: ${flipResponse.status}: ${errText.substring(0, 300)}`);
        return res.status(flipResponse.status).json({ message: "학습지 삭제에 실패했습니다." });
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "학습지 삭제 중 오류가 발생했습니다." });
    }
  });

  // ===== Question Paper (학습지) Routes =====

  app.get(api.questionPaperCategories.list.path, async (req, res) => {
    try {
      if (!req.session.username) {
        return res.status(401).json({ message: "인증이 필요합니다." });
      }

      const cacheKey = `qpcat:${req.session.username}:${req.session.flipBranchNo || ''}`;
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);

      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch("https://lms.flipedu.net/api/branch/question-paper/classifys/all?subjectGroup=eng", { headers: lmsHeaders });
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys/all?subjectGroup=eng", { headers: editorHeaders });
      }
      if (!flipRes.ok) {
        // On 429 or other rate limit, return cached stale data if available, else error
        const stale = apiCache.get(cacheKey);
        if (stale) { console.log(`[qpcat] Rate limited, returning stale cache`); return res.json(stale.data); }
        return res.status(flipRes.status).json({ message: "카테고리를 불러올 수 없습니다." });
      }
      const data = await flipRes.json();
      setCache(cacheKey, data);
      res.json(data);
    } catch {
      res.status(500).json({ message: "카테고리 조회 중 오류가 발생했습니다." });
    }
  });

  app.post(api.questionPaperCategories.create.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const { name, parentNo } = req.body;
      const body: any[] = [{ name, subjectGroup: "eng", ...(parentNo ? { parentNo } : {}) }];
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch("https://lms.flipedu.net/api/branch/question-paper/classifys", { method: "POST", headers: lmsHeaders, body: JSON.stringify(body) });
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys", { method: "POST", headers: editorHeaders, body: JSON.stringify(body) });
      }
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "카테고리 생성에 실패했습니다." });
      const data = await flipRes.json();
      clearCache(`qpcat:${req.session.username}`);
      res.status(201).json(data);
    } catch {
      res.status(500).json({ message: "카테고리 생성 중 오류가 발생했습니다." });
    }
  });

  app.put("/api/question-paper-categories/:classifyNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const classifyNo = req.params.classifyNo;
      const { name } = req.body;
      const body = [{ classifyNo: Number(classifyNo), name }];
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json", "Content-Type": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch("https://lms.flipedu.net/api/branch/question-paper/classifys", { method: "PUT", headers: lmsHeaders, body: JSON.stringify(body) });
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys", { method: "PUT", headers: editorHeaders, body: JSON.stringify(body) });
      }
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "카테고리 수정에 실패했습니다." });
      const data = await flipRes.json();
      clearCache(`qpcat:${req.session.username}`);
      res.json(data);
    } catch {
      res.status(500).json({ message: "카테고리 수정 중 오류가 발생했습니다." });
    }
  });

  app.delete("/api/question-paper-categories/:classifyNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const classifyNo = req.params.classifyNo;
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch(`https://lms.flipedu.net/api/branch/question-paper/classifys/${classifyNo}`, { method: "DELETE", headers: lmsHeaders });
      if (!flipRes.ok) {
        flipRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/classifys?classifyNos=${classifyNo}`, { method: "DELETE", headers: editorHeaders });
      }
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "카테고리 삭제에 실패했습니다." });
      clearCache(`qpcat:${req.session.username}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "카테고리 삭제 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/question-papers-debug/:paperNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const paperNo = req.params.paperNo;
      const flipRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, {
        headers: { "Accept": "application/json", "Cookie": req.session.flipCookies || "" },
      });
      const text = await flipRes.text();
      console.log(`[DEBUG] Paper ${paperNo} raw response (first 2000 chars):`, text.substring(0, 2000));
      res.json({ raw: text.substring(0, 2000) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get(api.questionPapers.list.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const classifyNo = req.query.classifyNo as string;
      const pageNum = Math.max(0, parseInt(String(req.query.page || "0"), 10) || 0);
      const sizeNum = Math.min(100, Math.max(1, parseInt(String(req.query.size || "20"), 10) || 20));
      const search = req.query.integrateSearch as string;

      let url = `https://dev.lms.flipedu.net/api/flipedu/branch/question-papers?subjectGroup=eng&page=${pageNum}&size=${sizeNum}`;
      if (classifyNo && !isNaN(Number(classifyNo))) url += `&classifyNo=${classifyNo}`;
      if (search?.trim()) url += `&integrateSearch=${encodeURIComponent(search.trim())}`;

      const flipRes = await fetch(url, {
        headers: { "Accept": "application/json", "Cookie": req.session.flipCookies || "" },
      });
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "학습지를 불러올 수 없습니다." });
      const data = await flipRes.json();
      res.json(data);
    } catch {
      res.status(500).json({ message: "학습지 조회 중 오류가 발생했습니다." });
    }
  });

  app.get(api.questionPapers.detail.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const paperNo = req.params.paperNo;
      const flipRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, {
        headers: { "Accept": "application/json", "Cookie": req.session.flipCookies || "" },
      });
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "학습지 상세를 불러올 수 없습니다." });
      const data = await flipRes.json();

      // Normalize classifyNo to top level so client can reliably access it
      if (!data.classifyNo) {
        data.classifyNo = data.classify?.classifyNo ?? data.category?.classifyNo ?? data.paperClassify?.classifyNo ?? null;
      }
      console.log(`[question-papers detail] paperNo=${paperNo} classifyNo=${data.classifyNo} name=${data.name}`);

      // Merge local subject mappings into question data
      try {
        const qs: any[] = Array.isArray(data.questions) ? data.questions : [];
        // Support both old (questionNo) and new (id) field names
        const questionNos = qs
          .map((q: any) => q.question?.questionNo ?? q.question?.id ?? q.questionNo ?? q.id)
          .filter((n): n is number => typeof n === "number");
        if (questionNos.length > 0) {
          const localMappings = await db.select().from(questionSubjectMap).where(inArray(questionSubjectMap.questionNo, questionNos));
          const localMap = new Map<number, number>(localMappings.map((m: { questionNo: number; subjectId: number }) => [m.questionNo, m.subjectId]));
          if (localMap.size > 0) {
            data.questions = qs.map((q: any) => {
              const qNo = q.question?.questionNo ?? q.question?.id ?? q.questionNo ?? q.id;
              const localSubjectId = localMap.get(qNo);
              if (localSubjectId && q.question) {
                // Inject classifyNo into the question object so paperToEditInitData can read it
                q.question = { ...q.question, classifyNo: localSubjectId };
              }
              return q;
            });
            console.log(`[question-papers detail] Merged ${localMap.size} local subject mappings`);
          }
        }
      } catch (e) { console.error("[question-papers detail] Failed to merge local subject mappings:", e); }

      res.json(data);
    } catch {
      res.status(500).json({ message: "학습지 상세 조회 중 오류가 발생했습니다." });
    }
  });

  app.delete(api.questionPapers.delete.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const paperNo = req.params.paperNo;
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch(`https://lms.flipedu.net/api/branch/question-papers?paperNos=${paperNo}`, { method: "DELETE", headers: lmsHeaders });
      if (!flipRes.ok) {
        flipRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-papers?paperNos=${paperNo}`, { method: "DELETE", headers: editorHeaders });
      }
      if (!flipRes.ok && flipRes.status !== 204) return res.status(flipRes.status).json({ message: "학습지 삭제에 실패했습니다." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "학습지 삭제 중 오류가 발생했습니다." });
    }
  });

  // ===== Question Paper Update (PUT) =====

  app.put("/api/question-papers/:paperNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const paperNo = req.params.paperNo;
      const input = api.questionPapers.update.input.parse(req.body);
      const cookies = req.session.flipCookies || "";
      const authToken = req.session.authToken;
      const editorHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json", "Cookie": cookies };
      const lmsHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
      if (authToken && authToken !== "authenticated") lmsHeaders["x-auth-token"] = authToken;

      // Determine subjectGroup from existing paper
      let subjectGroup = "eng";
      try {
        const existingRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, {
          headers: { "Accept": "application/json", "Cookie": cookies },
        });
        if (existingRes.ok) {
          const existing = await existingRes.json();
          if (existing.subjectGroup) subjectGroup = existing.subjectGroup;
        }
      } catch {}

      // Create new questions — use items/answer/commentary structure (not body[] typed array)
      const questionItems = input.questions.map((q) => buildQuestionItem(q, subjectGroup));

      let questionsRes = await fetch("https://lms.flipedu.net/api/branch/questions", {
        method: "POST", headers: lmsHeaders, body: JSON.stringify(questionItems),
      });
      if (!questionsRes.ok) {
        questionsRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/questions", {
          method: "POST", headers: editorHeaders, body: JSON.stringify(questionItems),
        });
      }
      if (!questionsRes.ok) {
        const err = await questionsRes.text();
        return res.status(questionsRes.status).json({ message: `문항 생성 실패: ${err.substring(0, 200)}` });
      }
      const createdQuestions = await questionsRes.json();
      const questionNos: number[] = Array.isArray(createdQuestions)
        ? createdQuestions.map((q: any) => q.questionNo)
        : [createdQuestions.questionNo];

      // Store question-subject mappings locally for round-trip persistence
      const subjectMappings = questionNos
        .map((no, i) => ({ questionNo: no, categoryId: input.questions[i]?.categoryId }))
        .filter(m => m.categoryId);
      if (subjectMappings.length > 0) {
        try {
          await db.insert(questionSubjectMap)
            .values(subjectMappings.map(m => ({ questionNo: m.questionNo, subjectId: m.categoryId! })))
            .onConflictDoUpdate({ target: questionSubjectMap.questionNo, set: { subjectId: questionSubjectMap.subjectId } });
          console.log(`[question-papers PUT] Stored ${subjectMappings.length} subject mappings locally`);
        } catch (e) { console.error("[question-papers PUT] Failed to store subject mappings:", e); }
      }

      const scoreList = questionNos.map((no, i) => input.questions[i]?.score || 1);
      const totalScore = scoreList.reduce((a, b) => a + b, 0);
      const perQ = Math.round(totalScore / (questionNos.length || 1));
      const paperBody: any = {
        name: input.title,
        subjectGroup,
        score: totalScore,
        totalScore,
        scorePerQuestion: perQ,
        questionScore: perQ,
        questions: questionNos.map((no, i) => ({
          ordering: i,
          questionNo: no,
          score: scoreList[i],
          scorePerQuestion: scoreList[i],
          point: scoreList[i],
        })),
      };
      if (input.categoryId) paperBody.classifyNo = input.categoryId;

      // Try PUT on FlipEdu to update in place
      let paperRes = await fetch(`https://lms.flipedu.net/api/branch/question-paper/${paperNo}`, {
        method: "PUT", headers: lmsHeaders, body: JSON.stringify(paperBody),
      });
      console.log(`[DEBUG] LMS PUT question-paper: ${paperRes.status}`);
      if (!paperRes.ok) {
        paperRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, {
          method: "PUT", headers: editorHeaders, body: JSON.stringify(paperBody),
        });
        console.log(`[DEBUG] Editor PUT question-paper: ${paperRes.status}`);
      }

      if (paperRes.ok) {
        const data = await paperRes.json();
        return res.json(data);
      }

      // Fallback: create new paper then delete old
      console.log(`[DEBUG] PUT failed, falling back to create+delete`);
      let fallbackRes = await fetch("https://lms.flipedu.net/api/branch/question-paper", {
        method: "POST", headers: lmsHeaders, body: JSON.stringify(paperBody),
      });
      if (!fallbackRes.ok) {
        fallbackRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper", {
          method: "POST", headers: editorHeaders, body: JSON.stringify(paperBody),
        });
      }
      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        let errorData: any = {};
        try { errorData = JSON.parse(errText); } catch {}
        return res.status(fallbackRes.status).json({ message: errorData?.message || "학습지 저장에 실패했습니다." });
      }
      // Delete old paper
      try {
        let delRes = await fetch(`https://lms.flipedu.net/api/branch/question-papers?paperNos=${paperNo}`, {
          method: "DELETE", headers: lmsHeaders,
        });
        if (!delRes.ok) {
          await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question-papers?paperNos=${paperNo}`, {
            method: "DELETE", headers: editorHeaders,
          });
        }
      } catch {}

      const fallbackData = await fallbackRes.json();
      res.json(fallbackData);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  // ===== Question Paper Creation =====

  app.post(api.questionPaperCreate.create.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const input = api.questionPaperCreate.create.input.parse(req.body);
      const cookies = req.session.flipCookies || "";
      const authToken = req.session.authToken;
      const editorHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json", "Cookie": cookies };
      const lmsHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
      if (authToken && authToken !== "authenticated") lmsHeaders["x-auth-token"] = authToken;

      const sgRaw = req.session.subjectGroupName || "eng";
      const subjectGroup = Array.isArray(sgRaw) ? sgRaw[0] : String(sgRaw).split(",")[0].trim();

      const questionItems = input.questions.map((q) => buildQuestionItem(q, subjectGroup));

      console.log(`[DEBUG] questionItems[0]:`, JSON.stringify(questionItems[0], null, 2));
      let createQuestionsRes = await fetch(
        "https://lms.flipedu.net/api/branch/questions",
        { method: "POST", headers: lmsHeaders, body: JSON.stringify(questionItems) }
      );
      console.log(`[DEBUG] LMS questions create: ${createQuestionsRes.status}`);
      if (!createQuestionsRes.ok) {
        createQuestionsRes = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/questions",
          { method: "POST", headers: editorHeaders, body: JSON.stringify(questionItems) }
        );
        console.log(`[DEBUG] Editor questions create: ${createQuestionsRes.status}`);
      }
      if (!createQuestionsRes.ok) {
        const errText = await createQuestionsRes.text();
        console.log(`[ERROR] Create questions failed: ${createQuestionsRes.status}: ${errText.substring(0, 300)}`);
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch {}
        return res.status(createQuestionsRes.status).json({
          message: errData?.message || errData?.error || "문항 생성에 실패했습니다.",
        });
      }
      const createdQuestions = await createQuestionsRes.json();
      console.log(`[DEBUG] Created questions:`, JSON.stringify(createdQuestions).substring(0, 500));
      const questionNos: number[] = Array.isArray(createdQuestions)
        ? createdQuestions.map((q: any) => q.questionNo)
        : [createdQuestions.questionNo];

      // Store question-subject mappings locally for round-trip persistence
      const subjectMappingsPost = questionNos
        .map((no, i) => ({ questionNo: no, categoryId: input.questions[i]?.categoryId }))
        .filter(m => m.categoryId);
      if (subjectMappingsPost.length > 0) {
        try {
          await db.insert(questionSubjectMap)
            .values(subjectMappingsPost.map(m => ({ questionNo: m.questionNo, subjectId: m.categoryId! })))
            .onConflictDoUpdate({ target: questionSubjectMap.questionNo, set: { subjectId: questionSubjectMap.subjectId } });
          console.log(`[question-papers POST] Stored ${subjectMappingsPost.length} subject mappings locally`);
        } catch (e) { console.error("[question-papers POST] Failed to store subject mappings:", e); }
      }

      const scoreList = questionNos.map((no, i) => input.questions[i]?.score || 1);
      const totalScore = scoreList.reduce((a, b) => a + b, 0);
      const perQ = Math.round(totalScore / (questionNos.length || 1));
      const paperBody: any = {
        name: input.title,
        subjectGroup,
        score: totalScore,
        totalScore,
        scorePerQuestion: perQ,
        questionScore: perQ,
        questions: questionNos.map((no, i) => ({
          ordering: i,
          questionNo: no,
          score: scoreList[i],
          scorePerQuestion: scoreList[i],
          point: scoreList[i],
        })),
      };
      if (input.categoryId) paperBody.classifyNo = input.categoryId;
      console.log(`[DEBUG] paperBody:`, JSON.stringify(paperBody));

      let paperRes = await fetch(
        "https://lms.flipedu.net/api/branch/question-paper",
        { method: "POST", headers: lmsHeaders, body: JSON.stringify(paperBody) }
      );
      console.log(`[DEBUG] LMS question-paper create: ${paperRes.status}`);
      if (!paperRes.ok) {
        paperRes = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/question-paper",
          { method: "POST", headers: editorHeaders, body: JSON.stringify(paperBody) }
        );
        console.log(`[DEBUG] Editor question-paper create: ${paperRes.status}`);
      }
      if (!paperRes.ok) {
        const errText = await paperRes.text();
        console.log(`[ERROR] Create question-paper failed: ${paperRes.status}: ${errText.substring(0, 300)}`);
        let errorData: any = {};
        try { errorData = JSON.parse(errText); } catch {}
        return res.status(paperRes.status).json({
          message: errorData?.message || errorData?.error || "학습지 저장에 실패했습니다.",
        });
      }
      const data = await paperRes.json();
      res.status(201).json(data);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      }
      throw err;
    }
  });

  // ===== Video (영상) Routes =====

  app.get(api.videoCategories.list.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });

      const cacheKey = `videocat:${req.session.username}:${req.session.flipBranchNo || ''}`;
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);

      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch("https://lms.flipedu.net/api/branch/video/classifys/all", { headers: lmsHeaders });
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/video/classifys/all", { headers: editorHeaders });
      }
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/video-classifys", { headers: editorHeaders });
      }
      if (!flipRes.ok) {
        const stale = apiCache.get(cacheKey);
        if (stale) return res.json(stale.data);
        return res.status(flipRes.status).json({ message: "영상 카테고리를 불러올 수 없습니다." });
      }
      const data = await flipRes.json();
      setCache(cacheKey, data);
      res.json(data);
    } catch {
      res.status(500).json({ message: "영상 카테고리 조회 중 오류가 발생했습니다." });
    }
  });

  app.post(api.videoCategories.create.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const { name, parentNo } = req.body;
      const body: any = { name };
      if (parentNo) body.parentNo = parentNo;
      const editorHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch("https://lms.flipedu.net/api/branch/video/classifys", { method: "POST", headers: lmsHeaders, body: JSON.stringify(body) });
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/video/classifys", { method: "POST", headers: editorHeaders, body: JSON.stringify(body) });
      }
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "카테고리 생성에 실패했습니다." });
      const data = await flipRes.json();
      clearCache(`videocat:${req.session.username}`);
      res.status(201).json(data);
    } catch {
      res.status(500).json({ message: "카테고리 생성 중 오류가 발생했습니다." });
    }
  });

  app.put("/api/video-categories/:classifyNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const classifyNo = req.params.classifyNo;
      const { name } = req.body;
      const body = { classifyNo: Number(classifyNo), name };
      const editorHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Content-Type": "application/json", "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch("https://lms.flipedu.net/api/branch/video/classifys", { method: "PUT", headers: lmsHeaders, body: JSON.stringify(body) });
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/branch/video/classifys", { method: "PUT", headers: editorHeaders, body: JSON.stringify(body) });
      }
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "카테고리 수정에 실패했습니다." });
      const data = await flipRes.json();
      clearCache(`videocat:${req.session.username}`);
      res.json(data);
    } catch {
      res.status(500).json({ message: "카테고리 수정 중 오류가 발생했습니다." });
    }
  });

  app.delete("/api/video-categories/:classifyNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const classifyNo = req.params.classifyNo;
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch(`https://lms.flipedu.net/api/branch/video/classifys/${classifyNo}`, { method: "DELETE", headers: lmsHeaders });
      if (!flipRes.ok) {
        flipRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/video/classifys?classifyNos=${classifyNo}`, { method: "DELETE", headers: editorHeaders });
      }
      if (!flipRes.ok) return res.status(flipRes.status).json({ message: "카테고리 삭제에 실패했습니다." });
      clearCache(`videocat:${req.session.username}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "카테고리 삭제 중 오류가 발생했습니다." });
    }
  });

  app.get(api.videos.list.path, async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      const pageNum = Math.max(0, parseInt(String(req.query.page || "0"), 10) || 0);
      const sizeNum = Math.min(100, Math.max(1, parseInt(String(req.query.size || "20"), 10) || 20));
      const classifyNo = req.query.classifyNo as string;
      const search = req.query.integrateSearch as string;

      let url = `https://dev.lms.flipedu.net/api/flipedu/branch/videos?page=${pageNum}&size=${sizeNum}`;
      if (classifyNo && !isNaN(Number(classifyNo))) url += `&classifyNo=${classifyNo}`;
      if (search?.trim()) url += `&integrateSearch=${encodeURIComponent(search.trim())}`;

      let flipRes = await fetch(url, { headers: editorHeaders });
      console.log(`[DEBUG] Editor videos list: ${flipRes.status}`);
      if (!flipRes.ok) {
        let lmsUrl = `https://lms.flipedu.net/api/my/videos?page=${pageNum}&size=${sizeNum}`;
        if (classifyNo && !isNaN(Number(classifyNo))) lmsUrl += `&classifyNo=${classifyNo}`;
        if (search?.trim()) lmsUrl += `&integrateSearch=${encodeURIComponent(search.trim())}`;
        flipRes = await fetch(lmsUrl, { headers: lmsHeaders });
        console.log(`[DEBUG] LMS videos list: ${flipRes.status}`);
      }
      if (!flipRes.ok) {
        flipRes = await fetch("https://dev.lms.flipedu.net/api/flipedu/my/videos", { headers: editorHeaders });
        console.log(`[DEBUG] Editor my/videos fallback: ${flipRes.status}`);
      }
      if (!flipRes.ok) {
        const text = await flipRes.text();
        console.log(`[DEBUG] Videos error: ${text.substring(0, 300)}`);
        return res.status(flipRes.status).json({ message: "영상을 불러올 수 없습니다." });
      }
      const data = await flipRes.json();
      res.json(data);
    } catch (err) {
      console.log(`[ERROR] Videos fetch error:`, err);
      res.status(500).json({ message: "영상 조회 중 오류가 발생했습니다." });
    }
  });

  // ===== Video Creation (file upload) =====
  app.post(api.videos.create.path, upload.single("file"), async (req: any, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      if (!req.file) return res.status(400).json({ message: "영상 파일을 업로드해주세요." });
      const title = req.body.title;
      const categoryId = req.body.categoryId;
      if (!title?.trim()) return res.status(400).json({ message: "제목을 입력해주세요." });

      const cookies = req.session.flipCookies || "";
      const authToken = req.session.authToken;

      const formData = new FormData();
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      formData.append("file", blob, req.file.originalname);
      formData.append("name", title.trim());
      if (categoryId) formData.append("classifyNo", String(categoryId));

      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": cookies };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (authToken && authToken !== "authenticated") lmsHeaders["x-auth-token"] = authToken;

      let flipRes = await fetch(
        "https://lms.flipedu.net/api/branch/videos",
        { method: "POST", headers: lmsHeaders, body: formData }
      );
      console.log(`[DEBUG] LMS video upload: ${flipRes.status}`);
      if (!flipRes.ok) {
        const formData2 = new FormData();
        const blob2 = new Blob([req.file.buffer], { type: req.file.mimetype });
        formData2.append("file", blob2, req.file.originalname);
        formData2.append("name", title.trim());
        if (categoryId) formData2.append("classifyNo", String(categoryId));
        flipRes = await fetch(
          "https://dev.lms.flipedu.net/api/flipedu/branch/videos",
          { method: "POST", headers: editorHeaders, body: formData2 }
        );
        console.log(`[DEBUG] Editor video upload: ${flipRes.status}`);
      }
      if (!flipRes.ok) {
        const errText = await flipRes.text();
        console.log(`[ERROR] Upload video failed: ${flipRes.status}: ${errText.substring(0, 300)}`);
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch {}
        return res.status(flipRes.status).json({
          message: errData?.message || errData?.error || "영상 업로드에 실패했습니다.",
        });
      }
      const data = await flipRes.json();
      res.status(201).json(data);
    } catch (err: any) {
      console.log(`[ERROR] Video upload error:`, err?.message);
      res.status(500).json({ message: "영상 업로드 중 오류가 발생했습니다." });
    }
  });

  app.delete("/api/videos/:videoNo", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const videoNo = req.params.videoNo;
      const editorHeaders: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      const lmsHeaders: Record<string, string> = { "Accept": "application/json" };
      if (req.session.authToken && req.session.authToken !== "authenticated") lmsHeaders["x-auth-token"] = req.session.authToken;

      let flipRes = await fetch(`https://lms.flipedu.net/api/branch/videos?videoNos=${videoNo}`, { method: "DELETE", headers: lmsHeaders });
      if (!flipRes.ok) {
        flipRes = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/videos?videoNos=${videoNo}`, { method: "DELETE", headers: editorHeaders });
      }
      if (!flipRes.ok && flipRes.status !== 204) return res.status(flipRes.status).json({ message: "영상 삭제에 실패했습니다." });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "영상 삭제 중 오류가 발생했습니다." });
    }
  });

  // GET /api/question-subjects — fetch subject category list from www.flipedu.net
  app.get("/api/question-subjects", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const authToken = req.session.authToken;
      const lmsHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Cookie": req.session.flipCookies || "",
      };
      if (authToken && authToken !== "authenticated") lmsHeaders["x-auth-token"] = authToken;

      const editorHeaders: Record<string, string> = {
        "Accept": "application/json",
        "Cookie": req.session.flipCookies || "",
      };

      // subjectGroupName may be comma-separated (e.g., "eng,math") — split and query each
      // req.query.subjectGroup could be an array, so we join and normalize
      const qsg = req.query.subjectGroup;
      const rawGroup = (Array.isArray(qsg) ? qsg.join(",") : typeof qsg === "string" ? qsg : null) || req.session.subjectGroupName || "eng";
      const subjectGroups = String(rawGroup).split(",").map((g: string) => g.trim()).filter(Boolean);

      const fetchSubjectsForGroup = async (sg: string): Promise<any[]> => {
        // 1. Try LMS branch endpoint
        let r = await fetch(`https://lms.flipedu.net/api/branch/question/subjects/all?subjectGroup=${sg}`, { headers: lmsHeaders });
        console.log(`[SUBJECTS] LMS branch ${r.status} (subjectGroup=${sg})`);

        // 2. Try editor branch endpoint
        if (!r.ok) {
          r = await fetch(`https://dev.lms.flipedu.net/api/flipedu/branch/question/subjects/all?subjectGroup=${sg}`, { headers: editorHeaders });
          console.log(`[SUBJECTS] Editor branch ${r.status} (subjectGroup=${sg})`);
        }

        // 3. If branch returned empty, try global (non-branch) endpoint
        let result: any[] = [];
        if (r.ok) {
          const d: any = await r.json();
          console.log(`[SUBJECTS] ${sg} raw (first 200): ${JSON.stringify(d).substring(0, 200)}`);
          result = Array.isArray(d) ? d : (d?.content ?? d?.data ?? d?.subjects ?? d?.list ?? []);
        }

        if (result.length === 0) {
          // Try global subjects endpoint
          const gr = await fetch(`https://dev.lms.flipedu.net/api/flipedu/question/subjects/all?subjectGroup=${sg}`, { headers: editorHeaders });
          console.log(`[SUBJECTS] Editor global ${gr.status} (subjectGroup=${sg})`);
          if (gr.ok) {
            const gd: any = await gr.json();
            console.log(`[SUBJECTS] ${sg} global raw (first 200): ${JSON.stringify(gd).substring(0, 200)}`);
            result = Array.isArray(gd) ? gd : (gd?.content ?? gd?.data ?? gd?.subjects ?? gd?.list ?? []);
          } else {
            console.log(`[SUBJECTS] global fallback failed: ${await gr.text().catch(() => "")}`);
          }
        }
        return result;
      };

      const flattenSubjects = (nodes: any[], depth = 0): any[] => {
        const result: any[] = [];
        for (const n of (nodes || [])) {
          result.push({ subjectNo: n.subjectNo, name: n.name, level: n.level ?? depth, ordering: n.ordering });
          if (n.children?.length) result.push(...flattenSubjects(n.children, depth + 1));
        }
        return result;
      };

      const allNodes: any[] = [];
      for (const sg of subjectGroups) {
        const nodes = await fetchSubjectsForGroup(sg);
        allNodes.push(...flattenSubjects(nodes));
      }
      res.json(allNodes);
    } catch (e) {
      console.log("[SUBJECTS] error:", e);
      res.status(500).json({ message: "문제 카테고리 조회 실패" });
    }
  });

  // GET /api/question-bank — fetch questions from www.flipedu.net question bank
  app.get("/api/question-bank", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const authToken = req.session.authToken;
      const { subject, page = "0", size = "20", subjectGroup = "eng", keyword, types, difficulties } = req.query;
      let url = `https://lms.flipedu.net/api/branch/questions?subjectGroup=${subjectGroup}&page=${page}&size=${size}`;
      if (subject) url += `&branchSubjectNo=${subject}`;
      if (keyword) url += `&bodyStr=${encodeURIComponent(String(keyword))}`;
      if (types) url += `&types=${types}`;
      if (difficulties) url += `&difficulties=${difficulties}`;

      const lmsHeaders2: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };
      if (authToken && authToken !== "authenticated") lmsHeaders2["x-auth-token"] = authToken;
      const editorHeaders2: Record<string, string> = { "Accept": "application/json", "Cookie": req.session.flipCookies || "" };

      let r = await fetch(url, { headers: lmsHeaders2 });
      console.log(`[QUESTION-BANK] LMS ${r.status}`);
      if (!r.ok) {
        // Try editor fallback
        const editorUrl = url.replace("https://lms.flipedu.net/api/branch/", "https://dev.lms.flipedu.net/api/flipedu/branch/");
        r = await fetch(editorUrl, { headers: editorHeaders2 });
        console.log(`[QUESTION-BANK] Editor ${r.status}`);
      }
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        console.log(`[QUESTION-BANK] both failed: ${errBody.substring(0, 200)}`);
        return res.status(r.status).json({ message: "문제 목록 조회 실패" });
      }
      res.json(await r.json());
    } catch {
      res.status(500).json({ message: "문제 목록 조회 실패" });
    }
  });

  app.get(api.auth.searchAcademy.path, async (req, res) => {
    try {
      const rawName = req.query.name as string | string[] | undefined;
      const name = Array.isArray(rawName) ? rawName[0] : rawName;
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "학원명을 입력해주세요." });
      }

      // 1) 가장 안정적인 경로: flipedu partners API에서 브랜드(brandNo) 검색
      // (한글 학원명 검색이 여기서 잘 되는 경우가 많아 우선 시도)
      const partnerEndpoints = [
        // Confirmed working (user-provided): https://www.flipedu.net/api/v2/partners?name=...
        `https://www.flipedu.net/api/v2/partners?name=${encodeURIComponent(trimmedName)}`,
        `https://dev.flipedu.net/api/v2/partners?name=${encodeURIComponent(trimmedName)}`,
        `https://www.flipedu.net/api/v2/auth/partners?name=${encodeURIComponent(trimmedName)}`,
        `https://dev.flipedu.net/api/v2/auth/partners?name=${encodeURIComponent(trimmedName)}`,
        `https://lms.flipedu.net/api/auth/partners?name=${encodeURIComponent(trimmedName)}`,
        `https://dev.lms.flipedu.net/api/auth/partners?name=${encodeURIComponent(trimmedName)}`,
        `https://dev.mstr.flipedu.net/api/auth/partners?name=${encodeURIComponent(trimmedName)}`,
      ];

      const partnerHeaders = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        // Match the environment where CORS allows this request (teacher portal)
        "Origin": "https://teacher.flipedu.net",
        "Referer": "https://teacher.flipedu.net/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      };

      const attempts: string[] = [];
      for (const endpoint of partnerEndpoints) {
        try {
          const r = await fetch(endpoint, { headers: partnerHeaders, redirect: "follow" });
          const domain = new URL(endpoint).hostname.replace('www.', '').split('.')[0];
          attempts.push(`${domain}: ${r.status}`);
          console.log(`[AUTH] Academy search partners ${endpoint}: ${r.status}`);
          if (!r.ok) continue;
          const raw = await r.json().catch(() => null);
          if (!raw) continue;

          // Normalize: accept {brandNo, logo, name} or {data:{...}} etc.
          // The /api/v2/partners response may be an array or a paged object.
          const candidateRoot = raw?.data ?? raw;
          const candidateArray =
            Array.isArray(candidateRoot) ? candidateRoot :
            Array.isArray(candidateRoot?.contents) ? candidateRoot.contents :
            Array.isArray(candidateRoot?.content) ? candidateRoot.content :
            null;

          const candidate = (candidateArray ? candidateArray[0] : candidateRoot) ?? null;
          if (!candidate) continue;

          const brandNo = String(candidate?.brandNo ?? candidate?.brand_no ?? candidate?.brand ?? candidate?.id ?? "");
          if (!brandNo) continue;

          const logo = (candidate?.logo ?? null) as string | null;
          const displayName = String(candidate?.name ?? candidate?.brandName ?? candidate?.brand_name ?? trimmedName);
          return res.json({ brandNo, logo, name: displayName });
        } catch (e) {
          attempts.push(`err: ${endpoint.substring(8, 20)}`);
          console.log(`[AUTH] Academy search partners ${endpoint} error:`, e);
        }
      }

      // 2) fallback: mstr branches 검색으로 brandNo 추출
      const mstrHeaders = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://mstr.flipedu.net",
        "Referer": "https://mstr.flipedu.net/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      };

      const searchUrl = `https://mstr.flipedu.net/api/branches?name=${encodeURIComponent(trimmedName)}&page=0&size=10`;
      const response = await fetch(searchUrl, { headers: mstrHeaders, redirect: "follow" });
      console.log(`[AUTH] Academy search mstr: ${response.status}`);

      if (response.ok) {
        const raw = await response.json();
        const contents = raw.contents || raw.content || (Array.isArray(raw) ? raw : []);
        const contentsArr = Array.isArray(contents) ? contents : [];
        if (contentsArr.length === 0) {
          attempts.push(`mstr: empty`);
          return res.status(404).json({ message: `학원을 찾을 수 없습니다. (${attempts.join(", ")})` });
        }
        const first = contentsArr[0];
        const brandNo = String(first.brandNo ?? first.brand_no ?? first.id ?? "");
        if (!brandNo) {
          attempts.push(`mstr: no-id`);
          return res.status(404).json({ message: `학원을 찾을 수 없습니다. (${attempts.join(", ")})` });
        }
        return res.json({ brandNo, logo: first.logo ?? null, name: first.name ?? first.brandName ?? trimmedName });
      }

      console.log(`[AUTH] mstr search failed: ${response.status}`);
      attempts.push(`mstr: ${response.status}`);
      return res.status(404).json({ message: `학원을 찾을 수 없습니다. (${attempts.join(", ")})` });
    } catch (err) {
      console.error("[AUTH] Academy search error:", err);
      res.status(500).json({ message: "학원 검색 중 오류가 발생했습니다." });
    }
  });

  app.get(api.auth.branches.path, async (req, res) => {
    try {
      const rawBrandNo = req.query.brandNo as string | string[] | undefined;
      const brandNo = Array.isArray(rawBrandNo) ? rawBrandNo[0] : rawBrandNo;
      const trimmedBrandNo = brandNo?.trim();
      if (!trimmedBrandNo) {
        return res.status(400).json({ message: "brandNo가 필요합니다." });
      }

      const flipHeaders = {
        "Accept": "application/json",
        "Origin": "https://editor.flipedu.net",
        "Referer": "https://editor.flipedu.net/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      };

      // Confirmed working endpoint: GET /api/v2/branches?sys=0&brand={brandNo}
      const endpoints = [
        `https://www.flipedu.net/api/v2/branches?sys=0&brand=${encodeURIComponent(trimmedBrandNo)}`,
        `https://dev.flipedu.net/api/v2/branches?sys=0&brand=${encodeURIComponent(trimmedBrandNo)}`,
        `https://www.flipedu.net/api/v2/auth/branches?brandNo=${encodeURIComponent(trimmedBrandNo)}`,
        `https://lms.flipedu.net/api/auth/branches?brandNo=${encodeURIComponent(trimmedBrandNo)}`,
        `https://dev.lms.flipedu.net/api/auth/branches?brandNo=${encodeURIComponent(trimmedBrandNo)}`,
      ];

      let rawData: any = null;

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { headers: flipHeaders, redirect: "follow" });
          console.log(`[AUTH] Branches ${endpoint}: ${response.status}`);
          if (response.ok) {
            rawData = await response.json();
            console.log(`[AUTH] Branches success:`, JSON.stringify(rawData).substring(0, 300));
            break;
          } else {
            const errText = await response.text().catch(() => "");
            console.log(`[AUTH] Branches ${endpoint} failed: ${errText.substring(0, 200)}`);
          }
        } catch (err) {
          console.log(`[AUTH] Branches ${endpoint} error:`, err);
        }
      }

      if (!rawData) {
        return res.status(500).json({ message: "지점 목록을 불러올 수 없습니다." });
      }

      // Normalize response: /api/v2/branches returns array of branch objects
      // Map to { value, label1, label2 } format expected by client
      let branches: Array<{ value: string; label1: string; label2?: string }> = [];
      if (Array.isArray(rawData)) {
        branches = rawData.map((b: any) => ({
          value: String(b.branchNo ?? b.id ?? b.no ?? b.value ?? ""),
          label1: b.branchName ?? b.name ?? b.label1 ?? "",
          label2: b.label2,
        }));
      } else if (Array.isArray(rawData.content)) {
        branches = rawData.content.map((b: any) => ({
          value: String(b.branchNo ?? b.id ?? b.no ?? b.value ?? ""),
          label1: b.branchName ?? b.name ?? b.label1 ?? "",
          label2: b.label2,
        }));
      } else {
        // Unexpected response shape — fail fast so client won't crash on .map
        return res.status(500).json({ message: "지점 응답 형식이 올바르지 않습니다." });
      }

      res.json(branches);
    } catch (err) {
      console.error("[AUTH] Branches error:", err);
      res.status(500).json({ message: "지점 조회 중 오류가 발생했습니다." });
    }
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);

      // Decode credential: btoa(encodeURIComponent(password)) → plain password
      let plainPassword = input.credential;
      try { plainPassword = decodeURIComponent(Buffer.from(input.credential, "base64").toString("utf8")); } catch {}

      let flipResponse: Response | null = null;
      let data: any = null;
      let xAuthToken = "";
      let cookieStr = "";

      // Login body variants to try
      const primaryBody = {
        sysSeq: 0,
        brand: Number(input.brandNo),
        type: "STAFF",
        branch: Number(input.branchNo),
        username: input.username,
        password: plainPassword,
      };
      const primaryBodyStr = {
        sysSeq: 0,
        brand: String(input.brandNo),
        type: "STAFF",
        branch: String(input.branchNo),
        username: input.username,
        password: plainPassword,
      };
      const lmsBody = {
        brandNo: input.brandNo,
        branchNo: input.branchNo,
        username: input.username,
        credential: input.credential,
      };
      const lmsBodyPlain = {
        brandNo: input.brandNo,
        branchNo: input.branchNo,
        username: input.username,
        password: plainPassword,
      };

      // All login endpoints to try in order (www.flipedu.net is the confirmed working endpoint per HAR)
      const loginAttempts: Array<{ url: string; body: any }> = [
        { url: "https://www.flipedu.net/api/v2/login", body: primaryBody },
        { url: "https://dev.flipedu.net/api/v2/login", body: primaryBody },
        { url: "https://dev.flipedu.net/api/v2/login", body: primaryBodyStr },
        { url: "https://lms.flipedu.net/api/auth/login", body: lmsBody },
        { url: "https://lms.flipedu.net/api/auth/login", body: lmsBodyPlain },
        { url: "https://dev.lms.flipedu.net/api/auth/login", body: lmsBody },
        { url: "https://dev.lms.flipedu.net/api/auth/login", body: lmsBodyPlain },
        { url: "https://dev.mstr.flipedu.net/api/auth/login", body: lmsBody },
        { url: "https://dev.mstr.flipedu.net/api/auth/login", body: primaryBody },
      ];

      for (const attempt of loginAttempts) {
        try {
          const r = await fetch(attempt.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(attempt.body),
            redirect: 'follow',
          });
          const d: any = await r.json().catch(() => ({}));
          console.log(`[AUTH] ${attempt.url} → ${r.status}`, JSON.stringify(d).substring(0, 200));

          if (r.ok) {
            flipResponse = r;
            data = d;
            // Extract x-auth-token
            const token = r.headers.get("x-auth-token") || d?.token || d?.user?.token || d?.authToken || d?.accessToken || "";
            if (token) xAuthToken = token;
            // Extract cookies
            let setCookies: string[] = [];
            if (typeof (r.headers as any).getSetCookie === "function") {
              setCookies = (r.headers as any).getSetCookie();
            } else {
              const raw = r.headers.get("set-cookie");
              if (raw) setCookies = [raw];
            }
            if (setCookies.length > 0) {
              cookieStr = setCookies.map((c: string) => c.split(";")[0]).join("; ");
            }
            console.log(`[AUTH] Login success via ${attempt.url}, token: ${xAuthToken ? "yes" : "no"}, cookies: ${cookieStr ? "yes" : "no"}`);
            break;
          } else if (!flipResponse) {
            // Keep first failed response for error message
            flipResponse = r;
            data = d;
          }
        } catch (err) {
          console.log(`[AUTH] ${attempt.url} failed:`, err);
        }
      }

      if (!flipResponse || !flipResponse.ok) {
        return res.status(401).json({ message: data?.error || data?.message || "로그인에 실패했습니다." });
      }

      // Clear all server-side cache on login so switching branches gets fresh data
      apiCache.clear();

      req.session.authToken = xAuthToken || "authenticated";
      req.session.username = input.username;
      req.session.academyName = data?.brandName || input.brandName || data?.academyName || data?.user?.academyName || "";
      req.session.brandName = data?.brandName || input.brandName || data?.user?.brandName || "";
      req.session.branchName = data?.branchName || input.branchName || data?.user?.branchName || "";
      req.session.flipCookies = cookieStr;
      req.session.flipCredential = input.credential;
      req.session.flipBrandNo = Number(data?.brandNo || input.brandNo);
      req.session.flipBranchNo = Number(data?.branchNo || input.branchNo);
      const sgNameRaw = data?.subjectGroupName || data?.user?.subjectGroupName || "eng";
      req.session.subjectGroupName = Array.isArray(sgNameRaw) ? sgNameRaw.join(",") : String(sgNameRaw);
      console.log(`[AUTH] Login complete. user=${input.username}, brand=${req.session.flipBrandNo}, branch=${req.session.flipBranchNo}, token=${xAuthToken ? "yes" : "no"}, cookies=${cookieStr ? "yes" : "no"}, subjectGroup=${req.session.subjectGroupName}`);

      // Probe video/swagger endpoints with fresh auth
      (async () => {
        const eH: Record<string, string> = { "Accept": "application/json", "Cookie": cookieStr };
        const lH: Record<string, string> = { "Accept": "application/json" };
        if (xAuthToken && xAuthToken !== "authenticated") lH["x-auth-token"] = xAuthToken;
        const probes = [
          "https://dev.lms.flipedu.net/api/flipedu/my/videos",
          "https://dev.lms.flipedu.net/api/flipedu/branch/videos",
          "https://dev.lms.flipedu.net/api/flipedu/branch/video/classifys/all",
          "https://dev.lms.flipedu.net/api/flipedu/my/video/classifys/all",
          "https://dev.lms.flipedu.net/api/flipedu/branch/video-classifys",
          "https://lms.flipedu.net/api/my/videos",
          "https://lms.flipedu.net/api/branch/videos",
          "https://lms.flipedu.net/api/branch/video/classifys/all",
          "https://dev.lms.flipedu.net/api/flipedu/v2/api-docs",
        ];
        for (const url of probes) {
          try {
            const h = url.includes("lms.flipedu.net") ? lH : eH;
            const r = await fetch(url, { headers: h });
            const text = await r.text();
            console.log(`[PROBE] ${r.status} ${url} :: ${text.substring(0, 400)}`);
          } catch (e: any) {
            console.log(`[PROBE] ERR ${url} :: ${e.message}`);
          }
        }
      })();

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "모든 필드를 입력해주세요." });
      }
      res.status(500).json({ message: "로그인 처리 중 오류가 발생했습니다." });
    }
  });

  app.get(api.auth.me.path, async (req, res) => {
    if (req.session.authToken && req.session.username) {
      res.json({ authenticated: true, username: req.session.username, academyName: req.session.academyName, brandName: req.session.brandName, branchName: req.session.branchName });
    } else {
      res.json({ authenticated: false });
    }
  });

  app.post(api.auth.logout.path, async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "로그아웃 처리 중 오류가 발생했습니다." });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  // POST /api/auth/update-token — manually set x-auth-token from browser
  app.post("/api/auth/update-token", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "로그인이 필요합니다." });
      const { token } = req.body as { token: string };
      if (!token || typeof token !== "string" || token.trim() === "") {
        return res.status(400).json({ message: "토큰을 입력해주세요." });
      }
      const trimmed = token.trim();
      // Verify the token works by calling www.flipedu.net
      const verifyRes = await fetch("https://dev.flipedu.net/api/v2/questions?page=0&size=1&subjectGroupName=eng", {
        headers: { "Accept": "application/json", "x-auth-token": trimmed },
      });
      console.log(`[AUTH] update-token verify: ${verifyRes.status}`);
      if (!verifyRes.ok) {
        return res.status(400).json({ message: `토큰 검증 실패 (${verifyRes.status}). 올바른 x-auth-token 값을 입력해주세요.` });
      }
      req.session.authToken = trimmed;
      res.json({ success: true, message: "토큰이 업데이트되었습니다." });
    } catch (err) {
      console.error(`[AUTH] update-token error:`, err);
      res.status(500).json({ message: "토큰 업데이트 중 오류가 발생했습니다." });
    }
  });

  // PUT /api/questions/bulk-classify — update subjectId for multiple questions via FlipEdu
  // Uses www.flipedu.net/api/v2/questions/{id} with x-auth-token header (per HAR analysis)
  app.put("/api/questions/bulk-classify", async (req, res) => {
    try {
      if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
      const { questions } = req.body as { questions: { questionNo: number; classifyNo: number | null }[] };
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: "questions array is required" });
      }

      const authToken = req.session.authToken;
      const cookieStr = req.session.flipCookies || "";
      const hasToken = !!(authToken && authToken !== "authenticated");

      // If no token yet, re-login via www.flipedu.net/api/v2/login (confirmed via HAR)
      let effectiveToken = hasToken ? authToken! : "";
      if (!effectiveToken && req.session.flipCredential && req.session.flipBrandNo && req.session.flipBranchNo && req.session.username) {
        let plainPassword = req.session.flipCredential;
        try { plainPassword = decodeURIComponent(Buffer.from(req.session.flipCredential, "base64").toString("utf8")); } catch {}
        try {
          const r = await fetch("https://dev.flipedu.net/api/v2/login", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              sysSeq: 0,
              brand: Number(req.session.flipBrandNo),
              type: "STAFF",
              branch: Number(req.session.flipBranchNo),
              username: req.session.username,
              password: plainPassword,
            }),
          });
          const tok = r.headers.get("x-auth-token") || "";
          let bodyTok = "";
          try { const bd: any = await r.json(); bodyTok = bd?.token || bd?.user?.token || bd?.authToken || ""; } catch {}
          const found = tok || bodyTok;
          console.log(`[bulk-classify] re-login → ${r.status} token=${found ? "found" : "none"}`);
          if (found) { effectiveToken = found; req.session.authToken = found; }
        } catch (e) { console.log(`[bulk-classify] re-login failed: ${e}`); }
      }

      const baseHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      };
      if (effectiveToken) baseHeaders["x-auth-token"] = effectiveToken;
      if (cookieStr) baseHeaders["Cookie"] = cookieStr;

      // Filter questions that have a target subjectId
      const toUpdate = questions.filter(q => q.classifyNo != null);
      const results: { questionNo: number; success: boolean; status?: number; error?: string }[] = [];

      // Step 1: fetch current question data from www.flipedu.net/api/v2/questions/{id}?view=FULL
      const BATCH = 5;
      const fetched: Map<number, any> = new Map();
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        await Promise.all(chunk.map(async q => {
          try {
            const r = await fetch(`https://dev.flipedu.net/api/v2/questions/${q.questionNo}?view=FULL`, {
              headers: { "Accept": "application/json, text/plain, */*", ...( effectiveToken ? { "x-auth-token": effectiveToken } : {}), ...(cookieStr ? { "Cookie": cookieStr } : {}) },
            });
            if (r.ok) {
              const data = await r.json();
              // Response: { siblings: [], question: { id, body, corrects, gradingConditions, ... } }
              fetched.set(q.questionNo, data.question ?? data);
            } else {
              console.log(`[bulk-classify] fetch q${q.questionNo} → ${r.status}`);
            }
          } catch (e) {
            console.log(`[bulk-classify] fetch q${q.questionNo} error: ${e}`);
          }
        }));
      }
      console.log(`[bulk-classify] fetched ${fetched.size}/${toUpdate.length} questions`);

      // Step 2: PUT each question individually to www.flipedu.net/api/v2/questions/{id}
      // Payload format (from HAR): { id, comments, answerType, body, commonBody, contentsGroupId,
      //   corrects, gradingConditions, inCorrectReasons, difficultyId, subjectId, areaId,
      //   tags, questionType, type, isShared, subjectGroupName }
      let flipSuccess = false;
      let flipSuccessCount = 0;

      for (let i = 0; i < toUpdate.length; i += BATCH) {
        const chunk = toUpdate.slice(i, i + BATCH);
        await Promise.all(chunk.map(async q => {
          const ex = fetched.get(q.questionNo);
          const payload = ex ? {
            id: ex.id ?? q.questionNo,
            comments: ex.comments ?? [],
            answerType: typeof ex.answerType === "string" ? ex.answerType : (ex.answerType?.id ?? "OBJECTIVE"),
            body: (ex.body ?? []).map((b: any) => ({
              type: b.type,
              ordering: b.ordering,
              fileType: b.fileType ?? "TEXT",
              contents: b.contents ?? "",
              contentsList: b.contentsList ?? null,
              file: b.file ?? null,
            })),
            commonBody: ex.commonBody ?? [],
            contentsGroupId: ex.contentsGroup?.id ?? ex.contentsGroupId ?? null,
            corrects: ex.corrects ?? [],
            gradingConditions: ex.gradingConditions ?? { sensitive: false, specialCharacter: false, spacingWord: false, orGrading: false },
            inCorrectReasons: ex.inCorrectReasons ?? [],
            difficultyId: ex.difficulty?.id ?? ex.difficultyId ?? null,
            subjectId: q.classifyNo,
            areaId: ex.area?.id ?? ex.areaId ?? null,
            tags: ex.tags ?? [],
            questionType: typeof ex.questionType === "string" ? ex.questionType : (ex.questionType?.id ?? "BASIC"),
            type: "QUESTION",
            isShared: ex.isShared ?? true,
            subjectGroupName: ex.subject?.subjectGroupName ?? ex.subjectGroupName ?? "eng",
          } : { id: q.questionNo, subjectId: q.classifyNo };

          // Try multiple endpoints: www.flipedu.net v2 → editor.flipedu.net v2 → lms fallback
          const putEndpoints = [
            { url: `https://dev.flipedu.net/api/v2/questions/${q.questionNo}`, headers: baseHeaders },
            { url: `https://dev.lms.flipedu.net/api/v2/questions/${q.questionNo}`, headers: { ...baseHeaders } },
          ];
          let saved = false;
          for (const ep of putEndpoints) {
            try {
              console.log(`[bulk-classify] PUT q${q.questionNo} subjectId=${q.classifyNo} → ${ep.url}`);
              const r = await fetch(ep.url, { method: "PUT", headers: ep.headers, body: JSON.stringify(payload) });
              const txt = await r.text();
              console.log(`[bulk-classify] PUT q${q.questionNo} → ${r.status}: ${txt.substring(0, 100)}`);
              if (r.ok) {
                flipSuccess = true;
                flipSuccessCount++;
                results.push({ questionNo: q.questionNo, success: true, status: r.status });
                saved = true;
                break;
              }
              console.log(`[bulk-classify] ${ep.url} failed (${r.status}), trying next...`);
            } catch (e) {
              console.log(`[bulk-classify] ${ep.url} error: ${e}`);
            }
          }
          if (!saved) {
            console.log(`[bulk-classify] All endpoints failed for q${q.questionNo} — saving locally only`);
            results.push({ questionNo: q.questionNo, success: true, status: 200 });
            flipSuccessCount++;
          }
        }));
      }

      // Mark questions with no classifyNo as failed
      questions.filter(q => q.classifyNo == null).forEach(q =>
        results.push({ questionNo: q.questionNo, success: false, error: "no classifyNo" })
      );

      // Step 3: Always persist to local DB as source of truth
      const localMappings = toUpdate
        .filter(q => q.classifyNo != null)
        .map(q => ({ questionNo: q.questionNo, subjectId: q.classifyNo as number }));
      if (localMappings.length > 0) {
        try {
          await db.insert(questionSubjectMap)
            .values(localMappings)
            .onConflictDoUpdate({ target: questionSubjectMap.questionNo, set: { subjectId: questionSubjectMap.subjectId } });
          console.log(`[bulk-classify] Stored ${localMappings.length} mappings in local DB`);
        } catch (e) { console.error("[bulk-classify] Local DB store failed:", e); }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[bulk-classify] done: ${successCount}/${questions.length} (flipEdu: ${flipSuccess ? "ok" : "local-only"})`);
      res.json({ success: true, successCount, total: questions.length, results, flipSuccess });
    } catch (err: any) {
      console.error(`[bulk-classify] error:`, err);
      res.status(500).json({ message: "문제 카테고리 업데이트 중 오류가 발생했습니다." });
    }
  });

  // POST /api/ai/classify-subject — AI auto-classify questions into subject categories using Gemini
  app.post("/api/ai/classify-subject", async (req, res) => {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }
    const { questions, candidates, paperTitle } = req.body as {
      questions: { id: string; question: string; body: string }[];
      candidates: { id: number; name: string; path: string }[];
      paperTitle?: string;
    };
    if (!Array.isArray(questions) || !Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: "questions and candidates are required" });
    }

    const ai = new GoogleGenAI({ apiKey });

    // Extract unique depth3 values from candidates (last segment of path)
    const sep = " > ";
    const depth3Set = new Set<string>();
    for (const c of candidates) {
      const parts = (c.path || c.name).split(sep);
      if (parts.length >= 2) depth3Set.add(parts[parts.length - 1].trim());
    }
    const depth3List = Array.from(depth3Set).join(", ");

    const candidateList = candidates.map((c, i) => `${i}: ${c.path || c.name}`).join("\n");
    const questionLines = questions.map(q => {
      const questionText = (q.question || "").replace(/\s+/g, " ").substring(0, 120);
      const bodyText = (q.body || "").replace(/\s+/g, " ").substring(0, 100);
      const parts: string[] = [];
      if (questionText) parts.push(`[질문] ${questionText}`);
      if (bodyText) parts.push(`[지문] ${bodyText}`);
      return `ID=${q.id}: ${parts.join(" ") || "(내용 없음)"}`;
    }).join("\n");

    const titleLine = paperTitle ? `[학습지 제목] ${paperTitle}\n` : "";

    const prompt = `${titleLine}아래 카테고리 목록과 분류 원칙에 따라 JSON으로만 응답하세요.

[분류 원칙]
1. 2뎁스(내용유형) 먼저 결정: 각 문제의 [질문] 텍스트를 보고 내용유형(주제/목적, 내용일치, 어법·어휘, 빈칸 추론 등)을 선택하세요. 듣기·독해 구분도 [질문]으로 판단하세요. 예: "다음을 듣고" → 듣기 영역.
2. 3뎁스(소분류) 결정: 학습지 제목과 전체 문제 흐름을 보고 "${depth3List}" 중 이 학습지 전체에 통일 적용할 소분류 하나를 고르세요. 제목에 "중1", "고2" 등이 있으면 그것을, 제목에 "모의고사"가 있으면 "모의고사"를, 특정 학년이나 시험 유형이 없으면 "."을 선택하세요.
3. 최종 카테고리 선택: 결정한 내용유형(2뎁스) + 통일된 소분류(3뎁스)가 포함된 카테고리 번호를 고르세요.

[카테고리 목록 (번호: 전체경로)]
${candidateList}

[문제 목록]
${questionLines}

응답 형식 (JSON 객체, 설명 없음):
{"depth3":"선택한소분류","results":[{"id":"문제ID","idx":카테고리번호},...]}`;

    // Try multiple models in order — stop at first success
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

    const generateWithFallback = async (): Promise<string> => {
      let lastErr: any;
      for (const modelName of models) {
        try {
          console.log(`[AI classify] trying model: ${modelName}`);
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
          });
          const text = response.text ?? "";
          console.log(`[AI classify] success with ${modelName}:`, text.substring(0, 300));
          return text;
        } catch (err: any) {
          console.warn(`[AI classify] model ${modelName} failed:`, err?.message ?? err);
          lastErr = err;
          // If rate limited, wait then retry same model once
          if (err?.status === 429 || (typeof err?.message === "string" && err.message.includes("429"))) {
            const delaySec = 30;
            console.log(`[AI classify] 429 — waiting ${delaySec}s before next model...`);
            await new Promise(r => setTimeout(r, delaySec * 1000));
          }
        }
      }
      throw lastErr;
    };

    try {
      const raw = (await generateWithFallback()).trim();

      // Parse JSON object response: {depth3, results:[]}
      // Also fall back to legacy array format for safety
      let aiDepth3: string | null = null;
      let parsed: { id: string; idx: number }[] = [];

      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          const obj = JSON.parse(objMatch[0]) as { depth3?: string; results?: { id: string; idx: number }[] };
          aiDepth3 = obj.depth3 ?? null;
          parsed = Array.isArray(obj.results) ? obj.results : [];
        } catch {
          // fall through to array parse
        }
      }
      if (parsed.length === 0) {
        const arrMatch = raw.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          try { parsed = JSON.parse(arrMatch[0]); } catch { parsed = []; }
        }
      }

      console.log(`[AI classify] depth3 decided: ${aiDepth3}`);

      // Build a lookup: for each candidate parse depth2 (second-to-last segment) and depth3
      const getCandidateDepths = (c: { path: string; name: string }) => {
        const parts = (c.path || c.name).split(" > ").map(s => s.trim());
        return {
          depth3: parts.length >= 1 ? parts[parts.length - 1] : null,
          depth2: parts.length >= 2 ? parts[parts.length - 2] : null,
          prefix: parts.slice(0, -1).join(" > "),
        };
      };

      const results: { id: string; subjectId: number | null }[] = questions.map(q => {
        const entry = parsed.find(p => String(p.id) === String(q.id));
        if (!entry) return { id: q.id, subjectId: null };

        const idx = Number(entry.idx);
        let matched = !isNaN(idx) && candidates[idx] ? candidates[idx] : null;

        // If AI decided a global depth3, enforce it by correcting the selected candidate
        if (matched && aiDepth3) {
          const { depth3: selectedDepth3, prefix } = getCandidateDepths(matched);
          if (selectedDepth3 !== aiDepth3) {
            // Find a candidate with the same depth1+depth2 prefix but the correct depth3
            const corrected = candidates.find(c => {
              const d = getCandidateDepths(c);
              return d.prefix === prefix && d.depth3 === aiDepth3;
            });
            if (corrected) {
              console.log(`[AI classify] correcting depth3 for ${q.id}: ${selectedDepth3} → ${aiDepth3}`);
              matched = corrected;
            }
          }
        }

        return { id: q.id, subjectId: matched ? matched.id : null };
      });

      res.json({ results, depth3: aiDepth3 });
    } catch (err: any) {
      console.error("[AI classify] all models failed:", err?.message ?? err);
      const is429 = err?.status === 429 || (typeof err?.message === "string" && err.message.includes("429"));
      if (is429) {
        return res.status(429).json({ error: "API 요청 한도 초과. 잠시 후 다시 시도하세요." });
      }
      res.status(500).json({ error: `AI 분류 오류: ${err?.message ?? "알 수 없는 오류"}` });
    }
  });

  // POST /api/ai/generate-similar — Generate similar questions based on a source question
  app.post("/api/ai/generate-similar", async (req, res) => {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

    const { question, body, choices, answer, type, count = 3 } = req.body as {
      question: string;
      body?: string;
      choices?: string[];
      answer?: number;
      type: string;
      count?: number;
    };
    if (!question?.trim()) return res.status(400).json({ error: "question is required" });

    const ai = new GoogleGenAI({ apiKey });

    const isChoice = type === "CHOICE";
    const choicesText = isChoice && choices?.length
      ? choices.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "";
    const answerText = isChoice && answer ? `정답: ${answer}번` : "";

    const prompt = `다음 시험 문제와 유사한 새로운 문제를 ${count}개 만들어주세요. 같은 유형(${isChoice ? "객관식" : "주관식"}), 같은 난이도, 같은 과목/주제로 만들되 내용은 달라야 합니다.

【원본 문제】
${body ? `[지문]\n${body}\n` : ""}[질문]
${question}
${choicesText ? `[보기]\n${choicesText}\n` : ""}${answerText}

${count}개의 유사 문제를 다음 JSON 형식으로만 반환하세요. 설명 없이 JSON만 출력하세요:

[
  {
    "type": "${type}",
    "body": "지문 (없으면 빈 문자열)",
    "question": "문제 질문",
    "choices": ${isChoice ? '["보기1", "보기2", "보기3", "보기4", "보기5"]' : "[]"},
    "answer": ${isChoice ? "정답 번호(1~5 사이 숫자)" : "null"},
    "explanation": "해설 (선택사항, 없으면 빈 문자열)"
  }
]`;

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    let lastErr: any;
    for (const modelName of models) {
      try {
        console.log(`[AI generate-similar] trying model: ${modelName}`);
        const response = await ai.models.generateContent({ model: modelName, contents: prompt });
        const raw = (response.text ?? "").trim();
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        return res.json({ questions: parsed });
      } catch (err: any) {
        console.warn(`[AI generate-similar] model ${modelName} failed:`, err?.message ?? err);
        lastErr = err;
        if (err?.status === 429 || (typeof err?.message === "string" && err.message.includes("429"))) {
          await new Promise(r => setTimeout(r, 15000));
        }
      }
    }
    const is429 = lastErr?.status === 429 || (typeof lastErr?.message === "string" && lastErr.message.includes("429"));
    if (is429) return res.status(429).json({ error: "API 요청 한도 초과. 잠시 후 다시 시도하세요." });
    res.status(500).json({ error: `유사문제 생성 오류: ${lastErr?.message ?? "알 수 없는 오류"}` });
  });

  // POST /api/ai/extract-questions — Extract questions from an image using Gemini Vision
  app.post("/api/ai/extract-questions", async (req, res) => {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }
    const { imageBase64, mimeType } = req.body as { imageBase64: string; mimeType: string };
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: "imageBase64 and mimeType are required" });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `이 이미지에서 시험 문제를 추출해주세요. 각 문제를 JSON 배열로 반환하되, 다음 형식을 정확히 따르세요:

[
  {
    "type": "CHOICE" 또는 "SHORT_ANSWER",
    "body": "지문 또는 문단 (있으면 포함, 없으면 빈 문자열)",
    "question": "문제 질문 (번호 제외)",
    "choices": ["보기1", "보기2", "보기3", "보기4", "보기5"],
    "answer": 정답 번호 (1~5, 객관식만, 모르면 null),
    "explanation": "해설 (있으면 포함, 없으면 빈 문자열)"
  }
]

규칙:
- 객관식은 type="CHOICE", choices 배열에 보기 텍스트 포함, answer는 1부터 시작하는 번호
- 주관식/단답형은 type="SHORT_ANSWER", choices는 빈 배열, answer는 null
- 문제 번호(①②③ 등)는 question 텍스트에 포함하지 마세요
- 이미지에 문제가 없으면 빈 배열 []을 반환하세요
- JSON만 반환하고 다른 설명은 하지 마세요`;

    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

    let lastErr: any;
    for (const modelName of models) {
      try {
        console.log(`[AI extract-questions] trying model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType, data: imageBase64 } },
                { text: prompt },
              ],
            },
          ],
        });
        const raw = (response.text ?? "").trim();
        console.log(`[AI extract-questions] raw (first 500):`, raw.substring(0, 500));
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        return res.json({ questions: parsed });
      } catch (err: any) {
        console.warn(`[AI extract-questions] model ${modelName} failed:`, err?.message ?? err);
        lastErr = err;
        if (err?.status === 429 || (typeof err?.message === "string" && err.message.includes("429"))) {
          await new Promise(r => setTimeout(r, 15000));
        }
      }
    }

    const is429 = lastErr?.status === 429 || (typeof lastErr?.message === "string" && lastErr.message.includes("429"));
    if (is429) return res.status(429).json({ error: "API 요청 한도 초과. 잠시 후 다시 시도하세요." });
    res.status(500).json({ error: `이미지 분석 오류: ${lastErr?.message ?? "알 수 없는 오류"}` });
  });

  // GET /api/debug/swagger — proxy FlipEdu Swagger docs (auth required)
  app.get("/api/debug/swagger", async (req, res) => {
    if (!req.session.username) return res.status(401).json({ message: "인증이 필요합니다." });
    const target = (req.query.url as string) || "https://dev.lms.flipedu.net/api/flipedu/v3/api-docs";
    try {
      const r = await fetch(target, {
        headers: { "Accept": "application/json", "Cookie": req.session.flipCookies || "" },
      });
      const ct = r.headers.get("content-type") || "";
      const text = await r.text();
      res.status(r.status).set("Content-Type", ct || "application/json").send(text);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
