import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookA, Check, ChevronRight, Plus, Search, Shuffle, SortAsc, Trash2, X } from "lucide-react";

import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type WordItem = {
  eng: string;
  kor: string;
  part?: string;
  level?: string;
  exampleInEng?: string;
  exampleInKor?: string;
};

type Step = 1 | 2 | 3;

function normalizeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.contents ?? data?.content ?? data?.data ?? data?.items ?? [];
}

function getId(item: any) {
  return item.wordPaperNo ?? item.vocabularyNo ?? item.id ?? item.no ?? item.paperNo;
}

function getName(item: any) {
  return item.name ?? item.title ?? item.paperNm ?? item.vocabularyName ?? "이름 없음";
}

function getCount(item: any) {
  return item.wordCnt ?? item.wordsCnt ?? item.contentsCnt ?? item.contents?.length ?? item.questionCnt ?? 0;
}

function parseWords(text: string): WordItem[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|,/).map((part) => part.trim());
      return {
        eng: parts[0] || "",
        kor: parts[1] || "",
        part: parts[2] || "",
        level: parts[3] || "",
        exampleInEng: parts[4] || "",
        exampleInKor: parts[5] || "",
      };
    })
    .filter((word) => word.eng && word.kor);
}

function categoryName(node: any) {
  return node.name ?? node.classifyName ?? node.title ?? String(node.classifyNo ?? node.id ?? "");
}

function findCategoryPath(nodes: any[], id?: number, path: string[] = []): string[] | null {
  if (!id) return null;
  for (const node of nodes) {
    const nodeId = Number(node.classifyNo ?? node.id);
    const next = [...path, categoryName(node)];
    if (nodeId === id) return next;
    const found = findCategoryPath(node.children ?? [], id, next);
    if (found) return found;
  }
  return null;
}

function hasSelectedDescendant(node: any, selectedId?: number): boolean {
  if (!selectedId) return false;
  const id = Number(node.classifyNo ?? node.id);
  if (id === selectedId) return true;
  return (node.children ?? []).some((child: any) => hasSelectedDescendant(child, selectedId));
}

function CategoryList({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: any[];
  selectedId?: number;
  onSelect: (id?: number) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const renderNode = (node: any, depth = 0): JSX.Element => {
    const id = Number(node.classifyNo ?? node.id);
    const children = node.children ?? [];
    const hasChildren = children.length > 0;
    const expanded = expandedIds.has(id) || hasSelectedDescendant(node, selectedId);
    const selected = selectedId === id;
    return (
      <div key={`${id}-${categoryName(node)}`}>
        <button
          className={`flex h-8 w-full items-center gap-1 rounded-md px-2 text-left text-[13px] ${
            selected ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() => onSelect(selected ? undefined : id)}
        >
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center"
            onClick={(event) => {
              if (!hasChildren) return;
              event.stopPropagation();
              setExpandedIds((prev) => {
                const next = new Set(prev);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              });
            }}
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${hasChildren ? "" : "opacity-0"} ${expanded ? "rotate-90" : ""}`} />
          </span>
          <span className="truncate">{categoryName(node)}</span>
        </button>
        {expanded && children.map((child: any) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      <button
        className={`mb-1 h-8 w-full rounded-md px-2 text-left text-[13px] font-semibold ${
          !selectedId ? "text-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
        onClick={() => onSelect(undefined)}
      >
        전체
      </button>
      {nodes.map((node) => renderNode(node))}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["입력방식", "단어입력", "확인 및 저장"];
  return (
    <div className="grid grid-cols-3 gap-4 bg-muted/40 px-7 py-5">
      {labels.map((label, index) => {
        const n = (index + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold ${
              active || done ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
            }`}>
              {done ? <Check className="h-4 w-4" /> : n}
            </div>
            <div className={`text-[14px] font-semibold ${active || done ? "text-blue-600" : "text-muted-foreground"}`}>{label}</div>
            {index < labels.length - 1 && <div className={`ml-auto h-px flex-1 ${done ? "bg-blue-500" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function WordHome() {
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [rawWords, setRawWords] = useState("");
  const [wordDrafts, setWordDrafts] = useState<WordItem[]>([]);

  const { data: categoriesRaw = [] } = useQuery({
    queryKey: [api.wordCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.wordCategories.list.path);
      if (!res.ok) return [];
      return normalizeList(await res.json());
    },
  });

  const { data: papersRaw, isLoading } = useQuery({
    queryKey: [api.wordPapers.list.path, categoryId, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "0", size: "50" });
      if (categoryId) params.set("classifyNo", String(categoryId));
      if (search.trim()) params.set("integrateSearch", search.trim());
      const res = await fetch(`${api.wordPapers.list.path}?${params}`);
      if (!res.ok) return { contents: [] };
      return res.json();
    },
  });

  const parsedWords = useMemo(() => parseWords(rawWords), [rawWords]);
  const papers = normalizeList(papersRaw);
  const categoryPath = findCategoryPath(categoriesRaw, categoryId)?.join(" > ");

  const createMutation = useMutation({
    mutationFn: async () => {
      const words = wordDrafts.filter((word) => word.eng.trim() && word.kor.trim());
      if (!title.trim()) throw new Error("단어장 이름을 입력하세요.");
      if (words.length === 0) throw new Error("단어를 1개 이상 입력하세요.");
      const res = await apiRequest("POST", api.wordPapers.create.path, {
        title: title.trim(),
        categoryId,
        words,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "단어장 생성 실패");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.wordPapers.list.path] });
      setCreateOpen(false);
      setStep(1);
      setTitle("");
      setRawWords("");
      setWordDrafts([]);
      toast({ title: "단어장이 저장되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (paper: any) => {
      const id = getId(paper);
      const res = await apiRequest("DELETE", buildUrl(api.wordPapers.delete.path, { vocabularyNo: id }));
      if (!res.ok) throw new Error((await res.json()).message || "삭제 실패");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.wordPapers.list.path] });
      setDeleteTarget(null);
      toast({ title: "단어장이 삭제되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setStep(1);
    setTitle("");
    setRawWords("");
    setWordDrafts([]);
    setCreateOpen(true);
  };

  const goStep2 = () => setStep(2);
  const goStep3 = () => {
    const next = parsedWords.length > 0 ? parsedWords : wordDrafts;
    setWordDrafts(next.length > 0 ? next : [{ eng: "", kor: "", part: "", level: "" }]);
    setStep(3);
  };

  const updateDraft = (index: number, patch: Partial<WordItem>) => {
    setWordDrafts((prev) => prev.map((word, i) => (i === index ? { ...word, ...patch } : word)));
  };

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-64 border-r border-border bg-background p-4 md:block">
        <div className="mb-4 flex items-center gap-2 text-[14px] font-semibold">
          <BookA className="h-4 w-4" />
          단어 카테고리
        </div>
        <CategoryList nodes={categoriesRaw} selectedId={categoryId} onSelect={setCategoryId} />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4 md:p-6">
          <Button className="h-9 bg-blue-600 text-[13px] text-white hover:bg-blue-700" onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            단어장 만들기
          </Button>
          <div className="relative ml-auto w-full md:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="단어장 검색"
              className="h-10 bg-muted pl-10 text-[13px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="text-[12px]">단어장</TableHead>
                  <TableHead className="hidden w-28 text-center text-[12px] md:table-cell">단어 수</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-[13px] text-muted-foreground">불러오는 중...</TableCell></TableRow>
                ) : papers.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-[13px] text-muted-foreground">단어장이 없습니다.</TableCell></TableRow>
                ) : (
                  papers.map((paper: any) => (
                    <TableRow key={getId(paper)}>
                      <TableCell className="text-[13px] font-medium">{getName(paper)}</TableCell>
                      <TableCell className="hidden text-center text-[13px] text-muted-foreground md:table-cell">{getCount(paper)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(paper)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[92vh] max-w-[min(1600px,calc(100vw-40px))] flex-col gap-0 p-0">
          <DialogHeader className="px-8 py-6">
            <DialogTitle className="text-[22px]">단어장 만들기</DialogTitle>
          </DialogHeader>
          <Stepper step={step} />

          {step === 1 && (
            <div className="grid min-h-[500px] grid-cols-2 gap-8 px-8 py-7">
              <section>
                <h3 className="mb-3 text-[15px] font-semibold">단어 입력</h3>
                <Textarea
                  value={rawWords}
                  onChange={(event) => setRawWords(event.target.value)}
                  placeholder={"apple\t사과\t명사\t초\nbridge\t다리\t명사\t중"}
                  className="h-[405px] resize-none text-[14px]"
                />
                <p className="mt-3 text-[12px] text-muted-foreground">
                  탭 또는 쉼표 구분: 영단어 → 뜻 → 품사 → 난이도 → 예문 → 해석
                </p>
              </section>
              <section>
                <h3 className="mb-3 text-[15px] font-semibold">미리보기</h3>
                <div className="flex h-[405px] items-center justify-center rounded-md border border-dashed border-border bg-muted/10">
                  {parsedWords.length === 0 ? (
                    <span className="text-[13px] text-muted-foreground">단어를 입력하면 미리보기가 표시됩니다</span>
                  ) : (
                    <div className="h-full w-full overflow-auto p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">#</TableHead>
                            <TableHead>영단어</TableHead>
                            <TableHead>뜻</TableHead>
                            <TableHead className="w-24">품사</TableHead>
                            <TableHead className="w-24">난이도</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedWords.map((word, index) => (
                            <TableRow key={`${word.eng}-${index}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{word.eng}</TableCell>
                              <TableCell>{word.kor}</TableCell>
                              <TableCell>{word.part || "-"}</TableCell>
                              <TableCell>{word.level || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {step === 2 && (
            <div className="min-h-[500px] px-8 py-7">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold">단어 목록 <span className="rounded bg-muted px-2 py-1 text-[12px]">{wordDrafts.length}개</span></h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">필요하면 저장 전 단어를 직접 수정하세요.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"><SortAsc className="mr-1 h-4 w-4" />ABC순</Button>
                  <Button variant="outline" size="sm"><Shuffle className="mr-1 h-4 w-4" />랜덤</Button>
                </div>
              </div>
              <div className="max-h-[360px] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="w-14 text-center">#</TableHead>
                      <TableHead>영단어</TableHead>
                      <TableHead>한글 뜻</TableHead>
                      <TableHead className="w-28">품사</TableHead>
                      <TableHead className="w-28">난이도</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wordDrafts.map((word, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell><Input value={word.eng} onChange={(e) => updateDraft(index, { eng: e.target.value })} /></TableCell>
                        <TableCell><Input value={word.kor} onChange={(e) => updateDraft(index, { kor: e.target.value })} /></TableCell>
                        <TableCell><Input value={word.part || ""} onChange={(e) => updateDraft(index, { part: e.target.value })} /></TableCell>
                        <TableCell><Input value={word.level || ""} onChange={(e) => updateDraft(index, { level: e.target.value })} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWordDrafts((prev) => prev.filter((_, i) => i !== index))}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" className="mt-4 h-9 w-full" onClick={() => setWordDrafts((prev) => [...prev, { eng: "", kor: "", part: "", level: "" }])}>
                <Plus className="mr-1 h-4 w-4" />
                단어 추가
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="min-h-[500px] space-y-5 px-8 py-7">
              <div>
                <label className="mb-2 block text-[14px] font-semibold">단어장 이름 <span className="text-red-500">*</span></label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="단어장 이름을 입력하세요" className="h-10" />
              </div>
              <div>
                <label className="mb-2 block text-[14px] font-semibold">카테고리 (선택)</label>
                <div className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-[13px]">
                  <span className="text-muted-foreground">선택:</span>
                  <span>{categoryPath || "없음"}</span>
                  {categoryId && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCategoryId(undefined)}><X className="h-4 w-4" /></Button>}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-[14px] font-semibold">단어 목록 <span className="rounded bg-muted px-2 py-1 text-[12px]">{wordDrafts.length}개</span></h3>
                <div className="max-h-[260px] overflow-auto rounded-md border border-border">
                  <Table>
                    <TableBody>
                      {wordDrafts.map((word, index) => (
                        <TableRow key={index}>
                          <TableCell className="w-14 text-center text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{word.eng}</TableCell>
                          <TableCell>{word.kor}</TableCell>
                          <TableCell className="text-muted-foreground">{word.part || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{word.level || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-auto border-t border-border px-8 py-5">
            <Button variant="outline" onClick={() => (step === 1 ? setCreateOpen(false) : setStep((step - 1) as Step))}>이전</Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              {step === 1 && <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={goStep3} disabled={parsedWords.length === 0}>다음</Button>}
              {step === 2 && <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setStep(3)}>다음</Button>}
              {step === 3 && <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? "저장 중..." : "저장"}</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>단어장 삭제</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget ? getName(deleteTarget) : ""}" 단어장을 삭제하시겠습니까?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
