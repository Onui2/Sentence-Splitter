import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSentenceSchema, type InsertSentence } from "@shared/schema";
import { useCreateSentence, useBulkCreateSentences } from "@/hooks/use-shadowing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, MessageSquarePlus, ListPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface AddSentenceFormProps {
  materialId: number;
  nextOrderIndex: number;
}

export function AddSentenceForm({ materialId, nextOrderIndex }: AddSentenceFormProps) {
  const { toast } = useToast();
  const createSentence = useCreateSentence();
  const bulkCreate = useBulkCreateSentences();
  const [bulkText, setBulkText] = useState("");

  const form = useForm<InsertSentence>({
    resolver: zodResolver(insertSentenceSchema),
    defaultValues: {
      originalText: "",
      translation: "",
      orderIndex: nextOrderIndex,
      materialId: materialId,
    },
  });

  const onSubmit = (data: InsertSentence) => {
    createSentence.mutate(
      { ...data, materialId },
      {
        onSuccess: () => {
          form.reset({
            originalText: "",
            translation: "",
            orderIndex: nextOrderIndex + 1,
            materialId: materialId,
          });
          toast({
            title: "Sentence Added",
            description: "Ready for the next one.",
          });
        },
      }
    );
  };

  const handleBulkSubmit = () => {
    const lines = bulkText.split("\n").filter(line => line.trim() !== "");
    const pairs: { originalText: string; translation: string }[] = [];
    
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i]) {
        pairs.push({
          originalText: lines[i].trim(),
          translation: lines[i+1]?.trim() || "",
        });
      }
    }

    if (pairs.length === 0) return;

    bulkCreate.mutate(
      { materialId, sentences: pairs },
      {
        onSuccess: () => {
          setBulkText("");
        }
      }
    );
  };

  return (
    <Card className="p-6 mt-8 border-border shadow-sm bg-muted/30">
      <Tabs defaultValue="single" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MessageSquarePlus className="w-5 h-5" />
            <h3 className="font-semibold text-sm uppercase tracking-wider">Add Sentences</h3>
          </div>
          <TabsList className="grid w-48 grid-cols-2 h-8">
            <TabsTrigger value="single" className="text-xs">Single</TabsTrigger>
            <TabsTrigger value="bulk" className="text-xs">Bulk</TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="single">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col md:flex-row gap-4 items-start">
              <FormField
                control={form.control}
                name="originalText"
                render={({ field }) => (
                  <FormItem className="flex-1 w-full">
                    <FormControl>
                      <Input 
                        placeholder="Original text (e.g. English)" 
                        className="rounded-md border-border"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="translation"
                render={({ field }) => (
                  <FormItem className="flex-1 w-full">
                    <FormControl>
                      <Input 
                        placeholder="Translation (e.g. Korean)" 
                        className="rounded-md border-border"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={createSentence.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-md w-10 h-10 shrink-0 no-default-hover-elevate"
              >
                {createSentence.isPending ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowRight className="w-5 h-5" />
                )}
              </Button>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-4">
          <div className="space-y-2">
            <Textarea
              placeholder={"Enter sentences in pairs:\nSentence 1 (English)\nTranslation 1 (Korean)\nSentence 2 (English)\n..."}
              className="min-h-[200px] rounded-md border-border font-mono text-sm"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Format: Odd lines are original text, even lines are translations.
            </p>
          </div>
          <Button 
            onClick={handleBulkSubmit}
            disabled={bulkCreate.isPending || !bulkText.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md gap-2 no-default-hover-elevate"
          >
            {bulkCreate.isPending ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <ListPlus className="w-4 h-4" />
            )}
            Bulk Add {bulkText.split("\n").filter(l => l.trim()).length > 0 ? Math.ceil(bulkText.split("\n").filter(l => l.trim()).length / 2) : 0} Sentences
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
