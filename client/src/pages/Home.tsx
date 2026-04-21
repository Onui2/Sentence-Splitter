import { useFlipPapers, useFlipPaperDetail, useUpdateFlipPaper, useDeleteFlipPaper } from "@/hooks/use-shadowing";
import { useLocation } from "wouter";
import { Search, ChevronDown, ChevronRight, ChevronLeft, X, Pencil, Trash2, ChevronsLeft, ChevronsRight, Plus, Check, MoreHorizontal, FolderOpen, CircleHelp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

function MoveCategoryNode({ node, depth, expandedNodes, toggleExpand, onSelect, isPending }: {
  node: any;
  depth: number;
  expandedNodes: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (classifyNo: number) => void;
  isPending: boolean;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(String(node.classifyNo));
  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        data-testid={`move-cat-${node.classifyNo}`}
      >
        {hasChildren ? (
          <button
            className="w-4 h-4 flex items-center justify-center shrink-0"
            onClick={(e) => { e.stopPropagation(); toggleExpand(String(node.classifyNo)); }}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" />
        )}
        <span
          className="text-[13px] flex-1 truncate"
          onClick={() => !isPending && onSelect(node.classifyNo)}
        >
          {node.name}
        </span>
      </div>
      {hasChildren && isExpanded && node.children.map((child: any) => (
        <MoveCategoryNode
          key={child.classifyNo}
          node={child}
          depth={depth + 1}
          expandedNodes={expandedNodes}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
          isPending={isPending}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [location, setLocation] = useLocation();
  const [categoryId, setCategoryId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("categoryId");
  });
  const isMobile = useIsMobile();
  const [mobileCatOpen, setMobileCatOpen] = useState(false);

  const { data: flipCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: [api.flipCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.flipCategories.list.path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.content ?? data?.contents ?? data?.data ?? []);
    },
  });

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedPaperNo, setSelectedPaperNo] = useState<number | undefined>();

  const { toast } = useToast();
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [addingRoot, setAddingRoot] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [editingPaper, setEditingPaper] = useState(false);
  const [paperNameInput, setPaperNameInput] = useState("");
  const [editedSentences, setEditedSentences] = useState<{ ordering: number; shadowingNo: number; english: string; korean: string }[]>([]);
  const paperNameInputRef = useRef<HTMLInputElement>(null);
  const [defaultDetailQuestion, setDefaultDetailQuestion] = useState("다음 문장을 듣고 따라 말해보세요.");
  const [bulkQuestionModalOpen, setBulkQuestionModalOpen] = useState(false);
  const [bulkQuestionInput, setBulkQuestionInput] = useState("");
  const [editQuestionIdx, setEditQuestionIdx] = useState<number | null>(null);
  const [editQuestionInput, setEditQuestionInput] = useState("");
  const [deletedShadowingNos, setDeletedShadowingNos] = useState<number[]>([]);
  const [addSentencesText, setAddSentencesText] = useState("");
  const [moveCategoryOpen, setMoveCategoryOpen] = useState(false);
  const [movingPaperNos, setMovingPaperNos] = useState<number[]>([]);
  const [moveExpandedNodes, setMoveExpandedNodes] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<"single" | "bulk">("single");
  const updatePaperMutation = useUpdateFlipPaper();
  const deletePaperMutation = useDeleteFlipPaper();

  useEffect(() => {
    if (addingUnder || addingRoot) addInputRef.current?.focus();
  }, [addingUnder, addingRoot]);

  useEffect(() => {
    if (editingCat) editInputRef.current?.focus();
  }, [editingCat]);

  useEffect(() => {
    if (mobileCatOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileCatOpen]);

  const createCategoryMutation = useMutation({
    mutationFn: async (body: { name: string; parentNo?: number }) => {
      const res = await fetch(api.flipCategories.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      setAddingUnder(null);
      setAddingRoot(false);
      setNewCatName("");
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
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipCategories.list.path] });
      setEditingCat(null);
      setEditName("");
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
      if (categoryId === String(classifyNo)) setCategoryId(null);
      toast({ title: "카테고리가 삭제되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "오류", description: err.message, variant: "destructive" });
    },
  });

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (addingRoot) {
      createCategoryMutation.mutate({ name: newCatName.trim() });
    } else if (addingUnder) {
      createCategoryMutation.mutate({ name: newCatName.trim(), parentNo: Number(addingUnder) });
    }
  };

  const handleRenameCategory = () => {
    if (!editName.trim() || !editingCat) return;
    updateCategoryMutation.mutate({ classifyNo: editingCat, name: editName.trim() });
  };

  const handleDeleteCategory = (classifyNo: string, name: string) => {
    if (confirm(`"${name}" 카테고리를 삭제하시겠습니까?`)) {
      deleteCategoryMutation.mutate(classifyNo);
    }
  };

  const [movePending, setMovePending] = useState(false);

  const handleMovePapers = async (targetClassifyNo: number) => {
    setMovePending(true);
    try {
      const results = await Promise.allSettled(
        movingPaperNos.map(async (paperNo) => {
          const url = buildUrl(api.flipPapers.update.path, { paperNo });
          const res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classifyNo: targetClassifyNo }),
            credentials: "include",
          });
          if (!res.ok) throw new Error("Failed");
        })
      );
      const failedCount = results.filter(r => r.status === "rejected").length;
      if (failedCount > 0) {
        toast({ title: "일부 이동 실패", description: `${failedCount}개 학습지를 이동하지 못했습니다.`, variant: "destructive" });
      } else {
        toast({ title: `${movingPaperNos.length}개 학습지가 이동되었습니다.` });
      }
      setMoveCategoryOpen(false);
      setMovingPaperNos([]);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.list.path] });
    } catch {
      toast({ title: "이동 실패", description: "학습지 이동에 실패했습니다.", variant: "destructive" });
    } finally {
      setMovePending(false);
    }
  };

  const handleCategoryChange = (newCategoryId: string) => {
    setCategoryId(newCategoryId);
    setPage(0);
    setSelectedIds([]);
    setSearch("");
    setSelectedPaperNo(undefined);
    if (isMobile) setMobileCatOpen(false);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds([]);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(0);
    setSelectedIds([]);
  };

  const toggleExpand = (classifyNo: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(classifyNo)) next.delete(classifyNo);
      else next.add(classifyNo);
      return next;
    });
  };

  const filterCategories = (nodes: any[], search: string): any[] => {
    if (!search.trim()) return nodes;
    const term = search.trim().toLowerCase();
    return nodes.reduce((acc: any[], node: any) => {
      const filteredChildren = filterCategories(node.children || [], term);
      if (node.name.toLowerCase().includes(term) || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
      }
      return acc;
    }, []);
  };

  const displayCategories = filterCategories(flipCategories || [], categorySearch);

  const { data: papersData, isLoading } = useFlipPapers(
    categoryId || undefined,
    page,
    pageSize
  );

  const papers = papersData?.contents || [];
  const totalPages = papersData?.totalPages || 0;
  const totalCount = papersData?.totalElementsCnt || 0;

  const { data: paperDetail, isLoading: detailLoading } = useFlipPaperDetail(selectedPaperNo);

  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const filteredPapers = papers.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
  };

  const detailSentences = paperDetail?.shadowings
    ?.sort((a: any, b: any) => a.ordering - b.ordering)
    .map((s: any) => {
      const exampleItem = s.shadowing.body.find((b: any) => b.type === "EXAMPLE");
      const queryItem = s.shadowing.body.find((b: any) => b.type === "QUERY");
      return {
        no: s.ordering + 1,
        ordering: s.ordering,
        shadowingNo: s.shadowing.shadowingNo,
        english: exampleItem ? stripHtml(exampleItem.contents || "") : (s.shadowing.aiSound?.trim() || ""),
        korean: queryItem ? stripHtml(queryItem.contents || "") : "",
      };
    }) || [];

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
        data-testid="input-new-category"
      />
      <button
        onClick={handleAddCategory}
        disabled={createCategoryMutation.isPending}
        className="shrink-0 p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-50"
        data-testid="btn-confirm-add-category"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { setAddingUnder(null); setAddingRoot(false); setNewCatName(""); }}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
        data-testid="btn-cancel-add-category"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderFlipCategories = (nodes: any[], depth = 0) => {
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
                data-testid={`category-node-${cat.classifyNo}`}
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
                      data-testid="input-rename-category"
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
                        data-testid="btn-confirm-rename"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(null); setEditName(""); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid="btn-cancel-rename"
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
                          data-testid={`btn-add-child-${cat.classifyNo}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(String(cat.classifyNo)); setEditName(cat.name); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid={`btn-rename-${cat.classifyNo}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(String(cat.classifyNo), cat.name); }}
                        className="p-0.5 text-gray-400 hover:text-red-500"
                        data-testid={`btn-delete-${cat.classifyNo}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {hasChildren && isExpanded && renderFlipCategories(cat.children, depth + 1)}
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
            data-testid="input-category-search"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        <div className="flex items-center justify-between px-3 py-2 mb-1">
          <button
            onClick={() => { setCategoryId(null); setPage(0); setSelectedIds([]); setSearch(""); setSelectedPaperNo(undefined); if (isMobile) setMobileCatOpen(false); }}
            className={`font-semibold text-[14px] rounded-md px-1 py-0.5 transition-colors ${!categoryId ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="button-all-categories"
          >
            전체
          </button>
          <button
            onClick={() => { setAddingRoot(true); setAddingUnder(null); setNewCatName(""); }}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            data-testid="btn-add-root-category"
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
          renderFlipCategories(displayCategories)
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
              <button onClick={() => setMobileCatOpen(false)} className="p-1 text-muted-foreground hover:text-foreground" data-testid="btn-mobile-cat-close">
                <X className="w-4 h-4" />
              </button>
            </div>
            {categorySidebarContent}
          </div>
          <div className="flex-1 bg-black/30" onClick={() => setMobileCatOpen(false)} />
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-full px-4 md:px-6 py-3 flex items-center gap-3 md:gap-6 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4">
          <span className="text-[13px] font-medium text-foreground whitespace-nowrap">{selectedIds.length}개 선택됨</span>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-[13px]"
              onClick={() => {
                setMovingPaperNos(selectedIds);
                setMoveCategoryOpen(true);
              }}
              data-testid="btn-bulk-move"
            >이동</Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-[13px] text-destructive"
              disabled={deletePaperMutation.isPending}
              onClick={() => {
                setDeleteTarget("bulk");
                setDeleteConfirmOpen(true);
              }}
              data-testid="btn-bulk-delete"
            >삭제</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="text-[13px] text-muted-foreground">취소</Button>
          </div>
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
                data-testid="btn-mobile-cat-toggle"
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 h-9 text-[13px] font-medium no-default-hover-elevate"
              onClick={() => setLocation(categoryId ? `/create?categoryId=${categoryId}` : "/create")}
              data-testid="btn-create-shadowing"
            >
              쉐도잉 만들기
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 md:flex-none md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="쉐도잉 검색" 
                className="pl-10 bg-muted border-none rounded-md h-10 text-[13px] focus-visible:ring-1 focus-visible:ring-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-paper-search"
              />
            </div>
            <div className="px-3 py-1 bg-muted rounded text-[11px] text-muted-foreground shrink-0" data-testid="text-total-count">
              총 {search.trim() ? filteredPapers.length : totalCount}개
            </div>
          </div>

          <div className="rounded border border-border overflow-hidden overflow-x-auto">
              <Table className="table-fixed w-full border-collapse">
                <TableHeader className="bg-muted">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="w-10 px-3">
                      <input 
                        type="checkbox" 
                        className="rounded border-border bg-transparent" 
                        checked={selectedIds.length > 0 && selectedIds.length === filteredPapers.length}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(filteredPapers.map((p: any) => p.shadowingPaperNo));
                          else setSelectedIds([]);
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[12px] h-10 border-r border-border/30">
                      <div className="flex items-center justify-between px-1">
                        쉐도잉 학습지
                      </div>
                    </TableHead>
                    {!isMobile && (
                      <TableHead className="text-muted-foreground font-medium text-[12px] h-10 w-24 border-r border-border/30">
                        <div className="flex items-center justify-between px-1">
                          문장수
                        </div>
                      </TableHead>
                    )}
                    {!isMobile && (
                      <TableHead className="text-muted-foreground font-medium text-[12px] h-10 w-32 border-r border-border/30">
                        <div className="flex items-center justify-between px-1">
                          수정일
                        </div>
                      </TableHead>
                    )}
                    {!isMobile && (
                      <TableHead className="text-muted-foreground font-medium text-[12px] h-10 w-32">
                        <div className="flex items-center justify-between px-1">
                          담당자
                        </div>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i} className="border-border/30">
                        <TableCell className="px-3"><Skeleton className="h-4 w-4" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                        {!isMobile && <TableCell><Skeleton className="h-4 w-8 ml-auto" /></TableCell>}
                        {!isMobile && <TableCell><Skeleton className="h-4 w-20" /></TableCell>}
                        {!isMobile && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                      </TableRow>
                    ))
                  ) : filteredPapers.length === 0 ? (
                    <TableRow className="border-border/30">
                      <TableCell colSpan={isMobile ? 2 : 5} className="text-center text-muted-foreground py-12 text-[13px]">
                        학습지가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : filteredPapers.map((paper: any) => (
                    <TableRow 
                      key={paper.shadowingPaperNo} 
                      className={`border-border/30 hover:bg-muted/50 group cursor-pointer ${selectedPaperNo === paper.shadowingPaperNo ? 'bg-muted/50' : ''}`}
                      onClick={() => setSelectedPaperNo(paper.shadowingPaperNo)}
                      data-testid={`row-paper-${paper.shadowingPaperNo}`}
                    >
                      <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="rounded border-border bg-transparent"
                          checked={selectedIds.includes(paper.shadowingPaperNo)}
                          onChange={() => toggleSelect(paper.shadowingPaperNo)}
                        />
                      </TableCell>
                      <TableCell className="text-[13px] text-foreground py-2.5">
                        <span className="truncate block" data-testid={`text-paper-name-${paper.shadowingPaperNo}`}>
                          {paper.name}
                        </span>
                        {isMobile && (
                          <span className="text-[11px] text-muted-foreground">
                            {paper.shadowingCnt || 0}문장 · {formatDate(paper.writeInfo?.updatedAt || paper.writeInfo?.createdAt)}
                          </span>
                        )}
                      </TableCell>
                      {!isMobile && (
                        <TableCell className="text-right text-[13px] text-muted-foreground">
                          {paper.shadowingCnt || 0}
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell className="text-[13px] text-muted-foreground truncate">
                          {formatDate(paper.writeInfo?.updatedAt || paper.writeInfo?.createdAt)}
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell className="text-[13px] text-muted-foreground truncate">
                          {paper.writeInfo?.updatedByNm || paper.writeInfo?.createdByNm || "-"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

          {totalPages > 0 && (
            <div className="flex items-center justify-center gap-3 pt-3" data-testid="pagination">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(0)}
                  disabled={page === 0}
                  className="text-muted-foreground"
                  data-testid="btn-first-page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="text-muted-foreground"
                  data-testid="btn-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-0.5 mx-1">
                  {(() => {
                    const maxVisible = 5;
                    let start = Math.max(0, page - Math.floor(maxVisible / 2));
                    let end = Math.min(totalPages, start + maxVisible);
                    if (end - start < maxVisible) start = Math.max(0, end - maxVisible);
                    return Array.from({ length: end - start }, (_, i) => {
                      const p = start + i;
                      return (
                        <button
                          key={p}
                          onClick={() => handlePageChange(p)}
                          className={`min-w-[32px] h-8 rounded text-[13px] font-medium transition-colors ${
                            p === page
                              ? "bg-blue-600 text-white"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                          data-testid={`btn-page-${p + 1}`}
                        >
                          {p + 1}
                        </button>
                      );
                    });
                  })()}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-muted-foreground"
                  data-testid="btn-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(totalPages - 1)}
                  disabled={page >= totalPages - 1}
                  className="text-muted-foreground"
                  data-testid="btn-last-page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="h-6 w-px bg-border" />
              <Select value={String(pageSize)} onValueChange={(v) => handlePageSizeChange(Number(v))}>
                <SelectTrigger className="h-8 w-auto gap-1 bg-muted border-border text-[12px] text-muted-foreground px-3" data-testid="select-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10" className="text-[12px]">10 / 페이지</SelectItem>
                  <SelectItem value="20" className="text-[12px]">20 / 페이지</SelectItem>
                  <SelectItem value="50" className="text-[12px]">50 / 페이지</SelectItem>
                  <SelectItem value="100" className="text-[12px]">100 / 페이지</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!selectedPaperNo}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPaperNo(undefined);
            setEditingPaper(false);
          }
        }}
      >
        <DialogContent
          className="max-w-4xl w-[95vw] md:w-[90vw] max-h-[90vh] md:max-h-[85vh] flex flex-col p-0 gap-0"
          data-testid="modal-paper-detail"
        >
          <div className="px-6 pt-5 pb-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-[16px] font-semibold">
                  {editingPaper ? "쉐도잉 수정" : "쉐도잉 상세"}
                </DialogTitle>
                <DialogDescription className="sr-only">학습지 내용 보기 및 수정</DialogDescription>
              </div>
              <div className="flex items-center gap-1 mr-8">
                {!editingPaper && !detailLoading && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      onClick={() => {
                        if (selectedPaperNo) {
                          setMovingPaperNos([selectedPaperNo]);
                          setMoveCategoryOpen(true);
                        }
                      }}
                      title="카테고리 이동"
                      data-testid="btn-detail-move"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      onClick={() => {
                        setPaperNameInput(paperDetail?.name || "");
                        const sentences = detailSentences.map((s: any) => ({ ordering: s.ordering, shadowingNo: s.shadowingNo, english: s.english, korean: s.korean }));
                        setEditedSentences(sentences);
                        const firstQuestion = sentences.length > 0 ? sentences[0].korean : "다음 문장을 듣고 따라 말해보세요.";
                        setDefaultDetailQuestion(firstQuestion);
                        setDeletedShadowingNos([]);
                        setAddSentencesText("");
                        setEditingPaper(true);
                        setEditQuestionIdx(null);
                        setTimeout(() => paperNameInputRef.current?.focus(), 50);
                      }}
                      data-testid="btn-detail-edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      disabled={deletePaperMutation.isPending}
                      onClick={() => {
                        setDeleteTarget("single");
                        setDeleteConfirmOpen(true);
                      }}
                      data-testid="btn-detail-delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {detailLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : editingPaper ? (
              <div className="space-y-1">
                <label className="text-[12px] font-medium text-muted-foreground">학습지 이름 <span className="text-red-500">*</span></label>
                <Input
                  ref={paperNameInputRef}
                  value={paperNameInput}
                  onChange={e => setPaperNameInput(e.target.value)}
                  className="text-[14px]"
                  data-testid="input-rename-paper"
                />
              </div>
            ) : (
              <div>
                <h3 className="text-[15px] font-medium text-foreground" data-testid="text-detail-title">
                  {paperDetail?.name}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5" data-testid="text-detail-count">
                  문장 {paperDetail?.shadowingCnt || 0}개
                </p>
              </div>
            )}
          </div>

          {editingPaper && (
            <div className="flex items-center gap-3 mx-6 mt-3 mb-0 bg-muted/50 border border-border rounded-lg px-4 py-2.5">
              <span className="text-[12px] font-medium text-muted-foreground shrink-0">기본 질문:</span>
              <span className="text-[13px] text-foreground flex-1 truncate" data-testid="text-default-question">{defaultDetailQuestion}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] shrink-0"
                onClick={() => {
                  setBulkQuestionInput(defaultDetailQuestion);
                  setBulkQuestionModalOpen(true);
                }}
                data-testid="btn-bulk-question-detail"
              >
                일괄 변경
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {detailLoading ? (
              <div className="p-6 space-y-3">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-4 w-6 shrink-0" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : detailSentences.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-[13px]">
                문장이 없습니다.
              </div>
            ) : (<>
              <Table className="table-fixed w-full">
                <TableHeader className="bg-muted sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="w-12 text-center text-muted-foreground font-medium text-[11px] h-9">#</TableHead>
                    <TableHead className="text-muted-foreground font-medium text-[11px] h-9 border-l border-border/30">
                      <div className="flex items-center justify-between">
                        <span>문장</span>
                        <span className="text-[11px] text-muted-foreground font-normal">{detailSentences.length}개</span>
                      </div>
                    </TableHead>
                    {editingPaper && (
                      <TableHead className="w-10 text-muted-foreground font-medium text-[11px] h-9 border-l border-border/30" />
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editingPaper ? (
                    editedSentences.map((sentence, idx) => {
                      const isDeleted = deletedShadowingNos.includes(sentence.shadowingNo);
                      return (
                        <TableRow key={sentence.ordering} className={`border-border/30 ${isDeleted ? "opacity-50 bg-red-50/50" : ""}`} data-testid={`row-detail-sentence-edit-${idx + 1}`}>
                          <TableCell className="text-center text-[12px] text-muted-foreground py-1.5 align-top pt-2.5">
                            <span className={isDeleted ? "line-through" : ""}>{idx + 1}</span>
                          </TableCell>
                          <TableCell className="py-1.5 border-l border-border/30">
                            {isDeleted ? (
                              <p className="text-[13px] text-muted-foreground line-through px-1">{sentence.english}</p>
                            ) : editQuestionIdx === idx ? (
                              <div className="space-y-1.5">
                                <Input
                                  value={sentence.english}
                                  onChange={e => {
                                    const updated = [...editedSentences];
                                    updated[idx] = { ...updated[idx], english: e.target.value };
                                    setEditedSentences(updated);
                                  }}
                                  className="h-7 text-[13px] font-medium border-border/50"
                                  data-testid={`input-edit-english-${idx + 1}`}
                                />
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground shrink-0">질문:</span>
                                  <Input
                                    value={editQuestionInput}
                                    onChange={e => setEditQuestionInput(e.target.value)}
                                    className="h-7 text-[12px] border-border/50 flex-1"
                                    data-testid={`input-edit-question-${idx + 1}`}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[11px] px-2"
                                    onClick={() => {
                                      const updated = [...editedSentences];
                                      updated[idx] = { ...updated[idx], korean: editQuestionInput };
                                      setEditedSentences(updated);
                                      setEditQuestionIdx(null);
                                      setEditQuestionInput("");
                                    }}
                                    data-testid={`btn-confirm-question-${idx + 1}`}
                                  >
                                    <Check className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[11px] px-2"
                                    onClick={() => { setEditQuestionIdx(null); setEditQuestionInput(""); }}
                                    data-testid={`btn-cancel-question-${idx + 1}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <Input
                                  value={sentence.english}
                                  onChange={e => {
                                    const updated = [...editedSentences];
                                    updated[idx] = { ...updated[idx], english: e.target.value };
                                    setEditedSentences(updated);
                                  }}
                                  className="h-7 text-[13px] font-medium border-border/50"
                                  data-testid={`input-edit-english-${idx + 1}`}
                                />
                                {sentence.korean !== defaultDetailQuestion && sentence.korean && (
                                  <p className="text-[11px] text-blue-500 px-1">개별 질문: {sentence.korean}</p>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5 border-l border-border/30 align-top pt-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" data-testid={`btn-row-menu-${idx + 1}`}>
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {isDeleted ? (
                                  <DropdownMenuItem
                                    onClick={() => setDeletedShadowingNos(prev => prev.filter(no => no !== sentence.shadowingNo))}
                                    data-testid={`menu-restore-sentence-${idx + 1}`}
                                  >
                                    삭제 취소
                                  </DropdownMenuItem>
                                ) : (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setEditQuestionIdx(idx);
                                        setEditQuestionInput(sentence.korean);
                                      }}
                                      data-testid={`menu-edit-question-${idx + 1}`}
                                    >
                                      개별 질문 수정
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        setDeletedShadowingNos(prev => [...prev, sentence.shadowingNo]);
                                        if (editQuestionIdx === idx) { setEditQuestionIdx(null); setEditQuestionInput(""); }
                                      }}
                                      data-testid={`menu-delete-sentence-${idx + 1}`}
                                    >
                                      문장 삭제
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    detailSentences.map((sentence: any) => (
                      <TableRow key={sentence.no} className="border-border/30 hover:bg-muted/30" data-testid={`row-detail-sentence-${sentence.no}`}>
                        <TableCell className="text-center text-[12px] text-muted-foreground py-2.5 align-top">{sentence.no}</TableCell>
                        <TableCell className="py-2.5 border-l border-border/30">
                          <p className="text-[13px] font-medium text-foreground" data-testid={`text-english-${sentence.no}`}>{sentence.english}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5" data-testid={`text-korean-${sentence.no}`}>{sentence.korean}</p>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {editingPaper && (
                <div className="px-6 py-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">문장 추가</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground/60 hover:text-blue-500 transition-colors" data-testid="btn-add-sentences-help">
                            <CircleHelp className="w-3.5 h-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] text-[12px] leading-relaxed">
                          <p className="font-semibold mb-1">입력 방법</p>
                          <p>한 줄에 영어 문장 하나씩 입력하세요.</p>
                          <p className="mt-1.5 text-muted-foreground">예시:</p>
                          <p className="font-mono text-[11px]">Hello, how are you?</p>
                          <p className="font-mono text-[11px]">I am doing well.</p>
                          <p className="mt-1.5">저장하면 기본 질문이 자동으로 적용됩니다.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Textarea
                    value={addSentencesText}
                    onChange={e => setAddSentencesText(e.target.value)}
                    placeholder={"한 줄에 영어 문장 하나씩 입력...\nHello, how are you?\nI am doing well."}
                    className="text-[13px] min-h-[68px] resize-none"
                    data-testid="textarea-add-sentences"
                  />
                </div>
              )}
            </>)}
          </div>

          {editingPaper && (
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                className="text-[13px]"
                onClick={() => { setEditingPaper(false); setEditQuestionIdx(null); setDeletedShadowingNos([]); setAddSentencesText(""); }}
                data-testid="btn-cancel-edit-paper"
              >
                취소
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 text-white text-[13px]"
                disabled={updatePaperMutation.isPending}
                onClick={() => {
                  if (!selectedPaperNo || !paperDetail) return;
                  const edits = editedSentences
                    .filter(s => !deletedShadowingNos.includes(s.shadowingNo))
                    .map(s => ({ shadowingNo: s.shadowingNo, english: s.english, korean: s.korean }));
                  const newSentences = addSentencesText
                    .split("\n")
                    .map(line => line.trim())
                    .filter(Boolean)
                    .map(english => ({ english, question: defaultDetailQuestion }));
                  const nameChanged = paperNameInput.trim() && paperNameInput.trim() !== paperDetail.name;
                  updatePaperMutation.mutate(
                    {
                      paperNo: selectedPaperNo,
                      name: nameChanged ? paperNameInput.trim() : undefined,
                      edits,
                      deleteShadowingNos: deletedShadowingNos.length > 0 ? deletedShadowingNos : undefined,
                      addSentences: newSentences.length > 0 ? newSentences : undefined,
                    },
                    { onSuccess: () => { setEditingPaper(false); setEditQuestionIdx(null); setDeletedShadowingNos([]); setAddSentencesText(""); } }
                  );
                }}
                data-testid="btn-save-edit-paper"
              >
                {updatePaperMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkQuestionModalOpen} onOpenChange={setBulkQuestionModalOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-[15px] font-semibold">기본 질문 일괄 변경</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            모든 문항의 질문을 아래 내용으로 변경합니다.
          </DialogDescription>
          <Input
            value={bulkQuestionInput}
            onChange={e => setBulkQuestionInput(e.target.value)}
            className="text-[13px]"
            placeholder="질문을 입력하세요"
            data-testid="input-bulk-question"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" className="text-[13px]" onClick={() => setBulkQuestionModalOpen(false)}>
              취소
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 text-white text-[13px]"
              onClick={() => {
                setEditedSentences(prev => prev.map(s => ({ ...s, korean: bulkQuestionInput })));
                setDefaultDetailQuestion(bulkQuestionInput);
                setBulkQuestionModalOpen(false);
                toast({ title: "완료", description: "모든 문항의 질문이 변경되었습니다." });
              }}
              data-testid="btn-apply-bulk-question"
            >
              적용
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moveCategoryOpen} onOpenChange={(open) => { if (!open) { setMoveCategoryOpen(false); setMovingPaperNos([]); setMoveExpandedNodes(new Set()); } }}>
        <DialogContent className="max-w-sm" data-testid="modal-move-category">
          <DialogTitle className="text-[15px] font-semibold">카테고리 이동</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            {movingPaperNos.length}개 학습지를 이동할 카테고리를 선택하세요.
          </DialogDescription>
          <div className="max-h-[300px] overflow-y-auto border border-border rounded-md p-2 space-y-0.5">
            {(flipCategories || []).map((cat: any) => (
              <MoveCategoryNode
                key={cat.classifyNo}
                node={cat}
                depth={0}
                expandedNodes={moveExpandedNodes}
                toggleExpand={(id) => setMoveExpandedNodes(prev => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                onSelect={(classifyNo) => handleMovePapers(classifyNo)}
                isPending={movePending}
              />
            ))}
            {(!flipCategories || flipCategories.length === 0) && (
              <p className="text-[12px] text-muted-foreground text-center py-4">카테고리가 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent data-testid="modal-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>학습지 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget === "bulk"
                ? `${selectedIds.length}개 학습지를 삭제하시겠습니까?`
                : "이 학습지를 삭제하시겠습니까?"}
              {" "}삭제된 학습지는 복구할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-delete-cancel">취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePaperMutation.isPending}
              data-testid="btn-delete-confirm"
              onClick={async () => {
                if (deleteTarget === "bulk") {
                  const results = await Promise.allSettled(selectedIds.map(id => deletePaperMutation.mutateAsync(id)));
                  const failedCount = results.filter(r => r.status === "rejected").length;
                  if (failedCount > 0) {
                    toast({ title: "일부 삭제 실패", description: `${failedCount}개 학습지를 삭제하지 못했습니다.`, variant: "destructive" });
                  }
                  setSelectedIds([]);
                  if (selectedPaperNo && selectedIds.includes(selectedPaperNo)) {
                    setSelectedPaperNo(undefined);
                  }
                } else if (selectedPaperNo) {
                  deletePaperMutation.mutate(selectedPaperNo, {
                    onSuccess: () => setSelectedPaperNo(undefined),
                  });
                }
              }}
            >삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
