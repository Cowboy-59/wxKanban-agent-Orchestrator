/**
 * HelpPage - Full-page help interface
 * 
 * Provides a comprehensive help experience with search, categories, and articles.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Book, Command, ArrowLeft } from "lucide-react";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "~/client/i18n";
import { TeachingBundleCard } from "../components/help/TeachingBundleCard"; // [SCOPE 138 / T011]

interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  category: string;
  subcategory: string | null;
  viewCount: number;
  helpfulCount: number;
}

interface HelpCategory {
  category: string;
  subcategories: string[];
}

export function HelpPage() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch categories
  const { data: categories } = useQuery<HelpCategory[]>({
    queryKey: ["help-categories"],
    queryFn: async () => {
      const response = await fetch("/api/help/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      return data.data;
    },
  });

  // Search articles
  const { data: searchResults, isLoading } = useQuery<{ articles: HelpArticle[] }>({
    queryKey: ["help-search", searchQuery, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (selectedCategory) params.append("category", selectedCategory);
      params.append("limit", "50");
      
      const response = await fetch(`/api/help/search?${params}`);
      if (!response.ok) throw new Error("Failed to search articles");
      const data = await response.json();
      return data.data;
    },
    enabled: searchQuery.length > 0 || !!selectedCategory,
  });

  // Fetch article if slug is provided
  const { data: article } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      if (!slug) return null;
      const response = await fetch(`/api/help/articles/${slug}`);
      if (!response.ok) throw new Error("Failed to fetch article");
      const data = await response.json();
      return data.data;
    },
    enabled: !!slug,
  });

  const handleArticleClick = (articleSlug: string) => {
    navigate(`/help/${articleSlug}`);
  };

  const handleBackToHelp = () => {
    navigate("/help");
    setSearchQuery("");
    setSelectedCategory(null);
  };

  // Article View
  if (slug && article) {
    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <Button 
          variant="ghost" 
          onClick={handleBackToHelp}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("helpPage.backToHelpCenter")}
        </Button>

        <article className="prose prose-lg max-w-none">
          <h1 className="text-3xl font-bold mb-6">{article.title}</h1>
          
          {article.command && (
            <div className="bg-muted p-4 rounded-lg mb-6 font-mono text-sm">
              {article.command}
            </div>
          )}

          {article.summary && (
            <p className="text-lg text-muted-foreground mb-6">{article.summary}</p>
          )}

          <div className="whitespace-pre-wrap">{article.content}</div>

          {article.examples && article.examples.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-4">{t("helpPage.examples")}</h2>
              <div className="space-y-3">
                {article.examples.map((example: string, i: number) => (
                  <div key={i} className="bg-muted p-4 rounded-lg font-mono text-sm">
                    {example}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rating */}
          <div className="mt-12 pt-6 border-t">
            <p className="text-muted-foreground mb-3">{t("helpPage.wasArticleHelpful")}</p>
            <div className="flex gap-3">
              <Button 
                variant="outline"
                onClick={() => {
                  fetch(`/api/help/${article.id}/rate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rating: "helpful" }),
                  });
                }}
              >
                👍 {t("helpPage.yesItHelped")}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  fetch(`/api/help/${article.id}/rate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rating: "not_helpful" }),
                  });
                }}
              >
                👎 {t("helpPage.noNotHelpful")}
              </Button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  // Help Center Home
  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{t("helpPage.helpCenter")}</h1>
        <p className="text-lg text-muted-foreground mb-8">
          {t("helpPage.subtitle")}
        </p>
        
        {/* Search */}
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder={t("helpPage.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 py-6 text-lg"
          />
        </div>
      </div>

      {/* [SCOPE 138 / T011] Learn wxKanban with your AI — hidden until a bundle exists */}
      <TeachingBundleCard />

      {searchQuery ? (
        // Search Results
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold mb-4">
            {t("helpPage.searchResults")} {searchResults && `(${searchResults.articles.length})`}
          </h2>
          
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">{t("helpPage.searching")}</div>
          ) : searchResults?.articles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("helpPage.noResults", { query: searchQuery })}
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults?.articles.map((article) => (
                <button
                  key={article.id}
                  onClick={() => handleArticleClick(article.slug)}
                  className="w-full text-left p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <h3 className="font-medium text-lg">{article.title}</h3>
                  {article.summary && (
                    <p className="text-muted-foreground mt-1 line-clamp-2">
                      {article.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="capitalize">{article.category}</span>
                    {article.subcategory && (
                      <>
                        <span>•</span>
                        <span>{article.subcategory}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{t("helpPage.viewsCount", { count: article.viewCount })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Categories Grid
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories?.map((cat) => (
            <div
              key={cat.category}
              className="p-6 rounded-xl border hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedCategory(cat.category)}
            >
              <div className="flex items-center gap-3 mb-3">
                {cat.category === "cli" ? (
                  <Command className="h-6 w-6 text-primary" />
                ) : (
                  <Book className="h-6 w-6 text-primary" />
                )}
                <h3 className="text-xl font-semibold capitalize">{cat.category}</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                {t("helpPage.topicsCount", { count: cat.subcategories.length })}
              </p>
              <div className="flex flex-wrap gap-2">
                {cat.subcategories.slice(0, 3).map((sub) => (
                  <span
                    key={sub}
                    className="text-xs bg-muted px-2 py-1 rounded"
                  >
                    {sub}
                  </span>
                ))}
                {cat.subcategories.length > 3 && (
                  <span className="text-xs text-muted-foreground">
                    {t("helpPage.moreCount", { count: cat.subcategories.length - 3 })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HelpPage;
