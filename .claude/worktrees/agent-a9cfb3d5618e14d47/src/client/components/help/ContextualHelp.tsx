/**
 * ContextualHelp - Help button that opens the help panel
 * 
 * Can be placed in navigation bars or specific contexts.
 */

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "../ui/Button";
import { HelpPanel } from "./HelpPanel";

interface ContextualHelpProps {
  context?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function ContextualHelp({ 
  context, 
  variant = "ghost", 
  size = "icon",
  className 
}: ContextualHelpProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsOpen(true)}
        className={className}
        title="Open help (Press ?)"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>

      <HelpPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        context={context}
      />
    </>
  );
}

export default ContextualHelp;
