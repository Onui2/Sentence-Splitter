import { useLocation } from "wouter";
import { Search, ChevronDown, ChevronRight, X, Pencil, Trash2, Plus, Check, Menu, Sparkles, Save, Tag, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import WorksheetCreateModal, { WorksheetEditInitData, QuestionItem } from "./WorksheetCreate";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

type AiWsSegment = { uid: string; parentIds: number[]; from: number; to: number };

export default function WorksheetHome() {
  const [location, setLocation] = useLocation();
  const [categoryId, setCategoryId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("categoryId");
  });
  const isMobile = useIsMobile();
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPaperNo, setEditPaperNo] = useState<number | null>(null);
  const [editInitData, setEditInitData] = useState<WorksheetEditInitData | null>(null);

  const { data: flipCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: [api.questionPaperCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.questionPaperCategories.list.path);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ paperNo: number; name: string } | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const formatDate = (val: string | undefined) => {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  };

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: [api.questionPapers.list.path, categoryId, page, debouncedSearch],
    queryFn: async () => {
      let url = `${api.questionPapers.list.path}?page=${page}&size=20`;
      if (categoryId) url += `&classifyNo=${categoryId}`;
      if (debouncedSearch.trim()) url += `&integrateSearch=${encodeURIComponent(debouncedSearch.trim())}`;
      const res = await fetch(url);
      if (!res.ok) return { contents: [], totalElementsCnt: 0, totalPages: 0, page: 0, size: 20, elementsCntOfPage: 0 };
      return res.json();
    }
  });

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Detail panel state
  const [selectedPaperNo, setSelectedPaperNo] = useState<number | null>(null);
  const [editedSubjects, setEditedSubjects] = useState<Record<number, number | null>>({});
  const [subjectExpanded, setSubjectExpanded] = useState<Set<number>>(new Set());
  const [openPickerFor, setOpenPickerFor] = useState<number | null>(null);
  const [savingSubjects, setSavingSubjects] = useState(false);
  // AI modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiSegments, setAiSegments] = useState<AiWsSegment[]>([{ uid: '1', parentIds: [], from: 1, to: 1 }]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ current: number; total: number } | null>(null);
  const [simulatedPct, setSimulatedPct] = useState(0);
  // AI compare modal state
  const [aiCompareOpen, setAiCompareOpen] = useState(false);
  const [aiCompareResults, setAiCompareResults] = useState<{ qNo: number; currentSid: number | null; aiSid: number | null; chosen: "current" | "ai" }[]>([]);
  // ESC close confirmation
  const [aiCloseConfirm, setAiCloseConfirm] = useState<"ai" | "compare" | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (aiCompareOpen) { e.preventDefault(); setAiCloseConfirm("compare"); }
      else if (aiModalOpen) { e.preventDefault(); setAiCloseConfirm("ai"); }
      else if (openPickerFor !== null) { setOpenPickerFor(null); }
      else if (selectedPaperNo) { setSelectedPaperNo(null); setEditedSubjects({}); setOpenPickerFor(null); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [aiModalOpen, aiCompareOpen, selectedPaperNo, openPickerFor]);

  useEffect(() => {
    if (openPickerFor === null) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest("[data-picker-panel]")) {
        setOpenPickerFor(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openPickerFor]);

  // Simulated progress animation while AI is loading
  useEffect(() => {
    if (!aiLoading) { setSimulatedPct(0); return; }
    setSimulatedPct(0);
    const total = aiProgress?.total ?? 1;
    // Estimate ~3s per question, max 90% until done
    const estimatedMs = Math.max(4000, total * 2500);
    const intervalMs = 150;
    const step = (90 / (estimatedMs / intervalMs));
    const id = setInterval(() => {
      setSimulatedPct(prev => prev >= 90 ? 90 : +(prev + step).toFixed(1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [aiLoading]);

  useEffect(() => {
    if (categoryId && flipCategories?.length) {
      const findAncestors = (nodes: any[], target: string, path: string[]): string[] | null => {
        for (const node of nodes) {
          const cur = [...path, String(node.classifyNo)];
          if (String(node.classifyNo) === target) return cur;
          if (node.children?.length) {
            const found = findAncestors(node.children, target, cur);
            if (found) return found;
          }
        }
        return null;
      };
      const ancestors = findAncestors(flipCategories, categoryId, []);
      if (ancestors?.length) {
        setExpandedNodes(prev => {
          const next = new Set(prev);
          ancestors.forEach(a => next.add(a));
          return next;
        });
      }
    }
  }, [flipCategories]);

  const [categorySearch, setCategorySearch] = useState("");
  const { toast } = useToast();
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ classifyNo: string; name: string } | null>(null);

  useEffect(() => {
    if (addingRoot || addingUnder) addInputRef.current?.focus();
  }, [addingRoot, addingUnder]);

  useEffect(() => {
    if (editingCat) editInputRef.current?.focus();
  }, [editingCat]);

  useEffect(() => {
    if (isMobile && mobileCatOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [isMobile, mobileCatOpen]);

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCategoryChange = (id: string) => {
    setCategoryId(prev => prev === id ? null : id);
    if (isMobile) setMobileCatOpen(false);
  };

  const createCategoryMutation = useMutation({
    mutationFn: async ({ name, parentNo }: { name: string; parentNo?: string }) => {
      const res = await apiRequest("POST", api.questionPaperCategories.create.path, {
        name,
        parentNo: parentNo ? Number(parentNo) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.questionPaperCategories.list.path] });
      setNewCatName("");
      setAddingUnder(null);
      setAddingRoot(false);
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ classifyNo, name }: { classifyNo: string; name: string }) => {
      const res = await apiRequest("PUT", buildUrl(api.questionPaperCategories.update.path, { classifyNo }), { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.questionPaperCategories.list.path] });
      setEditingCat(null);
      setEditName("");
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (classifyNo: string) => {
      const res = await apiRequest("DELETE", buildUrl(api.questionPaperCategories.delete.path, { classifyNo }));
      return res;
    },
    onSuccess: (_data, classifyNo) => {
      queryClient.invalidateQueries({ queryKey: [api.questionPaperCategories.list.path] });
      setDeleteCatTarget(null);
      if (categoryId === String(classifyNo)) setCategoryId(null);
    },
    onError: (err: Error) => { toast({ title: "오류", description: err.message, variant: "destructive" }); setDeleteCatTarget(null); },
  });

  const deletePaperMutation = useMutation({
    mutationFn: async (paperNo: number) => {
      const res = await apiRequest("DELETE", buildUrl(api.questionPapers.delete.path, { paperNo }));
      return res;
    },
    onSuccess: (_data, paperNo) => {
      queryClient.invalidateQueries({ queryKey: [api.questionPapers.list.path] });
      setSelectedIds(prev => prev.filter(id => id !== paperNo));
      if (selectedPaperNo === paperNo) { setSelectedPaperNo(null); setEditedSubjects({}); }
      setDeleteTarget(null);
      toast({ title: "삭제 완료", description: "학습지가 삭제되었습니다." });
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const handleBatchDelete = async () => {
    setBatchDeleteOpen(false);
    let successCount = 0;
    for (const id of selectedIds) {
      try {
        await apiRequest("DELETE", buildUrl(api.questionPapers.delete.path, { paperNo: id }));
        successCount++;
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: [api.questionPapers.list.path] });
    setSelectedIds([]);
    if (selectedPaperNo && selectedIds.includes(selectedPaperNo)) { setSelectedPaperNo(null); setEditedSubjects({}); }
    toast({ title: `${successCount}개 삭제 완료`, description: selectedIds.length > successCount ? `${selectedIds.length - successCount}개는 실패했습니다.` : undefined });
  };

  // Paper detail query
  const { data: paperDetail, isLoading: paperDetailLoading } = useQuery({
    queryKey: [api.questionPapers.list.path, selectedPaperNo],
    queryFn: async () => {
      if (!selectedPaperNo) return null;
      const res = await fetch(buildUrl(api.questionPapers.detail.path, { paperNo: selectedPaperNo }));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedPaperNo,
  });

  // Question subjects (문제 카테고리 목록)
  const { data: questionSubjects } = useQuery({
    queryKey: [api.questionSubjects.list.path],
    queryFn: async () => {
      const res = await fetch(api.questionSubjects.list.path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedPaperNo,
  });

  const buildSubjectTree = (flat: any[]): any[] => {
    const stack: any[] = [];
    const roots: any[] = [];
    for (const item of flat) {
      const node = { ...item, _children: [] };
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
      if (stack.length === 0) roots.push(node);
      else stack[stack.length - 1]._children.push(node);
      stack.push(node);
    }
    return roots;
  };

  const getNodeId = (n: any) => n.classifyNo != null ? Number(n.classifyNo) : (n.subjectNo ?? n.no ?? n.id ?? n.subjectId);
  const getNodeName = (n: any) => n.name ?? n.subjectName ?? n.title ?? String(getNodeId(n));

  const getSubjectName = (subjectId: number): string => {
    const s = (questionSubjects || []).find((s: any) => getNodeId(s) === subjectId);
    return s ? getNodeName(s) : String(subjectId);
  };

  const getNodeChildren = (node: any): any[] => node.children ?? node._children ?? [];

  const buildPathMap = (nodes: any[], prefix = ""): Map<number, string> => {
    const map = new Map<number, string>();
    for (const node of nodes) {
      const id = getNodeId(node);
      const name = getNodeName(node);
      const full = prefix ? `${prefix} > ${name}` : name;
      map.set(id, full);
      const kids = getNodeChildren(node);
      if (kids.length) {
        buildPathMap(kids, full).forEach((v, k) => map.set(k, v));
      }
    }
    return map;
  };

  const getAllDescendants = (node: any, parentPath: string): { id: number; name: string; path: string }[] => {
    const nodeId = getNodeId(node);
    const nodeName = getNodeName(node);
    const path = parentPath ? `${parentPath} > ${nodeName}` : nodeName;
    const kids = getNodeChildren(node);
    if (kids.length === 0) return [{ id: nodeId, name: nodeName, path }];
    const results: { id: number; name: string; path: string }[] = [];
    for (const child of kids) results.push(...getAllDescendants(child, path));
    return results;
  };

  const detailQuestions: any[] = (() => {
    if (!paperDetail) return [];
    if (Array.isArray(paperDetail.questions)) return paperDetail.questions;
    if (Array.isArray(paperDetail.shadowings)) return paperDetail.shadowings;
    return [];
  })();

  // Normalize: API returns {ordering, question: {questionNo, body: [...]}}
  // but some responses may be flat {questionNo, body: [...]}
  const normalizeQ = (q: any): any => {
    // FlipEdu wraps questions in {siblings, question: {...}} — unwrap by id OR questionNo
    if (q.question && typeof q.question === "object" && (q.question.questionNo || q.question.id)) {
      return q.question;
    }
    return q;
  };

  const getQuestionText = (q: any): { question: string; body: string } => {
    const inner = normalizeQ(q);
    const rawBody = inner.body || inner.questionBody;
    const bodyParts: any[] = Array.isArray(rawBody) ? rawBody : [];
    const queryPart = bodyParts.find((b: any) => b.type === "QUERY");
    const examplePart = bodyParts.find((b: any) => b.type === "EXAMPLE");
    const stripHtml = (s: any): string => {
      if (typeof s !== "string") return "";
      return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
    };
    return {
      question: stripHtml(queryPart?.contents) || stripHtml(typeof inner.question === "string" ? inner.question : ""),
      body: stripHtml(examplePart?.contents),
    };
  };

  const getQNo = (q: any): number => { const inner = normalizeQ(q); return inner.questionNo ?? inner.id; };

  const getCurrentSubjectId = (q: any): number | null => {
    const qNo = getQNo(q);
    if (editedSubjects.hasOwnProperty(qNo)) return editedSubjects[qNo] as number | null;
    const inner = normalizeQ(q);
    const subjects = inner.flipeduSubjects || inner.branchSubjects;
    if (subjects?.subjectNo) {
      // Traverse to the deepest leaf to get the most specific category
      const findDeepest = (node: any): number => {
        if (!node.children || node.children.length === 0) return node.subjectNo;
        return findDeepest(node.children[0]);
      };
      return findDeepest(subjects);
    }
    // FlipEdu actual response has subject.id for the category
    return inner.classifyNo ?? inner.subjectId ?? inner.subject?.id ?? q.classifyNo ?? null;
  };

  const paperToEditInitData = (paper: any, questions: any[]): WorksheetEditInitData => {
    const stripHtml = (s: any): string => {
      if (typeof s !== "string") return "";
      return s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
    };
    const qs: QuestionItem[] = questions.map((rawQ: any) => {
      const inner = normalizeQ(rawQ);

      // body parts: FlipEdu stores everything in body[] with type QUERY/EXAMPLE/CHOICE
      const bodyParts: any[] = Array.isArray(inner.body) ? inner.body : [];
      const queryPart = bodyParts.find((b: any) => b.type === "QUERY");

      // Helper: detect if contents is a file reference like "File:filename.mp3"
      // or if the body item has a file property → existing media, NOT text
      const detectFileRef = (b: any): { type: "image" | "audio" | "video"; name: string; url?: string } | null => {
        if (!b) return null;
        // Has a file object attached
        if (b.file) {
          const fn = b.file.originalName || b.file.name || b.file.fileName || "";
          const ext = fn.split(".").pop()?.toLowerCase() || "";
          const audioExts = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
          const videoExts = ["mp4", "mov", "avi", "webm", "mkv"];
          const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
          const t = audioExts.includes(ext) ? "audio" : videoExts.includes(ext) ? "video" : imageExts.includes(ext) ? "image" : null;
          if (t) return { type: t, name: fn, url: b.file.url || b.file.downloadUrl };
        }
        // Check "File:" prefix in contents
        if (typeof b.contents === "string") {
          const m = b.contents.match(/^File:(.+)$/i);
          if (m) {
            const fn = m[1].trim();
            const ext = fn.split(".").pop()?.toLowerCase() || "";
            const audioExts = ["mp3", "wav", "ogg", "m4a", "aac", "flac"];
            const videoExts = ["mp4", "mov", "avi", "webm", "mkv"];
            const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
            const t = audioExts.includes(ext) ? "audio" : videoExts.includes(ext) ? "video" : imageExts.includes(ext) ? "image" : null;
            if (t) return { type: t, name: fn };
          }
        }
        return null;
      };

      const exampleParts = bodyParts.filter((b: any) => b.type === "EXAMPLE");
      // Separate plain-text examples from file-reference examples
      const textExamplePart = exampleParts.find((b: any) => !detectFileRef(b));
      const fileExampleParts = exampleParts.filter((b: any) => !!detectFileRef(b));

      const questionText = stripHtml(queryPart?.contents) || stripHtml(typeof inner.question === "string" ? inner.question : "");
      const bodyText = stripHtml(textExamplePart?.contents) || "";

      // Question type: determined by answerType field (may be object {id,name} or plain string)
      const answerTypeRaw = inner.answerType ?? rawQ.answerType ?? "";
      const answerTypeId = (typeof answerTypeRaw === "string" ? answerTypeRaw : answerTypeRaw?.id || "").toUpperCase();
      const qTypeStr = inner.questionType?.id || inner.questionType || "";
      const qType: "CHOICE" | "SHORT_ANSWER" | "WORD_ORDER" =
        answerTypeId === "OBJECTIVE" ? "CHOICE" :
        answerTypeId === "SUBJECTIVE" ? "SHORT_ANSWER" :
        (typeof qTypeStr === "string" && qTypeStr.toUpperCase().includes("SHORT")) ? "SHORT_ANSWER" : "CHOICE";

      // Choices: FlipEdu stores them in body[] as type="CHOICE" entries (sorted by ordering)
      const choiceBodyItems = bodyParts
        .filter((b: any) => b.type === "CHOICE")
        .sort((a: any, b: any) => a.ordering - b.ordering);
      const rawChoices: string[] = choiceBodyItems.map((c: any) => stripHtml(c?.contents ?? ""));
      const choices = rawChoices.length > 0 ? rawChoices : ["", "", "", "", ""];

      // Correct answer: new format has direct `corrects: ["4"]`; old format has correctForms[0].corrects[0]
      let correctAnswer = 1;
      const correctFormsArr = inner.correctForms || rawQ.correctForms;
      // Try new direct corrects array first, then old correctForms wrapper
      const directCorrects = inner.corrects || rawQ.corrects;
      const correctFormOrdering = correctFormsArr?.[0]?.corrects?.[0] ?? (Array.isArray(directCorrects) ? directCorrects[0] : undefined);
      if (correctFormOrdering !== undefined && correctFormOrdering !== null) {
        const targetOrdering = parseInt(String(correctFormOrdering), 10);
        if (!isNaN(targetOrdering)) {
          const idx = choiceBodyItems.findIndex((c: any) => c.ordering === targetOrdering);
          if (idx >= 0) correctAnswer = idx + 1;
          else {
            // Fallback: treat as 1-based index directly
            if (targetOrdering >= 1 && targetOrdering <= choices.length) correctAnswer = targetOrdering;
          }
        }
      } else {
        // Legacy: check answer/correctAnswer field
        const rawAnswer = inner.answer ?? rawQ.answer ?? inner.correctAnswer ?? rawQ.correctAnswer ?? inner.answerNo ?? rawQ.answerNo;
        if (rawAnswer !== undefined && rawAnswer !== null) {
          const parsed = parseInt(String(rawAnswer), 10);
          if (!isNaN(parsed) && parsed >= 1) correctAnswer = parsed;
        }
      }

      // Short answer text: in correctForms[0].corrects[0] for SUBJECTIVE, or inner.answer
      const answerText = qType === "SHORT_ANSWER"
        ? (typeof correctFormOrdering === "string" && isNaN(Number(correctFormOrdering)) ? correctFormOrdering :
           typeof inner.answer === "string" ? inner.answer :
           typeof rawQ.answer === "string" ? rawQ.answer :
           typeof inner.answerText === "string" ? inner.answerText : "")
        : "";

      // Explanation: check commentary array (FlipEdu returns `comments`), or inner.explanation
      const commentsArr = inner.comments || inner.commentary || inner.comment || rawQ.comments || [];

      // Scoring/grading: FlipEdu uses `gradingConditions` object
      const gc = inner.gradingConditions || rawQ.gradingConditions || inner.scoring || {};

      // Existing media: IMAGE/AUDIO/VIDEO entries in body[], PLUS EXAMPLE parts that are file refs
      const toMediaType = (t: string): "image" | "audio" | "video" | null =>
        t === "IMAGE" ? "image" : t === "AUDIO" ? "audio" : t === "VIDEO" ? "video" : null;
      const bodyExistingMedia: { type: "image" | "audio" | "video"; name?: string; url?: string }[] = [
        // Explicit IMAGE/AUDIO/VIDEO typed body items
        ...bodyParts
          .filter((b: any) => toMediaType(b.type))
          .map((b: any) => ({
            type: toMediaType(b.type)!,
            name: b.file?.originalName || b.file?.name || b.file?.fileName || b.contents || undefined,
            url: b.file?.url || b.file?.downloadUrl || undefined,
          })),
        // EXAMPLE items that are actually file references (e.g. "File:audio.mp3")
        ...fileExampleParts.map((b: any) => detectFileRef(b)!),
      ];

      // Explanation: parse all comments items, separating text from media (including "File:" refs)
      const explanationExistingMedia: { type: "image" | "audio" | "video"; name?: string; url?: string }[] = [];
      let explanationText = "";
      if (Array.isArray(commentsArr) && commentsArr.length > 0) {
        for (const c of commentsArr) {
          if (Array.isArray(c.body) && c.body.length > 0) {
            // Nested body[] structure
            for (const b of c.body) {
              const mType = toMediaType(b.type);
              if (mType) {
                explanationExistingMedia.push({
                  type: mType,
                  name: b.file?.originalName || b.file?.name || b.file?.fileName || b.contents || undefined,
                  url: b.file?.url || b.file?.downloadUrl || undefined,
                });
              } else {
                const fileRef = detectFileRef(b);
                if (fileRef) {
                  explanationExistingMedia.push(fileRef);
                } else {
                  const txt = stripHtml(b.contents || b.comment || "");
                  if (txt) explanationText += (explanationText ? "\n" : "") + txt;
                }
              }
            }
          } else {
            // Flat comment item
            const mType = toMediaType(c.type);
            if (mType) {
              explanationExistingMedia.push({
                type: mType,
                name: c.file?.originalName || c.file?.name || c.file?.fileName || c.contents || undefined,
                url: c.file?.url || c.file?.downloadUrl || undefined,
              });
            } else {
              const fileRef = detectFileRef(c);
              if (fileRef) {
                explanationExistingMedia.push(fileRef);
              } else {
                const txt = stripHtml(c.contents ?? c.comment ?? "");
                if (txt) explanationText += (explanationText ? "\n" : "") + txt;
              }
            }
          }
        }
      } else {
        explanationText = stripHtml(inner.explanation ?? "");
      }

      return {
        id: Math.random().toString(36).substring(2, 9),
        questionType: qType,
        question: questionText,
        body: bodyText,
        choices,
        correctAnswer,
        answerText,
        gradingCaseSensitive: !!(gc.sensitive || gc.caseSensitive),
        gradingSpecialChars: !!(gc.specialCharacter),
        gradingSpacing: !!(gc.spacingWord || gc.spacing),
        gradingOr: !!(gc.orGrading || gc.orScoring),
        explanation: explanationText,
        tags: Array.isArray(inner.tags) ? inner.tags : [],
        shared: true,
        categoryId: undefined,
        subjectId: inner.classifyNo ?? inner.subjectId ?? inner.subject?.id ?? inner.branchSubjects?.[0]?.subjectNo ?? inner.flipeduSubjects?.[0]?.subjectNo ?? undefined,
        showChoiceNumbers: true,
        score: typeof rawQ.score === "number" ? rawQ.score : (typeof rawQ.scorePerQuestion === "number" ? rawQ.scorePerQuestion : 1),
        bodyImages: [],
        bodyVideos: [],
        bodyAudios: [],
        explanationImages: [],
        explanationVideos: [],
        explanationAudios: [],
        bodyExistingMedia,
        explanationExistingMedia,
      };
    });
    return {
      title: paper.name || "",
      categoryId: paper.classifyNo ?? paper.classify?.classifyNo ?? paper.category?.classifyNo ?? undefined,
      questions: qs,
    };
  };

  const handleEditPaper = () => {
    if (!paperDetail || !selectedPaperNo) return;
    const qs = detailQuestions;
    const data = paperToEditInitData(paperDetail, qs);
    // Fallback: try to get classifyNo from the list data if not found in detail
    if (!data.categoryId) {
      const paperInList = papersData?.contents?.find((p: any) => p.questionPaperNo === selectedPaperNo);
      const catNo = paperInList?.classifyNo ?? paperInList?.classify?.classifyNo ?? paperInList?.category?.classifyNo;
      if (catNo) data.categoryId = Number(catNo);
    }
    setEditInitData(data);
    setEditPaperNo(selectedPaperNo);
    setEditModalOpen(true);
  };

  const handleSaveSubjects = async () => {
    const toUpdate = Object.entries(editedSubjects)
      .filter(([, classifyNo]) => classifyNo !== null)
      .map(([questionNo, classifyNo]) => ({ questionNo: Number(questionNo), classifyNo: classifyNo as number }));
    if (toUpdate.length === 0) { toast({ title: "변경 없음", description: "수정된 카테고리가 없습니다." }); return; }
    setSavingSubjects(true);
    try {
      const res = await fetch(api.questions.bulkClassify.path, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: toUpdate }),
      });
      const data = await res.json();
      if (data.success) {
        const savedNos = new Set<number>(
          ((data.results || []) as Array<{ questionNo: number; success: boolean }>)
            .filter(r => r.success).map(r => r.questionNo)
        );
        setEditedSubjects(prev => {
          const next = { ...prev };
          savedNos.forEach(no => { delete next[no]; });
          return next;
        });
        queryClient.invalidateQueries({ queryKey: [api.questionPapers.list.path, selectedPaperNo] });
        if (data.flipSuccess) {
          toast({ title: "저장 완료", description: `${data.successCount}/${data.total}문항 카테고리가 FlipEdu 서버에 저장되었습니다.` });
        } else {
          toast({ title: "임시 저장 완료", description: `${data.successCount}/${data.total}문항 카테고리가 저장되었습니다. (FlipEdu 서버 저장 실패 — 이 앱에서만 유지됩니다)`, variant: "destructive" });
        }
      } else {
        toast({ title: "저장 실패", description: data.message || "오류가 발생했습니다.", variant: "destructive" });
      }
    } catch {
      toast({ title: "저장 실패", description: "요청 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setSavingSubjects(false);
    }
  };


  const runAiClassify = async () => {
    const validSegments = aiSegments.filter(s => s.parentIds.length > 0);
    if (validSegments.length === 0) { toast({ title: "오류", description: "구간마다 분류 기준 카테고리를 하나 이상 선택하세요.", variant: "destructive" }); return; }
    for (const seg of validSegments) {
      if (seg.from > seg.to) { toast({ title: "범위 오류", description: `${seg.from}~${seg.to}: 시작 번호가 끝 번호보다 클 수 없습니다.`, variant: "destructive" }); return; }
    }
    if (detailQuestions.length === 0) { toast({ title: "오류", description: "문항이 없습니다.", variant: "destructive" }); return; }
    const subjectTree = buildSubjectTree(questionSubjects || []);

    // Collect total items across segments
    const coveredNos = new Set<number>();
    for (const seg of validSegments) {
      detailQuestions.forEach((q: any, idx: number) => {
        const num = idx + 1;
        if (num >= seg.from && num <= seg.to) coveredNos.add(getQNo(q));
      });
    }
    const totalItems = coveredNos.size;
    if (totalItems === 0) { toast({ title: "오류", description: "적용 범위에 문항이 없습니다.", variant: "destructive" }); return; }

    setAiLoading(true);
    setAiProgress({ current: 0, total: totalItems });
    const resultMap: Record<string, number | null> = {};
    let processed = 0;
    try {
      for (const seg of validSegments) {
        const candidates: { id: number; name: string; path: string }[] = [];
        for (const pid of seg.parentIds) {
          const node = subjectTree.find((n: any) => getNodeId(n) === pid);
          if (node) candidates.push(...getAllDescendants(node, ""));
        }
        if (candidates.length === 0) continue;
        const rangeQs = detailQuestions.filter((_: any, idx: number) => {
          const num = idx + 1;
          return num >= seg.from && num <= seg.to;
        });
        if (rangeQs.length === 0) continue;
        const questionsPayload = rangeQs.map((q: any) => {
          const { question, body } = getQuestionText(q);
          return { id: String(getQNo(q)), question, body };
        });
        const res = await fetch(api.ai.classifySubject.path, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: questionsPayload, candidates }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || "AI 분류 요청 실패");
        }
        const { results } = await res.json() as { results: { id: string; subjectId: number | null }[] };
        for (const r of results) resultMap[r.id] = r.subjectId;
        processed += rangeQs.length;
        setAiProgress({ current: processed, total: totalItems });
      }
      setSimulatedPct(100);
      // Build comparison list — all questions; AI result only for covered ones
      const compareList = detailQuestions.map((q: any) => {
        const qNo = getQNo(q);
        const currentSid = getCurrentSubjectId(q);
        const aiSid = Object.prototype.hasOwnProperty.call(resultMap, String(qNo)) ? resultMap[String(qNo)] : null;
        return { qNo, currentSid, aiSid, chosen: aiSid !== null ? "ai" : "current" } as { qNo: number; currentSid: number | null; aiSid: number | null; chosen: "current" | "ai" };
      });
      setAiCompareResults(compareList);
      await new Promise(r => setTimeout(r, 400));
      setAiModalOpen(false);
      setAiCompareOpen(true);
    } catch (err: any) {
      toast({ title: "AI 분류 오류", description: err?.message || "요청 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setAiLoading(false);
      setAiProgress(null);
    }
  };

  const renderSubjectPickerNode = (node: any, questionNo: number, depth = 0): JSX.Element => {
    const nodeId = getNodeId(node);
    const nodeName = getNodeName(node);
    const kids = getNodeChildren(node);
    const hasChildren = kids.length > 0;
    const isExp = subjectExpanded.has(nodeId);
    const isSel = getCurrentSubjectId({ questionNo }) === nodeId;
    return (
      <div key={nodeId}>
        <div
          className={`flex items-center gap-1 pr-2 py-[5px] rounded text-[11px] mb-0.5 transition-colors ${isSel ? "bg-blue-600 text-white" : hasChildren ? "text-gray-700 hover:bg-gray-100 font-medium" : "text-gray-600 hover:bg-blue-50"}`}
          style={{ paddingLeft: `${depth * 14 + 6}px` }}
        >
          {/* Chevron toggles expand only */}
          <span
            className="shrink-0 w-4 flex justify-center cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setSubjectExpanded(prev => { const n = new Set(prev); n.has(nodeId) ? n.delete(nodeId) : n.add(nodeId); return n; });
            }}
          >
            {hasChildren ? (isExp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="w-3" />}
          </span>
          {/* Name click selects the node */}
          <span
            className="truncate cursor-pointer flex-1"
            onClick={() => {
              setEditedSubjects(prev => ({ ...prev, [questionNo]: nodeId }));
              setOpenPickerFor(null);
            }}
          >{nodeName}</span>
        </div>
        {hasChildren && isExp && kids.map((c: any) => renderSubjectPickerNode(c, questionNo, depth + 1))}
      </div>
    );
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    createCategoryMutation.mutate({ name: newCatName.trim(), parentNo: addingUnder || undefined });
  };

  const handleRenameCategory = () => {
    if (!editingCat || !editName.trim()) return;
    updateCategoryMutation.mutate({ classifyNo: editingCat, name: editName.trim() });
  };

  const handleDeleteCategory = (classifyNo: string, name: string) => {
    setDeleteCatTarget({ classifyNo, name });
  };

  const filterCategories = (nodes: any[], searchTerm: string): any[] => {
    if (!searchTerm.trim()) return nodes;
    return nodes.reduce((acc: any[], node: any) => {
      const matchesSelf = node.name.toLowerCase().includes(searchTerm.toLowerCase());
      const filteredChildren = node.children ? filterCategories(node.children, searchTerm) : [];
      if (matchesSelf || filteredChildren.length > 0) {
        acc.push({ ...node, children: matchesSelf ? node.children : filteredChildren });
      }
      return acc;
    }, []);
  };

  const displayCategories = filterCategories(flipCategories || [], categorySearch);

  const renderAddInput = (parentNo?: string) => (
    <div className={`flex items-center gap-1 px-2 py-1 ${parentNo ? 'ml-4' : ''}`}>
      <input
        ref={addInputRef}
        value={newCatName}
        onChange={(e) => setNewCatName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAddCategory();
          if (e.key === "Escape") { setAddingUnder(null); setAddingRoot(false); setNewCatName(""); }
        }}
        placeholder="카테고리 이름"
        className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-[12px] text-gray-900 outline-none focus:border-blue-500"
        data-testid="input-new-worksheet-category"
      />
      <button
        onClick={handleAddCategory}
        disabled={createCategoryMutation.isPending}
        className="shrink-0 p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-50"
        data-testid="btn-confirm-add-worksheet-category"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { setAddingUnder(null); setAddingRoot(false); setNewCatName(""); }}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
        data-testid="btn-cancel-add-worksheet-category"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderCategories = (nodes: any[], depth = 0): any => {
    if (depth >= 4 || !nodes?.length) return null;
    return (
      <div className={depth > 0 ? "ml-4" : ""}>
        {nodes.map((cat: any) => {
          const hasChildren = cat.children && cat.children.length > 0;
          const isExpanded = expandedNodes.has(String(cat.classifyNo));
          const isSelected = categoryId === String(cat.classifyNo);
          const isEditing = editingCat === String(cat.classifyNo);
          const canAddChild = depth < 3;

          return (
            <div key={cat.classifyNo}>
              <div
                className={`group w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 ${isSelected ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                data-testid={`worksheet-category-node-${cat.classifyNo}`}
              >
                <span
                  role="button"
                  onClick={() => {
                    if (isMobile && hasChildren && !isExpanded) {
                      toggleExpand(String(cat.classifyNo));
                    } else {
                      handleCategoryChange(String(cat.classifyNo));
                      if (hasChildren) toggleExpand(String(cat.classifyNo));
                    }
                  }}
                  className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer"
                >
                  <span className="shrink-0 w-4 flex justify-center">
                    {hasChildren ? (
                      isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3 opacity-0" />
                    )}
                  </span>
                  {isEditing ? (
                    <input
                      ref={editInputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameCategory();
                        if (e.key === "Escape") { setEditingCat(null); setEditName(""); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] text-gray-900 outline-none focus:border-blue-500"
                      data-testid="input-rename-worksheet-category"
                    />
                  ) : (
                    <span className="truncate">{cat.name}</span>
                  )}
                </span>
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isEditing ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRenameCategory(); }}
                        disabled={updateCategoryMutation.isPending}
                        className="p-0.5 text-emerald-600 hover:text-emerald-500"
                        data-testid="btn-confirm-worksheet-rename"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(null); setEditName(""); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid="btn-cancel-worksheet-rename"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      {canAddChild && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddingUnder(String(cat.classifyNo)); setAddingRoot(false); setNewCatName(""); if (!isExpanded) toggleExpand(String(cat.classifyNo)); }}
                          className="p-0.5 text-gray-400 hover:text-gray-600"
                          data-testid={`btn-add-worksheet-child-${cat.classifyNo}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(String(cat.classifyNo)); setEditName(cat.name); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid={`btn-worksheet-rename-${cat.classifyNo}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(String(cat.classifyNo), cat.name); }}
                        className="p-0.5 text-gray-400 hover:text-red-500"
                        data-testid={`btn-worksheet-delete-${cat.classifyNo}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {hasChildren && isExpanded && renderCategories(cat.children, depth + 1)}
              {addingUnder === String(cat.classifyNo) && renderAddInput(String(cat.classifyNo))}
            </div>
          );
        })}
      </div>
    );
  };

  const categorySidebarContent = (
    <>
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="카테고리 검색..."
            className="pl-9 bg-muted border-none h-9 text-[12px]"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            data-testid="input-worksheet-category-search"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        <div className="flex items-center justify-between px-3 py-2 mb-1">
          <button
            onClick={() => { setCategoryId(null); setSearch(""); if (isMobile) setMobileCatOpen(false); }}
            className={`font-semibold text-[14px] rounded-md px-1 py-0.5 transition-colors ${!categoryId ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="button-video-all-categories"
          >
            전체
          </button>
          <button
            onClick={() => { setAddingRoot(true); setAddingUnder(null); setNewCatName(""); }}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="btn-add-worksheet-root-category"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {addingRoot && renderAddInput()}

        {categoriesLoading ? (
          <div className="space-y-2 px-3">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : (
          renderCategories(displayCategories)
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {!isMobile && (
        <div className="w-64 border-r border-border flex flex-col bg-background">
          {categorySidebarContent}
        </div>
      )}

      {isMobile && mobileCatOpen && (
        <div className="fixed inset-0 z-50 flex" style={{ touchAction: "none" }}>
          <div className="w-72 bg-background border-r border-border flex flex-col h-full shadow-xl animate-in slide-in-from-left" style={{ touchAction: "auto" }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-[14px] font-semibold">카테고리</span>
              <button onClick={() => setMobileCatOpen(false)} className="p-1 text-muted-foreground hover:text-foreground" data-testid="btn-mobile-worksheet-cat-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            {categorySidebarContent}
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMobileCatOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto flex-1">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setMobileCatOpen(true)}
                data-testid="btn-mobile-worksheet-cat-toggle"
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 h-9 text-[13px] font-medium no-default-hover-elevate"
              onClick={() => setCreateModalOpen(true)}
              data-testid="btn-create-worksheet"
            >
              학습지 만들기
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 md:flex-none md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="학습지 검색"
                className="pl-10 bg-muted border-none rounded-md h-10 text-[13px] focus-visible:ring-1 focus-visible:ring-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-worksheet-search"
              />
            </div>
            <div className="px-3 py-1 bg-muted rounded text-[11px] text-muted-foreground shrink-0" data-testid="text-worksheet-total-count">
              총 {papersData?.totalElementsCnt || 0}개
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-[12px]">
              <span className="text-blue-700 font-medium">{selectedIds.length}개 선택됨</span>
              <button className="ml-auto text-destructive hover:text-destructive/80 flex items-center gap-1 font-medium" onClick={() => setBatchDeleteOpen(true)} data-testid="btn-batch-delete">
                <Trash2 className="w-3.5 h-3.5" /> 선택 삭제
              </button>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setSelectedIds([])} data-testid="btn-deselect-all">취소</button>
            </div>
          )}

          <div className="rounded border border-border overflow-hidden overflow-x-auto">
            <Table className="table-fixed w-full border-collapse">
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="w-10 px-3">
                    <input
                      type="checkbox"
                      className="rounded border-border bg-transparent cursor-pointer"
                      checked={!!papersData?.contents?.length && selectedIds.length === papersData.contents.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds((papersData?.contents || []).map((p: any) => p.questionPaperNo));
                        else setSelectedIds([]);
                      }}
                      data-testid="checkbox-worksheet-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium text-[12px] h-10 border-r border-border/30">
                    <div className="flex items-center px-1">학습지</div>
                  </TableHead>
                  <TableHead className="w-[72px] px-2 text-center text-muted-foreground font-medium text-[12px] h-10 whitespace-nowrap hidden md:table-cell border-r border-border/30">
                    문항수
                  </TableHead>
                  <TableHead className="w-24 text-muted-foreground font-medium text-[12px] h-10 hidden md:table-cell px-3">
                    수정일
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {papersLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-3"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : !papersData?.contents?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-16">
                      <div className="flex flex-col items-center gap-3 text-center">
                        <FileText className="w-10 h-10 text-muted-foreground/40" />
                        <p className="text-[13px] text-muted-foreground">
                          {debouncedSearch ? `"${debouncedSearch}"에 해당하는 학습지가 없습니다.` : "학습지가 없습니다."}
                        </p>
                        {!debouncedSearch && (
                          <Button
                            size="sm"
                            className="h-8 text-[12px] bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => setCreateModalOpen(true)}
                            data-testid="btn-empty-create-worksheet"
                          >
                            + 학습지 만들기
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  papersData.contents.map((paper: any) => (
                    <TableRow
                      key={paper.questionPaperNo}
                      className={`cursor-pointer group hover:bg-muted/50 ${selectedPaperNo === paper.questionPaperNo ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                      data-testid={`row-worksheet-${paper.questionPaperNo}`}
                      onClick={() => {
                        setSelectedPaperNo(prev => prev === paper.questionPaperNo ? null : paper.questionPaperNo);
                        setEditedSubjects({});
                        setOpenPickerFor(null);
                      }}
                    >
                      <TableCell className="px-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-border bg-transparent cursor-pointer"
                          checked={selectedIds.includes(paper.questionPaperNo)}
                          onChange={() => setSelectedIds(prev =>
                            prev.includes(paper.questionPaperNo) ? prev.filter(id => id !== paper.questionPaperNo) : [...prev, paper.questionPaperNo]
                          )}
                          data-testid={`checkbox-worksheet-${paper.questionPaperNo}`}
                        />
                      </TableCell>
                      <TableCell className="text-[13px] border-r border-border/30 max-w-0 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <span className="truncate">{paper.name}</span>
                          <button
                            className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => { e.stopPropagation(); setDeleteTarget({ paperNo: paper.questionPaperNo, name: paper.name }); }}
                            data-testid={`btn-delete-worksheet-${paper.questionPaperNo}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {isMobile && (
                          <span className="text-[11px] text-muted-foreground block mt-0.5">
                            {paper.questionCnt || 0}문항 · {formatDate(paper.writeInfo?.updatedAt || paper.writeInfo?.createdAt)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-[13px] text-muted-foreground hidden md:table-cell border-r border-border/30">
                        {paper.questionCnt || 0}
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground hidden md:table-cell px-3">
                        {formatDate(paper.writeInfo?.updatedAt || paper.writeInfo?.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {papersData && papersData.totalPages > 1 && (() => {
            const total = papersData.totalPages;
            const current = page;
            const pages: (number | "...")[] = [];
            if (total <= 7) {
              for (let i = 0; i < total; i++) pages.push(i);
            } else {
              pages.push(0);
              if (current > 2) pages.push("...");
              for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) pages.push(i);
              if (current < total - 3) pages.push("...");
              pages.push(total - 1);
            }
            return (
              <div className="flex items-center justify-center gap-1 pt-2">
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="btn-worksheet-prev">이전</Button>
                {pages.map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-[11px] text-muted-foreground">…</span>
                  ) : (
                    <button
                      key={p}
                      className={`h-7 w-7 rounded text-[11px] font-medium transition-colors ${p === current ? "bg-blue-600 text-white" : "hover:bg-muted text-foreground"}`}
                      onClick={() => setPage(p as number)}
                      data-testid={`btn-worksheet-page-${p}`}
                    >{(p as number) + 1}</button>
                  )
                )}
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" disabled={page >= papersData.totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="btn-worksheet-next">다음</Button>
              </div>
            );
          })()}
        </div>
      </div>

      <AlertDialog open={deleteCatTarget !== null} onOpenChange={(open) => { if (!open) { setDeleteCatTarget(null); setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }, 0); } }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle>카테고리 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteCatTarget?.name}" 카테고리를 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteCatTarget) deleteCategoryMutation.mutate(deleteCatTarget.classifyNo); setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }, 0); }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single paper delete dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습지 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" 학습지를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deletePaperMutation.mutate(deleteTarget.paperNo); }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch paper delete dialog */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>학습지 {selectedIds.length}개 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 학습지 {selectedIds.length}개를 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBatchDelete}
            >
              {selectedIds.length}개 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <WorksheetCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        defaultCategoryId={categoryId}
      />
      <WorksheetCreateModal
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditPaperNo(null); setEditInitData(null); }}
        defaultCategoryId={null}
        editPaperNo={editPaperNo}
        initData={editInitData}
      />

      {/* Paper detail slide-out panel */}
      {selectedPaperNo && (() => {
        const subjectTree = buildSubjectTree(questionSubjects || []);
        const pathMap = buildPathMap(subjectTree);
        const editedCount = Object.keys(editedSubjects).length;

        return (
          <div className="fixed inset-0 z-40 pointer-events-none">
            <div className="absolute right-0 top-0 h-full w-[440px] bg-background border-l border-border shadow-2xl flex flex-col pointer-events-auto">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground mb-0.5">학습지 상세</p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="text-[14px] font-semibold truncate">{paperDetail?.name || "불러오는 중..."}</h3>
                    {paperDetail?.name && (
                      <button
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => { navigator.clipboard.writeText(paperDetail.name); toast({ title: "복사됨", description: "학습지 이름이 클립보드에 복사되었습니다." }); }}
                        title="이름 복사"
                        data-testid="btn-copy-paper-name"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {paperDetail && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {detailQuestions.length}문항 · {formatDate(paperDetail.writeInfo?.updatedAt || paperDetail.writeInfo?.createdAt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    onClick={handleEditPaper}
                    disabled={paperDetailLoading || !paperDetail}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-blue-600 disabled:opacity-40"
                    title="학습지 수정"
                    data-testid="btn-edit-detail-panel"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { if (selectedPaperNo && paperDetail) setDeleteTarget({ paperNo: selectedPaperNo, name: paperDetail.name }); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                    title="학습지 삭제"
                    data-testid="btn-delete-detail-panel"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setSelectedPaperNo(null); setEditedSubjects({}); setOpenPickerFor(null); }}
                    className="p-1.5 rounded hover:bg-muted"
                    data-testid="btn-close-detail-panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-muted/30">
                <Button
                  size="sm"
                  className="h-8 text-[12px] px-3 bg-purple-600 hover:bg-purple-700 gap-1.5"
                  onClick={() => { setAiSegments([{ uid: '1', parentIds: [], from: 1, to: detailQuestions.length || 1 }]); setAiLoading(false); setAiProgress(null); setAiModalOpen(true); }}
                  disabled={paperDetailLoading || detailQuestions.length === 0}
                  data-testid="btn-ai-classify-panel"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 카테고리 분류
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px] px-3 gap-1.5"
                  disabled={editedCount === 0 || savingSubjects}
                  onClick={handleSaveSubjects}
                  data-testid="btn-save-subjects"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingSubjects ? "저장 중..." : `저장${editedCount > 0 ? ` (${editedCount})` : ""}`}
                </Button>
                {editedCount > 0 && (
                  <button
                    className="text-[11px] text-muted-foreground hover:text-foreground ml-auto"
                    onClick={() => setEditedSubjects({})}
                  >초기화</button>
                )}
              </div>

              {/* Question list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {paperDetailLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))
                ) : detailQuestions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12 text-[13px]">문항이 없습니다.</div>
                ) : (
                  detailQuestions.map((q: any, idx: number) => {
                    const qNo = getQNo(q);
                    const { question, body } = getQuestionText(q);
                    const currentSid = getCurrentSubjectId(q);
                    const isEdited = editedSubjects.hasOwnProperty(qNo);
                    const isPickerOpen = openPickerFor === qNo;

                    return (
                      <div key={qNo ?? idx} className={`border rounded-lg p-3 transition-colors ${isEdited ? "border-blue-300 bg-blue-50/30" : "border-border"}`} data-testid={`question-card-${qNo}`}>
                        <div className="flex items-start gap-2 mb-2">
                          <span className="text-[10px] font-bold text-muted-foreground shrink-0 mt-0.5 w-5">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            {body && <p className="text-[10px] text-muted-foreground mb-1 line-clamp-1">{body}</p>}
                            <p className="text-[12px] text-foreground line-clamp-2">{question || "(문제 텍스트 없음)"}</p>
                          </div>
                        </div>
                        <div className="relative ml-7" data-picker-panel>
                          <button
                            className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors ${currentSid ? "border-blue-300 bg-blue-50 text-blue-700" : "border-dashed border-border text-muted-foreground hover:border-gray-400"}`}
                            onClick={e => {
                              e.stopPropagation();
                              setSubjectExpanded(new Set());
                              setOpenPickerFor(prev => prev === qNo ? null : qNo);
                            }}
                            data-testid={`btn-question-category-${qNo}`}
                          >
                            <Tag className="w-3 h-3" />
                            {currentSid ? (pathMap.get(currentSid) ?? getSubjectName(currentSid)) : "카테고리 선택"}
                            {isEdited && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                          </button>
                          {currentSid && (
                            <button
                              className="ml-1 text-[10px] text-muted-foreground hover:text-red-500"
                              onClick={e => { e.stopPropagation(); setEditedSubjects(prev => ({ ...prev, [qNo]: null })); setOpenPickerFor(null); }}
                            >×</button>
                          )}
                          {isPickerOpen && (
                            <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-xl w-64 max-h-56 overflow-y-auto p-1">
                              {subjectTree.length > 0 ? subjectTree.map((node: any) => renderSubjectPickerNode(node, qNo)) : (
                                <p className="text-[11px] text-muted-foreground text-center py-3">카테고리 없음</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI compare modal */}
      {aiCompareOpen && (() => {
        const subjectTree = buildSubjectTree(questionSubjects || []);
        const pathMap = buildPathMap(subjectTree);
        const getSidLabel = (sid: number | null) => sid ? (pathMap.get(sid) ?? getSubjectName(sid)) : null;
        const hasAiSid = aiCompareResults.some(r => r.aiSid !== null);
        const applyCompare = () => {
          const newEdited: Record<number, number | null> = { ...editedSubjects };
          for (const r of aiCompareResults) {
            if (r.chosen === "ai" && r.aiSid !== null) newEdited[r.qNo] = r.aiSid;
          }
          setEditedSubjects(newEdited);
          setAiCompareOpen(false);
          const applied = aiCompareResults.filter(r => r.chosen === "ai" && r.aiSid !== null).length;
          toast({ title: "적용 완료", description: `${applied}개 문항 카테고리가 변경됐습니다.` });
        };
        return (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
            <div className="bg-background rounded-xl shadow-2xl w-[680px] flex flex-col max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h3 className="text-[15px] font-bold">AI 분류 결과 비교</h3>
                  <span className="text-[11px] text-muted-foreground ml-1">적용할 카테고리를 선택하세요</span>
                </div>
                <button onClick={() => setAiCloseConfirm("compare")} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              {/* Column labels */}
              <div className="grid grid-cols-[1fr_20px_1fr] gap-2 px-6 pt-4 pb-1 shrink-0">
                <div className="text-[11px] font-semibold text-gray-500 text-center">기존 카테고리</div>
                <div />
                <div className="text-[11px] font-semibold text-purple-600 text-center">AI 제안 카테고리</div>
              </div>
              {/* Shortcuts */}
              <div className="flex items-center gap-2 px-6 pb-2 shrink-0">
                <button
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setAiCompareResults(prev => prev.map(r => ({ ...r, chosen: "current" })))}
                >전체 기존 유지</button>
                <span className="text-muted-foreground text-[10px]">·</span>
                <button
                  className="text-[11px] text-purple-600 underline-offset-2 hover:underline"
                  onClick={() => setAiCompareResults(prev => prev.map(r => ({ ...r, chosen: r.aiSid !== null ? "ai" : r.chosen })))}
                >전체 AI 적용</button>
              </div>
              {/* Question rows */}
              <div className="overflow-y-auto flex-1 px-6 pb-4 flex flex-col gap-2">
                {aiCompareResults.map((r, i) => {
                  const q = detailQuestions.find((q: any) => getQNo(q) === r.qNo);
                  const qText = q ? (() => { const t = getQuestionText(q); return (t.question || t.body || "").slice(0, 50); })() : "";
                  const currentLabel = getSidLabel(r.currentSid);
                  const aiLabel = getSidLabel(r.aiSid);
                  const isSame = r.currentSid === r.aiSid;
                  return (
                    <div key={r.qNo} className="flex flex-col gap-1">
                      <p className="text-[10px] text-muted-foreground pl-1 truncate">{i + 1}. {qText || `문항 ${r.qNo}`}</p>
                      <div className="grid grid-cols-[1fr_20px_1fr] items-center gap-2">
                        {/* Current category card */}
                        <button
                          onClick={() => setAiCompareResults(prev => prev.map(item => item.qNo === r.qNo ? { ...item, chosen: "current" } : item))}
                          className={`px-3 py-2 rounded-lg border text-[11px] text-left transition-all ${r.chosen === "current" ? "border-blue-500 bg-blue-50 ring-2 ring-blue-300 font-semibold text-blue-800" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                        >
                          {currentLabel ?? <span className="italic opacity-50">카테고리 없음</span>}
                        </button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground mx-auto" />
                        {/* AI category card */}
                        <button
                          onClick={() => { if (r.aiSid !== null) setAiCompareResults(prev => prev.map(item => item.qNo === r.qNo ? { ...item, chosen: "ai" } : item)); }}
                          disabled={r.aiSid === null}
                          className={`px-3 py-2 rounded-lg border text-[11px] text-left transition-all ${r.aiSid === null ? "border-dashed border-border bg-muted/20 text-muted-foreground/40 cursor-not-allowed italic" : isSame ? "border-gray-300 bg-muted/40 text-muted-foreground" : r.chosen === "ai" ? "border-purple-500 bg-purple-50 ring-2 ring-purple-300 font-semibold text-purple-800" : "border-border bg-muted/40 text-muted-foreground hover:bg-purple-50/50 hover:border-purple-300"}`}
                        >
                          {r.aiSid === null ? "분류 불가" : isSame ? <span className="opacity-60">{aiLabel} (동일)</span> : aiLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
                <p className="text-[11px] text-muted-foreground">
                  AI 적용: {aiCompareResults.filter(r => r.chosen === "ai" && r.aiSid !== null).length}개 / 기존 유지: {aiCompareResults.filter(r => r.chosen === "current").length}개
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => setAiCompareOpen(false)}>취소</Button>
                  <Button
                    className="h-9 text-[13px] px-4 bg-purple-600 hover:bg-purple-700"
                    disabled={!hasAiSid}
                    onClick={applyCompare}
                    data-testid="btn-ai-compare-apply"
                  >적용</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI classify progress modal — shown while AI is running */}
      {aiLoading && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center">
          <div className="bg-background rounded-2xl shadow-2xl w-[360px] flex flex-col items-center px-8 py-10 gap-6">
            {/* Circular progress */}
            {(() => {
              const pct = simulatedPct;
              const r = 56;
              const circ = 2 * Math.PI * r;
              const offset = circ - (pct / 100) * circ;
              return (
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
                    <circle cx="72" cy="72" r={r} fill="none" stroke="#e9d5ff" strokeWidth="10" />
                    <circle
                      cx="72" cy="72" r={r} fill="none"
                      stroke="#9333ea" strokeWidth="10"
                      strokeDasharray={circ}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      style={{ transition: "stroke-dashoffset 0.3s ease" }}
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-bold text-purple-700">{Math.round(pct)}%</span>
                  </div>
                </div>
              );
            })()}
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
                <p className="text-[15px] font-bold">AI 분류 진행 중</p>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {aiProgress ? `${aiProgress.total}개 문항을 분석하는 중입니다...` : "문항을 분석하는 중입니다..."}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">잠시만 기다려 주세요</p>
            </div>
            {/* Progress bar */}
            <div className="w-full">
              <div className="w-full bg-purple-100 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full"
                  style={{ width: `${simulatedPct}%`, transition: "width 0.3s ease" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI classify modal — category selection */}
      {aiModalOpen && !aiLoading && (() => {
        const subjectTree = buildSubjectTree(questionSubjects || []);
        const totalQ = detailQuestions.length;
        const anyReady = aiSegments.some(s => s.parentIds.length > 0);
        return (
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
            <div className="bg-background rounded-xl shadow-2xl w-[500px] flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h3 className="text-[15px] font-bold">AI 카테고리 자동 분류</h3>
                </div>
                <button onClick={() => setAiCloseConfirm("ai")} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
                <div className="bg-purple-50 rounded-lg p-4 text-[12px] text-purple-900">
                  <p className="font-semibold text-[13px] mb-1">AI 자동 분류</p>
                  <p className="text-purple-700">구간별로 적용할 문항 범위와 분류 기준 카테고리를 설정하세요. 구간을 여러 개 추가해 서로 다른 범위에 다른 카테고리를 적용할 수 있습니다.</p>
                </div>

                {aiSegments.map((seg, segIdx) => {
                  const subCount = seg.parentIds.reduce((acc, pid) => {
                    const node = subjectTree.find((n: any) => getNodeId(n) === pid);
                    return acc + (node ? getAllDescendants(node, "").length : 0);
                  }, 0);
                  return (
                    <div key={seg.uid} className="border border-border rounded-xl p-4 flex flex-col gap-3 bg-muted/20">
                      {/* 구간 헤더 */}
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-gray-600">구간 {segIdx + 1}</span>
                        {aiSegments.length > 1 && (
                          <button
                            onClick={() => setAiSegments(prev => prev.filter(s => s.uid !== seg.uid))}
                            className="text-[11px] text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                          >삭제</button>
                        )}
                      </div>
                      {/* 범위 입력 */}
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={totalQ}
                          value={seg.from}
                          onChange={e => {
                            const v = Math.max(1, Math.min(totalQ, Number(e.target.value)));
                            setAiSegments(prev => prev.map(s => s.uid === seg.uid ? { ...s, from: v } : s));
                          }}
                          className="w-20 h-8 border border-border rounded-lg text-center text-[13px] bg-background focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-[13px] text-muted-foreground">번 ~</span>
                        <input
                          type="number"
                          min={1}
                          max={totalQ}
                          value={seg.to}
                          onChange={e => {
                            const v = Math.max(1, Math.min(totalQ, Number(e.target.value)));
                            setAiSegments(prev => prev.map(s => s.uid === seg.uid ? { ...s, to: v } : s));
                          }}
                          className="w-20 h-8 border border-border rounded-lg text-center text-[13px] bg-background focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <span className="text-[13px] text-muted-foreground">번</span>
                      </div>
                      {/* 카테고리 선택 */}
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 mb-2">분류 기준 카테고리 — 복수 선택 가능</p>
                        {subjectTree.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {subjectTree.map((node: any) => {
                              const nodeId = getNodeId(node);
                              const nodeName = getNodeName(node);
                              const isSel = seg.parentIds.includes(nodeId);
                              return (
                                <button
                                  key={nodeId}
                                  onClick={() => setAiSegments(prev => prev.map(s =>
                                    s.uid !== seg.uid ? s : {
                                      ...s,
                                      parentIds: s.parentIds.includes(nodeId)
                                        ? s.parentIds.filter(id => id !== nodeId)
                                        : [...s.parentIds, nodeId]
                                    }
                                  ))}
                                  className={`px-3 py-1.5 text-[12px] rounded-lg border transition-colors ${isSel ? "bg-purple-600 text-white border-purple-600" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                                >{nodeName}</button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[12px] text-muted-foreground text-center py-3 border border-border rounded-lg">카테고리를 불러오는 중...</div>
                        )}
                      </div>
                      {seg.parentIds.length > 0 && (
                        <div className="bg-muted rounded-lg px-3 py-2 text-[11px] text-muted-foreground flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                          <span>하위 카테고리 {subCount}개 중에서 {seg.from}~{seg.to}번 문항을 분류합니다</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 구간 추가 버튼 */}
                <button
                  onClick={() => {
                    const last = aiSegments[aiSegments.length - 1];
                    const nextFrom = Math.min((last?.to ?? 0) + 1, totalQ);
                    setAiSegments(prev => [...prev, { uid: String(Date.now()), parentIds: [], from: nextFrom, to: totalQ }]);
                  }}
                  className="w-full border border-dashed border-purple-400 rounded-xl py-2.5 text-[13px] text-purple-600 hover:bg-purple-50 transition-colors font-medium"
                >
                  + 구간 추가
                </button>
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
                <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => setAiModalOpen(false)}>취소</Button>
                <Button
                  className="h-9 text-[13px] px-4 bg-purple-600 hover:bg-purple-700 gap-1.5"
                  disabled={!anyReady}
                  onClick={runAiClassify}
                  data-testid="btn-ai-run"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  AI 분류 시작
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ESC close confirmation dialog */}
      {aiCloseConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-[320px] p-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[15px] font-bold">창을 닫으시겠습니까?</h3>
              <p className="text-[12px] text-muted-foreground">
                {aiCloseConfirm === "ai" && aiLoading
                  ? "AI 분류가 진행 중입니다. 닫으면 결과가 사라집니다."
                  : aiCloseConfirm === "compare"
                  ? "비교 결과가 사라지고 변경사항이 적용되지 않습니다."
                  : "창을 닫으면 작업이 취소됩니다."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-8 text-[12px] px-4" onClick={() => setAiCloseConfirm(null)}>계속하기</Button>
              <Button
                className="h-8 text-[12px] px-4 bg-red-500 hover:bg-red-600 text-white"
                onClick={() => {
                  if (aiCloseConfirm === "ai") { setAiModalOpen(false); setAiLoading(false); setAiProgress(null); }
                  if (aiCloseConfirm === "compare") setAiCompareOpen(false);
                  setAiCloseConfirm(null);
                }}
              >닫기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}