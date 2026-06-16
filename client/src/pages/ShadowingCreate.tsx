import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, Plus, Trash2, X } from "lucide-react";

import { api } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Step = 1 | 2 | 3;

type ShadowingLine = {
  originalText: string;
  translation: string;
  question: string;
};

const DEFAULT_QUESTION = "아래 문장을 읽고 따라 말해보세요.";

function normalizeList(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.contents ?? data?.content ?? data?.data ?? data?.items ?? [];
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

function splitSentences(text: string): ShadowingLine[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?。！？])\s+|(?<=[.!?。！？])\n+|\n(?=\S)/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t").map((part) => part.trim());
      return {
        originalText: parts[0] || "",
        translation: parts[1] || "",
        question: DEFAULT_QUESTION,
      };
    })
    .filter((line) => line.originalText);
}

function Stepper({ step }: { step: Step }) {
  const labels = ["입력방식", "문장입력", "확인 및 저장"];
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
      <div key={`${id}-${categoryName(node)}`}>
        <button
          className={`flex h-8 w-full items-center gap-1 rounded-md px-2 text-left text-[13px] ${
            selected ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          style={{ paddingLeft: depth * 14 + 8 }}
          onClick={() => onSelect(selected ? undefined : id)}
        >
          <ChevronRight className={`h-3 w-3 shrink-0 ${children.length ? "" : "opacity-0"}`} />
          <span className="truncate">{categoryName(node)}</span>
        </button>
        {children.map((child: any) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="max-h-[340px] overflow-auto rounded-md border border-border p-2">
      <button
        className={`mb-1 h-8 w-full rounded-md px-2 text-left text-[13px] font-semibold ${
          !selectedId ? "text-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
        onClick={() => onSelect(undefined)}
      >
        선택 안 함
      </button>
      {nodes.map((node) => renderNode(node))}
    </div>
  );
}

export default function ShadowingCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const initialCategoryId = searchParams.get("categoryId");

  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | undefined>(
    initialCategoryId ? Number(initialCategoryId) : undefined
  );
  const [rawText, setRawText] = useState("");
  const [lines, setLines] = useState<ShadowingLine[]>([]);

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: [api.flipCategories.list.path],
    queryFn: async () => {
      const res = await fetch(api.flipCategories.list.path);
      if (!res.ok) return [];
      return normalizeList(await res.json());
    },
  });

  const parsedLines = useMemo(() => splitSentences(rawText), [rawText]);
  const categoryPath = findCategoryPath(categories, categoryId)?.join(" > ");

  const createShadowingMutation = useMutation({
    mutationFn: async () => {
      const sentences = lines
        .map((line) => ({
          originalText: line.originalText.trim(),
          translation: line.translation.trim(),
          question: (line.question || DEFAULT_QUESTION).trim(),
        }))
        .filter((line) => line.originalText);
      if (!title.trim()) throw new Error("쉐도잉 제목을 입력하세요.");
      if (sentences.length === 0) throw new Error("문장을 1개 이상 입력하세요.");
      const res = await apiRequest("POST", api.shadowing.create.path, {
        title: title.trim(),
        categoryId,
        sentences,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "쉐도잉 저장 실패");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.list.path] });
      toast({ title: "쉐도잉 자료가 저장되었습니다." });
      setLocation(categoryId ? `/?categoryId=${categoryId}` : "/");
    },
    onError: (error: Error) => {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    },
  });

  const goStep2 = () => setStep(2);
  const goStep3 = () => {
    const next = parsedLines.length > 0 ? parsedLines : lines;
    setLines(next.length > 0 ? next : [{ originalText: "", translation: "", question: DEFAULT_QUESTION }]);
    setStep(3);
  };

  const updateLine = (index: number, patch: Partial<ShadowingLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-6">
      <div className="mx-auto flex max-h-[calc(100vh-48px)] max-w-[1200px] flex-col overflow-hidden rounded-lg bg-background shadow-2xl">
        <div className="flex items-center justify-between px-8 py-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-[22px] font-bold">쉐도잉 만들기</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <Stepper step={step} />

        <div className="flex-1 overflow-auto">
          {step === 1 && (
            <div className="grid min-h-[500px] grid-cols-2 gap-8 px-8 py-7">
              <section>
                <h3 className="mb-3 text-[15px] font-semibold">원문 붙여넣기</h3>
                <Textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder={"원문 텍스트를 붙여넣으세요...\n탭으로 원문과 번역을 같이 입력할 수 있습니다."}
                  className="h-[260px] resize-none text-[14px]"
                />
                <Button className="mt-4" variant="outline" disabled={parsedLines.length === 0} onClick={goStep3}>
                  문장 분할
                </Button>
              </section>
              <section>
                <h3 className="mb-3 text-[15px] font-semibold">미리보기</h3>
                <div className="flex h-[400px] items-center justify-center rounded-md border border-dashed border-border bg-muted/10">
                  {parsedLines.length === 0 ? (
                    <span className="text-[13px] text-muted-foreground">원문을 입력 후 문장 분할을 누르면 미리보기가 표시됩니다</span>
                  ) : (
                    <div className="h-full w-full overflow-auto p-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">#</TableHead>
                            <TableHead>문장</TableHead>
                            <TableHead>번역</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedLines.map((line, index) => (
                            <TableRow key={`${line.originalText}-${index}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell>{line.originalText}</TableCell>
                              <TableCell className="text-muted-foreground">{line.translation || "-"}</TableCell>
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
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[16px] font-semibold">문장 목록 <span className="rounded bg-muted px-2 py-1 text-[12px]">{lines.length}개</span></h3>
                <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { originalText: "", translation: "", question: DEFAULT_QUESTION }])}>
                  <Plus className="mr-1 h-4 w-4" />
                  문장 추가
                </Button>
              </div>
              <div className="max-h-[390px] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="w-14 text-center">#</TableHead>
                      <TableHead>원문</TableHead>
                      <TableHead>번역</TableHead>
                      <TableHead>질문</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                        <TableCell><Textarea value={line.originalText} onChange={(e) => updateLine(index, { originalText: e.target.value })} className="min-h-[52px]" /></TableCell>
                        <TableCell><Textarea value={line.translation} onChange={(e) => updateLine(index, { translation: e.target.value })} className="min-h-[52px]" /></TableCell>
                        <TableCell><Textarea value={line.question} onChange={(e) => updateLine(index, { question: e.target.value })} className="min-h-[52px]" /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid min-h-[500px] grid-cols-[1fr_360px] gap-8 px-8 py-7">
              <section className="space-y-5">
                <div>
                  <label className="mb-2 block text-[14px] font-semibold">쉐도잉 제목 <span className="text-red-500">*</span></label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="쉐도잉 제목을 입력하세요" className="h-10" />
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
                  <h3 className="mb-2 text-[14px] font-semibold">문장 목록 <span className="rounded bg-muted px-2 py-1 text-[12px]">{lines.length}개</span></h3>
                  <div className="max-h-[260px] overflow-auto rounded-md border border-border">
                    <Table>
                      <TableBody>
                        {lines.map((line, index) => (
                          <TableRow key={index}>
                            <TableCell className="w-14 text-center text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{line.originalText}</TableCell>
                            <TableCell className="text-muted-foreground">{line.translation || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </section>
              <aside>
                <h3 className="mb-3 text-[14px] font-semibold">카테고리 선택</h3>
                <CategoryList nodes={categories} selectedId={categoryId} onSelect={setCategoryId} />
              </aside>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-8 py-5">
          <Button variant="outline" onClick={() => (step === 1 ? setLocation("/") : setStep((step - 1) as Step))}>이전</Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setLocation("/")}>취소</Button>
            {step === 1 && <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={goStep3} disabled={parsedLines.length === 0}>다음</Button>}
            {step === 2 && <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setStep(3)}>다음</Button>}
            {step === 3 && (
              <Button className="bg-blue-600 text-white hover:bg-blue-700" disabled={createShadowingMutation.isPending} onClick={() => createShadowingMutation.mutate()}>
                {createShadowingMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
