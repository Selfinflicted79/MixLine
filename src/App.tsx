import { TooltipProvider } from "@/components/ui/tooltip";
import { MixerBoard } from "@/components/mixer/mixer-board";

export function App() {
  return (
    <TooltipProvider>
      <MixerBoard />
    </TooltipProvider>
  );
}
