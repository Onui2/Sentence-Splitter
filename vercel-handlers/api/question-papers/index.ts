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

    const fetchFn = await getFetch();
    const headers = createAuthHeaders(authToken);
    const subjectGroup = getPrimarySubjectGroup(auth);

    if (req.method === "GET") {
      const pageNum = Math.max(0, parseInt(String(req.query?.page || "0"), 10) || 0);
      const sizeNum = Math.min(100, Math.max(1, parseInt(String(req.query?.size || "20"), 10) || 20));
      const classifyNo = String(req.query?.classifyNo || "").trim();
      const integrateSearch = String(req.query?.integrateSearch || "").trim();

      const search = new URLSearchParams({
        subjectGroup,
        page: String(pageNum),
        size: String(sizeNum),
      });
      if (classifyNo) search.set("classifyNo", classifyNo);
      if (integrateSearch) search.set("integrateSearch", integrateSearch);

      let r = await fetchFn(`https://lms.flipedu.net/api/branch/question-papers?${search.toString()}`, { headers });
      if (!r.ok) {
        r = await fetchFn(`https://dev.lms.flipedu.net/api/flipedu/branch/question-papers?${search.toString()}`, { headers });
      }
      if (!r.ok) {
        return res.status(r.status).json({ message: "학습지를 불러올 수 없습니다." });
      }

      const data = await r.json();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const input = api.questionPaperCreate.create.input.parse(parseRequestBody(req.body));
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

      let paperRes = await fetchFn("https://lms.flipedu.net/api/branch/question-paper", {
        method: "POST",
        headers,
        body: JSON.stringify(paperBody),
      });
      if (!paperRes.ok) {
        paperRes = await fetchFn("https://dev.lms.flipedu.net/api/flipedu/branch/question-paper", {
          method: "POST",
          headers,
          body: JSON.stringify(paperBody),
        });
      }
      if (!paperRes.ok) {
        const errText = await paperRes.text().catch(() => "");
        return res.status(paperRes.status).json({
          message: errText || "학습지 저장에 실패했습니다.",
        });
      }

      const data = await paperRes.json();
      return res.status(201).json(data);
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
