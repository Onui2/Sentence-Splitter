import { useState, useCallback, useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { ArrowLeft, Plus, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2, ArrowUp, ArrowDown, Check, X } from "lucide-react";

interface SplitItem {
  id: string;
  originalText: string;
  translation: string;
  question: string;
}

const DEFAULT_QUESTION = "아래 문장을 읽고 녹음하세요.";

export default function ShadowingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const searchParams = new URLSearchParams(window.location.search);
  const defaultCategoryId = searchParams.get("categoryId");

  const { data: flipCategories } = useQuery<any[]>({
    queryKey: [api.flipCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.flipCategories.list.path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.content ?? data?.contents ?? data?.data ?? []);
    },
  });

  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>(
    defaultCategoryId ? Number(defaultCategoryId) : undefined
  );
  const [rawText, setRawText] = useState("");
  const [items, setItems] = useState<SplitItem[]>([]);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [bulkQuestion, setBulkQuestion] = useState(DEFAULT_QUESTION);
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
  const [defaultQuestion, setDefaultQuestion] = useState(DEFAULT_QUESTION);
  const [editQuestionItemId, setEditQuestionItemId] = useState<string | null>(null);
  const [editQuestionValue, setEditQuestionValue] = useState("");

  const getCategoryPathParts = (classifyNo: number): string[] => {
    const findPath = (nodes: any[], target: number, path: string[]): string[] | null => {
      for (const node of nodes) {
        const currentPath = [...path, node.name];
        if (node.classifyNo === target) return currentPath;
        if (node.children?.length) {
          const found = findPath(node.children, target, currentPath);
          if (found) return found;
        }
      }
      return null;
    };
    return findPath(flipCategories || [], classifyNo, []) || [];
  };

  const handleCategorySelect = (cat: any) => {
    setCategoryId(cat.classifyNo);
    if (!titleTouched && !title.trim()) {
      const parts = getCategoryPathParts(cat.classifyNo);
      const label = parts.slice(0, 2).join(" ");
      setTitle(label || cat.name || "");
    }
  };

  useEffect(() => {
    if (defaultCategoryId && flipCategories?.length && !titleTouched && !title.trim()) {
      const parts = getCategoryPathParts(Number(defaultCategoryId));
      const label = parts.slice(0, 2).join(" ");
      if (label) setTitle(label);
    }
  }, [flipCategories, defaultCategoryId]);

  const generateId = () => Math.random().toString(36).substring(2, 9);

  const splitBySentence = useCallback(() => {
    if (!rawText.trim()) return;
    const sentences = rawText
      .split(/(?<=[.!?。！？])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    setItems(sentences.map(s => ({
      id: generateId(),
      originalText: s,
      translation: "",
      question: DEFAULT_QUESTION,
    })));
  }, [rawText]);

  const splitByParagraph = useCallback(() => {
    if (!rawText.trim()) return;
    const paragraphs = rawText
      .split(/\n\s*\n|\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    setItems(paragraphs.map(s => ({
      id: generateId(),
      originalText: s,
      translation: "",
      question: DEFAULT_QUESTION,
    })));
  }, [rawText]);

  const updateItem = (id: string, field: keyof SplitItem, value: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
    if (syncEnabled) {
      const remaining = items.filter(item => item.id !== id);
      setRawText(remaining.map(item => item.originalText).join("\n\n"));
    }
    setDeleteItemId(null);
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      id: generateId(),
      originalText: "",
      translation: "",
      question: DEFAULT_QUESTION,
    }]);
  };

  const applyBulkQuestion = () => {
    setItems(prev => prev.map(item => ({ ...item, question: bulkQuestion })));
    setDefaultQuestion(bulkQuestion);
    setQuestionModalOpen(false);
    toast({ title: "완료", description: "모든 문항의 질문이 변경되었습니다." });
  };

  const handleOriginalTextChange = (id: string, value: string) => {
    updateItem(id, "originalText", value);
    if (syncEnabled) {
      const updatedItems = items.map(item =>
        item.id === id ? { ...item, originalText: value } : item
      );
      setRawText(updatedItems.map(item => item.originalText).join("\n\n"));
    }
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const newItems = [...items];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    setItems(newItems);
    if (syncEnabled) {
      setRawText(newItems.map(item => item.originalText).join("\n\n"));
    }
  };

  const createShadowing = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("제목을 입력해주세요.");
      if (items.length === 0) throw new Error("최소 1개 이상의 문장을 추가해주세요.");
      const validItems = items
        .map((item) => ({
          ...item,
          originalText: item.originalText.trim(),
          translation: item.translation.trim(),
          question: (item.question || DEFAULT_QUESTION).trim(),
        }))
        .filter((item) => item.originalText.length > 0);
      if (validItems.length === 0) throw new Error("원문 문장을 최소 1개 이상 입력해주세요.");
      const res = await apiRequest("POST", api.shadowing.create.path, {
        title: title.trim(),
        categoryId,
        sentences: validItems.map(item => ({
          originalText: item.originalText,
          translation: item.translation,
          question: item.question,
        })),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.list.path] });
      toast({ title: "성공", description: "쉐도잉이 생성되었습니다." });
      const catParam = categoryId ? `?categoryId=${categoryId}` : "";
      setLocation("/" + catParam);
    },
    onError: (error: Error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    }
  });

  const findCategoryInTree = (nodes: any[], classifyNo: number): any | null => {
    for (const node of nodes) {
      if (node.classifyNo === classifyNo) return node;
      if (node.children?.length) {
        const found = findCategoryInTree(node.children, classifyNo);
        if (found) return found;
      }
    }
    return null;
  };

  const getCategoryPath = (classifyNo: number): string => {
    const findPath = (nodes: any[], target: number, path: string[]): string[] | null => {
      for (const node of nodes) {
        const currentPath = [...path, node.name];
        if (node.classifyNo === target) return currentPath;
        if (node.children?.length) {
          const found = findPath(node.children, target, currentPath);
          if (found) return found;
        }
      }
      return null;
    };
    const parts = findPath(flipCategories || [], classifyNo, []);
    return parts ? parts.join(" > ") : "";
  };

  useEffect(() => {
    if (addingCatRoot || addingCatUnder) addCatInputRef.current?.focus();
  }, [addingCatRoot, addingCatUnder]);

  useEffect(() => {
    if (editingCat) editCatInputRef.current?.focus();
  }, [editingCat]);

  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [categoryDropdownOpen]);

  const toggleCatExpand = (id: string) => {
    setExpandedCatNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (body: { name: string; parentNo?: number }) => {
      const res = await fetch(api.flipCategories.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("카테고리 생성에 실패했습니다.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      setNewCatName("");
      setAddingCatRoot(false);
      setAddingCatUnder(null);
      toast({ title: "카테고리가 생성되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ classifyNo, name }: { classifyNo: string; name: string }) => {
      const res = await fetch(buildUrl(api.flipCategories.update.path, { classifyNo }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("카테고리 수정에 실패했습니다.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      setEditingCat(null);
      setEditCatName("");
      toast({ title: "카테고리 이름이 수정되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (classifyNo: string) => {
      const res = await fetch(buildUrl(api.flipCategories.delete.path, { classifyNo }), { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (_data, classifyNo) => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      if (categoryId === Number(classifyNo)) setCategoryId(undefined);
      setDeleteCatTarget(null);
      toast({ title: "카테고리가 삭제되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
      setDeleteCatTarget(null);
    },
  });

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (addingCatRoot) {
      createCategoryMutation.mutate({ name: newCatName.trim() });
    } else if (addingCatUnder) {
      createCategoryMutation.mutate({ name: newCatName.trim(), parentNo: Number(addingCatUnder) });
    }
  };

  const handleRenameCat = () => {
    if (!editCatName.trim() || !editingCat) return;
    updateCategoryMutation.mutate({ classifyNo: editingCat, name: editCatName.trim() });
  };

  const renderCatAddInput = (parentNo?: string) => (
    <div className={`flex items-center gap-1 px-2 py-1 ${parentNo ? 'ml-4' : ''}`}>
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
        data-testid="input-new-category-create"
      />
      <button
        onClick={handleAddCategory}
        disabled={createCategoryMutation.isPending}
        className="shrink-0 p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-50"
        data-testid="btn-confirm-add-cat"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { setAddingCatUnder(null); setAddingCatRoot(false); setNewCatName(""); }}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
        data-testid="btn-cancel-add-cat"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderCategoryTree = (nodes: any[], depth = 0): any => {
    if (depth >= 4 || !nodes?.length) return null;
    return (
      <div className={depth > 0 ? "ml-4" : ""}>
        {nodes.map((cat: any) => {
          const hasChildren = cat.children && cat.children.length > 0;
          const isExpanded = expandedCatNodes.has(String(cat.classifyNo));
          const isSelected = categoryId === cat.classifyNo;
          const canAddChild = depth < 3;
          const isEditing = editingCat === String(cat.classifyNo);
          return (
            <div key={cat.classifyNo}>
              <div
                className={`group w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 cursor-pointer ${isSelected ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => {
                  handleCategorySelect(cat);
                  if (hasChildren) toggleCatExpand(String(cat.classifyNo));
                }}
                data-testid={`cat-tree-node-${cat.classifyNo}`}
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
                    ref={editCatInputRef}
                    value={editCatName}
                    onChange={(e) => setEditCatName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameCat();
                      if (e.key === "Escape") { setEditingCat(null); setEditCatName(""); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] text-gray-900 outline-none focus:border-blue-500"
                    data-testid="input-rename-cat"
                  />
                ) : (
                  <span className="truncate flex-1">{cat.name}</span>
                )}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isEditing ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRenameCat(); }}
                        disabled={updateCategoryMutation.isPending}
                        className="p-0.5 text-emerald-600 hover:text-emerald-500"
                        data-testid="btn-confirm-rename-cat"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(null); setEditCatName(""); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid="btn-cancel-rename-cat"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      {canAddChild && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setAddingCatUnder(String(cat.classifyNo)); setAddingCatRoot(false); setNewCatName(""); if (!isExpanded) toggleCatExpand(String(cat.classifyNo)); }}
                          className={`p-0.5 ${isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                          data-testid={`btn-add-child-cat-${cat.classifyNo}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(String(cat.classifyNo)); setEditCatName(cat.name); }}
                        className={`p-0.5 ${isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        data-testid={`btn-rename-cat-${cat.classifyNo}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteCatTarget({ classifyNo: String(cat.classifyNo), name: cat.name }); }}
                        className={`p-0.5 ${isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                        data-testid={`btn-delete-cat-${cat.classifyNo}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
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


  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-border">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setLocation(defaultCategoryId ? `/?categoryId=${defaultCategoryId}` : "/")}
            data-testid="btn-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-[16px] font-semibold text-foreground">쉐도잉 만들기</h1>
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          <div className="p-4 md:p-6 space-y-4 border-b border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center h-[18px]">
                  <label className="text-[12px] font-medium text-muted-foreground">제목</label>
                </div>
                <Input
                  placeholder="쉐도잉 제목을 입력하세요"
                  className="bg-muted border-border h-10 text-[13px]"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center h-[18px]">
                  <label className="text-[12px] font-medium text-muted-foreground">카테고리</label>
                </div>
                <div className="relative" ref={catDropdownRef}>
                  <button
                    className="w-full flex items-center justify-between bg-muted border border-border rounded-md h-10 px-3 text-[13px]"
                    onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                    data-testid="btn-category-select"
                  >
                    <span className={categoryId ? "text-foreground" : "text-muted-foreground"}>
                      {categoryId ? getCategoryPath(categoryId) : "카테고리 선택"}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {categoryDropdownOpen && (
                    <div className="absolute top-full left-0 w-full mt-1 bg-background border border-border rounded-md shadow-xl z-50 max-h-72 overflow-y-auto p-1">
                      <div
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 cursor-pointer ${!categoryId ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                        onClick={() => { setCategoryId(undefined); setCategoryDropdownOpen(false); }}
                        data-testid="cat-tree-none"
                      >
                        없음
                      </div>
                      {renderCategoryTree(flipCategories || [])}
                      {addingCatRoot && renderCatAddInput()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-muted-foreground">내용동기화</span>
                <Switch
                  checked={syncEnabled}
                  onCheckedChange={setSyncEnabled}
                  className="data-[state=checked]:bg-blue-600"
                  data-testid="switch-sync"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 bg-muted/50 border border-border rounded-lg px-4 py-3">
              <span className="text-[12px] font-medium text-muted-foreground shrink-0">기본 질문:</span>
              <span className="text-[13px] text-foreground flex-1 truncate">{defaultQuestion}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] shrink-0"
                onClick={() => {
                  setBulkQuestion(defaultQuestion);
                  setQuestionModalOpen(true);
                }}
                data-testid="btn-bulk-question"
              >
                일괄 변경
              </Button>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-muted-foreground">원문 붙여넣기</label>
              <Textarea
                placeholder="원문 텍스트를 붙여넣으세요..."
                className="bg-muted border-border min-h-[140px] text-[13px] leading-relaxed resize-y"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                data-testid="textarea-raw"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                  onClick={splitBySentence}
                  data-testid="btn-split-sentence"
                >
                  문장 분할
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[12px] hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                  onClick={splitByParagraph}
                  data-testid="btn-split-paragraph"
                >
                  문단 분할
                </Button>
                {items.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[12px] text-destructive border-destructive/30 hover:bg-destructive hover:text-white transition-colors"
                    onClick={() => { setItems([]); }}
                    data-testid="btn-reset-items"
                  >
                    초기화
                  </Button>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium text-muted-foreground">문장 목록 ({items.length}개)</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={addItem}
                    data-testid="btn-add-item"
                  >
                    <Plus className="w-3 h-3 mr-1" /> 항목 추가
                  </Button>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted">
                      <TableRow className="hover:bg-transparent border-none">
                        <TableHead className="w-12 text-center text-muted-foreground font-medium text-[11px] h-9">번호</TableHead>
                        <TableHead className="text-muted-foreground font-medium text-[11px] h-9">문장</TableHead>
                        <TableHead className="w-12 text-center text-muted-foreground font-medium text-[11px] h-9"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.id} className="border-border/30 hover:bg-muted/30" data-testid={`split-item-${index}`}>
                          <TableCell className="text-center text-[12px] text-muted-foreground py-2 align-top pt-3">
                            {index + 1}
                          </TableCell>
                          <TableCell className="py-2 space-y-1.5">
                            <Textarea
                              placeholder="원문"
                              className="bg-background border-border text-[13px] min-h-[48px] resize-y"
                              value={item.originalText}
                              onChange={(e) => handleOriginalTextChange(item.id, e.target.value)}
                              data-testid={`input-original-${index}`}
                            />
                            <Input
                              placeholder="번역"
                              className="bg-background border-border text-[13px] h-9"
                              value={item.translation}
                              onChange={(e) => updateItem(item.id, "translation", e.target.value)}
                              data-testid={`input-translation-${index}`}
                            />
                          </TableCell>
                          <TableCell className="text-center py-2 align-top pt-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" data-testid={`btn-menu-${index}`}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuItem
                                  className="text-[13px] gap-2"
                                  onClick={() => {
                                    setEditQuestionItemId(item.id);
                                    setEditQuestionValue(item.question);
                                  }}
                                  data-testid={`menu-edit-question-${index}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  질문 수정
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[13px] gap-2"
                                  disabled={index === 0}
                                  onClick={() => moveItem(index, "up")}
                                  data-testid={`menu-move-up-${index}`}
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                  위로 이동
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[13px] gap-2"
                                  disabled={index === items.length - 1}
                                  onClick={() => moveItem(index, "down")}
                                  data-testid={`menu-move-down-${index}`}
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                  아래로 이동
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[13px] gap-2 text-destructive focus:text-destructive"
                                  onClick={() => setDeleteItemId(item.id)}
                                  data-testid={`menu-delete-${index}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
              </div>
            )}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 md:px-6 py-4 border-t border-border bg-background flex items-center justify-end gap-2 z-40">
          <Button
            variant="ghost"
            className="text-[13px] text-muted-foreground"
            onClick={() => {
              if (rawText.trim()) {
                setCancelConfirmOpen(true);
              } else {
                setLocation("/");
              }
            }}
            data-testid="btn-cancel"
          >
            취소
          </Button>
          <Button
            className="bg-blue-600 text-white text-[13px]"
            onClick={() => createShadowing.mutate()}
            disabled={createShadowing.isPending}
            data-testid="btn-submit"
          >
            {createShadowing.isPending ? "생성 중..." : "저장"}
          </Button>
        </div>
      </div>

      <Dialog open={questionModalOpen} onOpenChange={setQuestionModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>질문 일괄 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-[12px] text-muted-foreground">
              모든 문항의 질문을 아래 내용으로 일괄 변경합니다.
            </p>
            <Textarea
              className="bg-muted border-border text-[13px] min-h-[80px]"
              value={bulkQuestion}
              onChange={(e) => setBulkQuestion(e.target.value)}
              data-testid="textarea-bulk-question"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setQuestionModalOpen(false)}
            >
              취소
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={applyBulkQuestion}
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
          <div className="space-y-3 py-2">
            <p className="text-[12px] text-muted-foreground">
              이 문항의 질문을 수정합니다.
            </p>
            <Textarea
              className="bg-muted border-border text-[13px] min-h-[80px]"
              value={editQuestionValue}
              onChange={(e) => setEditQuestionValue(e.target.value)}
              data-testid="textarea-edit-question"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setEditQuestionItemId(null)}
            >
              취소
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                if (editQuestionItemId) {
                  updateItem(editQuestionItemId, "question", editQuestionValue);
                  setEditQuestionItemId(null);
                  toast({ title: "완료", description: "질문이 수정되었습니다." });
                }
              }}
              data-testid="btn-apply-edit-question"
            >
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteItemId !== null} onOpenChange={(open) => {
        if (!open) {
          setDeleteItemId(null);
          setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }, 0);
        }
      }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle>항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 항목을 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteItemId) removeItem(deleteItemId); setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }, 0); }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteCatTarget !== null} onOpenChange={(open) => {
        if (!open) {
          setDeleteCatTarget(null);
          setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }, 0);
        }
      }}>
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

      <AlertDialog open={cancelConfirmOpen} onOpenChange={(open) => {
        if (!open) {
          setCancelConfirmOpen(false);
          setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }, 0);
        }
      }}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; document.body.style.overflow = ''; }}>
          <AlertDialogHeader>
            <AlertDialogTitle>작성 취소</AlertDialogTitle>
            <AlertDialogDescription>
              입력된 원문이 있습니다. 정말 취소하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setCancelConfirmOpen(false); setTimeout(() => { document.body.style.pointerEvents = ''; document.body.style.overflow = ''; setLocation("/"); }, 0); }}
            >
              취소하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
