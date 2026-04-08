import { useLocation } from "wouter";
import { Search, ChevronDown, ChevronRight, X, Pencil, Trash2, Plus, Check, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import VideoCreateModal from "./VideoCreate";
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
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

export default function VideoHome() {
  const [location, setLocation] = useLocation();
  const [categoryId, setCategoryId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("categoryId");
  });
  const isMobile = useIsMobile();
  const [mobileCatOpen, setMobileCatOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: flipCategories, isLoading: categoriesLoading } = useQuery({
    queryKey: [api.videoCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.videoCategories.list.path);
      if (!res.ok) return [];
      return res.json();
    }
  });

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const { data: videosData, isLoading: videosLoading } = useQuery({
    queryKey: [api.videos.list.path, categoryId, page, search],
    queryFn: async () => {
      let url = `${api.videos.list.path}?page=${page}&size=20`;
      if (categoryId) url += `&classifyNo=${categoryId}`;
      if (search.trim()) url += `&integrateSearch=${encodeURIComponent(search.trim())}`;
      const res = await fetch(url);
      if (!res.ok) return { contents: [], totalElementsCnt: 0, totalPages: 0, page: 0, size: 20, elementsCntOfPage: 0 };
      return res.json();
    }
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
      const res = await apiRequest("POST", api.videoCategories.create.path, {
        name,
        parentNo: parentNo ? Number(parentNo) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.videoCategories.list.path] });
      setNewCatName("");
      setAddingUnder(null);
      setAddingRoot(false);
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ classifyNo, name }: { classifyNo: string; name: string }) => {
      const res = await apiRequest("PUT", `/api/video-categories/${classifyNo}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.videoCategories.list.path] });
      setEditingCat(null);
      setEditName("");
    },
    onError: (err: Error) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (classifyNo: string) => {
      const res = await apiRequest("DELETE", `/api/video-categories/${classifyNo}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.videoCategories.list.path] });
      setDeleteCatTarget(null);
      if (deleteCatTarget && categoryId === deleteCatTarget.classifyNo) setCategoryId(null);
    },
    onError: (err: Error) => { toast({ title: "오류", description: err.message, variant: "destructive" }); setDeleteCatTarget(null); },
  });

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

  const videosList = Array.isArray(videosData) ? videosData : (videosData?.contents || []);
  const filteredVideos = search.trim()
    ? videosList.filter((v: any) => (v.title || v.name || "").toLowerCase().includes(search.toLowerCase()))
    : videosList;

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
        data-testid="input-new-video-category"
      />
      <button
        onClick={handleAddCategory}
        disabled={createCategoryMutation.isPending}
        className="shrink-0 p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-50"
        data-testid="btn-confirm-add-video-category"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => { setAddingUnder(null); setAddingRoot(false); setNewCatName(""); }}
        className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
        data-testid="btn-cancel-add-video-category"
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
                data-testid={`video-category-node-${cat.classifyNo}`}
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
                      data-testid="input-rename-video-category"
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
                        data-testid="btn-confirm-video-rename"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(null); setEditName(""); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid="btn-cancel-video-rename"
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
                          data-testid={`btn-add-video-child-${cat.classifyNo}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCat(String(cat.classifyNo)); setEditName(cat.name); }}
                        className="p-0.5 text-gray-400 hover:text-gray-600"
                        data-testid={`btn-video-rename-${cat.classifyNo}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(String(cat.classifyNo), cat.name); }}
                        className="p-0.5 text-gray-400 hover:text-red-500"
                        data-testid={`btn-video-delete-${cat.classifyNo}`}
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
            data-testid="input-video-category-search"
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
            data-testid="btn-add-video-root-category"
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
              <button onClick={() => setMobileCatOpen(false)} className="p-1 text-muted-foreground hover:text-foreground" data-testid="btn-mobile-video-cat-close">
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
                data-testid="btn-mobile-video-cat-toggle"
              >
                <Menu className="w-4 h-4" />
              </Button>
            )}
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 h-9 text-[13px] font-medium no-default-hover-elevate"
              onClick={() => setCreateModalOpen(true)}
              data-testid="btn-create-video"
            >
              영상 만들기
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 md:flex-none md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="영상 검색"
                className="pl-10 bg-muted border-none rounded-md h-10 text-[13px] focus-visible:ring-1 focus-visible:ring-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-video-search"
              />
            </div>
            <div className="px-3 py-1 bg-muted rounded text-[11px] text-muted-foreground shrink-0" data-testid="text-video-total-count">
              총 {filteredVideos.length}개
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
                      disabled
                      data-testid="checkbox-video-select-all"
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground font-medium text-[12px] h-10 border-r border-border/30">
                    <div className="flex items-center justify-between px-1">
                      영상 학습지
                    </div>
                  </TableHead>
                  <TableHead className="w-20 text-center text-muted-foreground font-medium text-[12px] h-10 hidden md:table-cell">
                    상태
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videosLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="px-3"><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-8 mx-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : !filteredVideos.length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-12 text-[13px]">
                      영상이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVideos.map((video: any, idx: number) => (
                    <TableRow key={video.videoNo || idx} className="cursor-pointer hover:bg-muted/50" data-testid={`row-video-${video.videoNo || idx}`}>
                      <TableCell className="px-3">
                        <input type="checkbox" className="rounded border-border bg-transparent" />
                      </TableCell>
                      <TableCell className="text-[13px] truncate border-r border-border/30">
                        {video.title || video.name || `영상 ${idx + 1}`}
                      </TableCell>
                      <TableCell className="text-center text-[13px] text-muted-foreground hidden md:table-cell">
                        {video.status || "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
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

      <VideoCreateModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        defaultCategoryId={categoryId}
      />
    </div>
  );
}