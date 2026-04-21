import { useState, useRef, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, ChevronDown, ChevronRight, Pencil, Trash2, Check, X, Copy, Eye,
  FileText, GripVertical, AlignLeft, Image as ImageIcon, Music, Video, CircleHelp,
  ScanLine, Sparkles, Upload, SquareCheck, Search,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AttachSection = "body" | "explanation";
type AttachType = "image" | "video" | "audio";

type QuestionType = "CHOICE" | "SHORT_ANSWER" | "WORD_ORDER";

export interface QuestionItem {
  id: string;
  questionType: QuestionType;
  question: string;
  body: string;
  choices: string[];
  correctAnswer: number;
  answerText: string;
  gradingCaseSensitive: boolean;
  gradingSpecialChars: boolean;
  gradingSpacing: boolean;
  gradingOr: boolean;
  explanation: string;
  tags: string[];
  shared: boolean;
  categoryId?: number;
  subjectId?: number;
  showChoiceNumbers: boolean;
  score?: number;
  bodyImages: File[];
  bodyVideos: File[];
  bodyAudios: File[];
  explanationImages: File[];
  explanationVideos: File[];
  explanationAudios: File[];
  bodyExistingMedia: { type: "image" | "audio" | "video"; name?: string; url?: string }[];
  explanationExistingMedia: { type: "image" | "audio" | "video"; name?: string; url?: string }[];
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function createEmptyQuestion(type: QuestionType = "CHOICE"): QuestionItem {
  return {
    id: generateId(),
    questionType: type,
    question: "",
    body: "",
    choices: ["", "", "", "", ""],
    correctAnswer: 1,
    answerText: "",
    gradingCaseSensitive: false,
    gradingSpecialChars: false,
    gradingSpacing: false,
    gradingOr: false,
    explanation: "",
    tags: [],
    shared: true,
    categoryId: undefined,
    subjectId: undefined,
    showChoiceNumbers: true,
    bodyImages: [],
    bodyVideos: [],
    bodyAudios: [],
    explanationImages: [],
    explanationVideos: [],
    explanationAudios: [],
    bodyExistingMedia: [],
    explanationExistingMedia: [],
  };
}

export interface WorksheetEditInitData {
  title: string;
  categoryId?: number;
  questions: QuestionItem[];
}

interface WorksheetCreateModalProps {
  open: boolean;
  onClose: () => void;
  defaultCategoryId?: string | null;
  editPaperNo?: number | null;
  initData?: WorksheetEditInitData | null;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  CHOICE: "객관식",
  SHORT_ANSWER: "주관식",
  WORD_ORDER: "어순배열",
};

const CIRCLE_NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

type AiSegment = { uid: string; parentIds: number[]; from: number; to: number };

export default function WorksheetCreateModal({ open, onClose, defaultCategoryId, editPaperNo, initData }: WorksheetCreateModalProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: categories } = useQuery<any[]>({
    queryKey: [api.questionPaperCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.questionPaperCategories.list.path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.content ?? data?.contents ?? data?.data ?? []);
    },
  });

  const { data: questionSubjects } = useQuery<any[]>({
    queryKey: [api.questionSubjects.list.path],
    queryFn: async () => {
      const res = await fetch(api.questionSubjects.list.path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.content ?? data?.data ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>(
    defaultCategoryId ? Number(defaultCategoryId) : undefined
  );
  const [items, setItems] = useState<QuestionItem[]>([createEmptyQuestion()]);
  const [selectedItemId, setSelectedItemId] = useState<string>("");

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const catDropdownRef = useRef<HTMLDivElement>(null);
  const [expandedCatNodes, setExpandedCatNodes] = useState<Set<string>>(new Set());
  const [addingCatRoot, setAddingCatRoot] = useState(false);
  const [addingCatUnder, setAddingCatUnder] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const addCatInputRef = useRef<HTMLInputElement>(null);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const editCatInputRef = useRef<HTMLInputElement>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ classifyNo: string; name: string } | null>(null);

  const [questionCatOpen, setQuestionCatOpen] = useState<string | null>(null);
  const [subjectExpanded, setSubjectExpanded] = useState<Set<number>>(new Set());
  const [qCatExpanded, setQCatExpanded] = useState<Set<string>>(new Set());
  const [bulkCatPickerExpanded, setBulkCatPickerExpanded] = useState<Set<string>>(new Set());

  const [previewOpen, setPreviewOpen] = useState(false);

  const [bulkQuestionOpen, setBulkQuestionOpen] = useState(false);
  const [bulkQuestionFrom, setBulkQuestionFrom] = useState(1);
  const [bulkQuestionTo, setBulkQuestionTo] = useState(1);

  const [bulkAnswerOpen, setBulkAnswerOpen] = useState(false);
  const [bulkAnswerValues, setBulkAnswerValues] = useState<Record<string, number>>({});
  const [bulkAnswerActiveIdx, setBulkAnswerActiveIdx] = useState(0);

  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategoryFrom, setBulkCategoryFrom] = useState(1);
  const [bulkCategoryTo, setBulkCategoryTo] = useState(1);

  const [scorePopoverOpen, setScorePopoverOpen] = useState(false);
  const [bulkScoreInput, setBulkScoreInput] = useState("");
  const [totalScoreInput, setTotalScoreInput] = useState("");
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editingScoreValue, setEditingScoreValue] = useState("");
  const scorePopoverRef = useRef<HTMLDivElement>(null);
  const [bulkCategoryMode, setBulkCategoryMode] = useState<"manual" | "csat" | "ai">("manual");
  const [bulkCategorySubjectId, setBulkCategorySubjectId] = useState<number | undefined>(undefined);
  const [bulkCatExpanded, setBulkCatExpanded] = useState<Set<number>>(new Set());
  const [bulkAiSegments, setBulkAiSegments] = useState<AiSegment[]>([{ uid: '1', parentIds: [], from: 1, to: 1 }]);
  const [bulkAiLoading, setBulkAiLoading] = useState(false);
  const [bulkAiProgress, setBulkAiProgress] = useState<{ current: number; total: number } | null>(null);
  const [singleImportText, setSingleImportText] = useState("");

  // Question picker (유사문제만들기) state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSourceId, setPickerSourceId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerDebouncedSearch, setPickerDebouncedSearch] = useState("");
  const [pickerCategoryId, setPickerCategoryId] = useState<string | null>(null);
  const [pickerPage, setPickerPage] = useState(0);
  const [pickerPaperNo, setPickerPaperNo] = useState<number | null>(null);
  const [pickerPaperDetail, setPickerPaperDetail] = useState<any | null>(null);
  const [pickerPaperLoading, setPickerPaperLoading] = useState(false);
  const [selectedPickerQNos, setSelectedPickerQNos] = useState<Set<number>>(new Set());
  const [pickerCatExpanded, setPickerCatExpanded] = useState<Set<string>>(new Set());

  // Picker: debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPickerDebouncedSearch(pickerSearch); setPickerPage(0); }, 350);
    return () => clearTimeout(t);
  }, [pickerSearch]);

  // Picker: papers list query
  const { data: pickerPapersData, isLoading: pickerPapersLoading } = useQuery<any>({
    queryKey: [api.questionPapers.list.path, pickerCategoryId, pickerPage, pickerDebouncedSearch, pickerOpen],
    queryFn: async () => {
      if (!pickerOpen) return null;
      let url = `${api.questionPapers.list.path}?page=${pickerPage}&size=10`;
      if (pickerCategoryId) url += `&classifyNo=${pickerCategoryId}`;
      if (pickerDebouncedSearch.trim()) url += `&integrateSearch=${encodeURIComponent(pickerDebouncedSearch.trim())}`;
      const res = await fetch(url);
      if (!res.ok) return { contents: [], totalPages: 0 };
      return res.json();
    },
    enabled: pickerOpen,
  });

  // Picker: load paper detail when paperNo selected
  useEffect(() => {
    if (pickerPaperNo === null) { setPickerPaperDetail(null); return; }
    setPickerPaperLoading(true);
    setPickerPaperDetail(null);
    fetch(buildUrl(api.questionPapers.detail.path, { paperNo: pickerPaperNo }))
      .then(r => r.json())
      .then(d => setPickerPaperDetail(d))
      .catch(() => setPickerPaperDetail(null))
      .finally(() => setPickerPaperLoading(false));
  }, [pickerPaperNo]);

  // AI image extract state
  const [imageExtractOpen, setImageExtractOpen] = useState(false);
  const [extractImage, setExtractImage] = useState<File | null>(null);
  const [extractLoading, setExtractLoading] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);
  const [selectedExtractIds, setSelectedExtractIds] = useState<Set<number>>(new Set());
  const [extractDragOver, setExtractDragOver] = useState(false);
  const extractFileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ itemId: string; section: AttachSection; type: AttachType } | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);
  const objectUrlCache = useRef<WeakMap<File, string>>(new WeakMap());

  const getObjectUrl = (file: File): string => {
    if (!objectUrlCache.current.has(file)) {
      objectUrlCache.current.set(file, URL.createObjectURL(file));
    }
    return objectUrlCache.current.get(file)!;
  };

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      if (initData) {
        setTitle(initData.title);
        setTitleTouched(false);
        setCategoryId(initData.categoryId);
        const qs = initData.questions.length > 0 ? initData.questions : [createEmptyQuestion()];
        setItems(qs);
        setSelectedItemId(qs[0].id);
      } else {
        const firstQ = createEmptyQuestion();
        setTitle("");
        setTitleTouched(false);
        setCategoryId(defaultCategoryId ? Number(defaultCategoryId) : undefined);
        setItems([firstQ]);
        setSelectedItemId(firstQ.id);
      }
      setCategoryDropdownOpen(false);
      setPreviewOpen(false);
      setSingleImportText("");
      setQuestionCatOpen(null);
      setBulkQuestionOpen(false);
      setBulkAnswerOpen(false);
      setBulkCategoryOpen(false);
      setCancelConfirmOpen(false);
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open, defaultCategoryId, initData]);

  useEffect(() => {
    if (open && modalRef.current) modalRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (imageExtractOpen) { setImageExtractOpen(false); setExtractImage(null); setExtractedQuestions([]); return; }
      if (bulkAnswerOpen) { setBulkAnswerOpen(false); return; }
      if (bulkQuestionOpen) { setBulkQuestionOpen(false); return; }
      if (bulkCategoryOpen) { setBulkCategoryOpen(false); return; }
      if (!cancelConfirmOpen) setCancelConfirmOpen(true);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, imageExtractOpen, bulkAnswerOpen, bulkQuestionOpen, bulkCategoryOpen, cancelConfirmOpen]);

  useEffect(() => {
    if (addingCatRoot || addingCatUnder) addCatInputRef.current?.focus();
  }, [addingCatRoot, addingCatUnder]);

  useEffect(() => {
    if (editingCat) editCatInputRef.current?.focus();
  }, [editingCat]);

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node))
        setCategoryDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [categoryDropdownOpen]);

  useEffect(() => {
    if (!categoryDropdownOpen || !categoryId || !categories?.length) return;
    const target = Number(categoryId);
    const ancestorIds = new Set<string>();
    const findAncestors = (nodes: any[], ancestors: string[]): boolean => {
      for (const node of nodes) {
        if (Number(node.classifyNo) === target) {
          ancestors.forEach(id => ancestorIds.add(id));
          return true;
        }
        if (node.children?.length) {
          if (findAncestors(node.children, [...ancestors, String(node.classifyNo)])) return true;
        }
      }
      return false;
    };
    findAncestors(categories, []);
    if (ancestorIds.size > 0) {
      setExpandedCatNodes(prev => new Set([...prev, ...ancestorIds]));
    }
  }, [categoryDropdownOpen, categoryId, categories]);

  const bulkAnswerActiveIdxRef = useRef(bulkAnswerActiveIdx);
  useEffect(() => { bulkAnswerActiveIdxRef.current = bulkAnswerActiveIdx; }, [bulkAnswerActiveIdx]);

  useEffect(() => {
    if (!bulkAnswerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const num = parseInt(e.key);
      const activeItem = items[bulkAnswerActiveIdxRef.current];
      if (!activeItem) return;
      const isLastItem = bulkAnswerActiveIdxRef.current === items.length - 1;
      if (num >= 1 && num <= 9 && activeItem.questionType === "CHOICE" && num <= activeItem.choices.length) {
        e.preventDefault();
        setBulkAnswerValues(prev => ({ ...prev, [activeItem.id]: num }));
        if (!isLastItem) setBulkAnswerActiveIdx(prev => prev + 1);
      }
      if (e.key === "ArrowDown") { e.preventDefault(); setBulkAnswerActiveIdx(prev => Math.min(prev + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setBulkAnswerActiveIdx(prev => Math.max(prev - 1, 0)); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [bulkAnswerOpen, items]);

  useEffect(() => {
    if (!bulkAnswerOpen) return;
    const el = document.getElementById(`bulk-row-${bulkAnswerActiveIdx}`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [bulkAnswerActiveIdx, bulkAnswerOpen]);

  useEffect(() => {
    if (defaultCategoryId && categories?.length && !titleTouched && !title.trim()) {
      const parts = getCategoryPathParts(Number(defaultCategoryId));
      const label = parts.slice(0, 2).join(" ");
      if (label) setTitle(label);
    }
  }, [categories, defaultCategoryId]);

  const getCategoryPathParts = (classifyNo: number | string): string[] => {
    const target = Number(classifyNo);
    const findPath = (nodes: any[], path: string[]): string[] | null => {
      for (const node of nodes) {
        const currentPath = [...path, node.name];
        if (Number(node.classifyNo) === target) return currentPath;
        if (node.children?.length) {
          const found = findPath(node.children, currentPath);
          if (found) return found;
        }
      }
      return null;
    };
    return findPath(categories || [], []) || [];
  };

  const getCategoryPath = (classifyNo: number | string): string =>
    getCategoryPathParts(classifyNo).join(" > ");

  const getSubjectName = (subjectId: number): string => {
    const s = (questionSubjects || []).find(
      (s: any) => (s.subjectNo ?? s.no ?? s.id ?? s.subjectId) === subjectId
    );
    return s ? (s.subjectName ?? s.name ?? s.title ?? String(subjectId)) : String(subjectId);
  };

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

  const buildSubjectPathMap = (nodes: any[], prefix = ""): Map<number, string> => {
    const map = new Map<number, string>();
    for (const node of nodes) {
      const id = node.subjectNo ?? node.no ?? node.id ?? node.subjectId;
      const name = node.subjectName ?? node.name ?? node.title ?? String(id);
      const full = prefix ? `${prefix} > ${name}` : name;
      map.set(id, full);
      if (node._children?.length) buildSubjectPathMap(node._children, full).forEach((v, k) => map.set(k, v));
    }
    return map;
  };

  const renderSubjectNode = (node: any, selectedId: number | undefined, onSelect: (id: number) => void, depth = 0): JSX.Element => {
    const nodeId = node.subjectNo ?? node.no ?? node.id ?? node.subjectId;
    const nodeName = node.subjectName ?? node.name ?? node.title ?? String(nodeId);
    const hasChildren = node._children && node._children.length > 0;
    const isExpanded = subjectExpanded.has(nodeId);
    const isSelected = selectedId === nodeId;
    return (
      <div key={nodeId}>
        <div
          className={`flex items-center gap-1 pr-2 py-[5px] rounded text-[11px] mb-0.5 transition-colors ${isSelected ? "bg-blue-600 text-white" : hasChildren ? "text-gray-700 hover:bg-gray-100 font-medium" : "text-gray-600 hover:bg-blue-50"}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <span
            className="shrink-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setSubjectExpanded(prev => { const next = new Set(prev); next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId); return next; });
            }}
          >
            {hasChildren ? (
              <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            ) : (
              <span className="w-3 h-3 block" />
            )}
          </span>
          <span className="truncate cursor-pointer flex-1" onClick={() => onSelect(nodeId)}>{nodeName}</span>
        </div>
        {hasChildren && isExpanded &&
          node._children.map((child: any) => renderSubjectNode(child, selectedId, onSelect, depth + 1))
        }
      </div>
    );
  };

  const renderBulkSubjectNode = (node: any, selectedId: number | undefined, onSelect: (id: number) => void, depth = 0): JSX.Element => {
    const nodeId = node.subjectNo ?? node.no ?? node.id ?? node.subjectId;
    const nodeName = node.subjectName ?? node.name ?? node.title ?? String(nodeId);
    const hasChildren = node._children && node._children.length > 0;
    const isExpanded = bulkCatExpanded.has(nodeId);
    const isSelected = selectedId === nodeId;
    return (
      <div key={nodeId}>
        <div
          className={`flex items-center gap-1 pr-2 py-[5px] rounded text-[12px] mb-0.5 transition-colors ${isSelected ? "bg-blue-600 text-white" : hasChildren ? "text-gray-700 hover:bg-gray-100 font-medium" : "text-gray-600 hover:bg-blue-50"}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <span
            className="shrink-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setBulkCatExpanded(prev => { const next = new Set(prev); next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId); return next; });
            }}
          >
            {hasChildren ? (
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            ) : (
              <span className="w-3.5 h-3.5 block" />
            )}
          </span>
          <span className="truncate cursor-pointer flex-1" onClick={() => onSelect(nodeId)}>{nodeName}</span>
        </div>
        {hasChildren && isExpanded &&
          node._children.map((child: any) => renderBulkSubjectNode(child, selectedId, onSelect, depth + 1))
        }
      </div>
    );
  };

  const renderCatSelectNode = (cat: any, selectedId: number | undefined, onSelect: (id: number) => void, expanded: Set<string>, setExpanded: (fn: (prev: Set<string>) => Set<string>) => void, depth = 0): JSX.Element => {
    const catId = Number(cat.classifyNo);
    const catName = cat.name ?? String(catId);
    const hasChildren = cat.children && cat.children.length > 0;
    const isExpandedNode = expanded.has(String(catId));
    const isSelected = selectedId === catId;
    return (
      <div key={catId}>
        <div
          className={`flex items-center gap-1 pr-2 py-[5px] rounded text-[11px] mb-0.5 transition-colors ${isSelected ? "bg-blue-600 text-white" : hasChildren ? "text-gray-700 hover:bg-gray-100 font-medium" : "text-gray-600 hover:bg-blue-50"}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <span
            className="shrink-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setExpanded(prev => { const next = new Set(prev); next.has(String(catId)) ? next.delete(String(catId)) : next.add(String(catId)); return next; });
            }}
          >
            {hasChildren ? (
              <ChevronRight className={`w-3 h-3 transition-transform ${isExpandedNode ? "rotate-90" : ""}`} />
            ) : (
              <span className="w-3 h-3 block" />
            )}
          </span>
          <span className="truncate cursor-pointer flex-1" onClick={() => onSelect(catId)}>{catName}</span>
        </div>
        {hasChildren && isExpandedNode &&
          cat.children.map((child: any) => renderCatSelectNode(child, selectedId, onSelect, expanded, setExpanded, depth + 1))
        }
      </div>
    );
  };

  const handleCategorySelect = (cat: any) => {
    setCategoryId(cat.classifyNo);
    if (!titleTouched && !title.trim()) {
      const parts = getCategoryPathParts(cat.classifyNo);
      setTitle(parts.slice(0, 2).join(" ") || cat.name || "");
    }
    setCategoryDropdownOpen(false);
  };

  const toggleCatExpand = (id: string) => {
    setExpandedCatNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const currentItem = items.find(i => i.id === selectedItemId) || items[0];
  const currentIdx = items.findIndex(i => i.id === currentItem?.id);

  const updateItem = (id: string, updates: Partial<QuestionItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const newItems = prev.filter(item => item.id !== id);
      if (selectedItemId === id) setSelectedItemId(newItems[0]?.id || "");
      return newItems;
    });
    setDeleteItemId(null);
  };

  const addItem = (type: QuestionType = "CHOICE") => {
    const newQ = createEmptyQuestion(type);
    setItems(prev => [...prev, newQ]);
    setSelectedItemId(newQ.id);
  };

  const duplicateItem = (id: string) => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      if (idx === -1) return prev;
      const copy = { ...prev[idx], id: generateId() };
      const newItems = [...prev];
      newItems.splice(idx + 1, 0, copy);
      setSelectedItemId(copy.id);
      return newItems;
    });
  };

  const moveItem = (id: string, direction: "up" | "down") => {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const newItems = [...prev];
      [newItems[idx], newItems[targetIdx]] = [newItems[targetIdx], newItems[idx]];
      return newItems;
    });
  };

  const updateChoice = (itemId: string, choiceIdx: number, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newChoices = [...item.choices];
      newChoices[choiceIdx] = value;
      return { ...item, choices: newChoices };
    }));
  };

  const addChoice = (itemId: string) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, choices: [...item.choices, ""] } : item
    ));
  };

  const removeChoice = (itemId: string, choiceIdx: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      if (item.choices.length <= 2) return item;
      const newChoices = item.choices.filter((_, i) => i !== choiceIdx);
      let newCorrect = item.correctAnswer;
      if (choiceIdx + 1 === item.correctAnswer) newCorrect = 1;
      else if (choiceIdx + 1 < item.correctAnswer) newCorrect = item.correctAnswer - 1;
      return { ...item, choices: newChoices, correctAnswer: Math.min(newCorrect, newChoices.length) };
    }));
  };

  const applyRange = (field: keyof QuestionItem, value: any, from: number, to: number) => {
    if (from > to) {
      toast({ title: "범위 오류", description: "시작 번호가 끝 번호보다 클 수 없습니다.", variant: "destructive" });
      return;
    }
    setItems(prev => prev.map((item, idx) => {
      const num = idx + 1;
      if (num >= from && num <= to) return { ...item, [field]: value };
      return item;
    }));
    toast({ title: "일괄 적용", description: `${from}번~${to}번 문항에 적용되었습니다.` });
  };

  const ATTACH_FIELD_MAP: Record<AttachSection, Record<AttachType, keyof QuestionItem>> = {
    body: { image: "bodyImages", video: "bodyVideos", audio: "bodyAudios" },
    explanation: { image: "explanationImages", video: "explanationVideos", audio: "explanationAudios" },
  };

  const appendFiles = useCallback((itemId: string, section: AttachSection, type: AttachType, files: File[]) => {
    const field = ATTACH_FIELD_MAP[section][type];
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, [field]: [...(item[field] as File[]), ...files] };
    }));
  }, []);

  const removeAttachedFile = useCallback((itemId: string, section: AttachSection, type: AttachType, idx: number) => {
    const field = ATTACH_FIELD_MAP[section][type];
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const arr = [...(item[field] as File[])];
      arr.splice(idx, 1);
      return { ...item, [field]: arr };
    }));
  }, []);

  const openFilePicker = (itemId: string, section: AttachSection, type: AttachType) => {
    setUploadTarget({ itemId, section, type });
    const acceptMap: Record<AttachType, string> = { image: "image/*", video: "video/*", audio: "audio/*" };
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptMap[type];
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadTarget || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    appendFiles(uploadTarget.itemId, uploadTarget.section, uploadTarget.type, files);
    setUploadTarget(null);
  };

  const handleSectionDrop = (e: React.DragEvent, itemId: string, section: AttachSection) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSection(null);
    const files = Array.from(e.dataTransfer.files);
    const imgs = files.filter(f => f.type.startsWith("image/"));
    const vids = files.filter(f => f.type.startsWith("video/"));
    const auds = files.filter(f => f.type.startsWith("audio/"));
    if (imgs.length) appendFiles(itemId, section, "image", imgs);
    if (vids.length) appendFiles(itemId, section, "video", vids);
    if (auds.length) appendFiles(itemId, section, "audio", auds);
  };

  const parseSingleQuestionText = (text: string) => {
    if (!currentItem) return;
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;

    const choicePatterns = [/^[①②③④⑤⑥⑦⑧⑨⑩]/, /^\([1-9]\)/, /^[1-9]\.\s/];
    const isChoiceLine = (line: string) => choicePatterns.some(p => p.test(line));
    const isExplanationLine = (line: string) => /^해설/.test(line);
    const isAnswerLine = (line: string) => /^정답/.test(line);

    const choiceIndices = lines.map((l, i) => isChoiceLine(l) ? i : -1).filter(i => i >= 0);
    const firstChoiceIdx = choiceIndices[0] ?? lines.length;
    const lastChoiceIdx = choiceIndices[choiceIndices.length - 1] ?? -1;
    const explanationIndex = lines.findIndex(isExplanationLine);

    const questionLine = lines[0] || "";
    const bodyLines = lines.slice(1, firstChoiceIdx).filter(l => !isChoiceLine(l) && !isExplanationLine(l) && !isAnswerLine(l));
    const choiceLines = choiceIndices.map(i => lines[i].replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").replace(/^\([1-9]\)\s*/, "").replace(/^[1-9]\.\s*/, "").trim());
    const expStart = explanationIndex !== -1 ? explanationIndex : (lastChoiceIdx !== -1 ? lastChoiceIdx + 1 : -1);
    const explanationText = expStart !== -1
      ? lines.slice(expStart).filter(l => !isChoiceLine(l) && !isAnswerLine(l)).join(" ").replace(/^해설[:：]?\s*/, "")
      : "";

    const parseAnswerNumber = (ansLine: string): number | null => {
      const ansText = ansLine.replace(/^정답\s*[:：]?\s*/, "").trim();
      const circledMap: Record<string, number> = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10 };
      for (const [char, num] of Object.entries(circledMap)) {
        if (ansText.includes(char)) return num;
      }
      const parenMatch = ansText.match(/^\((\d+)\)/);
      if (parenMatch) return parseInt(parenMatch[1]);
      const numMatch = ansText.match(/^(\d+)/);
      if (numMatch) return parseInt(numMatch[1]);
      return null;
    };

    const updates: Partial<QuestionItem> = {
      question: questionLine,
      body: bodyLines.join("\n"),
      explanation: explanationText,
    };

    if (currentItem.questionType === "CHOICE" && choiceLines.length > 0) {
      const paddedChoices = [...choiceLines];
      while (paddedChoices.length < 2) paddedChoices.push("");
      updates.choices = paddedChoices;
      const ansLine = lines.find(isAnswerLine);
      if (ansLine) {
        const num = parseAnswerNumber(ansLine);
        if (num !== null && num >= 1 && num <= paddedChoices.length) {
          updates.correctAnswer = num;
        }
      }
    } else if (currentItem.questionType !== "CHOICE") {
      const ansLine = lines.find(isAnswerLine);
      if (ansLine) updates.answerText = ansLine.replace(/^정답[:：]?\s*/, "");
    }

    updateItem(currentItem.id, updates);
    setSingleImportText("");
    toast({ title: "입력 완료", description: "선택된 문항에 내용이 입력되었습니다." });
  };

  const handleClose = () => {
    setCancelConfirmOpen(true);
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (addingCatRoot) createCategoryMutation.mutate({ name: newCatName.trim() });
    else if (addingCatUnder) createCategoryMutation.mutate({ name: newCatName.trim(), parentNo: Number(addingCatUnder) });
  };

  const handleRenameCat = () => {
    if (!editCatName.trim() || !editingCat) return;
    updateCategoryMutation.mutate({ classifyNo: editingCat, name: editCatName.trim() });
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (body: { name: string; parentNo?: number }) => {
      const res = await apiRequest("POST", api.questionPaperCategories.create.path, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.questionPaperCategories.list.path] });
      setNewCatName(""); setAddingCatRoot(false); setAddingCatUnder(null);
    },
    onError: (err: any) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ classifyNo, name }: { classifyNo: string; name: string }) => {
      const res = await apiRequest("PUT", buildUrl(api.questionPaperCategories.update.path, { classifyNo }), { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.questionPaperCategories.list.path] });
      setEditingCat(null); setEditCatName("");
    },
    onError: (err: any) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (classifyNo: string) => {
      const res = await apiRequest("DELETE", buildUrl(api.questionPaperCategories.delete.path, { classifyNo }));
      return res.json();
    },
    onSuccess: (_data, classifyNo) => {
      queryClient.invalidateQueries({ queryKey: [api.questionPaperCategories.list.path] });
      if (categoryId === Number(classifyNo)) setCategoryId(undefined);
      setDeleteCatTarget(null);
    },
    onError: (err: any) => { toast({ title: "오류", description: err.message, variant: "destructive" }); setDeleteCatTarget(null); },
  });

  const createWorksheet = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("제목을 입력해주세요.");
      const validItems = items.filter(item => item.question.trim());
      if (validItems.length === 0) throw new Error("최소 1개 이상의 문항에 질문을 입력해주세요.");
      for (const item of validItems) {
        if (item.questionType === "CHOICE") {
          const filteredChoices = item.choices.filter((c) => c.trim());
          if (filteredChoices.length < 2) {
            throw new Error("객관식 문항은 최소 2개 이상의 선택지를 입력해주세요.");
          }
          if (item.correctAnswer < 1 || item.correctAnswer > item.choices.length) {
            throw new Error("객관식 정답 번호가 올바르지 않습니다.");
          }
        } else if (!item.answerText.trim()) {
          throw new Error("주관식/어순배열 문항은 정답 텍스트를 입력해주세요.");
        }
      }
      const payload = {
        title: title.trim(),
        categoryId,
        questions: validItems.map(item => {
          const filteredChoices = item.questionType === "CHOICE" ? item.choices.filter(c => c.trim()) : undefined;
          let remappedCorrectAnswer: number | undefined = undefined;
          if (item.questionType === "CHOICE" && filteredChoices) {
            const originalChoice = item.choices[item.correctAnswer - 1];
            const newIdx = originalChoice?.trim() ? filteredChoices.indexOf(originalChoice) : -1;
            remappedCorrectAnswer = newIdx >= 0 ? newIdx + 1 : 1;
          }
          return ({
            questionType: item.questionType === "WORD_ORDER" ? "SHORT_ANSWER" : item.questionType,
            question: item.question.trim(),
            body: item.body.trim() || undefined,
            choices: filteredChoices,
            correctAnswer: remappedCorrectAnswer,
            answerText: item.questionType !== "CHOICE" ? item.answerText.trim() || undefined : undefined,
            gradingCaseSensitive: item.questionType !== "CHOICE" ? item.gradingCaseSensitive : undefined,
            gradingSpecialChars: item.questionType !== "CHOICE" ? item.gradingSpecialChars : undefined,
            gradingSpacing: item.questionType !== "CHOICE" ? item.gradingSpacing : undefined,
            gradingOr: item.questionType !== "CHOICE" ? item.gradingOr : undefined,
            explanation: item.explanation.trim() || undefined,
            tags: item.tags.length > 0 ? item.tags : undefined,
            categoryId: item.subjectId || item.categoryId || undefined,
            score: item.score ?? 1,
          });
        }),
      };
      const res = editPaperNo
        ? await apiRequest("PUT", buildUrl(api.questionPapers.update.path, { paperNo: editPaperNo }), payload)
        : await apiRequest("POST", api.questionPaperCreate.create.path, payload);
      return res.json();
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [api.questionPapers.list.path] });
      toast({ title: "성공", description: editPaperNo ? "학습지가 수정되었습니다." : "학습지가 생성되었습니다." });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const renderCatAddInput = (parentNo?: string) => (
    <div className={`flex items-center gap-1 px-2 py-1 ${parentNo ? "ml-4" : ""}`}>
      <input
        ref={addCatInputRef}
        value={newCatName}
        onChange={(e) => setNewCatName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleAddCategory();
          if (e.key === "Escape") { setAddingCatUnder(null); setAddingCatRoot(false); setNewCatName(""); }
        }}
        placeholder="카테고리 이름"
        className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-[12px] text-gray-900 outline-none focus:border-blue-500"
      />
      <button onClick={handleAddCategory} disabled={createCategoryMutation.isPending} className="shrink-0 p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-50"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => { setAddingCatUnder(null); setAddingCatRoot(false); setNewCatName(""); }} className="shrink-0 p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
    </div>
  );

  const renderCategoryTree = (nodes: any[], depth = 0): any => {
    if (depth >= 4 || !nodes?.length) return null;
    return (
      <div className={depth > 0 ? "ml-4" : ""}>
        {nodes.map((cat: any) => {
          const hasChildren = cat.children && cat.children.length > 0;
          const isExpanded = expandedCatNodes.has(String(cat.classifyNo));
          const isSelected = categoryId !== undefined && Number(categoryId) === Number(cat.classifyNo);
          const canAddChild = depth < 3;
          const isEditing = editingCat === String(cat.classifyNo);
          return (
            <div key={cat.classifyNo}>
              <div
                className={`group w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 cursor-pointer ${isSelected ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
                onClick={() => handleCategorySelect(cat)}
              >
                <span
                  className="shrink-0 w-4 flex justify-center"
                  onClick={(e) => { if (hasChildren) { e.stopPropagation(); toggleCatExpand(String(cat.classifyNo)); } }}
                >
                  {hasChildren
                    ? (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)
                    : <ChevronRight className="w-3 h-3 opacity-0" />}
                </span>
                {isEditing ? (
                  <input
                    ref={editCatInputRef}
                    value={editCatName}
                    onChange={(e) => setEditCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameCat(); if (e.key === "Escape") { setEditingCat(null); setEditCatName(""); } }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] text-gray-900 outline-none focus:border-blue-500"
                  />
                ) : <span className="truncate flex-1">{cat.name}</span>}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isEditing ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleRenameCat(); }} className="p-0.5 text-emerald-600 hover:text-emerald-500"><Check className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingCat(null); setEditCatName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                    </>
                  ) : (
                    <>
                      {canAddChild && <button onClick={(e) => { e.stopPropagation(); setAddingCatUnder(String(cat.classifyNo)); setAddingCatRoot(false); setNewCatName(""); if (!isExpanded) toggleCatExpand(String(cat.classifyNo)); }} className={`p-0.5 ${isSelected ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-gray-600"}`}><Plus className="w-3 h-3" /></button>}
                      <button onClick={(e) => { e.stopPropagation(); setEditingCat(String(cat.classifyNo)); setEditCatName(cat.name); }} className={`p-0.5 ${isSelected ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-gray-600"}`}><Pencil className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteCatTarget({ classifyNo: String(cat.classifyNo), name: cat.name }); }} className={`p-0.5 ${isSelected ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-red-500"}`}><Trash2 className="w-3 h-3" /></button>
                    </>
                  )}
                </div>
              </div>
              {hasChildren && isExpanded && renderCategoryTree(cat.children, depth + 1)}
              {addingCatUnder === String(cat.classifyNo) && renderCatAddInput(String(cat.classifyNo))}
            </div>
          );
        })}
      </div>
    );
  };

  const removeExistingMedia = (itemId: string, section: AttachSection, idx: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      if (section === "body") {
        const next = [...item.bodyExistingMedia];
        next.splice(idx, 1);
        return { ...item, bodyExistingMedia: next };
      } else {
        const next = [...item.explanationExistingMedia];
        next.splice(idx, 1);
        return { ...item, explanationExistingMedia: next };
      }
    }));
  };

  const renderAttachZone = (itemId: string, section: AttachSection) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return null;
    const sectionKey = `${itemId}-${section}`;
    const isDragOver = dragOverSection === sectionKey;
    const images = section === "body" ? item.bodyImages : item.explanationImages;
    const videos = section === "body" ? item.bodyVideos : item.explanationVideos;
    const audios = section === "body" ? item.bodyAudios : item.explanationAudios;
    const existingMedia = section === "body" ? item.bodyExistingMedia : item.explanationExistingMedia;
    const hasFiles = images.length > 0 || videos.length > 0 || audios.length > 0 || existingMedia.length > 0;

    return (
      <div
        className={`mt-2 rounded-lg transition-all ${isDragOver ? "ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-950/30" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOverSection(sectionKey); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOverSection(sectionKey); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSection(null); }}
        onDrop={(e) => handleSectionDrop(e, itemId, section)}
      >
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openFilePicker(itemId, section, "image")}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 border border-border rounded hover:bg-muted hover:text-foreground transition-colors"
            data-testid={`btn-attach-image-${section}-${itemId}`}
          >
            <ImageIcon className="w-2.5 h-2.5" />이미지 첨부
          </button>
          <button
            onClick={() => openFilePicker(itemId, section, "video")}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 border border-border rounded hover:bg-muted hover:text-foreground transition-colors"
            data-testid={`btn-attach-video-${section}-${itemId}`}
          >
            <Video className="w-2.5 h-2.5" />영상 첨부
          </button>
          <button
            onClick={() => openFilePicker(itemId, section, "audio")}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 border border-border rounded hover:bg-muted hover:text-foreground transition-colors"
            data-testid={`btn-attach-audio-${section}-${itemId}`}
          >
            <Music className="w-2.5 h-2.5" />음원 첨부
          </button>
          {isDragOver && (
            <span className="text-[10px] text-blue-500 font-medium animate-pulse">파일을 놓으세요...</span>
          )}
        </div>

        {hasFiles && (
          <div className="mt-2 space-y-2">
            {existingMedia.map((m, idx) => {
              const Icon = m.type === "audio" ? Music : m.type === "video" ? Video : ImageIcon;
              const colorClass = m.type === "audio" ? "text-purple-500" : m.type === "video" ? "text-blue-500" : "text-green-500";
              const label = m.type === "audio" ? "음원" : m.type === "video" ? "영상" : "이미지";
              return (
                <div key={idx} className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded text-[11px] text-foreground">
                  <Icon className={`w-3 h-3 ${colorClass} shrink-0`} />
                  <span className="text-amber-700 font-medium shrink-0">{label} 등록됨</span>
                  {m.name && <span className="truncate flex-1 text-muted-foreground">{m.name}</span>}
                  <button
                    onClick={() => removeExistingMedia(itemId, section, idx)}
                    className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0"
                    data-testid={`btn-remove-existing-${section}-${idx}`}
                    title="삭제"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {images.map((file, idx) => {
                  const url = getObjectUrl(file);
                  return (
                    <div key={idx} className="relative group w-16 h-16 shrink-0">
                      <img src={url} alt={file.name} className="w-full h-full object-cover rounded border border-border" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded transition-opacity flex items-center justify-center">
                        <button
                          onClick={() => removeAttachedFile(itemId, section, "image", idx)}
                          className="p-0.5 bg-white/90 text-red-600 rounded"
                          data-testid={`btn-remove-image-${section}-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {videos.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted/60 border border-border px-2.5 py-1.5 rounded text-[11px] text-foreground">
                <Video className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-[9px] text-muted-foreground shrink-0">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={() => removeAttachedFile(itemId, section, "video", idx)} className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0" data-testid={`btn-remove-video-${section}-${idx}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {audios.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted/60 border border-border px-2.5 py-1.5 rounded text-[11px] text-foreground">
                <Music className="w-3 h-3 text-purple-500 shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-[9px] text-muted-foreground shrink-0">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={() => removeAttachedFile(itemId, section, "audio", idx)} className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0" data-testid={`btn-remove-audio-${section}-${idx}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!hasFiles && (
          <p className="text-[9px] text-muted-foreground/50 mt-1.5">파일을 드래그하거나 버튼을 클릭해 첨부하세요</p>
        )}
      </div>
    );
  };

  // Picker: normalize question object (same pattern as WorksheetHome)
  const pickerNormalizeQ = (q: any): any => {
    if (q.question && typeof q.question === "object" && q.question.questionNo) return q.question;
    return q;
  };
  const pickerGetText = (q: any): { question: string; body: string } => {
    const inner = pickerNormalizeQ(q);
    const bodyParts: any[] = Array.isArray(inner.body || inner.questionBody) ? (inner.body || inner.questionBody) : [];
    const queryPart = bodyParts.find((b: any) => b.type === "QUERY");
    const stripHtml = (s: any): string => typeof s === "string" ? s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim() : "";
    const isFileRef = (b: any): boolean => {
      if (b?.file) return true;
      if (typeof b?.contents === "string" && /^File:.+\.[a-z0-9]{2,5}$/i.test(b.contents.trim())) return true;
      return false;
    };
    const textExamplePart = bodyParts.find((b: any) => b.type === "EXAMPLE" && !isFileRef(b));
    return {
      question: stripHtml(queryPart?.contents) || stripHtml(typeof inner.question === "string" ? inner.question : ""),
      body: stripHtml(textExamplePart?.contents),
    };
  };
  const pickerGetQNo = (q: any): number => pickerNormalizeQ(q).questionNo;

  const pickerDetailQuestions: any[] = (() => {
    if (!pickerPaperDetail) return [];
    if (Array.isArray(pickerPaperDetail.questions)) return pickerPaperDetail.questions;
    if (Array.isArray(pickerPaperDetail.shadowings)) return pickerPaperDetail.shadowings;
    return [];
  })();

  const handleImportPicker = () => {
    const sourceIdx = items.findIndex(i => i.id === pickerSourceId);
    const toImport = pickerDetailQuestions.filter(q => selectedPickerQNos.has(pickerGetQNo(q)));
    const stripHtmlLocal = (s: any): string => typeof s === "string" ? s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim() : "";
    const newItems: QuestionItem[] = toImport.map((rawQ: any) => {
      const inner = pickerNormalizeQ(rawQ);
      const { question, body } = pickerGetText(rawQ);

      // Question type from answerType field
      const answerTypeId = (inner.answerType?.id || rawQ.answerType?.id || "").toUpperCase();
      const qType: QuestionType =
        answerTypeId === "SUBJECTIVE" ? "SHORT_ANSWER" :
        answerTypeId === "OBJECTIVE" ? "CHOICE" :
        (inner.questionType === "SHORT_ANSWER" ? "SHORT_ANSWER" :
         inner.questionType === "WORD_ORDER" ? "WORD_ORDER" : "CHOICE");

      // Choices from body[] type="CHOICE" items, sorted by ordering
      const bodyParts: any[] = Array.isArray(inner.body) ? inner.body : [];
      const choiceBodyItems = bodyParts
        .filter((b: any) => b.type === "CHOICE")
        .sort((a: any, b: any) => a.ordering - b.ordering);
      const choiceTexts = choiceBodyItems.map((c: any) => stripHtmlLocal(c?.contents ?? ""));

      // Correct answer from correctForms[0].corrects[0] (ordering value → 1-based index)
      let correctAnswer = 1;
      const correctFormsArr = inner.correctForms || rawQ.correctForms;
      const correctFormOrdering = correctFormsArr?.[0]?.corrects?.[0];
      if (correctFormOrdering !== undefined && correctFormOrdering !== null) {
        const targetOrdering = parseInt(String(correctFormOrdering), 10);
        if (!isNaN(targetOrdering)) {
          const idx = choiceBodyItems.findIndex((c: any) => c.ordering === targetOrdering);
          if (idx >= 0) correctAnswer = idx + 1;
          else if (targetOrdering >= 1 && targetOrdering <= choiceTexts.length) correctAnswer = targetOrdering;
        }
      } else {
        const rawAnswer = inner.answer ?? rawQ.answer ?? inner.correctAnswer ?? rawQ.correctAnswer;
        if (rawAnswer !== undefined && rawAnswer !== null) {
          const parsed = parseInt(String(rawAnswer), 10);
          if (!isNaN(parsed) && parsed >= 1) correctAnswer = parsed;
        }
      }

      const choices = qType === "CHOICE" && choiceTexts.length > 0
        ? (choiceTexts.length >= 5 ? choiceTexts.slice(0, 5) : [...choiceTexts, ...Array(5 - choiceTexts.length).fill("")])
        : ["", "", "", "", ""];

      const detectFileRef2 = (b: any): { type: "image" | "audio" | "video"; name: string; url?: string } | null => {
        if (!b) return null;
        if (b.file) {
          const fn = b.file.originalName || b.file.name || b.file.fileName || "";
          const ext = fn.split(".").pop()?.toLowerCase() || "";
          const t = ["mp3","wav","ogg","m4a","aac","flac"].includes(ext) ? "audio"
                  : ["mp4","mov","avi","webm","mkv"].includes(ext) ? "video"
                  : ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext) ? "image" : null;
          if (t) return { type: t as "image"|"audio"|"video", name: fn, url: b.file.url || b.file.downloadUrl };
        }
        if (typeof b.contents === "string") {
          const m = b.contents.match(/^File:(.+)$/i);
          if (m) {
            const fn = m[1].trim();
            const ext = fn.split(".").pop()?.toLowerCase() || "";
            const t = ["mp3","wav","ogg","m4a","aac","flac"].includes(ext) ? "audio"
                    : ["mp4","mov","avi","webm","mkv"].includes(ext) ? "video"
                    : ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext) ? "image" : null;
            if (t) return { type: t as "image"|"audio"|"video", name: fn };
          }
        }
        return null;
      };
      const toMediaType2 = (t: string): "image" | "audio" | "video" | null =>
        t === "IMAGE" ? "image" : t === "AUDIO" ? "audio" : t === "VIDEO" ? "video" : null;
      const fileExampleParts2 = bodyParts.filter((b: any) => b.type === "EXAMPLE" && !!detectFileRef2(b));
      const bodyExistingMedia: { type: "image"|"audio"|"video"; name?: string; url?: string }[] = [
        ...bodyParts
          .filter((b: any) => toMediaType2(b.type))
          .map((b: any) => ({
            type: toMediaType2(b.type)!,
            name: b.file?.originalName || b.file?.name || b.file?.fileName || b.contents || undefined,
            url: b.file?.url || b.file?.downloadUrl || undefined,
          })),
        ...fileExampleParts2.map((b: any) => detectFileRef2(b)!),
      ];

      return {
        ...createEmptyQuestion(qType),
        question,
        body,
        choices,
        correctAnswer,
        answerText: "",
        bodyExistingMedia,
      };
    });
    if (newItems.length === 0) return;
    setItems(prev => {
      const next = [...prev];
      next.splice(Math.max(sourceIdx + 1, 0), 0, ...newItems);
      return next;
    });
    setSelectedItemId(newItems[0].id);
    setPickerOpen(false);
    setPickerPaperNo(null);
    setPickerPaperDetail(null);
    setSelectedPickerQNos(new Set());
    toast({ title: `문제 ${newItems.length}개 복사됨`, description: "내용을 편집하여 커스텀해보세요." });
  };

  const handleExtractFromImage = async () => {
    if (!extractImage) return;
    setExtractLoading(true);
    setExtractedQuestions([]);
    setSelectedExtractIds(new Set());
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(extractImage);
      });
      const res = await fetch(api.ai.extractQuestions.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: extractImage.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "추출 실패");
      const qs = Array.isArray(data.questions) ? data.questions : [];
      setExtractedQuestions(qs);
      setSelectedExtractIds(new Set(qs.map((_: any, i: number) => i)));
      if (qs.length === 0) toast({ title: "문제를 찾지 못했습니다", description: "이미지에서 시험 문제를 인식하지 못했습니다." });
    } catch (err: any) {
      toast({ title: "오류", description: err.message || "이미지 분석 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setExtractLoading(false);
    }
  };

  const handleImportExtracted = () => {
    const toImport = extractedQuestions.filter((_: any, i: number) => selectedExtractIds.has(i));
    const newItems: QuestionItem[] = toImport.map((q: any) => {
      const type: QuestionType = q.type === "SHORT_ANSWER" ? "SHORT_ANSWER" : "CHOICE";
      const choices: string[] = Array.isArray(q.choices) && q.choices.length > 0
        ? q.choices
        : ["", "", "", "", ""];
      return {
        ...createEmptyQuestion(),
        questionType: type,
        question: q.question || "",
        body: q.body || "",
        choices: type === "CHOICE" ? choices : ["", "", "", "", ""],
        correctAnswer: typeof q.answer === "number" ? q.answer : 0,
        answerText: "",
        explanation: q.explanation || "",
      };
    });
    if (newItems.length === 0) return;
    setItems(prev => {
      const hasBlank = prev.length === 1 && !prev[0].question.trim();
      return hasBlank ? newItems : [...prev, ...newItems];
    });
    if (newItems.length > 0) setSelectedItemId(newItems[0].id);
    setImageExtractOpen(false);
    setExtractImage(null);
    setExtractedQuestions([]);
    setSelectedExtractIds(new Set());
    toast({ title: `${newItems.length}개 문항 추가 완료` });
  };

  const validItems = items.filter(i => i.question.trim());

  const currentTotalScore = items.reduce((sum, item) => sum + (item.score ?? 1), 0);

  const applyBulkScore = (value: number) => {
    const clamped = Math.max(1, Math.min(1000, value));
    setItems(prev => prev.map(item => ({ ...item, score: clamped })));
  };

  const applyTotalScore = (total: number) => {
    const clamped = Math.max(1, Math.min(1000, total));
    const count = items.length;
    if (count === 0) return;
    const base = Math.floor(clamped / count);
    const remainder = clamped - base * count;
    setItems(prev => prev.map((item, idx) => ({ ...item, score: base + (idx === count - 1 ? remainder : 0) })));
  };

  const renderPreviewItem = (item: QuestionItem, idx: number) => (
    <div key={item.id} className="border border-border rounded-lg p-3 bg-card" data-testid={`preview-question-${idx}`}>
      <div className="flex items-start gap-2">
        <span className="text-[12px] font-bold text-blue-600 shrink-0 mt-0.5">{idx + 1}.</span>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.questionType === "CHOICE" ? "bg-blue-100 text-blue-700" : item.questionType === "WORD_ORDER" ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"}`}>
              {TYPE_LABEL[item.questionType]}
            </span>
            {item.subjectId && <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">{getSubjectName(item.subjectId) || String(item.subjectId)}</span>}
          </div>
          <p className="text-[12px] text-foreground font-medium">{item.question || <span className="text-muted-foreground italic">질문 미입력</span>}</p>
          {item.body && <p className="text-[11px] text-muted-foreground bg-muted rounded px-2 py-1">{item.body}</p>}
          {item.questionType === "CHOICE" && item.choices.filter(c => c.trim()).length > 0 && (
            <div className="space-y-0.5 pl-1">
              {(() => {
                const filtered: { text: string; origIdx: number }[] = [];
                item.choices.forEach((c, i) => { if (c.trim()) filtered.push({ text: c, origIdx: i }); });
                return filtered.map((entry, ci) => {
                  const isCorrect = entry.origIdx === item.correctAnswer - 1;
                  return (
                    <div key={ci} className={`text-[11px] flex items-center gap-1 ${isCorrect ? "text-blue-600 font-medium" : "text-muted-foreground"}`}>
                      <span>{CIRCLE_NUMS[ci]}</span><span>{entry.text}</span>
                      {isCorrect && <Check className="w-2.5 h-2.5 text-blue-600" />}
                    </div>
                  );
                });
              })()}
            </div>
          )}
          {item.questionType !== "CHOICE" && item.answerText && (
            <p className="text-[11px] text-blue-600 font-medium">정답: {item.answerText}</p>
          )}
          {item.explanation && <p className="text-[10px] text-muted-foreground italic">해설: {item.explanation}</p>}
        </div>
      </div>
    </div>
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        data-testid="worksheet-create-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      >
        <div
          ref={modalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="학습지 만들기"
          className={`bg-background rounded-xl shadow-2xl flex flex-col outline-none ${isMobile ? "w-full h-full rounded-none" : "w-[1200px] max-h-[90vh]"}`}
          data-testid="worksheet-create-modal"
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <h2 className="text-[15px] font-bold text-foreground" data-testid="modal-title">학습지 만들기</h2>
            <button onClick={handleClose} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors" data-testid="btn-modal-close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form header: title + category */}
          <div className="px-5 py-3 border-b border-border bg-muted/20 shrink-0 space-y-2">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                학습지 제목 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="학습지 제목을 입력하세요"
                className="w-full bg-background border-border h-9 text-[13px]"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
                data-testid="input-title"
              />
            </div>
            <div ref={catDropdownRef} className="relative">
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">학습지 카테고리</label>
              <button
                className="w-full flex items-center justify-between bg-background border border-border rounded-md h-9 px-3 text-[12px] text-left"
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                data-testid="btn-category-select"
              >
                <span className={categoryId ? "text-foreground truncate" : "text-muted-foreground"}>
                  {categoryId ? getCategoryPath(categoryId) : "카테고리 선택"}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2 transition-transform ${categoryDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {categoryDropdownOpen && (
                <div className="absolute top-full left-0 w-72 mt-1 bg-background border border-border rounded-md shadow-xl z-50 max-h-64 overflow-y-auto p-1">
                  <div
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] cursor-pointer mb-0.5 transition-colors ${!categoryId ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                    onClick={() => { setCategoryId(undefined); setCategoryDropdownOpen(false); }}
                  >없음</div>
                  {renderCategoryTree(categories || [])}
                  {addingCatRoot && renderCatAddInput()}
                  <div
                    className="flex items-center gap-1 px-2 py-1.5 text-[12px] text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer mt-1 border-t border-border pt-2"
                    onClick={() => { setAddingCatRoot(true); setAddingCatUnder(null); setNewCatName(""); }}
                  >
                    <Plus className="w-3 h-3" /><span>새 카테고리</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main 3-column area */}
          <div className="flex-1 flex overflow-hidden min-h-0">

            {/* LEFT: Question list sidebar */}
            <div className="w-48 border-r border-border flex flex-col shrink-0 bg-muted/10">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-[12px] font-semibold text-foreground">문항 ({items.length})</span>
                <div className="flex items-center gap-0.5">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => { setScorePopoverOpen(v => !v); setBulkScoreInput(""); setTotalScoreInput(""); }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${scorePopoverOpen ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                          data-testid="btn-score-settings"
                        >
                          {currentTotalScore}pt
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-[11px]">배점 설정</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => { setImageExtractOpen(true); setExtractImage(null); setExtractedQuestions([]); setSelectedExtractIds(new Set()); }}
                          className="p-1 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors"
                          data-testid="btn-image-extract-open"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-[11px]">이미지로 문제 추출</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button onClick={() => addItem("CHOICE")} className="p-1 text-muted-foreground hover:text-foreground rounded" data-testid="btn-add-question-sidebar">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Score settings panel */}
              {scorePopoverOpen && (
                <div ref={scorePopoverRef} className="border-b border-border bg-blue-50/60 px-3 py-2.5 space-y-2">
                  <p className="text-[10px] font-semibold text-blue-700 mb-1">배점 설정</p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">일괄 설정 (문항당 동일 배점)</p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={bulkScoreInput}
                        onChange={e => setBulkScoreInput(e.target.value)}
                        placeholder="예) 5"
                        className="flex-1 h-6 text-[11px] border border-border rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                        data-testid="input-bulk-score"
                      />
                      <button
                        onClick={() => { const v = Number(bulkScoreInput); if (v > 0) applyBulkScore(v); }}
                        className="h-6 px-2 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0"
                        data-testid="btn-apply-bulk-score"
                      >적용</button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">총점/문제 설정 (균등 배분, max 1000점)</p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={totalScoreInput}
                        onChange={e => setTotalScoreInput(e.target.value)}
                        placeholder="예) 100"
                        className="flex-1 h-6 text-[11px] border border-border rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                        data-testid="input-total-score"
                      />
                      <button
                        onClick={() => { const v = Number(totalScoreInput); if (v > 0) applyTotalScore(v); }}
                        className="h-6 px-2 text-[10px] font-medium bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0"
                        data-testid="btn-apply-total-score"
                      >배분</button>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">현재 합계: <span className="font-semibold text-blue-700">{currentTotalScore}pt</span></p>
                </div>
              )}
              <div className="flex-1 overflow-y-auto py-1">
                {items.map((item, idx) => {
                  const isSelected = item.id === currentItem?.id;
                  const itemScore = item.score ?? 1;
                  const isEditingScore = editingScoreId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`w-full flex items-center gap-1.5 px-2 py-2 text-left transition-colors ${isSelected ? "bg-blue-600 text-white" : "text-foreground hover:bg-muted"}`}
                      data-testid={`sidebar-question-${idx}`}
                    >
                      <button className="flex items-center gap-1.5 flex-1 min-w-0" onClick={() => setSelectedItemId(item.id)}>
                        <GripVertical className={`w-3 h-3 shrink-0 ${isSelected ? "text-white/40" : "text-muted-foreground"}`} />
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isSelected ? "bg-white text-blue-600" : "bg-blue-100 text-blue-700"}`}>{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[10px] font-medium ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>{TYPE_LABEL[item.questionType]}</p>
                          <p className="text-[11px] truncate">
                            {item.question || <span className={`italic ${isSelected ? "text-white/50" : "text-muted-foreground/60"}`}>질문 미입력</span>}
                          </p>
                        </div>
                      </button>
                      {isEditingScore ? (
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          autoFocus
                          value={editingScoreValue}
                          onChange={e => setEditingScoreValue(e.target.value)}
                          onBlur={() => {
                            const v = Number(editingScoreValue);
                            if (v > 0) updateItem(item.id, { score: Math.max(1, Math.min(1000, v)) });
                            setEditingScoreId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") { const v = Number(editingScoreValue); if (v > 0) updateItem(item.id, { score: Math.max(1, Math.min(1000, v)) }); setEditingScoreId(null); }
                            if (e.key === "Escape") setEditingScoreId(null);
                          }}
                          className="w-9 h-5 text-[10px] text-center border border-blue-300 rounded bg-white text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
                          data-testid={`input-score-${idx}`}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setEditingScoreId(item.id); setEditingScoreValue(String(itemScore)); }}
                          className={`shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded transition-colors ${isSelected ? "bg-white/20 text-white hover:bg-white/30" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                          data-testid={`btn-score-${idx}`}
                          title="클릭하여 배점 수정"
                        >
                          {itemScore}pt
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border p-2 space-y-0.5">
                {(["CHOICE", "SHORT_ANSWER", "WORD_ORDER"] as QuestionType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => addItem(type)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors text-left"
                    data-testid={`btn-add-${type.toLowerCase()}`}
                  >
                    <Plus className="w-3 h-3 shrink-0" />+ {TYPE_LABEL[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* CENTER: Selected question editor */}
            {currentItem ? (
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* Question top bar: type tabs + actions */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-bold text-foreground shrink-0 min-w-[30px]">{currentIdx + 1}번</span>
                  <div className="flex rounded-md overflow-hidden border border-border">
                    {(["CHOICE", "SHORT_ANSWER", "WORD_ORDER"] as QuestionType[]).map((type, i) => (
                      <button
                        key={type}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${i > 0 ? "border-l border-border" : ""} ${currentItem.questionType === type ? "bg-blue-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                        onClick={() => updateItem(currentItem.id, { questionType: type })}
                        data-testid={`btn-type-${type.toLowerCase()}`}
                      >
                        {TYPE_LABEL[type]}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => {
                            setPickerSourceId(currentItem.id);
                            setPickerPaperNo(null);
                            setPickerPaperDetail(null);
                            setSelectedPickerQNos(new Set());
                            setPickerSearch("");
                            setPickerDebouncedSearch("");
                            setPickerCategoryId(null);
                            setPickerPage(0);
                            setPickerOpen(true);
                          }}
                          className="p-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                          data-testid={`btn-picker-${currentIdx}`}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-[11px]">유사문제 만들기</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <button onClick={() => duplicateItem(currentItem.id)} className="p-1 text-muted-foreground hover:text-foreground rounded" title="복제" data-testid={`btn-duplicate-${currentIdx}`}>
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveItem(currentItem.id, "up")}
                    disabled={currentIdx === 0}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"
                    data-testid={`btn-move-up-${currentIdx}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  </button>
                  <button
                    onClick={() => moveItem(currentItem.id, "down")}
                    disabled={currentIdx === items.length - 1}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 rounded"
                    data-testid={`btn-move-down-${currentIdx}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                  </button>
                  <button
                    onClick={() => items.length > 1 ? setDeleteItemId(currentItem.id) : toast({ title: "안내", description: "최소 1개의 문항이 필요합니다." })}
                    className="p-1 text-muted-foreground hover:text-red-500 rounded"
                    data-testid={`btn-delete-question-${currentIdx}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 2-column editing: left = question/body/choices, right = answer/explanation/category */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                  {/* Left editing column */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 border-r border-border min-w-0">
                    {/* 질문 */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-[11px] font-semibold text-red-500">질문 *</label>
                        <button
                          onClick={() => {
                            const idx = items.findIndex(i => i.id === selectedItemId);
                            setBulkQuestionFrom(idx + 1);
                            setBulkQuestionTo(items.length);
                            setBulkQuestionOpen(true);
                          }}
                          className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium hover:bg-blue-200 transition-colors"
                          data-testid="btn-apply-all-question"
                        >일괄적용</button>
                      </div>
                      <Input
                        placeholder="문제 내용을 입력하세요"
                        value={currentItem.question}
                        onChange={(e) => updateItem(currentItem.id, { question: e.target.value })}
                        className="h-9 text-[12px] bg-muted border-border"
                        data-testid={`input-question-${currentIdx}`}
                      />
                    </div>

                    {/* 내용 */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">내용</label>
                      <Textarea
                        placeholder="지문이나 본문을 입력하세요 (선택)"
                        value={currentItem.body}
                        onChange={(e) => updateItem(currentItem.id, { body: e.target.value })}
                        className="min-h-[56px] text-[12px] bg-muted border-border resize-y"
                        data-testid={`input-body-${currentIdx}`}
                      />
                      {renderAttachZone(currentItem.id, "body")}
                    </div>

                    {/* 보기항목 */}
                    {(currentItem.questionType === "CHOICE" || currentItem.questionType === "WORD_ORDER") && (
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <label className="text-[11px] font-semibold text-red-500">보기항목 *</label>
                          <button
                            onClick={() => updateItem(currentItem.id, { showChoiceNumbers: !currentItem.showChoiceNumbers })}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors ${currentItem.showChoiceNumbers ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                            data-testid={`btn-toggle-numbers-${currentIdx}`}
                          >
                            번호 {currentItem.showChoiceNumbers ? "삭제" : "표시"}
                          </button>
                          <button
                            onClick={() => addChoice(currentItem.id)}
                            className="ml-auto flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-700"
                          >
                            <Plus className="w-2.5 h-2.5" />추가
                          </button>
                        </div>
                        <div className="space-y-2">
                          {currentItem.choices.map((choice, ci) => (
                            <div key={ci} className="flex items-center gap-1.5">
                              {currentItem.showChoiceNumbers && (
                                <span className="text-[12px] text-muted-foreground shrink-0 w-5 text-center">{CIRCLE_NUMS[ci] || `${ci + 1}`}</span>
                              )}
                              <Input
                                placeholder={`보기 ${ci + 1}`}
                                value={choice}
                                onChange={(e) => updateChoice(currentItem.id, ci, e.target.value)}
                                className="h-8 text-[12px] bg-background border-border flex-1"
                                data-testid={`input-choice-${currentIdx}-${ci}`}
                              />
                              {currentItem.choices.length > 2 && (
                                <button onClick={() => removeChoice(currentItem.id, ci)} className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0" data-testid={`btn-remove-choice-${currentIdx}-${ci}`}>
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right editing column */}
                  <div className="w-[290px] shrink-0 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {/* 정답 */}
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-[11px] font-semibold text-red-500">정답 *</label>
                        <button
                          onClick={() => {
                            const vals: Record<string, number> = {};
                            items.forEach(item => { vals[item.id] = item.correctAnswer; });
                            setBulkAnswerValues(vals);
                            setBulkAnswerActiveIdx(0);
                            setBulkAnswerOpen(true);
                          }}
                          className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium hover:bg-blue-200 transition-colors"
                          data-testid="btn-apply-all-answer"
                        >일괄입력</button>
                      </div>
                      {currentItem.questionType === "CHOICE" ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {currentItem.choices.map((_, ci) => (
                            <button
                              key={ci}
                              onClick={() => updateItem(currentItem.id, { correctAnswer: ci + 1 })}
                              className={`w-7 h-7 rounded-full text-[11px] font-medium border transition-colors ${currentItem.correctAnswer === ci + 1 ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground border-border hover:border-blue-400"}`}
                              data-testid={`btn-answer-${currentIdx}-${ci}`}
                            >{CIRCLE_NUMS[ci] || `${ci + 1}`}</button>
                          ))}
                        </div>
                      ) : (
                        <>
                          <Input
                            placeholder="정답을 입력하세요"
                            value={currentItem.answerText}
                            onChange={(e) => updateItem(currentItem.id, { answerText: e.target.value })}
                            className="h-8 text-[12px] bg-muted border-border"
                            data-testid={`input-answer-${currentIdx}`}
                          />
                          {currentItem.questionType === "SHORT_ANSWER" && (
                            <div className="flex items-center gap-3 flex-wrap mt-1.5">
                              {[
                                { key: "gradingCaseSensitive", label: "대/소문자" },
                                { key: "gradingSpecialChars", label: "특수기호" },
                                { key: "gradingSpacing", label: "띄어쓰기" },
                                { key: "gradingOr", label: "OR채점" },
                              ].map(({ key, label }) => (
                                <label key={key} className="flex items-center gap-1 text-[11px] text-foreground cursor-pointer">
                                  <Checkbox
                                    checked={currentItem[key as keyof QuestionItem] as boolean}
                                    onCheckedChange={(v) => updateItem(currentItem.id, { [key]: !!v })}
                                    className="w-3.5 h-3.5"
                                  />{label}
                                </label>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* 해설 */}
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1.5">해설</label>
                      <Textarea
                        placeholder="풀이 설명을 입력하세요 (선택)"
                        value={currentItem.explanation}
                        onChange={(e) => updateItem(currentItem.id, { explanation: e.target.value })}
                        className="min-h-[56px] text-[12px] bg-muted border-border resize-y"
                        data-testid={`input-explanation-${currentIdx}`}
                      />
                      {renderAttachZone(currentItem.id, "explanation")}
                    </div>
                    </div>

                    {/* 문제 카테고리 - overflow 밖에 배치하여 드롭다운 클릭 가능 */}
                    <div className="shrink-0 px-3 pt-2 pb-3 border-t border-border/50 relative">
                      <div className="flex items-center gap-2 mb-1.5">
                        <label className="text-[11px] font-semibold text-gray-600">문제 카테고리</label>
                        <button
                          onClick={() => {
                            const idx = items.findIndex(i => i.id === selectedItemId);
                            setBulkCategoryFrom(idx + 1);
                            setBulkCategoryTo(items.length);
                            setBulkCategoryMode("manual");
                            setBulkCategorySubjectId(items.find(i => i.id === selectedItemId)?.subjectId);
                            setBulkCatExpanded(new Set());
                            setBulkAiSegments([{ uid: '1', parentIds: [], from: 1, to: items.length }]);
                            setBulkAiLoading(false);
                            setBulkAiProgress(null);
                            setBulkCategoryOpen(true);
                          }}
                          className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium hover:bg-blue-200 transition-colors"
                          data-testid="btn-apply-all-category"
                        >일괄적용</button>
                      </div>
                      <div className="relative">
                        <button
                          className="w-full flex items-center justify-between bg-muted border border-border rounded-md h-8 px-2.5 text-[11px]"
                          onClick={() => setQuestionCatOpen(questionCatOpen === currentItem.id ? null : currentItem.id)}
                          data-testid={`btn-q-cat-${currentIdx}`}
                        >
                          <span className={currentItem.subjectId ? "text-foreground truncate" : "text-muted-foreground"}>
                            {currentItem.subjectId ? (getSubjectName(currentItem.subjectId) || String(currentItem.subjectId)) : "카테고리 선택"}
                          </span>
                          <ChevronDown className={`w-3 h-3 text-muted-foreground shrink-0 ml-1 transition-transform ${questionCatOpen === currentItem.id ? "rotate-180" : ""}`} />
                        </button>
                        {questionCatOpen === currentItem.id && (
                          <div className="absolute bottom-full left-0 w-full mb-1 bg-background border border-border rounded-md shadow-xl z-[60] max-h-48 overflow-y-auto p-1">
                            {(questionSubjects && questionSubjects.length > 0)
                              ? buildSubjectTree(questionSubjects || []).map((node: any) =>
                                  renderSubjectNode(node, currentItem.subjectId, (id) => {
                                    updateItem(currentItem.id, { subjectId: id });
                                    setQuestionCatOpen(null);
                                  })
                                )
                              : (
                              <div className="px-2 py-3 text-[11px] text-muted-foreground text-center">
                                {questionSubjects === undefined ? "불러오는 중..." : "카테고리 없음"}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px]">
                좌측에서 문항을 선택하세요
              </div>
            )}

            {/* RIGHT: Tools panel */}
            <div className="w-56 border-l border-border flex flex-col shrink-0 bg-muted/10">
              <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 border-b border-border shrink-0">
                <AlignLeft className="w-3 h-3 text-blue-600" />
                <span className="text-[10px] text-blue-600 font-medium">{currentIdx + 1}번 문항에 입력</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground/50 hover:text-blue-500 transition-colors ml-auto" data-testid="btn-text-format-help">
                        <CircleHelp className="w-3.5 h-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-[12px] leading-relaxed">
                      <p className="font-semibold mb-1">입력 형식</p>
                      <p>질문</p>
                      <p className="text-muted-foreground">지문 내용(선택)</p>
                      <p>① 보기1</p>
                      <p>② 보기2</p>
                      <p>③ 보기3</p>
                      <p className="text-muted-foreground">해설</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">(1, ①, ㄱ 등 지원)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden p-3 min-h-0">
                <Textarea
                  placeholder={`질문\n지문 내용(선택)\n① 보기1\n② 보기2\n③ 보기3\n해설`}
                  value={singleImportText}
                  onChange={(e) => setSingleImportText(e.target.value)}
                  className="flex-1 text-[11px] bg-background border-border resize-none font-mono"
                  data-testid="textarea-single-import"
                />
                <Button
                  className="mt-2 w-full h-8 text-[12px] bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => parseSingleQuestionText(singleImportText)}
                  disabled={!singleImportText.trim()}
                  data-testid="btn-single-import"
                >
                  입력
                </Button>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
            <span className="text-[12px] text-muted-foreground">{validItems.length}개 문항 작성됨</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-9 text-[13px] px-3" onClick={() => setPreviewOpen(true)} data-testid="btn-preview">
                <Eye className="w-3.5 h-3.5 mr-1.5" />미리보기
              </Button>
              <Button variant="outline" className="h-9 text-[13px] px-4" onClick={handleClose} data-testid="btn-cancel">취소</Button>
              <Button
                className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700 text-white px-6"
                onClick={() => createWorksheet.mutate()}
                disabled={createWorksheet.isPending || !title.trim() || validItems.length === 0}
                data-testid="btn-save"
              >
                {createWorksheet.isPending ? (editPaperNo ? "수정 중..." : "저장 중...") : (editPaperNo ? "수정" : "저장")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview overlay */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
          data-testid="preview-overlay"
        >
          <div className={`bg-background rounded-xl shadow-2xl flex flex-col outline-none ${isMobile ? "w-full h-full rounded-none" : "w-[600px] max-h-[85vh]"}`} data-testid="preview-modal">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                <h2 className="text-[15px] font-bold text-foreground">미리보기</h2>
                <span className="text-[12px] text-muted-foreground">{validItems.length}개 문항</span>
              </div>
              <button onClick={() => setPreviewOpen(false)} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {title.trim() && (
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-[15px] font-bold text-foreground">{title}</p>
                  {categoryId && <p className="text-[12px] text-muted-foreground mt-1">{getCategoryPath(categoryId)}</p>}
                </div>
              )}
              {validItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground/20 mb-3" />
                  <p className="text-[13px] text-muted-foreground">입력된 문항이 없습니다</p>
                </div>
              ) : validItems.map((item, idx) => renderPreviewItem(item, idx))}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end">
              <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => setPreviewOpen(false)}>닫기</Button>
            </div>
          </div>
        </div>
      )}

      {/* Alert: delete question */}
      <AlertDialog open={!!deleteItemId} onOpenChange={(open) => !open && setDeleteItemId(null)}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">문항 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">이 문항을 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]">취소</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white text-[13px]" onClick={() => deleteItemId && removeItem(deleteItemId)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert: cancel confirm */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">정말 종료하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">작성 중인 내용은 저장되지 않습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]" data-testid="btn-stay">계속 작성</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white text-[13px]" onClick={() => { setCancelConfirmOpen(false); onClose(); }} data-testid="btn-leave">종료</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alert: delete category */}
      <AlertDialog open={!!deleteCatTarget} onOpenChange={(open) => !open && setDeleteCatTarget(null)}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">카테고리 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              {deleteCatTarget ? `'${deleteCatTarget.name}' 카테고리를 삭제하시겠습니까?` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]">취소</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white text-[13px]" onClick={() => deleteCatTarget && deleteCategoryMutation.mutate(deleteCatTarget.classifyNo)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk: 질문 일괄설정 */}
      {bulkQuestionOpen && (() => {
        const currentItem = items.find(i => i.id === selectedItemId);
        const currentIdx = items.findIndex(i => i.id === selectedItemId);
        return (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
            <div className="bg-background rounded-xl shadow-2xl w-[480px] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-bold">질문 일괄설정</h3>
                <button onClick={() => setBulkQuestionOpen(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[13px] text-muted-foreground mb-5">
                현재 {currentIdx + 1}번 문항의 질문을 아래 범위의 문항에 동일하게 적용합니다.
              </p>
              <div className="flex items-center gap-3">
                <input type="number" min={1} max={items.length} value={bulkQuestionFrom}
                  onChange={e => setBulkQuestionFrom(Math.max(1, Math.min(items.length, Number(e.target.value))))}
                  className="w-20 h-9 border border-border rounded-md text-center text-[13px] bg-muted outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="input-bulk-q-from" />
                <span className="text-[13px] text-muted-foreground">번 ~</span>
                <input type="number" min={1} max={items.length} value={bulkQuestionTo}
                  onChange={e => setBulkQuestionTo(Math.max(1, Math.min(items.length, Number(e.target.value))))}
                  className="w-20 h-9 border border-border rounded-md text-center text-[13px] bg-muted outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="input-bulk-q-to" />
                <span className="text-[13px] text-muted-foreground">번 문항</span>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => setBulkQuestionOpen(false)}>취소</Button>
                <Button className="h-9 text-[13px] px-4 bg-blue-600 hover:bg-blue-700" onClick={() => {
                  if (currentItem) applyRange("question", currentItem.question, bulkQuestionFrom, bulkQuestionTo);
                  setBulkQuestionOpen(false);
                }} data-testid="btn-bulk-q-apply">적용</Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk: 정답 일괄입력 */}
      {bulkAnswerOpen && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
          <div className="bg-background rounded-xl shadow-2xl w-[660px] flex flex-col" style={{ maxHeight: "80vh" }}>
            <div className="px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold">정답 일괄입력</h3>
                <button onClick={() => setBulkAnswerOpen(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">숫자키(1~5)로 정답 입력, ↑↓ 방향키로 문항 이동</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-6 space-y-2">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  id={`bulk-row-${idx}`}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${idx === bulkAnswerActiveIdx ? "bg-blue-600/15 border border-blue-500/50" : "bg-muted/50 border border-transparent hover:border-border"}`}
                  onClick={() => setBulkAnswerActiveIdx(idx)}
                  data-testid={`bulk-answer-row-${idx}`}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-[12px] font-bold flex items-center justify-center shrink-0">{idx + 1}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ${
                    item.questionType === "CHOICE" ? "bg-blue-100 text-blue-700" :
                    item.questionType === "WORD_ORDER" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {item.questionType === "CHOICE" ? "객관식" : item.questionType === "WORD_ORDER" ? "어순배열" : "주관식"}
                  </span>
                  <span className="flex-1 text-[12px] text-muted-foreground truncate min-w-0">{item.question || "(질문 없음)"}</span>
                  {item.questionType === "CHOICE" ? (
                    <div className="flex items-center gap-1 shrink-0">
                      {item.choices.map((_, ci) => (
                        <button
                          key={ci}
                          onClick={e => {
                            e.stopPropagation();
                            setBulkAnswerValues(prev => ({ ...prev, [item.id]: ci + 1 }));
                            if (idx < items.length - 1) setBulkAnswerActiveIdx(idx + 1);
                          }}
                          className={`w-7 h-7 rounded-full text-[11px] font-medium border transition-colors ${bulkAnswerValues[item.id] === ci + 1 ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground border-border hover:border-blue-400 hover:text-blue-500"}`}
                          data-testid={`bulk-ans-btn-${idx}-${ci}`}
                        >{CIRCLE_NUMS[ci] || `${ci + 1}`}</button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      placeholder="정답"
                      value={item.answerText}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setItems(prev => prev.map(it => it.id === item.id ? { ...it, answerText: e.target.value } : it))}
                      className="w-28 h-7 border border-border rounded text-[11px] bg-background px-2 shrink-0"
                      data-testid={`bulk-ans-text-${idx}`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
              <Button
                variant="outline"
                className="h-9 text-[13px] px-4 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                onClick={() => { setBulkAnswerValues({}); setBulkAnswerActiveIdx(0); }}
                data-testid="btn-bulk-ans-reset"
              >초기화</Button>
              <div className="flex gap-2">
              <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => setBulkAnswerOpen(false)}>취소</Button>
              <Button className="h-9 text-[13px] px-4 bg-blue-600 hover:bg-blue-700" onClick={() => {
                setItems(prev => prev.map(item => {
                  if (item.questionType === "CHOICE" && bulkAnswerValues[item.id] !== undefined) {
                    return { ...item, correctAnswer: bulkAnswerValues[item.id] };
                  }
                  return item;
                }));
                toast({ title: "정답 일괄입력", description: "정답이 적용되었습니다." });
                setBulkAnswerOpen(false);
              }} data-testid="btn-bulk-ans-apply">적용</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk: 문제 카테고리 일괄설정 */}
      {bulkCategoryOpen && (() => {
        const catFlat = buildSubjectTree(questionSubjects || []);

        const flattenCats = (nodes: any[]): any[] => {
          const result: any[] = [];
          for (const node of nodes) {
            result.push(node);
            const kids = node.children ?? node._children ?? [];
            if (kids.length) result.push(...flattenCats(kids));
          }
          return result;
        };
        const catFlatAll = flattenCats(catFlat);
        const getSubjId = (n: any) => n.subjectNo ?? n.no ?? n.id ?? n.subjectId;
        const listeningSubject = catFlatAll.find((c: any) => (c.subjectName ?? c.name ?? "").includes("듣기"));
        const readingSubject = catFlatAll.find((c: any) => (c.subjectName ?? c.name ?? "").includes("독해"));

        const applyBulk = () => {
          if (bulkCategoryFrom > bulkCategoryTo) {
            toast({ title: "범위 오류", description: "시작 번호가 끝 번호보다 클 수 없습니다.", variant: "destructive" });
            return;
          }
          if (bulkCategoryMode === "manual") {
            applyRange("subjectId", bulkCategorySubjectId, bulkCategoryFrom, bulkCategoryTo);
          } else if (bulkCategoryMode === "csat") {
            const listenId = listeningSubject ? Number(getSubjId(listeningSubject)) : undefined;
            const readId = readingSubject ? Number(getSubjId(readingSubject)) : undefined;
            setItems(prev => prev.map((item, idx) => {
              const qNum = idx + 1;
              if (qNum < bulkCategoryFrom || qNum > bulkCategoryTo) return item;
              const subjectId = qNum <= 17 ? listenId : readId;
              return { ...item, subjectId };
            }));
            toast({ title: "모의고사 자동 배정 완료", description: `${bulkCategoryFrom}~${bulkCategoryTo}번: 1~17번 듣기, 18번~ 독해 적용` });
          }
          setBulkCategoryOpen(false);
        };

        const getAllDescendants = (node: any, parentPath: string): { id: number; name: string; path: string }[] => {
          const nodeId = Number(node.classifyNo ?? node.subjectNo ?? node.no ?? node.id ?? node.subjectId);
          const nodeName = node.name ?? node.subjectName ?? node.title ?? String(nodeId);
          const path = parentPath ? `${parentPath} > ${nodeName}` : nodeName;
          const children = node.children ?? node._children ?? [];
          if (children.length === 0) {
            return [{ id: nodeId, name: nodeName, path }];
          }
          const results: { id: number; name: string; path: string }[] = [];
          for (const child of children) {
            results.push(...getAllDescendants(child, path));
          }
          return results;
        };

        const runAiClassify = async () => {
          const validSegments = bulkAiSegments.filter(s => s.parentIds.length > 0);
          if (validSegments.length === 0) {
            toast({ title: "오류", description: "구간마다 분류 기준 카테고리를 하나 이상 선택하세요.", variant: "destructive" });
            return;
          }
          for (const seg of validSegments) {
            if (seg.from > seg.to) {
              toast({ title: "범위 오류", description: `구간 ${seg.from}~${seg.to}: 시작 번호가 끝 번호보다 클 수 없습니다.`, variant: "destructive" });
              return;
            }
          }
          // Collect all range items across segments
          const allRangeItemIds = new Set<string>();
          for (const seg of validSegments) {
            items.forEach((item, idx) => {
              const qNum = idx + 1;
              if (qNum >= seg.from && qNum <= seg.to) allRangeItemIds.add(item.id);
            });
          }
          const totalItems = allRangeItemIds.size;
          if (totalItems === 0) {
            toast({ title: "오류", description: "적용 범위에 문항이 없습니다.", variant: "destructive" });
            return;
          }
          setBulkAiLoading(true);
          setBulkAiProgress({ current: 0, total: totalItems });
          const resultMap: Record<string, number | null> = {};
          let totalAssigned = 0;
          let processedCount = 0;
          try {
            for (const seg of validSegments) {
              // Merge candidates from all selected parentIds in this segment
              const candidates: { id: number; name: string; path: string }[] = [];
              for (const pid of seg.parentIds) {
                const parentNode = catFlatAll.find((n: any) => Number(getSubjId(n)) === pid);
                if (parentNode) candidates.push(...getAllDescendants(parentNode, ""));
              }
              if (candidates.length === 0) continue;
              const rangeItems = items.filter((_, idx) => {
                const qNum = idx + 1;
                return qNum >= seg.from && qNum <= seg.to;
              });
              if (rangeItems.length === 0) continue;
              const questionsPayload = rangeItems.map(item => ({
                id: item.id,
                question: item.question || "",
                body: item.body || "",
              }));
              const res = await fetch(api.ai.classifySubject.path, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ questions: questionsPayload, candidates, paperTitle: title }),
              });
              if (!res.ok) throw new Error("AI 분류 요청 실패");
              const { results } = await res.json() as { results: { id: string; subjectId: number | null }[] };
              for (const r of results) { resultMap[r.id] = r.subjectId; }
              totalAssigned += results.filter(r => r.subjectId !== null).length;
              processedCount += rangeItems.length;
              setBulkAiProgress({ current: processedCount, total: totalItems });
            }
            setItems(prev => prev.map(item => {
              if (Object.prototype.hasOwnProperty.call(resultMap, item.id)) {
                const sid = resultMap[item.id];
                return { ...item, subjectId: sid ?? item.subjectId };
              }
              return item;
            }));
            toast({ title: "AI 분류 완료", description: `${totalAssigned}/${totalItems}문항 자동 분류됨` });
            setBulkCategoryOpen(false);
          } catch (err) {
            toast({ title: "AI 분류 오류", description: "요청 중 오류가 발생했습니다. 다시 시도해주세요.", variant: "destructive" });
          } finally {
            setBulkAiLoading(false);
            setBulkAiProgress(null);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center">
            <div className="bg-background rounded-xl shadow-2xl w-[500px] flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <h3 className="text-[15px] font-bold">문제 카테고리 일괄설정</h3>
                <button onClick={() => setBulkCategoryOpen(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>

              <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto">
                {/* Mode toggle */}
                <div className="flex gap-2">
                  <button
                    className={`flex-1 py-2 text-[12px] font-medium rounded-lg border transition-colors ${bulkCategoryMode === "manual" ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                    onClick={() => setBulkCategoryMode("manual")}
                  >직접 선택</button>
                  <button
                    className={`flex-1 py-2 text-[12px] font-medium rounded-lg border transition-colors ${bulkCategoryMode === "csat" ? "bg-blue-600 text-white border-blue-600" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                    onClick={() => setBulkCategoryMode("csat")}
                  >모의고사 자동 배정</button>
                  <button
                    className={`flex-1 py-2 text-[12px] font-medium rounded-lg border transition-colors ${bulkCategoryMode === "ai" ? "bg-purple-600 text-white border-purple-600" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                    onClick={() => setBulkCategoryMode("ai")}
                  >AI 자동 분류</button>
                </div>

                {/* Manual mode: subject tree */}
                {bulkCategoryMode === "manual" && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-2">적용할 카테고리 선택</p>
                    {catFlat.length > 0 ? (
                      <div className="border border-border rounded-lg max-h-52 overflow-y-auto p-1">
                        {catFlat.map((cat: any) =>
                          renderSubjectNode(cat, bulkCategorySubjectId, (id) => setBulkCategorySubjectId(id))
                        )}
                      </div>
                    ) : (
                      <div className="text-[12px] text-muted-foreground text-center py-4 border border-border rounded-lg">카테고리를 불러오는 중...</div>
                    )}
                    {bulkCategorySubjectId && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[11px] text-blue-600 font-medium">선택됨: {buildSubjectPathMap(catFlat).get(bulkCategorySubjectId) || String(bulkCategorySubjectId)}</span>
                        <button
                          className="text-[10px] text-gray-400 hover:text-gray-600 ml-1"
                          onClick={() => setBulkCategorySubjectId(undefined)}
                        >초기화</button>
                      </div>
                    )}
                  </div>
                )}

                {/* CSAT auto mode */}
                {bulkCategoryMode === "csat" && (
                  <div className="space-y-3">
                    <div className="bg-blue-50 rounded-lg p-4 text-[12px] text-blue-900 space-y-1.5">
                      <p className="font-semibold text-[13px] mb-2">모의고사 영어 기준 자동 배정</p>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span>1번 ~ 17번 → <strong>듣기</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                        <span>18번 ~ → <strong>독해</strong></span>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-3 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">듣기 카테고리</span>
                        <span className={listeningSubject ? "text-blue-600 font-medium" : "text-red-400"}>
                          {listeningSubject ? (listeningSubject.name ?? String(listeningSubject.classifyNo)) : "감지 안됨"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">독해 카테고리</span>
                        <span className={readingSubject ? "text-indigo-600 font-medium" : "text-red-400"}>
                          {readingSubject ? (readingSubject.name ?? String(readingSubject.classifyNo)) : "감지 안됨"}
                        </span>
                      </div>
                    </div>
                    {(!listeningSubject || !readingSubject) && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 rounded px-3 py-2">
                        일부 카테고리를 감지하지 못했습니다. 직접 선택 모드를 사용하세요.
                      </p>
                    )}
                  </div>
                )}

                {/* AI mode */}
                {bulkCategoryMode === "ai" && (
                  <div className="space-y-3">
                    <div className="bg-purple-50 rounded-lg px-4 py-3 text-[12px] text-purple-900">
                      <p className="font-semibold text-[13px] mb-0.5">AI 자동 분류</p>
                      <p className="text-purple-700">구간별로 1단계 카테고리와 범위를 설정하세요. 예) 1~17번: 듣기 / 18~45번: 독해</p>
                    </div>

                    {/* Segment list */}
                    <div className="space-y-2">
                      {bulkAiSegments.map((seg, segIdx) => {
                        const subCount = seg.parentIds.reduce((acc, pid) => {
                          const node = catFlatAll.find((n: any) => Number(getSubjId(n)) === pid);
                          return acc + (node ? getAllDescendants(node, "").length : 0);
                        }, 0);
                        return (
                          <div key={seg.uid} className="border border-border rounded-lg p-3 space-y-2.5 bg-muted/20">
                            {/* Segment header */}
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-gray-500">구간 {segIdx + 1}</span>
                              {bulkAiSegments.length > 1 && (
                                <button
                                  onClick={() => setBulkAiSegments(prev => prev.filter(s => s.uid !== seg.uid))}
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                  disabled={bulkAiLoading}
                                ><X className="w-3.5 h-3.5" /></button>
                              )}
                            </div>
                            {/* Category buttons — multi-select */}
                            {catFlat.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {catFlat.map((cat: any) => {
                                  const catId = Number(getSubjId(cat));
                                  const catName = cat.subjectName ?? cat.name ?? String(catId);
                                  const isSelected = seg.parentIds.includes(catId);
                                  return (
                                    <button
                                      key={catId}
                                      onClick={() => setBulkAiSegments(prev => prev.map(s => {
                                        if (s.uid !== seg.uid) return s;
                                        const alreadySelected = s.parentIds.includes(catId);
                                        const next = alreadySelected
                                          ? s.parentIds.filter(id => id !== catId)
                                          : [...s.parentIds, catId];
                                        return { ...s, parentIds: next };
                                      }))}
                                      disabled={bulkAiLoading}
                                      className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${isSelected ? "bg-purple-600 text-white border-purple-600" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
                                    >{catName}</button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground text-center py-2 border border-border rounded">카테고리를 불러오는 중...</div>
                            )}
                            {/* Range inputs */}
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min={1} max={items.length} value={seg.from}
                                onChange={e => setBulkAiSegments(prev => prev.map(s => s.uid === seg.uid ? { ...s, from: Math.max(1, Math.min(items.length, Number(e.target.value))) } : s))}
                                disabled={bulkAiLoading}
                                className="w-16 h-8 border border-border rounded text-center text-[12px] bg-background outline-none focus:ring-1 focus:ring-purple-500"
                              />
                              <span className="text-[12px] text-muted-foreground">번 ~</span>
                              <input
                                type="number" min={1} max={items.length} value={seg.to}
                                onChange={e => setBulkAiSegments(prev => prev.map(s => s.uid === seg.uid ? { ...s, to: Math.max(1, Math.min(items.length, Number(e.target.value))) } : s))}
                                disabled={bulkAiLoading}
                                className="w-16 h-8 border border-border rounded text-center text-[12px] bg-background outline-none focus:ring-1 focus:ring-purple-500"
                              />
                              <span className="text-[12px] text-muted-foreground">번</span>
                              {seg.parentIds.length > 0 && (
                                <span className="ml-auto text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-0.5 shrink-0">
                                  하위 {subCount}개
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add segment button */}
                    <button
                      onClick={() => setBulkAiSegments(prev => {
                        const last = prev[prev.length - 1];
                        const newFrom = last ? Math.min(last.to + 1, items.length) : 1;
                        return [...prev, { uid: Date.now().toString(), parentIds: [], from: newFrom, to: items.length }];
                      })}
                      disabled={bulkAiLoading}
                      className="w-full py-2 text-[12px] text-purple-600 border border-dashed border-purple-300 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                    >+ 구간 추가</button>

                    {/* Progress */}
                    {bulkAiLoading && bulkAiProgress && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>AI 분류 중...</span>
                          <span>{bulkAiProgress.current}/{bulkAiProgress.total}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.round(bulkAiProgress.current / bulkAiProgress.total * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Range (manual/csat mode only) */}
                {bulkCategoryMode !== "ai" && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 mb-2">적용 범위</p>
                  <div className="flex items-center gap-3">
                    <input type="number" min={1} max={items.length} value={bulkCategoryFrom}
                      onChange={e => setBulkCategoryFrom(Math.max(1, Math.min(items.length, Number(e.target.value))))}
                      className="w-20 h-9 border border-border rounded-md text-center text-[13px] bg-muted outline-none focus:ring-1 focus:ring-blue-500"
                      data-testid="input-bulk-cat-from" />
                    <span className="text-[13px] text-muted-foreground">번 ~</span>
                    <input type="number" min={1} max={items.length} value={bulkCategoryTo}
                      onChange={e => setBulkCategoryTo(Math.max(1, Math.min(items.length, Number(e.target.value))))}
                      className="w-20 h-9 border border-border rounded-md text-center text-[13px] bg-muted outline-none focus:ring-1 focus:ring-blue-500"
                      data-testid="input-bulk-cat-to" />
                    <span className="text-[13px] text-muted-foreground">번 문항</span>
                  </div>
                </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
                <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => setBulkCategoryOpen(false)} disabled={bulkAiLoading}>취소</Button>
                {bulkCategoryMode === "ai" ? (
                  <Button
                    className="h-9 text-[13px] px-4 bg-purple-600 hover:bg-purple-700"
                    disabled={bulkAiSegments.every(s => s.parentIds.length === 0) || bulkAiLoading}
                    onClick={runAiClassify}
                    data-testid="btn-bulk-cat-ai-run"
                  >{bulkAiLoading ? "AI 분류 중..." : "AI 분류 시작"}</Button>
                ) : (
                  <Button
                    className="h-9 text-[13px] px-4 bg-blue-600 hover:bg-blue-700"
                    disabled={bulkCategoryMode === "manual" && !bulkCategorySubjectId}
                    onClick={applyBulk}
                    data-testid="btn-bulk-cat-apply"
                  >적용</Button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Question Picker Modal (유사문제만들기) */}
      {pickerOpen && (() => {
        const sourceIdx = items.findIndex(i => i.id === pickerSourceId);
        const pickerPapers: any[] = pickerPapersData?.contents ?? [];
        const pickerTotalPages: number = pickerPapersData?.totalPages ?? 0;

        const renderPickerCatTree = (nodes: any[], depth = 0): any =>
          nodes.map((node: any) => {
            const key = String(node.classifyNo);
            const isExpanded = pickerCatExpanded.has(key);
            const isSelected = pickerCategoryId === key;
            const hasChildren = node.children?.length > 0;
            return (
              <div key={key}>
                <button
                  className={`w-full flex items-center gap-1 py-1 px-2 text-left text-[11px] rounded transition-colors ${isSelected ? "bg-emerald-100 text-emerald-800 font-semibold" : "text-foreground hover:bg-muted"}`}
                  style={{ paddingLeft: `${8 + depth * 12}px` }}
                  onClick={() => {
                    setPickerCategoryId(isSelected ? null : key);
                    setPickerPage(0);
                    setPickerPaperNo(null);
                    if (hasChildren) setPickerCatExpanded(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
                  }}
                  data-testid={`picker-cat-${key}`}
                >
                  {hasChildren ? (isExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />) : <span className="w-3 shrink-0" />}
                  <span className="truncate">{node.classifyName || node.name}</span>
                </button>
                {hasChildren && isExpanded && renderPickerCatTree(node.children, depth + 1)}
              </div>
            );
          });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-xl shadow-2xl w-full max-w-4xl mx-4 flex flex-col" style={{ height: "80vh" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Copy className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-[14px] font-semibold">유사문제 만들기</h2>
                    <p className="text-[11px] text-muted-foreground">기존 학습지에서 문제를 찾아 복사한 후 커스텀하세요</p>
                  </div>
                </div>
                <button
                  onClick={() => { setPickerOpen(false); setPickerPaperNo(null); setSelectedPickerQNos(new Set()); }}
                  className="p-1.5 rounded hover:bg-muted"
                  data-testid="btn-close-picker"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 3-column body */}
              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Left: Category tree */}
                <div className="w-44 border-r border-border flex flex-col shrink-0">
                  <div className="px-2 py-2 border-b border-border shrink-0">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">카테고리</p>
                  </div>
                  <div className="flex-1 overflow-y-auto py-1 px-1">
                    <button
                      className={`w-full flex items-center gap-1 py-1 px-2 text-left text-[11px] rounded transition-colors ${!pickerCategoryId ? "bg-emerald-100 text-emerald-800 font-semibold" : "text-muted-foreground hover:bg-muted"}`}
                      onClick={() => { setPickerCategoryId(null); setPickerPage(0); setPickerPaperNo(null); }}
                    >전체</button>
                    {Array.isArray(categories) && renderPickerCatTree(categories)}
                  </div>
                </div>

                {/* Middle: Papers list */}
                <div className="w-56 border-r border-border flex flex-col shrink-0">
                  <div className="px-2 py-2 border-b border-border shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        className="w-full pl-6 pr-2 py-1 text-[11px] bg-muted/40 border border-border rounded-md outline-none focus:border-emerald-400"
                        placeholder="학습지 검색..."
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                        data-testid="input-picker-search"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {pickerPapersLoading ? (
                      <div className="p-4 text-center text-[11px] text-muted-foreground">불러오는 중...</div>
                    ) : pickerPapers.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-muted-foreground">학습지가 없습니다</div>
                    ) : pickerPapers.map((paper: any) => {
                      const pNo = paper.paperNo ?? paper.questionPaperNo;
                      const isSelected = pickerPaperNo === pNo;
                      return (
                        <button
                          key={pNo}
                          className={`w-full flex flex-col gap-0.5 px-3 py-2.5 text-left border-b border-border/50 transition-colors ${isSelected ? "bg-emerald-50 border-l-2 border-l-emerald-500" : "hover:bg-muted/50"}`}
                          onClick={() => { setPickerPaperNo(pNo); setSelectedPickerQNos(new Set()); }}
                          data-testid={`picker-paper-${pNo}`}
                        >
                          <span className={`text-[11px] font-medium line-clamp-2 ${isSelected ? "text-emerald-800" : "text-foreground"}`}>{paper.name || paper.title || paper.paperName || `학습지 #${pNo}`}</span>
                          {paper.questionCount !== undefined && <span className="text-[9px] text-muted-foreground">{paper.questionCount}문항</span>}
                        </button>
                      );
                    })}
                    {/* Pagination */}
                    {pickerTotalPages > 1 && (
                      <div className="flex items-center justify-center gap-1 p-2">
                        <button disabled={pickerPage === 0} onClick={() => setPickerPage(p => p - 1)} className="w-6 h-6 text-[10px] rounded border border-border disabled:opacity-30 hover:bg-muted">‹</button>
                        <span className="text-[10px] text-muted-foreground">{pickerPage + 1}/{pickerTotalPages}</span>
                        <button disabled={pickerPage >= pickerTotalPages - 1} onClick={() => setPickerPage(p => p + 1)} className="w-6 h-6 text-[10px] rounded border border-border disabled:opacity-30 hover:bg-muted">›</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Questions in selected paper */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                  {!pickerPaperNo ? (
                    <div className="flex-1 flex items-center justify-center text-center px-6">
                      <div>
                        <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-[12px] text-muted-foreground">왼쪽에서 학습지를 선택하면<br />문제 목록이 여기에 표시됩니다</p>
                      </div>
                    </div>
                  ) : pickerPaperLoading ? (
                    <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground">문제 불러오는 중...</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
                        <span className="text-[11px] font-semibold">{pickerDetailQuestions.length}개 문제</span>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-[10px] text-blue-600 hover:text-blue-700"
                            onClick={() => setSelectedPickerQNos(new Set(pickerDetailQuestions.map(q => pickerGetQNo(q))))}
                          >전체 선택</button>
                          <span className="text-muted-foreground text-[10px]">·</span>
                          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setSelectedPickerQNos(new Set())}>전체 해제</button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto divide-y divide-border/50">
                        {pickerDetailQuestions.length === 0 ? (
                          <div className="p-6 text-center text-[12px] text-muted-foreground">이 학습지에 문제가 없습니다</div>
                        ) : pickerDetailQuestions.map((q: any, qi: number) => {
                          const qNo = pickerGetQNo(q);
                          const { question, body } = pickerGetText(q);
                          const inner = pickerNormalizeQ(q);
                          const isChecked = selectedPickerQNos.has(qNo);
                          const rawChoices: any[] = Array.isArray(inner.choices) ? inner.choices : [];
                          return (
                            <div
                              key={qNo}
                              className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors ${isChecked ? "bg-emerald-50" : "hover:bg-muted/30"}`}
                              onClick={() => setSelectedPickerQNos(prev => {
                                const next = new Set(prev);
                                if (next.has(qNo)) next.delete(qNo); else next.add(qNo);
                                return next;
                              })}
                              data-testid={`picker-question-${qi}`}
                            >
                              <div className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${isChecked ? "bg-emerald-600 border-emerald-600" : "border-border"}`}>
                                {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="text-[9px] font-medium w-4 h-4 rounded-full bg-muted flex items-center justify-center shrink-0">{qi + 1}</span>
                                  <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${inner.questionType === "SHORT_ANSWER" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                                    {inner.questionType === "SHORT_ANSWER" ? "주관식" : "객관식"}
                                  </span>
                                </div>
                                {body && <p className="text-[10px] text-muted-foreground line-clamp-1 mb-0.5">{body}</p>}
                                <p className="text-[11px] text-foreground line-clamp-2 font-medium">{question || "(질문 없음)"}</p>
                                {rawChoices.length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {rawChoices.slice(0, 2).map((c: any, ci: number) => {
                                      const txt = typeof c === "string" ? c : (c.content?.replace(/<[^>]+>/g, "") || c.text || "");
                                      return txt ? <p key={ci} className={`text-[10px] ${inner.answer === ci + 1 ? "text-blue-600" : "text-muted-foreground"}`}>{ci + 1}. {txt.slice(0, 40)}{txt.length > 40 ? "..." : ""}</p> : null;
                                    })}
                                    {rawChoices.length > 2 && <p className="text-[9px] text-muted-foreground">+{rawChoices.length - 2}개</p>}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-border shrink-0">
                <span className="text-[12px] text-muted-foreground">
                  {selectedPickerQNos.size > 0
                    ? `${selectedPickerQNos.size}개 선택됨 · ${sourceIdx >= 0 ? `${sourceIdx + 1}번` : ""} 뒤에 추가됩니다`
                    : "문제를 선택하세요"}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-9 text-[13px] px-4" onClick={() => { setPickerOpen(false); setPickerPaperNo(null); setSelectedPickerQNos(new Set()); }}>취소</Button>
                  <Button
                    className="h-9 text-[13px] px-4 bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                    disabled={selectedPickerQNos.size === 0}
                    onClick={handleImportPicker}
                    data-testid="btn-import-picker"
                  >
                    <SquareCheck className="w-4 h-4" />
                    {selectedPickerQNos.size > 0 ? `${selectedPickerQNos.size}개 복사 후 편집` : "복사하기"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI Image Extract Modal */}
      {imageExtractOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ScanLine className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold">이미지로 문제 추출</h2>
                  <p className="text-[11px] text-muted-foreground">시험지 사진을 업로드하면 AI가 문제를 자동으로 추출합니다</p>
                </div>
              </div>
              <button
                onClick={() => { setImageExtractOpen(false); setExtractImage(null); setExtractedQuestions([]); }}
                className="p-1.5 rounded hover:bg-muted"
                data-testid="btn-close-image-extract"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Upload area */}
              {!extractImage ? (
                <div
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${extractDragOver ? "border-purple-400 bg-purple-50" : "border-border hover:border-purple-300 hover:bg-muted/30"}`}
                  onClick={() => extractFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setExtractDragOver(true); }}
                  onDragLeave={() => setExtractDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setExtractDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file && file.type.startsWith("image/")) setExtractImage(file);
                  }}
                  data-testid="image-extract-dropzone"
                >
                  <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-purple-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-medium text-foreground">이미지 드래그 또는 클릭하여 업로드</p>
                    <p className="text-[12px] text-muted-foreground mt-1">JPG, PNG, WEBP 지원 · 최대 10MB</p>
                  </div>
                  <input
                    ref={extractFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) setExtractImage(f); }}
                    data-testid="input-extract-image"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Image preview */}
                  <div className="relative rounded-xl overflow-hidden border border-border bg-muted/20">
                    <img
                      src={URL.createObjectURL(extractImage)}
                      alt="업로드된 이미지"
                      className="w-full max-h-56 object-contain"
                    />
                    <button
                      onClick={() => { setExtractImage(null); setExtractedQuestions([]); setSelectedExtractIds(new Set()); }}
                      className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-black/80"
                      data-testid="btn-remove-extract-image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">{extractImage.name} · {(extractImage.size / 1024 / 1024).toFixed(2)}MB</p>

                  {/* Analyze button */}
                  {extractedQuestions.length === 0 && (
                    <Button
                      className="w-full h-10 bg-purple-600 hover:bg-purple-700 gap-2"
                      onClick={handleExtractFromImage}
                      disabled={extractLoading}
                      data-testid="btn-analyze-image"
                    >
                      {extractLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          AI 분석 중...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          AI로 문제 추출하기
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {/* Extracted questions */}
              {extractedQuestions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{extractedQuestions.length}개 문제 추출됨</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-[11px] text-blue-600 hover:text-blue-700"
                        onClick={() => setSelectedExtractIds(new Set(extractedQuestions.map((_: any, i: number) => i)))}
                        data-testid="btn-extract-select-all"
                      >전체 선택</button>
                      <span className="text-muted-foreground text-[11px]">·</span>
                      <button
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedExtractIds(new Set())}
                        data-testid="btn-extract-deselect-all"
                      >전체 해제</button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {extractedQuestions.map((q: any, i: number) => {
                      const isSelected = selectedExtractIds.has(i);
                      return (
                        <div
                          key={i}
                          className={`border rounded-lg p-3 cursor-pointer transition-colors ${isSelected ? "border-purple-300 bg-purple-50/50" : "border-border bg-background hover:bg-muted/30"}`}
                          onClick={() => setSelectedExtractIds(prev => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i); else next.add(i);
                            return next;
                          })}
                          data-testid={`extracted-question-${i}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${isSelected ? "bg-purple-600 border-purple-600" : "border-border"}`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                  {q.type === "SHORT_ANSWER" ? "주관식" : "객관식"}
                                </span>
                                <span className="text-[9px] text-muted-foreground">문제 {i + 1}</span>
                              </div>
                              {q.body && <p className="text-[11px] text-muted-foreground mb-1 line-clamp-2">{q.body}</p>}
                              <p className="text-[12px] text-foreground font-medium line-clamp-2">{q.question || "(질문 없음)"}</p>
                              {q.choices?.length > 0 && (
                                <div className="mt-1.5 space-y-0.5">
                                  {q.choices.slice(0, 3).map((c: string, ci: number) => (
                                    <p key={ci} className={`text-[10px] ${q.answer === ci + 1 ? "text-blue-600 font-medium" : "text-muted-foreground"}`}>
                                      {ci + 1}. {c} {q.answer === ci + 1 && "✓"}
                                    </p>
                                  ))}
                                  {q.choices.length > 3 && <p className="text-[10px] text-muted-foreground">+{q.choices.length - 3}개 더</p>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    className="text-[11px] text-purple-600 hover:text-purple-700 flex items-center gap-1"
                    onClick={() => { setExtractedQuestions([]); setSelectedExtractIds(new Set()); }}
                    data-testid="btn-reanalyze"
                  >
                    <ScanLine className="w-3 h-3" /> 다시 분석
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-border shrink-0">
              <span className="text-[12px] text-muted-foreground">
                {extractedQuestions.length > 0 && `${selectedExtractIds.size}개 선택됨`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-9 text-[13px] px-4"
                  onClick={() => { setImageExtractOpen(false); setExtractImage(null); setExtractedQuestions([]); }}
                  data-testid="btn-extract-cancel"
                >
                  취소
                </Button>
                <Button
                  className="h-9 text-[13px] px-4 bg-purple-600 hover:bg-purple-700 gap-1.5"
                  disabled={selectedExtractIds.size === 0}
                  onClick={handleImportExtracted}
                  data-testid="btn-extract-import"
                >
                  <SquareCheck className="w-4 h-4" />
                  {selectedExtractIds.size > 0 ? `${selectedExtractIds.size}개 가져오기` : "가져오기"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for attachment */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        data-testid="hidden-file-input"
      />
    </>
  );
}
