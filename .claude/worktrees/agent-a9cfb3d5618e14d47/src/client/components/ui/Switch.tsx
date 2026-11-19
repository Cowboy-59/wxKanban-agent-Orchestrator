/**
 * Switch Component
 * shadcn/ui style switch — the shadcn v4 Switch API and styling (`checked`, `onCheckedChange`,
 * `data-state`, `size`), built on a native button with `role="switch"` like the repo's other
 * shadcn-style components, so it adds no Radix dependency.
 */

import * as React from "react";
import { cn } from "../../lib/utils";

// [SCOPE 145 / T005] BEGIN — Switch (shadcn/ui style)
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
	checked: boolean;
	onCheckedChange?: (checked: boolean) => void;
	size?: "sm" | "default";
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
	({ checked, onCheckedChange, size = "default", className, disabled, ...props }, ref) => {
		const state = checked ? "checked" : "unchecked";
		return (
			<button
				ref={ref}
				type="button"
				role="switch"
				aria-checked={checked}
				data-slot="switch"
				data-state={state}
				data-size={size}
				disabled={disabled}
				onClick={() => onCheckedChange?.(!checked)}
				className={cn(
					"peer inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none",
					"focus-visible:ring-[3px] focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50",
					size === "default" ? "h-[1.15rem] w-8" : "h-3.5 w-6",
					checked ? "bg-blue-600" : "bg-slate-600",
					className,
				)}
				{...props}
			>
				<span
					data-slot="switch-thumb"
					data-state={state}
					className={cn(
						"pointer-events-none block rounded-full bg-white ring-0 transition-transform",
						size === "default" ? "size-4" : "size-3",
						checked ? "translate-x-[calc(100%-2px)]" : "translate-x-0",
					)}
				/>
			</button>
		);
	},
);
Switch.displayName = "Switch";
// [SCOPE 145 / T005] END
