import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertMaterial, type InsertSentence, type MaterialWithSentences } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ============================================
// FLIP PAPERS HOOKS
// ============================================

export function useFlipPapers(classifyNo?: string, page = 0, size = 20) {
  return useQuery({
    queryKey: [api.flipPapers.list.path, classifyNo || "all", page, size],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (classifyNo) params.set("classifyNo", classifyNo);
      params.set("page", String(page));
      params.set("size", String(size));
      const res = await fetch(`${api.flipPapers.list.path}?${params}`);
      if (!res.ok) throw new Error("Failed to fetch papers");
      return await res.json();
    },
  });
}

export function useFlipPaperDetail(paperNo?: number) {
  return useQuery({
    queryKey: [api.flipPapers.detail.path, paperNo],
    queryFn: async () => {
      const url = buildUrl(api.flipPapers.detail.path, { paperNo: paperNo! });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch paper detail");
      return await res.json();
    },
    enabled: !!paperNo,
  });
}

export function useUpdateFlipPaper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ paperNo, name, classifyNo, edits, deleteShadowingNos, addSentences }: {
      paperNo: number;
      name?: string;
      classifyNo?: number;
      edits?: { shadowingNo: number; english: string; korean: string }[];
      deleteShadowingNos?: number[];
      addSentences?: { english: string; question: string }[];
    }) => {
      const url = buildUrl(api.flipPapers.update.path, { paperNo });
      const body: any = {};
      if (name) body.name = name;
      if (classifyNo !== undefined) body.classifyNo = classifyNo;
      if (edits) body.edits = edits;
      if (deleteShadowingNos?.length) body.deleteShadowingNos = deleteShadowingNos;
      if (addSentences?.length) body.addSentences = addSentences;
      await apiRequest("PUT", url, body);
      return { paperNo };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.detail.path, variables.paperNo] });
      toast({ title: "학습지가 수정되었습니다." });
    },
    onError: () => {
      toast({ title: "수정 실패", description: "학습지 수정에 실패했습니다.", variant: "destructive" });
    },
  });
}

export function useDeleteFlipPaper() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (paperNo: number) => {
      const url = buildUrl(api.flipPapers.delete.path, { paperNo });
      const res = await apiRequest("DELETE", url);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.flipPapers.list.path] });
      toast({ title: "학습지가 삭제되었습니다." });
    },
    onError: () => {
      toast({ title: "삭제 실패", description: "학습지 삭제에 실패했습니다.", variant: "destructive" });
    },
  });
}

// ============================================
// MATERIALS HOOKS
// ============================================

export function useMaterials(categoryId?: number) {
  return useQuery({
    queryKey: [api.materials.list.path, categoryId],
    queryFn: async () => {
      const url = categoryId ? `${api.materials.list.path}?categoryId=${categoryId}` : api.materials.list.path;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch materials");
      return await res.json();
    },
  });
}

export function useMaterial(id: number) {
  return useQuery({
    queryKey: [api.materials.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.materials.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch material");
      return await res.json();
    },
    enabled: !isNaN(id),
  });
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: InsertMaterial) => {
      const res = await apiRequest("POST", api.materials.create.path, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create material");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.materials.list.path] });
    },
  });
}

// ============================================
// SENTENCES HOOKS
// ============================================

export function useCreateSentence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ materialId, ...data }: InsertSentence & { materialId: number }) => {
      const url = buildUrl(api.sentences.create.path, { materialId });
      const res = await apiRequest("POST", url, data);
      if (!res.ok) throw new Error("Failed to create sentence");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.materials.get.path, variables.materialId] });
    },
  });
}

export function useBulkCreateSentences() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { materialId: number; sentences: { originalText: string; translation: string }[] }) => {
      const url = buildUrl(api.sentences.bulkCreate.path, { materialId: data.materialId });
      const res = await apiRequest("POST", url, { sentences: data.sentences });
      if (!res.ok) throw new Error("Failed to bulk create sentences");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.materials.get.path, variables.materialId] });
      toast({
        title: "Success",
        description: `${variables.sentences.length} sentences added successfully.`,
      });
    },
  });
}
