import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookA, ChevronRight, Plus, Search, Trash2, X } from "lucide-react";

import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  phonetic?: string;
  exampleInEng?: string;
  exampleInKor?: string;
};

function normalizeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.contents ?? data?.content ?? data?.data ?? data?.items ?? [];
}

function getId(item: any) {
  return item.vocabularyNo ?? item.id ?? item.no ?? item.paperNo;
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
        phonetic: parts[3] || "",
        exampleInEng: parts[4] || "",
        exampleInKor: parts[5] || "",
      };
    })
    .filter((word) => word.eng && word.kor);
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
  const renderNode = (node: any, depth = 0): JSX.Element => {
    const id = Number(node.classifyNo ?? node.id);
    const children = node.children ?? [];
    const selected = selectedId === id;
    return (
      <div key={`${id}-${node.name}`}>
        <button
          className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[13px] ${
            selected ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() => onSelect(selected ? undefined : id)}
        >
          <ChevronRight className={`h-3 w-3 shrink-0 ${children.length ? "" : "opacity-0"}`} />
          <span className="truncate">{node.name}</span>
        </button>
        {children.map((child: any) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      <button
        className={`mb-1 w-full rounded-md px-2 py-1.5 text-left text-[13px] font-semibold ${
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

export default function WordHome() {
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [rawWords, setRawWords] = useState("");

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

  const words = useMemo(() => parseWords(rawWords), [rawWords]);
  const papers = normalizeList(papersRaw);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("제목을 입력하세요.");
      if (words.length === 0) throw new Error("단어를 1개 이상 입력하세요.");
      const res = await apiRequest("POST", api.wordPapers.create.path, {
        title: title.trim(),
        categoryId,
        words,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "단어 자료 생성 실패");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.wordPapers.list.path] });
      setCreateOpen(false);
      setTitle("");
      setRawWords("");
      toast({ title: "단어 자료가 탑재되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "탑재 실패", description: err.message, variant: "destructive" });
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
      toast({ title: "단어 자료가 삭제되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

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
          <Button className="h-9 bg-blue-600 text-[13px] text-white hover:bg-blue-700" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            단어 탑재
          </Button>
          <div className="relative ml-auto w-full md:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="단어 자료 검색"
              className="h-10 bg-muted pl-10 text-[13px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-6">
          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="text-[12px]">단어 자료</TableHead>
                  <TableHead className="hidden w-28 text-center text-[12px] md:table-cell">단어 수</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-[13px] text-muted-foreground">불러오는 중...</TableCell></TableRow>
                ) : papers.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="py-10 text-center text-[13px] text-muted-foreground">단어 자료가 없습니다.</TableCell></TableRow>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>단어 탑재</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="단어 자료 제목" />
            <Textarea
              value={rawWords}
              onChange={(event) => setRawWords(event.target.value)}
              className="min-h-[260px] font-mono text-[13px]"
              placeholder={"영단어\\t뜻\\t품사\\t발음기호\\t영어 예문\\t예문 해석\napple\t사과\tnoun\t[ˈæpəl]\tI eat an apple.\t나는 사과를 먹는다."}
            />
            <div className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
              감지된 단어 {words.length}개. 탭 또는 콤마 구분 지원.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>취소</Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "탑재 중..." : "탑재"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>단어 자료 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget ? getName(deleteTarget) : ""}" 자료를 삭제하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
