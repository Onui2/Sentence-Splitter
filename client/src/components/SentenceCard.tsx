import { type Sentence } from "@shared/schema";
import { useState } from "react";
import { Eye, EyeOff, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface SentenceCardProps {
  sentence: Sentence;
  index: number;
}

export function SentenceCard({ sentence, index }: SentenceCardProps) {
  const [showTranslation, setShowTranslation] = useState(false);

  // Function to read text aloud (basic browser TTS)
  const speak = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(sentence.originalText);
      // Try to set English voice if available, otherwise default
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith('en'));
      if (engVoice) utterance.voice = engVoice;
      
      window.speechSynthesis.cancel(); // Stop any previous
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative bg-card hover:bg-card/80 border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300"
    >
      <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
          onClick={speak}
          title="Listen"
        >
          <PlayCircle className="w-4 h-4" />
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary"
          onClick={() => setShowTranslation(!showTranslation)}
          title={showTranslation ? "Hide Translation" : "Show Translation"}
        >
          {showTranslation ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
      </div>

      <div className="flex gap-4 items-start">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-secondary-foreground text-xs font-bold font-mono shrink-0 mt-1">
          {index + 1}
        </span>
        <div className="space-y-3 flex-1 pr-16">
          <p className="text-xl md:text-2xl font-medium leading-relaxed text-foreground text-balance">
            {sentence.originalText}
          </p>
          
          <div className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            showTranslation ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
          )}>
            <p className="text-muted-foreground text-lg leading-relaxed pt-2 border-t border-border/50 border-dashed">
              {sentence.translation}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
