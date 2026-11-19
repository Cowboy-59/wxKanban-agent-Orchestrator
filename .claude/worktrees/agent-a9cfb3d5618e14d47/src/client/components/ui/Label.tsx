import * as React from "react";
import { cn } from "../../lib/utils";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
	error?: string;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
	({ className, children, error, ...props }, ref) => {
		return (
			<label
				ref={ref}
				className={cn(
					"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
					error && "text-destructive",
					className
				)}
				{...props}
			>
				{children}
			</label>
		);
	}
);
Label.displayName = "Label";

export { Label };
