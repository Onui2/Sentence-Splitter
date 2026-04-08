import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertMaterialSchema, type InsertMaterial } from "@shared/schema";
import { useCreateMaterial } from "@/hooks/use-shadowing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CreateMaterialDialogProps {
  children?: React.ReactNode;
  defaultCategoryId?: number;
}

export function CreateMaterialDialog({ children, defaultCategoryId }: CreateMaterialDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const createMaterial = useCreateMaterial();

  const form = useForm<InsertMaterial>({
    resolver: zodResolver(insertMaterialSchema),
    defaultValues: {
      title: "",
      description: "",
      categoryId: defaultCategoryId,
    },
  });

  useEffect(() => {
    if (open && defaultCategoryId) {
      form.setValue("categoryId", defaultCategoryId);
    }
  }, [open, defaultCategoryId]);

  const onSubmit = (data: InsertMaterial) => {
    createMaterial.mutate(data, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        toast({
          title: "Material Created",
          description: "Start adding sentences to practice!",
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-md px-6 h-10 font-medium no-default-hover-elevate">
            쉐도잉 만들기
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">카테고리 설정</DialogTitle>
          <DialogDescription>
            새로운 쉐도잉 학습 세트의 카테고리와 제목을 입력하세요.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pt-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g. Daily Conversation Ep. 1" 
                      className="border-border focus-visible:ring-1 focus-visible:ring-blue-500"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-2">
              <Button 
                type="submit" 
                disabled={createMaterial.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white w-full"
              >
                {createMaterial.isPending ? "Creating..." : "쉐도잉 생성"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
