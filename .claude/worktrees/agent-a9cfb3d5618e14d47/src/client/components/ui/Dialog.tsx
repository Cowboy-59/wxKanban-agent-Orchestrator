/**
 * Dialog Component
 * shadcn/ui style dialog/modal
 */

import * as React from "react";
import { cn } from "../../lib/utils";

interface DialogProps {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
}

const DialogContext = React.createContext<{
	open: boolean;
	onOpenChange: (open: boolean) => void;
}>({
	open: false,
	onOpenChange: () => {},
});

const Dialog: React.FC<DialogProps> = ({ open = false, onOpenChange, children }) => {
	return (
		<DialogContext.Provider value={{ open, onOpenChange: onOpenChange || (() => {}) }}>
			{children}
		</DialogContext.Provider>
	);
};

const DialogTrigger: React.FC<{ children: React.ReactNode; asChild?: boolean }> = ({
	children,
	asChild,
}) => {
	const { onOpenChange } = React.useContext(DialogContext);

	if (asChild && React.isValidElement(children)) {
		return React.cloneElement(children, {
			onClick: () => onOpenChange(true),
		} as React.HTMLAttributes<HTMLElement>);
	}

	return (
		<button onClick={() => onOpenChange(true)} className="inline-flex">
			{children}
		</button>
	);
};

const DialogContent = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & { onPointerDownOutside?: () => void }
>(({ className, children, onPointerDownOutside, ...props }, ref) => {
	const { open, onOpenChange } = React.useContext(DialogContext);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/80"
				onClick={() => onOpenChange(false)}
			/>
			{/* Content */}
			<div
				ref={ref}
				className={cn(
					"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
					className
				)}
				{...props}
			>
				{children}
				<button
					onClick={() => onOpenChange(false)}
					className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="h-4 w-4"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
					<span className="sr-only">Close</span>
				</button>
			</div>
		</div>
	);
});
DialogContent.displayName = "DialogContent";

const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
	className,
	...props
}) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left",
			className
		)}
		{...props}
	/>
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
	className,
	...props
}) => (
	<div
		className={cn(
			"flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
			className
		)}
		{...props}
	/>
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
	HTMLHeadingElement,
	React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
	<h2
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-none tracking-tight",
			className
		)}
		{...props}
	/>
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
	<p
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
DialogDescription.displayName = "DialogDescription";

export {
	Dialog,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogFooter,
	DialogTitle,
	DialogDescription,
};
