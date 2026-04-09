import { z } from "zod";
import {
  createAuthHeaders,
  createEditorHeaders,
  getAuthFromRequest,
  getAuthTokenFromRequest,
  getFetch,
  getPrimarySubjectGroup,
  getUpstreamCookiesFromRequest,
  parseRequestBody,
} from "../../lib/flip-auth";

const updateQuestionPaperSchema = z.object({
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
});

function buildQuestionItem(q: any, subjectGroup: string) {
  const item: any = {
    questionType: "BASIC",
    subjectGroup,
    score: q.score || 1,
  };

  const bodyParts: any[] = [
    { ordering: 0, type: "QUERY", fileType: "TEXT", contents: q.question || "" },
  ];
  if (q.body?.trim()) {
    bodyParts.push({ ordering: 1, type: "EXAMPLE", fileType: "TEXT", contents: `<p>${q.body.trim()}</p>` });
  }
  item.body = bodyParts;

  if (q.questionType === "CHOICE" && q.choices?.length) {
    item.answerType = "OBJECTIVE";
    item.items = q.choices.map((c: string, i: number) => ({ ordering: i, contents: c }));
    const answerStr = String(q.correctAnswer ?? 1);
    item.answer = answerStr;
    item.correctForms = [{ corrects: [answerStr], inCorrects: null }];
  } else if (q.questionType === "SHORT_ANSWER") {
    item.answerType = "SUBJECTIVE";
    const answerStr = q.answerText || "";
    item.answer = answerStr;
    item.correctForms = [{ corrects: [answerStr], inCorrects: null }];
    const gradingConditions: any = {};
    if (q.gradingCaseSensitive) gradingConditions.sensitive = true;
    if (q.gradingSpecialChars) gradingConditions.specialCharacter = true;
    if (q.gradingSpacing) gradingConditions.spacingWord = true;
    if (q.gradingOr) gradingConditions.orGrading = true;
    if (Object.keys(gradingConditions).length > 0) item.gradingConditions = gradingConditions;
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

async function parseUpstreamBody(response: Response): Promise<any> {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function pickErrorMessage(data: any, fallback: string): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    return data.message || data.error || fallback;
  }
  return fallback;
}

function extractQuestionNos(data: any): number[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.content)
      ? data.content
      : data
        ? [data]
        : [];

  return list
    .map((item: any) => Number(item?.questionNo ?? item?.id ?? item?.no))
    .filter((value: number) => Number.isFinite(value) && value > 0);
}

export default async function handler(req: any, res: any) {
  try {
    const auth = getAuthFromRequest(req);
    const authToken = getAuthTokenFromRequest(req, auth);

    if (!auth?.authenticated || !auth?.username || !authToken) {
      return res.status(401).json({ message: "?몄쬆???꾩슂?⑸땲??" });
    }

    const paperNo = String(req.query?.paperNo || "").trim();
    if (!paperNo) {
      return res.status(400).json({ message: "paperNo媛 ?꾩슂?⑸땲??" });
    }

    const fetchFn = await getFetch();
    const upstreamCookies = getUpstreamCookiesFromRequest(req);
    const lmsHeaders = createAuthHeaders(authToken);
    const editorHeaders = createEditorHeaders(authToken, upstreamCookies);

    if (req.method === "GET") {
      let r = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, { headers: editorHeaders });
      if (!r.ok) {
        r = await fetchFn(`https://lms.flipedu.net/api/branch/question-paper/${paperNo}`, { headers: lmsHeaders });
      }
      if (!r.ok) {
        return res.status(r.status).json({ message: "?숈뒿吏 ?곸꽭瑜?遺덈윭?????놁뒿?덈떎." });
      }

      const data = await parseUpstreamBody(r);
      if (data && !data.classifyNo) {
        data.classifyNo = data.classify?.classifyNo ?? data.category?.classifyNo ?? data.paperClassify?.classifyNo ?? null;
      }
      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      const input = updateQuestionPaperSchema.parse(parseRequestBody(req.body));

      let subjectGroup = getPrimarySubjectGroup(auth);
      try {
        const existing = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, { headers: editorHeaders });
        if (existing.ok) {
          const data = await parseUpstreamBody(existing);
          if (data?.subjectGroup) subjectGroup = String(data.subjectGroup);
        }
      } catch {
        // keep fallback subject group
      }

      const questionItems = input.questions.map((q) => buildQuestionItem(q, subjectGroup));

      let questionsRes = await fetchFn("https://lms.flipedu.net/api/branch/questions", {
        method: "POST",
        headers: lmsHeaders,
        body: JSON.stringify(questionItems),
      });
      if (!questionsRes.ok) {
        questionsRes = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/questions", {
          method: "POST",
          headers: editorHeaders,
          body: JSON.stringify(questionItems),
        });
      }
      if (!questionsRes.ok) {
        const errorBody = await parseUpstreamBody(questionsRes);
        return res.status(questionsRes.status).json({
          message: pickErrorMessage(errorBody, "臾명빆 ?앹꽦???ㅽ뙣?덉뒿?덈떎."),
        });
      }

      const createdQuestions = await parseUpstreamBody(questionsRes);
      const questionNos = extractQuestionNos(createdQuestions);
      if (questionNos.length === 0) {
        return res.status(502).json({ message: "臾명빆 ?앹꽦 ?묐떟??questionNo媛 ?놁뒿?덈떎." });
      }

      const scoreList = questionNos.map((_, i) => input.questions[i]?.score || 1);
      const totalScore = scoreList.reduce((a, b) => a + b, 0);
      const perQuestion = Math.round(totalScore / (questionNos.length || 1));

      const paperBody: any = {
        name: input.title,
        subjectGroup,
        score: totalScore,
        totalScore,
        scorePerQuestion: perQuestion,
        questionScore: perQuestion,
        questions: questionNos.map((questionNo, i) => ({
          ordering: i,
          questionNo,
          score: scoreList[i],
          scorePerQuestion: scoreList[i],
          point: scoreList[i],
        })),
      };
      if (input.categoryId) paperBody.classifyNo = input.categoryId;

      let paperRes = await fetchFn(`https://lms.flipedu.net/api/branch/question-paper/${paperNo}`, {
        method: "PUT",
        headers: lmsHeaders,
        body: JSON.stringify(paperBody),
      });
      if (!paperRes.ok) {
        paperRes = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, {
          method: "PUT",
          headers: editorHeaders,
          body: JSON.stringify(paperBody),
        });
      }

      if (paperRes.ok) {
        const data = await parseUpstreamBody(paperRes);
        return res.status(200).json(data);
      }

      let fallbackRes = await fetchFn("https://lms.flipedu.net/api/branch/question-paper", {
        method: "POST",
        headers: lmsHeaders,
        body: JSON.stringify(paperBody),
      });
      if (!fallbackRes.ok) {
        fallbackRes = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper", {
          method: "POST",
          headers: editorHeaders,
          body: JSON.stringify(paperBody),
        });
      }
      if (!fallbackRes.ok) {
        const errorBody = await parseUpstreamBody(fallbackRes);
        return res.status(fallbackRes.status).json({
          message: pickErrorMessage(errorBody, "?숈뒿吏 ??μ뿉 ?ㅽ뙣?덉뒿?덈떎."),
        });
      }

      await fetchFn(`https://lms.flipedu.net/api/branch/question-papers?paperNos=${paperNo}`, {
        method: "DELETE",
        headers: lmsHeaders,
      }).catch(() => undefined);

      const data = await parseUpstreamBody(fallbackRes);
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      let r = await fetchFn(`https://lms.flipedu.net/api/branch/question-papers?paperNos=${paperNo}`, {
        method: "DELETE",
        headers: lmsHeaders,
      });
      if (!r.ok && r.status !== 204) {
        r = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-papers?paperNos=${paperNo}`, {
          method: "DELETE",
          headers: editorHeaders,
        });
      }
      if (!r.ok && r.status !== 204) {
        return res.status(r.status).json({ message: "?숈뒿吏 ??젣???ㅽ뙣?덉뒿?덈떎." });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ message: "Method Not Allowed" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: error.errors[0]?.message || "?낅젰媛믪씠 ?щ컮瑜댁? ?딆뒿?덈떎.",
        field: error.errors[0]?.path?.join("."),
      });
    }
    return res.status(500).json({ message: "?숈뒿吏 泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎." });
  }
}
