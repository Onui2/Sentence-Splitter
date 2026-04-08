import { useMaterial } from "@/hooks/use-shadowing";
import { AddSentenceForm } from "@/components/AddSentenceForm";
import { SentenceCard } from "@/components/SentenceCard";
import { useRoute, Link } from "wouter";
import { ArrowLeft, BookOpen, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function MaterialDetail() {
  const [match, params] = useRoute("/material/:id");
  const id = params ? parseInt(params.id) : 0;
  const { data: material, isLoading, error } = useMaterial(id);

  if (isLoading) return <DetailSkeleton />;
  if (error || !material) return <DetailError />;

  const sentences = material.sentences || [];
  const nextOrderIndex = sentences.length > 0 
    ? Math.max(...sentences.map(s => s.orderIndex)) + 1 
    : 0;

  // Sort sentences by orderIndex
  const sortedSentences = [...sentences].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Library
            </Button>
          </Link>
          <h1 className="font-display font-bold text-lg truncate max-w-[200px] sm:max-w-md">
            {material.title}
          </h1>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Material Info */}
        <div className="mb-12 text-center">
          <div className="w-16 h-16 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3 hover:rotate-6 transition-transform">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-4 text-balance">
            {material.title}
          </h1>
          {material.description && (
            <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
              {material.description}
            </p>
          )}
        </div>

        {/* Sentences List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-8">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-accent" />
              Practice Script
            </h2>
            <span className="text-sm font-medium bg-muted px-3 py-1 rounded-full">
              {sortedSentences.length} Sentences
            </span>
          </div>

          {sortedSentences.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground mb-2">No sentences added yet.</p>
              <p className="text-sm text-muted-foreground/60">Use the form below to start building your script.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedSentences.map((sentence, index) => (
                <SentenceCard key={sentence.id} sentence={sentence} index={index} />
              ))}
            </div>
          )}
        </div>

        {/* Add New Sentence */}
        <AddSentenceForm materialId={material.id} nextOrderIndex={nextOrderIndex} />
      </main>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-16 border-b border-border/50 bg-background" />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex flex-col items-center mb-12">
          <Skeleton className="w-16 h-16 rounded-2xl mb-6" />
          <Skeleton className="h-10 w-3/4 mb-4 rounded-full" />
          <Skeleton className="h-6 w-1/2 rounded-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function DetailError() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h2 className="text-2xl font-bold mb-2">Material Not Found</h2>
        <p className="text-muted-foreground mb-6">The material you are looking for does not exist or has been deleted.</p>
        <Link href="/">
          <Button>Return to Library</Button>
        </Link>
      </div>
    </div>
  );
}
