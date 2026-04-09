import { z } from "zod";
import { api } from "../../../shared/routes";
import {
  createAuthHeaders,
  getAuthFromRequest,
  getAuthTokenFromRequest,
  getFetch,
  getPrimarySubjectGroup,
  parseRequestBody,
} from "../_lib/flip-auth";

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

export default async function handler(req: any, res: any) {
  try {
    const auth = getAuthFromRequest(req);
    const authToken = getAuthTokenFromRequest(req, auth);

    if (!auth?.authenticated || !auth?.username || !authToken) {
      return res.status(401).json({ message: "인증이 필요합니다." });
    }

    const paperNo = String(req.query?.paperNo || "").trim();
    if (!paperNo) {
      return res.status(400).json({ message: "paperNo가 필요합니다." });
    }

    const fetchFn = await getFetch();
    const headers = createAuthHeaders(authToken);

    if (req.method === "GET") {
      let r = await fetchFn(`https://lms.flipedu.net/api/branch/question-paper/${paperNo}`, { headers });
      if (!r.ok) {
        r = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, { headers });
      }
      if (!r.ok) {
        return res.status(r.status).json({ message: "학습지 상세를 불러올 수 없습니다." });
      }
      const data = await r.json();
      if (!data.classifyNo) {
        data.classifyNo = data.classify?.classifyNo ?? data.category?.classifyNo ?? data.paperClassify?.classifyNo ?? null;
      }
      return res.status(200).json(data);
    }

    if (req.method === "PUT") {
      const input = api.questionPapers.update.input.parse(parseRequestBody(req.body));

      let subjectGroup = getPrimarySubjectGroup(auth);
      try {
        const existing = await fetchFn(`https://lms.flipedu.net/api/branch/question-paper/${paperNo}`, { headers });
        if (existing.ok) {
          const data = await existing.json();
          if (data?.subjectGroup) subjectGroup = String(data.subjectGroup);
        }
      } catch {
        // keep fallback subject group
      }

      const questionItems = input.questions.map((q) => buildQuestionItem(q, subjectGroup));

      let questionsRes = await fetchFn("https://lms.flipedu.net/api/branch/questions", {
        method: "POST",
        headers,
        body: JSON.stringify(questionItems),
      });
      if (!questionsRes.ok) {
        questionsRes = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/questions", {
          method: "POST",
          headers,
          body: JSON.stringify(questionItems),
        });
      }
      if (!questionsRes.ok) {
        const errText = await questionsRes.text().catch(() => "");
        return res.status(questionsRes.status).json({
          message: errText || "문항 생성에 실패했습니다.",
        });
      }

      const createdQuestions = await questionsRes.json();
      const questionNos: number[] = Array.isArray(createdQuestions)
        ? createdQuestions.map((q: any) => q.questionNo)
        : [createdQuestions.questionNo];
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
        headers,
        body: JSON.stringify(paperBody),
      });
      if (!paperRes.ok) {
        paperRes = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-paper/${paperNo}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(paperBody),
        });
      }

      if (paperRes.ok) {
        const data = await paperRes.json();
        return res.status(200).json(data);
      }

      let fallbackRes = await fetchFn("https://lms.flipedu.net/api/branch/question-paper", {
        method: "POST",
        headers,
        body: JSON.stringify(paperBody),
      });
      if (!fallbackRes.ok) {
        fallbackRes = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper", {
          method: "POST",
          headers,
          body: JSON.stringify(paperBody),
        });
      }
      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text().catch(() => "");
        return res.status(fallbackRes.status).json({
          message: errText || "학습지 저장에 실패했습니다.",
        });
      }

      await fetchFn(`https://lms.flipedu.net/api/branch/question-papers?paperNos=${paperNo}`, {
        method: "DELETE",
        headers,
      }).catch(() => undefined);

      const data = await fallbackRes.json();
      return res.status(200).json(data);
    }

    if (req.method === "DELETE") {
      let r = await fetchFn(`https://lms.flipedu.net/api/branch/question-papers?paperNos=${paperNo}`, {
        method: "DELETE",
        headers,
      });
      if (!r.ok && r.status !== 204) {
        r = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-papers?paperNos=${paperNo}`, {
          method: "DELETE",
          headers,
        });
      }
      if (!r.ok && r.status !== 204) {
        return res.status(r.status).json({ message: "학습지 삭제에 실패했습니다." });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ message: "Method Not Allowed" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: error.errors[0]?.message || "입력값이 올바르지 않습니다.",
        field: error.errors[0]?.path?.join("."),
      });
    }
    return res.status(500).json({ message: "학습지 처리 중 오류가 발생했습니다." });
  }
}
