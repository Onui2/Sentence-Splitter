import { useState, useRef, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, ChevronDown, ChevronRight, Pencil, Trash2, Check, X, Upload, Film, Play } from "lucide-react";

interface VideoFile {
  id: string;
  file: File;
  title: string;
  previewUrl: string;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

interface VideoCreateModalProps {
  open: boolean;
  onClose: () => void;
  defaultCategoryId?: string | null;
}

export default function VideoCreateModal({ open, onClose, defaultCategoryId }: VideoCreateModalProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: categories } = useQuery<any[]>({
    queryKey: [api.videoCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.videoCategories.list.path);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.content ?? data?.contents ?? data?.data ?? []);
    },
  });

  const [files, setFiles] = useState<VideoFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | undefined>(
    defaultCategoryId ? Number(defaultCategoryId) : undefined
  );
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
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      files.forEach(f => URL.revokeObjectURL(f.previewUrl));
      setFiles([]);
      setSelectedFileId(null);
      setCategoryId(defaultCategoryId ? Number(defaultCategoryId) : undefined);
      setCategoryDropdownOpen(false);
      setIsUploading(false);
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open, defaultCategoryId]);

  useEffect(() => {
    if (open && modalRef.current) modalRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isUploading) handleClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, files, isUploading]);

  useEffect(() => {
    return () => { files.forEach(f => URL.revokeObjectURL(f.previewUrl)); };
  }, []);

  const addFiles = (newFiles: FileList | File[]) => {
    const videoFiles: VideoFile[] = [];
    for (const file of Array.from(newFiles)) {
      if (!file.type.startsWith("video/")) {
        toast({ title: "안내", description: `${file.name}은 영상 파일이 아닙니다.`, variant: "destructive" });
        continue;
      }
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      videoFiles.push({
        id: generateId(),
        file,
        title: nameWithoutExt,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: "pending",
      });
    }
    if (videoFiles.length === 0) return;
    setFiles(prev => [...prev, ...videoFiles]);
    if (!selectedFileId && videoFiles.length > 0) {
      setSelectedFileId(videoFiles[0].id);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const f = prev.find(x => x.id === id);
      if (f) URL.revokeObjectURL(f.previewUrl);
      const next = prev.filter(x => x.id !== id);
      if (selectedFileId === id) setSelectedFileId(next[0]?.id || null);
      return next;
    });
  };

  const updateFileTitle = (id: string, title: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, title } : f));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }, [selectedFileId]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadSingleFile = (vf: VideoFile): Promise<boolean> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append("file", vf.file);
      formData.append("title", vf.title.trim() || vf.file.name.replace(/\.[^/.]+$/, ""));
      if (categoryId) formData.append("categoryId", String(categoryId));

      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setFiles(prev => prev.map(f => f.id === vf.id ? { ...f, progress: pct, status: "uploading" } : f));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFiles(prev => prev.map(f => f.id === vf.id ? { ...f, progress: 100, status: "done" } : f));
          resolve(true);
        } else {
          let msg = "업로드 실패";
          try { msg = JSON.parse(xhr.responseText)?.message || msg; } catch {}
          setFiles(prev => prev.map(f => f.id === vf.id ? { ...f, status: "error", error: msg } : f));
          resolve(false);
        }
      };
      xhr.onerror = () => {
        setFiles(prev => prev.map(f => f.id === vf.id ? { ...f, status: "error", error: "네트워크 오류" } : f));
        resolve(false);
      };
      xhr.open("POST", api.videos.create.path);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  const handleUploadAll = async () => {
    const pendingFiles = files.filter(f => f.status === "pending" || f.status === "error");
    if (pendingFiles.length === 0) {
      toast({ title: "안내", description: "업로드할 파일이 없습니다." });
      return;
    }
    const untitled = pendingFiles.find(f => !f.title.trim());
    if (untitled) {
      toast({ title: "안내", description: "모든 파일의 제목을 입력해주세요.", variant: "destructive" });
      setSelectedFileId(untitled.id);
      return;
    }

    setIsUploading(true);
    let successCount = 0;
    for (const vf of pendingFiles) {
      setSelectedFileId(vf.id);
      const ok = await uploadSingleFile(vf);
      if (ok) successCount++;
    }
    setIsUploading(false);
    queryClient.invalidateQueries({ queryKey: [api.videos.list.path] });

    if (successCount === pendingFiles.length) {
      toast({ title: "성공", description: `${successCount}개 영상이 업로드되었습니다.` });
      onClose();
    } else {
      toast({ title: "안내", description: `${successCount}/${pendingFiles.length}개 업로드 성공. 실패한 항목을 확인해주세요.` });
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    const hasContent = files.length > 0;
    if (hasContent) setCancelConfirmOpen(true);
    else onClose();
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
    const parts = findPath(categories || [], classifyNo, []);
    return parts ? parts.join(" > ") : "";
  };

  useEffect(() => { if (addingCatRoot || addingCatUnder) addCatInputRef.current?.focus(); }, [addingCatRoot, addingCatUnder]);
  useEffect(() => { if (editingCat) editCatInputRef.current?.focus(); }, [editingCat]);
  useEffect(() => {
    if (!categoryDropdownOpen) return;
    const handler = (e: MouseEvent) => { if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) setCategoryDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [categoryDropdownOpen]);

  const toggleCatExpand = (id: string) => {
    setExpandedCatNodes(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const createCategoryMutation = useMutation({
    mutationFn: async (body: { name: string; parentNo?: number }) => {
      const res = await fetch(api.videoCategories.create.path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), credentials: "include",
      });
      if (!res.ok) throw new Error("카테고리 생성에 실패했습니다.");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [api.videoCategories.list.path] }); setNewCatName(""); setAddingCatRoot(false); setAddingCatUnder(null); },
    onError: (err: any) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ classifyNo, name }: { classifyNo: string; name: string }) => {
      const res = await fetch(`/api/video-categories/${classifyNo}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }), credentials: "include",
      });
      if (!res.ok) throw new Error("카테고리 수정에 실패했습니다.");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [api.videoCategories.list.path] }); setEditingCat(null); setEditCatName(""); },
    onError: (err: any) => toast({ title: "오류", description: err.message, variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (classifyNo: string) => {
      const res = await fetch(`/api/video-categories/${classifyNo}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [api.videoCategories.list.path] }); setDeleteCatTarget(null); },
    onError: (err: any) => { toast({ title: "오류", description: err.message, variant: "destructive" }); setDeleteCatTarget(null); },
  });

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    if (addingCatRoot) createCategoryMutation.mutate({ name: newCatName.trim() });
    else if (addingCatUnder) createCategoryMutation.mutate({ name: newCatName.trim(), parentNo: Number(addingCatUnder) });
  };

  const handleRenameCat = () => {
    if (!editCatName.trim() || !editingCat) return;
    updateCategoryMutation.mutate({ classifyNo: editingCat, name: editCatName.trim() });
  };

  if (!open) return null;

  const selectedFile = files.find(f => f.id === selectedFileId);
  const pendingCount = files.filter(f => f.status === "pending" || f.status === "error").length;
  const doneCount = files.filter(f => f.status === "done").length;
  const totalSize = files.reduce((a, f) => a + f.file.size, 0);

  const renderCatAddInput = (parentNo?: string) => (
    <div className={`flex items-center gap-1 px-2 py-1 ${parentNo ? 'ml-4' : ''}`}>
      <input ref={addCatInputRef} value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); if (e.key === "Escape") { setAddingCatUnder(null); setAddingCatRoot(false); setNewCatName(""); } }}
        placeholder="카테고리 이름" className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-1 text-[12px] text-gray-900 outline-none focus:border-blue-500" data-testid="input-new-category-create" />
      <button onClick={handleAddCategory} disabled={createCategoryMutation.isPending} className="shrink-0 p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-50" data-testid="btn-confirm-add-cat"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => { setAddingCatUnder(null); setAddingCatRoot(false); setNewCatName(""); }} className="shrink-0 p-1 text-gray-400 hover:text-gray-600" data-testid="btn-cancel-add-cat"><X className="w-3.5 h-3.5" /></button>
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
              <div className={`group w-full flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 cursor-pointer ${isSelected ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => { setCategoryId(cat.classifyNo); if (hasChildren) toggleCatExpand(String(cat.classifyNo)); }}
                data-testid={`cat-tree-node-${cat.classifyNo}`}>
                <span className="shrink-0 w-4 flex justify-center">
                  {hasChildren ? (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <ChevronRight className="w-3 h-3 opacity-0" />}
                </span>
                {isEditing ? (
                  <input ref={editCatInputRef} value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRenameCat(); if (e.key === "Escape") { setEditingCat(null); setEditCatName(""); } }}
                    onClick={(e) => e.stopPropagation()} className="flex-1 min-w-0 bg-white border border-gray-300 rounded px-2 py-0.5 text-[12px] text-gray-900 outline-none focus:border-blue-500" data-testid="input-rename-cat" />
                ) : <span className="truncate flex-1">{cat.name}</span>}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isEditing ? (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); handleRenameCat(); }} disabled={updateCategoryMutation.isPending} className="p-0.5 text-emerald-600 hover:text-emerald-500"><Check className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingCat(null); setEditCatName(""); }} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>
                    </>
                  ) : (
                    <>
                      {canAddChild && <button onClick={(e) => { e.stopPropagation(); setAddingCatUnder(String(cat.classifyNo)); setAddingCatRoot(false); setNewCatName(""); if (!isExpanded) toggleCatExpand(String(cat.classifyNo)); }} className={`p-0.5 ${isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`} data-testid={`btn-add-child-cat-${cat.classifyNo}`}><Plus className="w-3 h-3" /></button>}
                      <button onClick={(e) => { e.stopPropagation(); setEditingCat(String(cat.classifyNo)); setEditCatName(cat.name); }} className={`p-0.5 ${isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`} data-testid={`btn-rename-cat-${cat.classifyNo}`}><Pencil className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteCatTarget({ classifyNo: String(cat.classifyNo), name: cat.name }); }} className={`p-0.5 ${isSelected ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'}`} data-testid={`btn-delete-cat-${cat.classifyNo}`}><Trash2 className="w-3 h-3" /></button>
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

  const getStatusBadge = (vf: VideoFile) => {
    switch (vf.status) {
      case "done": return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">완료</span>;
      case "uploading": return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">{vf.progress}%</span>;
      case "error": return <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">실패</span>;
      default: return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">대기</span>;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="video-create-overlay"
        onClick={(e) => { if (e.target === e.currentTarget && !isUploading) handleClose(); }}>
        <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="영상 만들기"
          className={`bg-background rounded-xl shadow-2xl flex flex-col outline-none ${isMobile ? 'w-full h-full rounded-none' : 'w-[900px] max-h-[85vh]'}`}
          data-testid="video-create-modal">

          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-[16px] font-bold text-foreground" data-testid="modal-title">영상 만들기</h2>
            <button onClick={handleClose} disabled={isUploading} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors disabled:opacity-50" data-testid="btn-modal-close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="relative flex-1" ref={catDropdownRef}>
                <button className="w-full flex items-center justify-between bg-muted border border-border rounded-md h-9 px-3 text-[13px]"
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)} data-testid="btn-category-select">
                  <span className={categoryId ? "text-foreground" : "text-muted-foreground"}>
                    {categoryId ? getCategoryPath(categoryId) : "카테고리 선택 (선택사항)"}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {categoryDropdownOpen && (
                  <div className="absolute top-full left-0 w-full mt-1 bg-background border border-border rounded-md shadow-xl z-50 max-h-60 overflow-y-auto p-1">
                    <div className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-[13px] transition-colors mb-0.5 cursor-pointer ${!categoryId ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                      onClick={() => { setCategoryId(undefined); setCategoryDropdownOpen(false); }} data-testid="cat-tree-none">없음</div>
                    {renderCategoryTree(categories || [])}
                    {addingCatRoot && renderCatAddInput()}
                    <div className="flex items-center gap-1 px-2 py-1.5 text-[12px] text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer mt-1 border-t border-border pt-2"
                      onClick={() => { setAddingCatRoot(true); setAddingCatUnder(null); setNewCatName(""); }} data-testid="btn-add-root-cat">
                      <Plus className="w-3 h-3" /><span>새 카테고리</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground shrink-0">
                {files.length > 0 && `${files.length}개 파일 (${(totalSize / (1024 * 1024)).toFixed(1)} MB)`}
              </div>
            </div>
          </div>

          <div className={`flex-1 flex overflow-hidden ${isMobile ? 'flex-col' : ''}`}>
            <div className={`${isMobile ? 'flex-1' : 'w-[380px]'} border-r border-border flex flex-col overflow-hidden`}>
              <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleFileInput} data-testid="input-file" />

              <div
                className={`m-3 border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors shrink-0 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-border hover:border-blue-400 hover:bg-blue-50/30'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                data-testid="dropzone"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-blue-100' : 'bg-muted'}`}>
                  <Upload className={`w-4 h-4 ${isDragging ? 'text-blue-600' : 'text-muted-foreground'}`} />
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-medium text-foreground">{isDragging ? "여기에 놓으세요" : "클릭 또는 드래그하여 영상 추가"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">MP4, MOV, AVI, WebM (다중 선택 가능)</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5" data-testid="file-list">
                {files.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Film className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-[12px] text-muted-foreground">영상 파일을 추가해주세요</p>
                  </div>
                )}
                {files.map((vf, idx) => (
                  <div
                    key={vf.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${selectedFileId === vf.id ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-muted/50'}`}
                    onClick={() => setSelectedFileId(vf.id)}
                    data-testid={`file-item-${idx}`}
                  >
                    <div className="w-12 h-8 rounded bg-black/80 flex items-center justify-center shrink-0 overflow-hidden">
                      <Play className="w-3 h-3 text-white/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground truncate">{vf.title || vf.file.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground">{(vf.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                        {getStatusBadge(vf)}
                      </div>
                      {vf.status === "uploading" && (
                        <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${vf.progress}%` }} />
                        </div>
                      )}
                    </div>
                    {vf.status !== "uploading" && (
                      <button onClick={(e) => { e.stopPropagation(); removeFile(vf.id); }} className="p-1 text-muted-foreground hover:text-red-500 shrink-0" data-testid={`btn-remove-file-${idx}`}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={`${isMobile ? 'flex-1' : 'flex-1'} flex flex-col overflow-hidden`}>
              {selectedFile ? (
                <div className="flex-1 flex flex-col overflow-y-auto">
                  <div className="flex-1 bg-black/90 flex items-center justify-center min-h-[200px]">
                    <video
                      key={selectedFile.id}
                      src={selectedFile.previewUrl}
                      controls
                      className="max-w-full max-h-full"
                      data-testid="video-preview"
                    />
                  </div>
                  <div className="p-4 space-y-3 border-t border-border">
                    <div className="space-y-1">
                      <label className="text-[12px] font-medium text-muted-foreground">제목</label>
                      <Input
                        placeholder="영상 제목"
                        value={selectedFile.title}
                        onChange={(e) => updateFileTitle(selectedFile.id, e.target.value)}
                        className="h-9 text-[13px] bg-muted border-border"
                        disabled={selectedFile.status === "done" || selectedFile.status === "uploading"}
                        data-testid="input-title"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                      <span>파일명: {selectedFile.file.name}</span>
                      <span>{(selectedFile.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                    {selectedFile.status === "error" && selectedFile.error && (
                      <p className="text-[12px] text-red-500">{selectedFile.error}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <Film className="w-12 h-12 text-muted-foreground/20 mb-3" />
                  <p className="text-[13px] text-muted-foreground">파일을 선택하면 미리보기가 표시됩니다</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background">
            <div className="text-[12px] text-muted-foreground">
              {files.length > 0 && (
                <span>{doneCount > 0 && `${doneCount}개 완료`}{doneCount > 0 && pendingCount > 0 && " / "}{pendingCount > 0 && `${pendingCount}개 대기`}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-9 text-[13px] px-4" onClick={handleClose} disabled={isUploading} data-testid="btn-cancel">취소</Button>
              <Button className="h-9 text-[13px] bg-blue-600 hover:bg-blue-700 text-white px-6"
                onClick={handleUploadAll}
                disabled={isUploading || files.length === 0 || pendingCount === 0}
                data-testid="btn-upload">
                {isUploading ? "업로드 중..." : `업로드 (${pendingCount}개)`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">작성 취소</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">추가된 파일이 있습니다. 정말 나가시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]" data-testid="btn-stay">계속 작성</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white text-[13px]"
              onClick={() => { setCancelConfirmOpen(false); onClose(); }} data-testid="btn-leave">나가기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCatTarget} onOpenChange={(open) => !open && setDeleteCatTarget(null)}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">카테고리 삭제</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">'{deleteCatTarget?.name}' 카테고리를 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[13px]">취소</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white text-[13px]"
              onClick={() => deleteCatTarget && deleteCategoryMutation.mutate(deleteCatTarget.classifyNo)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
