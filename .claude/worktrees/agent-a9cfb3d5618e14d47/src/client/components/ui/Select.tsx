/**
 * Select Component

 * shadcn/ui style select dropdown with full API support
 */

import * as React from "react";
import { cn } from "../../lib/utils";

// Context for select state
interface SelectContextValue {
	value: string;
	onValueChange: (value: string) => void;
	open: boolean;
	setOpen: (open: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue | undefined>(undefined);

const useSelect = () => {
	const context = React.useContext(SelectContext);
	if (!context) {
		throw new Error("Select components must be used within a Select provider");
	}
	return context;
};

// Main Select component
interface SelectProps {
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	disabled?: boolean;
	children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({ 
	value: controlledValue, 
	defaultValue, 
	onValueChange, 
	disabled,
	children 
}) => {
	const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue || "");
	const [open, setOpen] = React.useState(false);
	
	const isControlled = controlledValue !== undefined;
	const value = isControlled ? controlledValue : uncontrolledValue;
	
	const handleValueChange = (newValue: string) => {
		if (!isControlled) {
			setUncontrolledValue(newValue);
		}
		onValueChange?.(newValue);
		setOpen(false);
	};
	
	return (
		<SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen }}>
			<div className={cn("relative", disabled && "opacity-50 pointer-events-none")}>
				{children}
			</div>
		</SelectContext.Provider>
	);
};

// SelectTrigger - the button that opens the dropdown
interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	children?: React.ReactNode;
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
	({ className, children, ...props }, ref) => {
		const { open, setOpen } = useSelect();
		
		return (
			<button
				ref={ref}
				type="button"
				onClick={() => setOpen(!open)}
				className={cn(
					"flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
					className
				)}
				{...props}
			>
				{children || <span className="text-muted-foreground">Select...</span>}
			</button>
		);
	}
);
SelectTrigger.displayName = "SelectTrigger";

// SelectValue - displays the selected value or placeholder
interface SelectValueProps {
	placeholder?: string;
}

const SelectValue: React.FC<SelectValueProps> = ({ placeholder }) => {
	const { value } = useSelect();
	return <span>{value || placeholder}</span>;
};

// SelectContent - the dropdown content
interface SelectContentProps {
	children: React.ReactNode;
}

const SelectContent: React.FC<SelectContentProps> = ({ children }) => {
	const { open } = useSelect();
	
	if (!open) return null;
	
	return (
		<div className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 top-full mt-1 w-full">
			<div className="p-1">
				{children}
			</div>
		</div>
	);
};

// SelectItem - individual option
interface SelectItemProps {
	value: string;
	children: React.ReactNode;
	disabled?: boolean;
}

const SelectItem: React.FC<SelectItemProps> = ({ value, children, disabled }) => {
	const { value: selectedValue, onValueChange } = useSelect();
	const isSelected = selectedValue === value;
	
	return (
		<div
			onClick={() => !disabled && onValueChange(value)}
			className={cn(
				"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
				isSelected && "bg-accent text-accent-foreground",
				disabled && "pointer-events-none opacity-50"
			)}
		>
			<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
				{isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
			</span>
			{children}
		</div>
	);
};

// Legacy Select for backward compatibility
interface LegacySelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
	label?: string;
	error?: string;
}

const LegacySelect = React.forwardRef<HTMLSelectElement, LegacySelectProps>(
	({ className, label, error, children, ...props }, ref) => {
		return (
			<div className="w-full">
				{label && (
					<label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block">
						{label}
					</label>
				)}
				<select
					ref={ref}
					className={cn(
						"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
						error && "border-destructive focus-visible:ring-destructive",
						className
					)}
					{...props}
				>
					{children}
				</select>
				{error && (
					<p className="text-sm font-medium text-destructive mt-1">{error}</p>
				)}
			</div>
		);
	}
);
LegacySelect.displayName = "LegacySelect";
export { 
	Select, 
	SelectTrigger, 
	SelectValue, 
	SelectContent, 
	SelectItem,
	LegacySelect 
};

