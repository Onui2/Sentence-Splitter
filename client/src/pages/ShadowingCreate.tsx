import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SplitItem {
  id: string;
  originalText: string;
  translation: string;
  question: string;
}

type CategoryNode = {
  classifyNo: number;
  name: string;
  children?: CategoryNode[];
};

const DEFAULT_QUESTION = "아래 문장을 읽고 녹음하세요.";

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeCategoryList(data: any): CategoryNode[] {
  const list = Array.isArray(data) ? data : data?.content ?? data?.contents ?? data?.data ?? [];
  return Array.isArray(list) ? list : [];
}

function findCategoryPath(nodes: CategoryNode[], target?: number, path: string[] = []): string[] | null {
  if (!target) return null;
  for (const node of nodes) {
    const nextPath = [...path, node.name];
    if (node.classifyNo === target) return nextPath;
    const found = findCategoryPath(node.children || [], target, nextPath);
    if (found) return found;
  }
  return null;
}

function filterCategoryTree(nodes: CategoryNode[], keyword: string): CategoryNode[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return nodes;

  return nodes
    .map((node) => {
      const children = filterCategoryTree(node.children || [], keyword);
      const matched = node.name.toLowerCase().includes(q);
      if (!matched && children.length === 0) return null;
      return { ...node, children };
    })
    .filter(Boolean) as CategoryNode[];
}

function splitIntoSentences(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?。！？])\s+|(?<=[.!?。！？])\n+|\n(?=\S)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePairs(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result: Array<{ originalText: string; translation: string }> = [];
  let i = 0;
  while (i < lines.length) {
    const tabParts = lines[i].split("\t").map((part) => part.trim()).filter(Boolean);
    if (tabParts.length >= 2) {
      result.push({ originalText: tabParts[0], translation: tabParts.slice(1).join(" ") });
      i += 1;
    } else {
      result.push({ originalText: lines[i], translation: lines[i + 1] || "" });
      i += 2;
    }
  }
  return result;
}

export default function ShadowingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const initialCategoryId = searchParams.get("categoryId");

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<CategoryNode[]>({
    queryKey: [api.flipCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.flipCategories.list.path);
      if (!res.ok) return [];
      return normalizeCategoryList(await res.json());
    },
  });

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>(
    initialCategoryId ? Number(initialCategoryId) : undefined
  );
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [addingRoot, setAddingRoot] = useState(false);
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<CategoryNode | null>(null);
  const [rawText, setRawText] = useState("");
  const [items, setItems] = useState<SplitItem[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [defaultQuestion, setDefaultQuestion] = useState(DEFAULT_QUESTION);
  const [bulkQuestionOpen, setBulkQuestionOpen] = useState(false);
  const [bulkQuestion, setBulkQuestion] = useState(DEFAULT_QUESTION);
  const [editQuestionItemId, setEditQuestionItemId] = useState<string | null>(null);
  const [editQuestionValue, setEditQuestionValue] = useState("");
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const newCategoryRef = useRef<HTMLInputElement>(null);
  const editCategoryRef = useRef<HTMLInputElement>(null);

  const categoryPath = useMemo(() => {
    return findCategoryPath(categories, categoryId)?.join(" > ") || "";
  }, [categories, categoryId]);

  const visibleCategories = useMemo(
    () => filterCategoryTree(categories, categorySearch),
    [categories, categorySearch]
  );

  useEffect(() => {
    if (!initialCategoryId || titleTouched || title.trim() || categories.length === 0) return;
    const parts = findCategoryPath(categories, Number(initialCategoryId));
    if (parts?.length) setTitle(parts.slice(0, 2).join(" "));
  }, [categories, initialCategoryId, title, titleTouched]);

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setCategoryDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [categoryDropdownOpen]);

  useEffect(() => {
    if (addingRoot || addingUnder) newCategoryRef.current?.focus();
  }, [addingRoot, addingUnder]);

  useEffect(() => {
    if (editingCategory) editCategoryRef.current?.focus();
  }, [editingCategory]);

  const replaceItems = useCallback(
    (nextItems: SplitItem[]) => {
      setItems(nextItems);
      if (syncEnabled) setRawText(nextItems.map((item) => item.originalText).join("\n\n"));
    },
    [syncEnabled]
  );

  const createItems = (parts: Array<{ originalText: string; translation?: string }>) =>
    parts.map((part) => ({
      id: generateId(),
      originalText: part.originalText,
      translation: part.translation || "",
      question: defaultQuestion,
    }));

  const splitBySentence = () => {
    const sentences = splitIntoSentences(rawText);
    if (sentences.length === 0) return;
    replaceItems(createItems(sentences.map((originalText) => ({ originalText }))));
  };

  const splitByParagraph = () => {
    const paragraphs = rawText
      .replace(/\r\n/g, "\n")
      .split(/\n\s*\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) return;
    replaceItems(createItems(paragraphs.map((originalText) => ({ originalText }))));
  };

  const splitByPairs = () => {
    const pairs = parsePairs(rawText);
    if (pairs.length === 0) return;
    replaceItems(createItems(pairs));
  };

  const updateItem = (id: string, field: keyof SplitItem, value: string) => {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, [field]: value } : item));
      if (field === "originalText" && syncEnabled) {
        setRawText(next.map((item) => item.originalText).join("\n\n"));
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: generateId(), originalText: "", translation: "", question: defaultQuestion },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (syncEnabled) setRawText(next.map((item) => item.originalText).join("\n\n"));
      return next;
    });
    setDeleteItemId(null);
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    setItems((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      if (syncEnabled) setRawText(next.map((item) => item.originalText).join("\n\n"));
      return next;
    });
  };

  const handleCategorySelect = (category: CategoryNode) => {
    setCategoryId(category.classifyNo);
    if (!titleTouched && !title.trim()) {
      const parts = findCategoryPath(categories, category.classifyNo);
      setTitle(parts?.slice(0, 2).join(" ") || category.name);
    }
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (body: { name: string; parentNo?: number }) => {
      const res = await fetch(api.flipCategories.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "카테고리 생성에 실패했습니다.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      setAddingRoot(false);
      setAddingUnder(null);
      setNewCategoryName("");
      toast({ title: "카테고리가 생성되었습니다." });
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ classifyNo, name }: { classifyNo: string; name: string }) => {
      const res = await fetch(buildUrl(api.flipCategories.update.path, { classifyNo }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "카테고리 수정에 실패했습니다.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      setEditingCategory(null);
      setEditingCategoryName("");
      toast({ title: "카테고리 이름이 수정되었습니다." });
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (classifyNo: number) => {
      const res = await fetch(buildUrl(api.flipCategories.delete.path, { classifyNo }), { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "카테고리 삭제에 실패했습니다.");
      return res.json();
    },
    onSuccess: (_data, classifyNo) => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      if (categoryId === classifyNo) setCategoryId(undefined);
      setDeleteCategoryTarget(null);
      toast({ title: "카테고리가 삭제되었습니다." });
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const createShadowingMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("제목을 입력하세요.");

      const sentences = items
        .map((item) => ({
          originalText: item.originalText.trim(),
          translation: item.translation.trim(),
          question: (item.question || defaultQuestion).trim(),
        }))
        .filter((item) => item.originalText);

      if (sentences.length === 0) throw new Error("문장을 1개 이상 추가하세요.");

      const res = await apiRequest("POST", api.shadowing.create.path, {
        title: title.trim(),
        categoryId,
        sentences,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.list.path] });
      toast({ title: "저장 완료", description: "쉐도잉 자료가 생성되었습니다." });
      setLocation(categoryId ? `/?categoryId=${categoryId}` : "/");
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const submitNewCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    createCategoryMutation.mutate({
      name,
      parentNo: addingUnder ? Number(addingUnder) : undefined,
    });
  };

  const submitCategoryRename = () => {
    if (!editingCategory || !editingCategoryName.trim()) return;
    updateCategoryMutation.mutate({ classifyNo: editingCategory, name: editingCategoryName.trim() });
  };

  const renderCategoryInput = (parentNo?: string) => (
    <div className={`flex items-center gap-1 px-2 py-1 ${parentNo ? "ml-5" : ""}`}>
      <Input
        ref={newCategoryRef}
        value={newCategoryName}
        onChange={(event) => setNewCategoryName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submitNewCategory();
          if (event.key === "Escape") {
            setAddingRoot(false);
            setAddingUnder(null);
            setNewCategoryName("");
          }
        }}
        placeholder="카테고리 이름"
        className="h-7 text-[12px]"
        data-testid="input-new-category-create"
      />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={submitNewCategory}>
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          setAddingRoot(false);
          setAddingUnder(null);
          setNewCategoryName("");
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const renderCategoryTree = (nodes: CategoryNode[], depth = 0): JSX.Element => (
    <div className={depth > 0 ? "ml-4" : ""}>
      {nodes.map((category) => {
        const id = String(category.classifyNo);
        const children = category.children || [];
        const hasChildren = children.length > 0;
        const expanded = expandedNodes.has(id) || Boolean(categorySearch.trim());
        const selected = categoryId === category.classifyNo;
        const editing = editingCategory === id;

        return (
          <div key={id}>
            <div
              className={`group flex min-h-8 items-center gap-1 rounded-md px-2 text-[13px] ${
                selected ? "bg-blue-600 text-white" : "text-foreground hover:bg-muted"
              }`}
              data-testid={`cat-tree-node-${id}`}
              onClick={() => {
                handleCategorySelect(category);
                if (hasChildren) {
                  setExpandedNodes((prev) => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  });
                }
              }}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {hasChildren ? (
                  expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 opacity-0" />
                )}
              </span>
              {editing ? (
                <Input
                  ref={editCategoryRef}
                  value={editingCategoryName}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setEditingCategoryName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitCategoryRename();
                    if (event.key === "Escape") setEditingCategory(null);
                  }}
                  className="h-7 min-w-0 bg-background text-[12px] text-foreground"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                {editing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        submitCategoryRename();
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingCategory(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    {depth < 3 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(event) => {
                          event.stopPropagation();
                          setAddingUnder(id);
                          setAddingRoot(false);
                          setNewCategoryName("");
                          setExpandedNodes((prev) => new Set(prev).add(id));
                        }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingCategory(id);
                        setEditingCategoryName(category.name);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteCategoryTarget(category);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {addingUnder === id && renderCategoryInput(id)}
            {hasChildren && expanded && renderCategoryTree(children, depth + 1)}
          </div>
        );
      })}
    </div>
  );

  const hasDraft = title.trim() || rawText.trim() || items.some((item) => item.originalText.trim() || item.translation.trim());

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setLocation(categoryId ? `/?categoryId=${categoryId}` : "/")}
          data-testid="btn-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-[16px] font-semibold">쉐도잉 자료 만들기</h1>
      </div>

      <div className="flex-1 space-y-5 p-4 pb-28 md:p-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">제목</label>
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleTouched(true);
              }}
              placeholder="쉐도잉 자료 제목"
              className="h-10 bg-muted text-[13px]"
              data-testid="input-title"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">카테고리</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-muted px-3 text-left text-[13px]"
                onClick={() => setCategoryDropdownOpen((open) => !open)}
                data-testid="btn-category-select"
              >
                <span className={categoryId ? "truncate text-foreground" : "text-muted-foreground"}>
                  {categoryId ? categoryPath : "카테고리 선택"}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ${categoryDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {categoryDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border border-border bg-background p-2 shadow-xl">
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={categorySearch}
                      onChange={(event) => setCategorySearch(event.target.value)}
                      placeholder="카테고리 검색"
                      className="h-8 pl-7 text-[12px]"
                      data-testid="input-category-search"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <button
                      type="button"
                      className={`mb-1 flex min-h-8 w-full items-center rounded-md px-2 text-left text-[13px] ${
                        !categoryId ? "bg-blue-600 text-white" : "hover:bg-muted"
                      }`}
                      onClick={() => setCategoryId(undefined)}
                      data-testid="cat-tree-none"
                    >
                      없음
                    </button>
                    {categoriesLoading ? (
                      <div className="py-6 text-center text-[12px] text-muted-foreground">카테고리를 불러오는 중...</div>
                    ) : visibleCategories.length === 0 ? (
                      <div className="py-6 text-center text-[12px] text-muted-foreground">검색 결과가 없습니다.</div>
                    ) : (
                      renderCategoryTree(visibleCategories)
                    )}
                    {addingRoot && renderCategoryInput()}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 w-full justify-start text-[12px]"
                    onClick={() => {
                      setAddingRoot(true);
                      setAddingUnder(null);
                      setNewCategoryName("");
                    }}
                    data-testid="btn-add-root-category"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    루트 카테고리 추가
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} data-testid="switch-sync" />
            <span className="text-[12px] font-medium text-muted-foreground">원문 입력과 문장 목록 동기화</span>
          </div>
          <div className="hidden h-5 w-px bg-border md:block" />
          <span className="min-w-0 flex-1 truncate text-[13px]">기본 질문: {defaultQuestion}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => {
              setBulkQuestion(defaultQuestion);
              setBulkQuestionOpen(true);
            }}
            data-testid="btn-bulk-question"
          >
            질문 일괄 변경
          </Button>
        </section>

        <section className="space-y-2">
          <label className="text-[12px] font-medium text-muted-foreground">원문 붙여넣기</label>
          <Textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={"문장을 붙여넣으세요.\n탭 구분 또는 원문/번역 줄 교차 입력도 지원합니다."}
            className="min-h-[150px] resize-y bg-muted text-[13px] leading-relaxed"
            data-testid="textarea-raw"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={splitBySentence} data-testid="btn-split-sentence">
              문장 분할
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={splitByParagraph} data-testid="btn-split-paragraph">
              문단 분할
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={splitByPairs} data-testid="btn-split-pairs">
              원문/번역 가져오기
            </Button>
            {items.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive/30 text-[12px] text-destructive hover:bg-destructive hover:text-white"
                onClick={() => {
                  setItems([]);
                  if (syncEnabled) setRawText("");
                }}
                data-testid="btn-reset-items"
              >
                초기화
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-medium text-muted-foreground">문장 목록 ({items.length}개)</label>
            <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={addItem} data-testid="btn-add-item">
              <Plus className="mr-1 h-3.5 w-3.5" />
              항목 추가
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-[13px] text-muted-foreground">
              원문을 붙여넣고 분할 버튼을 누르거나 항목을 직접 추가하세요.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="w-12 text-center text-[11px]">번호</TableHead>
                    <TableHead className="text-[11px]">문장 / 번역</TableHead>
                    <TableHead className="hidden text-[11px] md:table-cell">질문</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.id} data-testid={`split-item-${index}`}>
                      <TableCell className="align-top pt-4 text-center text-[12px] text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="space-y-2 py-3">
                        <Textarea
                          value={item.originalText}
                          onChange={(event) => updateItem(item.id, "originalText", event.target.value)}
                          placeholder="원문"
                          className="min-h-[48px] resize-y bg-background text-[13px]"
                          data-testid={`input-original-${index}`}
                        />
                        <Input
                          value={item.translation}
                          onChange={(event) => updateItem(item.id, "translation", event.target.value)}
                          placeholder="번역"
                          className="h-9 bg-background text-[13px]"
                          data-testid={`input-translation-${index}`}
                        />
                        <button
                          type="button"
                          className="block max-w-full truncate text-left text-[11px] text-muted-foreground md:hidden"
                          onClick={() => {
                            setEditQuestionItemId(item.id);
                            setEditQuestionValue(item.question);
                          }}
                        >
                          질문: {item.question || defaultQuestion}
                        </button>
                      </TableCell>
                      <TableCell className="hidden max-w-[260px] align-top pt-4 text-[12px] text-muted-foreground md:table-cell">
                        <button
                          type="button"
                          className="line-clamp-2 text-left hover:text-foreground"
                          onClick={() => {
                            setEditQuestionItemId(item.id);
                            setEditQuestionValue(item.question);
                          }}
                        >
                          {item.question || defaultQuestion}
                        </button>
                      </TableCell>
                      <TableCell className="align-top pt-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`btn-menu-${index}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditQuestionItemId(item.id);
                                setEditQuestionValue(item.question);
                              }}
                              data-testid={`menu-edit-question-${index}`}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              질문 수정
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={index === 0} onClick={() => moveItem(index, "up")} data-testid={`menu-move-up-${index}`}>
                              <ArrowUp className="mr-2 h-3.5 w-3.5" />
                              위로 이동
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={index === items.length - 1}
                              onClick={() => moveItem(index, "down")}
                              data-testid={`menu-move-down-${index}`}
                            >
                              <ArrowDown className="mr-2 h-3.5 w-3.5" />
                              아래로 이동
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteItemId(item.id)} data-testid={`menu-delete-${index}`}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              삭제
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-end gap-2 border-t border-border bg-background px-4 py-4 md:px-6">
        <Button
          variant="ghost"
          className="text-[13px] text-muted-foreground"
          onClick={() => (hasDraft ? setCancelConfirmOpen(true) : setLocation(categoryId ? `/?categoryId=${categoryId}` : "/"))}
          data-testid="btn-cancel"
        >
          취소
        </Button>
        <Button
          className="bg-blue-600 text-[13px] text-white hover:bg-blue-700"
          disabled={createShadowingMutation.isPending}
          onClick={() => createShadowingMutation.mutate()}
          data-testid="btn-submit"
        >
          {createShadowingMutation.isPending ? "저장 중..." : "저장"}
        </Button>
      </div>

      <Dialog open={bulkQuestionOpen} onOpenChange={setBulkQuestionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>질문 일괄 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-[12px] text-muted-foreground">모든 문장 질문을 아래 내용으로 변경합니다.</p>
            <Textarea
              value={bulkQuestion}
              onChange={(event) => setBulkQuestion(event.target.value)}
              className="min-h-[90px] bg-muted text-[13px]"
              data-testid="textarea-bulk-question"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkQuestionOpen(false)}>
              취소
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                const nextQuestion = bulkQuestion.trim() || DEFAULT_QUESTION;
                setDefaultQuestion(nextQuestion);
                setItems((prev) => prev.map((item) => ({ ...item, question: nextQuestion })));
                setBulkQuestionOpen(false);
                toast({ title: "적용 완료", description: "모든 문장 질문이 변경되었습니다." });
              }}
              data-testid="btn-apply-bulk-question"
            >
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editQuestionItemId !== null} onOpenChange={(open) => !open && setEditQuestionItemId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>개별 질문 수정</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editQuestionValue}
            onChange={(event) => setEditQuestionValue(event.target.value)}
            className="min-h-[90px] bg-muted text-[13px]"
            data-testid="textarea-edit-question"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditQuestionItemId(null)}>
              취소
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                if (editQuestionItemId) updateItem(editQuestionItemId, "question", editQuestionValue.trim() || DEFAULT_QUESTION);
                setEditQuestionItemId(null);
              }}
              data-testid="btn-apply-edit-question"
            >
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteItemId !== null} onOpenChange={(open) => !open && setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 문장 항목을 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteItemId && removeItem(deleteItemId)}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteCategoryTarget !== null} onOpenChange={(open) => !open && setDeleteCategoryTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카테고리 삭제</AlertDialogTitle>
            <AlertDialogDescription>"{deleteCategoryTarget?.name}" 카테고리를 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCategoryTarget && deleteCategoryMutation.mutate(deleteCategoryTarget.classifyNo)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>작성 취소</AlertDialogTitle>
            <AlertDialogDescription>입력한 내용이 사라집니다. 작성을 취소하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => setLocation(categoryId ? `/?categoryId=${categoryId}` : "/")}
            >
              취소하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
