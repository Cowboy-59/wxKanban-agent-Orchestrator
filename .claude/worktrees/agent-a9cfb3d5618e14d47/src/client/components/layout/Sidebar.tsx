/**
 * Sidebar Component
 * Standalone sidebar navigation component
 * Can be used independently or within AppShell
 */

import { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface NavItem {
	label: string;
	href: string;
	icon: ReactNode;
	active?: boolean;
	disabled?: boolean;
	badge?: string | number;
}

interface SidebarProps {
	items: NavItem[];
	logo?: ReactNode;
	footer?: ReactNode;
	className?: string;
	collapsed?: boolean;
	onCollapse?: (collapsed: boolean) => void;
}

/**
 * Sidebar provides vertical navigation with:
 * - Logo/header area
 * - Navigation items with icons
 * - Active state highlighting
 * - Disabled/locked state support
 * - Optional footer area
 * - Collapsible support
 */
export function Sidebar({
	items,
	logo,
	footer,
	className,
	collapsed = false,
	onCollapse,
}: SidebarProps) {
	return (
		<aside
			className={cn(
				"flex flex-col h-full bg-card border-r border-border",
				collapsed ? "w-16" : "w-56",
				className
			)}
		>
			{/* Header / Logo */}
			{logo && (
				<div className="px-4 py-5 border-b border-border flex items-center justify-between">
					{!collapsed && <div className="flex-1">{logo}</div>}
					{onCollapse && (
						<button
							onClick={() => onCollapse(!collapsed)}
							className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
							title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
						>
							{collapsed ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="m9 18 6-6-6-6" />
								</svg>
							) : (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="m15 18-6-6 6-6" />
								</svg>
							)}
						</button>
					)}
				</div>
			)}

			{/* Navigation */}
			<nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
				{items.map((item, index) => (
					<a
						key={index}
						href={item.disabled ? undefined : item.href}
						className={cn(
							"flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full",
							item.active
								? "bg-primary/10 text-primary"
								: "text-muted-foreground hover:bg-accent hover:text-foreground",
							item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
							collapsed && "justify-center px-2"
						)}
						title={collapsed ? item.label : undefined}
					>
						<span className={cn("shrink-0", collapsed && "w-5 h-5")}>
							{item.icon}
						</span>
						{!collapsed && (
							<>
								<span className="flex-1">{item.label}</span>
								{item.badge !== undefined && (
									<span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">
										{item.badge}
									</span>
								)}
							</>
						)}
					</a>
				))}
			</nav>

			{/* Footer */}
			{footer && (
				<div className="px-3 py-4 border-t border-border">{footer}</div>
			)}
		</aside>
	);
}

export default Sidebar;
