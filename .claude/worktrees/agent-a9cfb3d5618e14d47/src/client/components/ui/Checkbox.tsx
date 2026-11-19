/**
 * Checkbox Component
 * shadcn/ui style checkbox — the shadcn v4 Checkbox API and styling (`checked`, `onCheckedChange`,
 * `data-state`, check indicator), built on a native button with `role="checkbox"` like the repo's
 * other shadcn-style components (see Switch.tsx), so it adds no Radix dependency.
 */

import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "../../lib/utils";

// [SCOPE 037 / T080] BEGIN — Checkbox (shadcn/ui style)
export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
	checked: boolean;
	onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
	({ checked, onCheckedChange, className, disabled, ...props }, ref) => {
		const state = checked ? "checked" : "unchecked";
		return (
			<button
				ref={ref}
				type="button"
				role="checkbox"
				aria-checked={checked}
				data-slot="checkbox"
				data-state={state}
				disabled={disabled}
				onClick={() => onCheckedChange?.(!checked)}
				className={cn(
					"peer grid size-4 shrink-0 place-content-center rounded-[4px] border shadow-xs transition-shadow outline-none",
					"focus-visible:ring-[3px] focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50",
					checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-500 bg-slate-900",
					className,
				)}
				{...props}
			>
				{checked && (
					<span data-slot="checkbox-indicator" className="grid place-content-center text-current">
						<CheckIcon className="size-3.5" />
					</span>
				)}
			</button>
		);
	},
);
Checkbox.displayName = "Checkbox";
// [SCOPE 037 / T080] END
