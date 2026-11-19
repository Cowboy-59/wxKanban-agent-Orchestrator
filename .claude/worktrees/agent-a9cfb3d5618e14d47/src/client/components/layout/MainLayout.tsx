/**
 * MainLayout Component
 * Wrapper around AppShell providing additional layout structure
 * Includes breadcrumb support and page header
 */

import { ReactNode } from "react";
import { AppShell } from "./AppShell";

interface BreadcrumbItem {
	label: string;
	href?: string;
}

interface MainLayoutProps {
	children: ReactNode;
	title?: string;
	description?: string;
	breadcrumbs?: BreadcrumbItem[];
	actions?: ReactNode;
}

/**
 * MainLayout provides consistent page structure with:
 * - AppShell wrapper (sidebar + navigation)
 * - Optional page header with title, description, breadcrumbs
 * - Action buttons area
 * - Consistent content padding and max-width
 */
export function MainLayout({
	children,
	title,
	description,
	breadcrumbs,
	actions,
}: MainLayoutProps) {
	return (
		<AppShell>
			<div className="max-w-7xl mx-auto">
				{/* Page Header */}
				{(title || breadcrumbs) && (
					<div className="mb-6">
						{/* Breadcrumbs */}
						{breadcrumbs && breadcrumbs.length > 0 && (
							<nav className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
								{breadcrumbs.map((crumb, index) => (
									<span key={index} className="flex items-center gap-2">
										{index > 0 && <span className="text-muted-foreground/50">/</span>}
										{crumb.href ? (
											<a
												href={crumb.href}
												className="hover:text-foreground transition-colors"
											>
												{crumb.label}
											</a>
										) : (
											<span className={index === breadcrumbs.length - 1 ? "text-foreground font-medium" : ""}>
												{crumb.label}
											</span>
										)}
									</span>
								))}
							</nav>
						)}

						{/* Title and Actions Row */}
						<div className="flex items-start justify-between gap-4">
							<div>
								{title && (
									<h1 className="text-2xl font-bold tracking-tight text-foreground">
										{title}
									</h1>
								)}
								{description && (
									<p className="text-muted-foreground mt-1">{description}</p>
								)}
							</div>
							{actions && (
								<div className="flex items-center gap-2 shrink-0">{actions}</div>
							)}
						</div>
					</div>
				)}

				{/* Main Content */}
				{children}
			</div>
		</AppShell>
	);
}

export default MainLayout;
