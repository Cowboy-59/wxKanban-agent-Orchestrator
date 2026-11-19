/**
 * HelpPanel - Slide-out help panel component
 * 
 * Provides contextual help and search functionality.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Search, Book, Command, HelpCircle, ChevronRight } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  subcategory: string | null;
  viewCount: number;
}

interface HelpCategory {
  category: string;
  subcategories: string[];
}

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  context?: string;
}

export function HelpPanel({ isOpen, onClose, initialQuery = "", context }: HelpPanelProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);

  // Fetch categories
  const { data: categories } = useQuery<HelpCategory[]>({
    queryKey: ["help-categories"],
    queryFn: async () => {
      const response = await fetch("/api/help/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen,
  });

  // Search articles
  const { data: searchResults, isLoading: isSearching } = useQuery<{ articles: HelpArticle[]; totalCount: number }>({
    queryKey: ["help-search", searchQuery, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (selectedCategory) params.append("category", selectedCategory);
      params.append("limit", "20");
      
      const response = await fetch(`/api/help/search?${params}`);
      if (!response.ok) throw new Error("Failed to search articles");
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen && (searchQuery.length > 0 || !!selectedCategory),
  });

  // Fetch CLI commands
  const { data: cliCommands } = useQuery<HelpArticle[]>({
    queryKey: ["help-cli-commands"],
    queryFn: async () => {
      const response = await fetch("/api/help/cli-commands");
      if (!response.ok) throw new Error("Failed to fetch CLI commands");
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen,
  });

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isOpen) {
          e.preventDefault();
          // Toggle would be handled by parent
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleArticleClick = (article: HelpArticle) => {
    setSelectedArticle(article);
  };

  const handleBackToSearch = () => {
    setSelectedArticle(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-background border-l shadow-xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Help Center</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Search */}
        {!selectedArticle && (
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search help articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedArticle ? (

            // Article View
            <div className="p-4">
              <Button 
                variant="ghost" 
                onClick={handleBackToSearch}
                className="mb-4"
              >
                ← Back to search
              </Button>
              <ArticleView slug={selectedArticle.slug} />
            </div>
          ) : searchQuery || selectedCategory ? (
            // Search Results
            <div className="p-4 space-y-4">
              {isSearching ? (
                <div className="text-center py-8 text-muted-foreground">
                  Searching...
                </div>
              ) : searchResults?.articles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No results found for "{searchQuery}"
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults?.articles.map((article) => (
                    <button
                      key={article.id}
                      onClick={() => handleArticleClick(article)}
                      className="w-full text-left p-3 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{article.title}</h3>
                          {article.summary && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {article.summary}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                            <span className="capitalize">{article.category}</span>
                            {article.subcategory && (
                              <>
                                <span>•</span>
                                <span>{article.subcategory}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Default View - Categories & Quick Access
            <div className="p-4 space-y-6">
              {/* Contextual Help */}
              {context && (
                <div className="bg-primary/5 rounded-lg p-4">
                  <h3 className="font-medium mb-2">Contextual Help</h3>
                  <p className="text-sm text-muted-foreground">
                    You're viewing: <span className="font-medium">{context}</span>
                  </p>
                </div>
              )}

              {/* Categories */}
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Book className="h-4 w-4" />
                  Browse by Category
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {categories?.map((cat) => (
                    <button
                      key={cat.category}
                      onClick={() => setSelectedCategory(cat.category)}
                      className="p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                    >
                      <span className="capitalize font-medium">{cat.category}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {cat.subcategories.length} subcategories
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* CLI Commands */}
              {cliCommands && cliCommands.length > 0 && (
                <div>
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <Command className="h-4 w-4" />
                    CLI Commands
                  </h3>
                  <div className="space-y-2">
                    {cliCommands.slice(0, 5).map((cmd) => (
                      <button
                        key={cmd.id}
                        onClick={() => handleArticleClick(cmd)}
                        className="w-full text-left p-2 rounded hover:bg-accent transition-colors text-sm"
                      >
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {cmd.slug}
                        </code>
                        <span className="ml-2">{cmd.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Keyboard Shortcuts */}
              <div className="text-xs text-muted-foreground border-t pt-4">
                <p>Keyboard shortcuts:</p>
                <ul className="mt-1 space-y-1">
                  <li><kbd className="bg-muted px-1 rounded">?</kbd> Open help</li>
                  <li><kbd className="bg-muted px-1 rounded">Esc</kbd> Close panel</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Article View Component
function ArticleView({ slug }: { slug: string }) {

  const { data: article, isLoading } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      const response = await fetch(`/api/help/articles/${slug}`);
      if (!response.ok) throw new Error("Failed to fetch article");
      const data = await response.json();
      return data.data;
    },
  });

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (!article) {
    return <div className="py-8 text-center text-muted-foreground">Article not found</div>;
  }

  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-2xl font-bold mb-4">{article.title}</h1>
      
      {article.command && (
        <div className="bg-muted p-3 rounded-lg mb-4">
          <code className="text-sm font-mono">{article.command}</code>
        </div>
      )}

      {article.content && (
        <div 
          className="whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
      )}

      {article.examples && article.examples.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Examples</h3>
          <div className="space-y-2">
            {article.examples.map((example: string, i: number) => (
              <div key={i} className="bg-muted p-3 rounded-lg">
                <code className="text-sm font-mono">{example}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rating */}
      <div className="mt-8 pt-4 border-t">
        <p className="text-sm text-muted-foreground mb-2">Was this helpful?</p>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              fetch(`/api/help/${article.id}/rate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating: "helpful" }),
              });
            }}
          >
            👍 Yes
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              fetch(`/api/help/${article.id}/rate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating: "not_helpful" }),
              });
            }}
          >
            👎 No
          </Button>
        </div>
      </div>
    </article>
  );
}

export default HelpPanel;
