/**
 * LoadingSpinner Component
 * Reusable loading indicator with multiple variants
 * 
 * @task T050
 */

import { cn } from "../../lib/utils";

interface LoadingSpinnerProps {
	/** Size variant of the spinner */
	size?: "sm" | "md" | "lg" | "xl";
	/** Color variant */
	variant?: "primary" | "secondary" | "white" | "slate";
	/** Additional CSS classes */
	className?: string;
	/** Accessible label */
	label?: string;
	/** Whether to show as full page overlay */
	fullPage?: boolean;
	/** Whether to center in container */
	centered?: boolean;
}

const sizeClasses = {
	sm: "w-4 h-4 border-2",
	md: "w-6 h-6 border-2",
	lg: "w-8 h-8 border-3",
	xl: "w-12 h-12 border-4",
};

const variantClasses = {
	primary: "border-indigo-600 border-t-transparent",
	secondary: "border-slate-400 border-t-transparent",
	white: "border-white border-t-transparent",
	slate: "border-slate-600 border-t-transparent",
};

/**
 * LoadingSpinner - Animated loading indicator
 */
export function LoadingSpinner({
	size = "md",
	variant = "primary",
	className,
	label = "Loading...",
	fullPage = false,
	centered = false,
}: LoadingSpinnerProps) {
	const spinner = (
		<div
			role="status"
			aria-label={label}
			className={cn(
				"inline-block rounded-full animate-spin",
				sizeClasses[size],
				variantClasses[variant],
				className
			)}
		>
			<span className="sr-only">{label}</span>
		</div>
	);

	if (fullPage) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
				<div className="flex flex-col items-center gap-3">
					{spinner}
					<p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
				</div>
			</div>
		);
	}

	if (centered) {
		return (
			<div className="flex items-center justify-center w-full h-full min-h-[100px]">
				{spinner}
			</div>
		);
	}

	return spinner;
}

/**
 * LoadingOverlay - Full page loading overlay with spinner
 */
export function LoadingOverlay({ label = "Loading..." }: { label?: string }) {
	return <LoadingSpinner fullPage size="xl" label={label} />;
}

/**
 * LoadingCard - Card with loading spinner for content areas
 */
export function LoadingCard({ label = "Loading..." }: { label?: string }) {
	return (
		<div className="flex flex-col items-center justify-center p-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
			<LoadingSpinner size="lg" label={label} />
			<p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{label}</p>
		</div>
	);
}

/**
 * SkeletonLoader - Placeholder loading state for content
 */
export function SkeletonLoader({
	lines = 3,
	className,
}: {
	lines?: number;
	className?: string;
}) {
	return (
		<div className={cn("animate-pulse space-y-3", className)}>
			{Array.from({ length: lines }).map((_, i) => (
				<div
					key={i}
					className="h-4 bg-slate-200 dark:bg-slate-700 rounded"
					style={{ width: `${Math.random() * 40 + 60}%` }}
				/>
			))}
		</div>
	);
}

/**
 * ButtonLoadingSpinner - Small spinner for button loading states
 */
export function ButtonLoadingSpinner({
	className,
}: {
	className?: string;
}) {
	return (
		<LoadingSpinner
			size="sm"
			variant="white"
			className={cn("mr-2", className)}
			label="Processing..."
		/>
	);
}
