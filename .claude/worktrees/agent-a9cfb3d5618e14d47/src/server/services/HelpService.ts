/**
 * HelpService - wxKanban Online Help System
 * 
 * Provides CRUD operations, search, and analytics for help articles.
 */

import { db } from "../../db/client.js";
import { wxkanbanhelp, WxKanbanHelp, NewWxKanbanHelp } from "../../db/schema/wxkanbanhelp.js";
import { eq, and, or, like, desc, asc, sql, count } from "drizzle-orm";

export interface HelpSearchFilters {
  category?: string;
  subcategory?: string;
  status?: string;
  visibility?: string;
  searchQuery?: string;
  tags?: string[];
}

export interface HelpSearchResult {
  articles: WxKanbanHelp[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface HelpRatingInput {
  articleId: string;
  userId: string;
  rating: "helpful" | "not_helpful";
}

class HelpService {
  /**
   * Search help articles with full-text search and filters
   */
  async searchArticles(
    filters: HelpSearchFilters,
    page: number = 1,
    pageSize: number = 20
  ): Promise<HelpSearchResult> {
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [];

    if (filters.category) {
      conditions.push(eq(wxkanbanhelp.category, filters.category));
    }

    if (filters.subcategory) {
      conditions.push(eq(wxkanbanhelp.subcategory, filters.subcategory));
    }

    if (filters.status) {
      conditions.push(eq(wxkanbanhelp.status, filters.status));
    } else {
      // Default to active articles only
      conditions.push(eq(wxkanbanhelp.status, "active"));
    }

    if (filters.visibility) {
      conditions.push(eq(wxkanbanhelp.visibility, filters.visibility));
    } else {
      // Default to public articles only
      conditions.push(eq(wxkanbanhelp.visibility, "public"));
    }

    if (filters.searchQuery) {
      // Full-text search over title/content.
      conditions.push(
        sql`to_tsvector('english', coalesce(${wxkanbanhelp.title}, '') || ' ' || coalesce(${wxkanbanhelp.content}, '')) @@ plainto_tsquery('english', ${filters.searchQuery})`
      );
    }

    if (filters.tags && filters.tags.length > 0) {
      // Check if any of the tags match (using JSON array containment)
      for (const tag of filters.tags) {
        conditions.push(
          sql`${wxkanbanhelp.tags}::jsonb @> ${JSON.stringify([tag])}::jsonb`
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: count() })
      .from(wxkanbanhelp)
      .where(whereClause || sql`TRUE`);

    const totalCount = Number(countResult[0]?.count || 0);

    // Get articles with stable ordering.
    const articles = filters.searchQuery
      ? await db
        .select()
        .from(wxkanbanhelp)
        .where(whereClause || sql`TRUE`)
        .orderBy(
          desc(
            sql`ts_rank(to_tsvector('english', coalesce(${wxkanbanhelp.title}, '') || ' ' || coalesce(${wxkanbanhelp.content}, '')), plainto_tsquery('english', ${filters.searchQuery}))`
          )
        )
        .limit(pageSize)
        .offset(offset)
      : await db
        .select()
        .from(wxkanbanhelp)
        .where(whereClause || sql`TRUE`)
        .orderBy(desc(wxkanbanhelp.viewCount), desc(wxkanbanhelp.updatedAt))
        .limit(pageSize)
        .offset(offset);

    return {
      articles,
      totalCount,
      page,
      pageSize,
    };
  }

  /**
   * Get a single article by slug
   */
  async getArticleBySlug(slug: string): Promise<WxKanbanHelp | null> {
    const results = await db
      .select()
      .from(wxkanbanhelp)
      .where(
        and(
          eq(wxkanbanhelp.slug, slug),
          eq(wxkanbanhelp.status, "active"),
          eq(wxkanbanhelp.visibility, "public")
        )
      )
      .limit(1);

    return results[0] || null;
  }

  /**
   * Get a single article by ID
   */
  async getArticleById(id: string): Promise<WxKanbanHelp | null> {
    const results = await db
      .select()
      .from(wxkanbanhelp)
      .where(eq(wxkanbanhelp.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Increment view count for an article
   */
  async incrementViewCount(id: string): Promise<void> {
    await db
      .update(wxkanbanhelp)
      .set({
        viewCount: sql`${wxkanbanhelp.viewCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(wxkanbanhelp.id, id));
  }

  /**
   * Rate an article (helpful/not helpful)
   */
  async rateArticle(input: HelpRatingInput): Promise<void> {
    const { articleId, rating } = input;

    if (rating === "helpful") {
      await db
        .update(wxkanbanhelp)
        .set({
          helpfulCount: sql`${wxkanbanhelp.helpfulCount} + 1`,
        })
        .where(eq(wxkanbanhelp.id, articleId));
    } else {
      await db
        .update(wxkanbanhelp)
        .set({
          notHelpfulCount: sql`${wxkanbanhelp.notHelpfulCount} + 1`,
        })
        .where(eq(wxkanbanhelp.id, articleId));
    }
  }

  /**
   * Get all unique categories
   */
  async getCategories(): Promise<Array<{ category: string; subcategories: string[] }>> {
    const results = await db
      .select({
        category: wxkanbanhelp.category,
        subcategory: wxkanbanhelp.subcategory,
      })
      .from(wxkanbanhelp)
      .where(
        and(
          eq(wxkanbanhelp.status, "active"),
          eq(wxkanbanhelp.visibility, "public")
        )
      )
      .groupBy(wxkanbanhelp.category, wxkanbanhelp.subcategory);

    // Group by category
    const categoryMap = new Map<string, Set<string>>();
    
    for (const row of results) {
      if (!categoryMap.has(row.category)) {
        categoryMap.set(row.category, new Set());
      }
      if (row.subcategory) {
        categoryMap.get(row.category)!.add(row.subcategory);
      }
    }

    return Array.from(categoryMap.entries()).map(([category, subcategories]) => ({
      category,
      subcategories: Array.from(subcategories),
    }));
  }

  /**
   * Get related articles based on category and tags
   */
  async getRelatedArticles(articleId: string, limit: number = 5): Promise<WxKanbanHelp[]> {
    const article = await this.getArticleById(articleId);
    if (!article) return [];

    const conditions = [
      eq(wxkanbanhelp.status, "active"),
      eq(wxkanbanhelp.visibility, "public"),
      sql`${wxkanbanhelp.id} != ${articleId}`,
    ];

    // Same category is preferred
    if (article.category) {
      conditions.push(eq(wxkanbanhelp.category, article.category));
    }

    const related = await db
      .select()
      .from(wxkanbanhelp)
      .where(and(...conditions))
      .limit(limit)
      .orderBy(desc(wxkanbanhelp.viewCount), desc(wxkanbanhelp.updatedAt));

    return related;
  }

  /**
   * Get CLI command documentation
   */
  async getCLICommands(): Promise<WxKanbanHelp[]> {
    return await db
      .select()
      .from(wxkanbanhelp)
      .where(
        and(
          eq(wxkanbanhelp.category, "cli"),
          eq(wxkanbanhelp.status, "active"),
          eq(wxkanbanhelp.visibility, "public")
        )
      )
      .orderBy(asc(wxkanbanhelp.title));
  }

  // ==================== Admin Methods ====================

  /**
   * Get all articles (admin view with filters)
   */
  async getAllArticles(
    filters: Partial<HelpSearchFilters> = {},
    page: number = 1,
    pageSize: number = 50
  ): Promise<HelpSearchResult> {
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (filters.category) {
      conditions.push(eq(wxkanbanhelp.category, filters.category));
    }

    if (filters.status) {
      conditions.push(eq(wxkanbanhelp.status, filters.status));
    }

    if (filters.visibility) {
      conditions.push(eq(wxkanbanhelp.visibility, filters.visibility));
    }

    if (filters.searchQuery) {
      conditions.push(
        or(
          like(wxkanbanhelp.title, `%${filters.searchQuery}%`),
          like(wxkanbanhelp.content, `%${filters.searchQuery}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countResult = await db
      .select({ count: count() })
      .from(wxkanbanhelp)
      .where(whereClause || sql`TRUE`);

    const totalCount = Number(countResult[0]?.count || 0);

    const articles = await db
      .select()
      .from(wxkanbanhelp)
      .where(whereClause || sql`TRUE`)
      .limit(pageSize)
      .offset(offset)
      .orderBy(desc(wxkanbanhelp.updatedAt));

    return {
      articles,
      totalCount,
      page,
      pageSize,
    };
  }

  /**
   * Create a new help article
   */
  async createArticle(data: NewWxKanbanHelp): Promise<WxKanbanHelp> {
    // Generate slug if not provided
    if (!data.slug && data.title) {
      data.slug = this.generateSlug(data.title);
    }

    // Set timestamps
    const now = new Date();
    
    const result = await db
      .insert(wxkanbanhelp)
      .values({
        ...data,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result[0];
  }

  /**
   * Update an existing help article
   */
  async updateArticle(
    id: string,
    data: Partial<NewWxKanbanHelp>
  ): Promise<WxKanbanHelp | null> {
    const result = await db
      .update(wxkanbanhelp)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(wxkanbanhelp.id, id))
      .returning();

    return result[0] || null;
  }

  /**
   * Soft delete a help article
   */
  async deleteArticle(id: string): Promise<boolean> {
    const result = await db
      .update(wxkanbanhelp)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(eq(wxkanbanhelp.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Hard delete a help article (use with caution)
   */
  async hardDeleteArticle(id: string): Promise<boolean> {
    const result = await db
      .delete(wxkanbanhelp)
      .where(eq(wxkanbanhelp.id, id))
      .returning();

    return result.length > 0;
  }

  /**
   * Get analytics data
   */
  async getAnalytics(): Promise<{
    totalArticles: number;
    totalViews: number;
    totalHelpful: number;
    totalNotHelpful: number;
    topArticles: WxKanbanHelp[];
    categoryDistribution: Array<{ category: string; count: number }>;
  }> {
    // Total counts
    const totalResult = await db
      .select({
        articles: count(),
        views: sql`SUM(${wxkanbanhelp.viewCount})`,
        helpful: sql`SUM(${wxkanbanhelp.helpfulCount})`,
        notHelpful: sql`SUM(${wxkanbanhelp.notHelpfulCount})`,
      })
      .from(wxkanbanhelp)
      .where(eq(wxkanbanhelp.status, "active"));

    // Top articles by views
    const topArticles = await db
      .select()
      .from(wxkanbanhelp)
      .where(eq(wxkanbanhelp.status, "active"))
      .orderBy(desc(wxkanbanhelp.viewCount))
      .limit(10);

    // Category distribution
    const categoryDist = await db
      .select({
        category: wxkanbanhelp.category,
        count: count(),
      })
      .from(wxkanbanhelp)
      .where(eq(wxkanbanhelp.status, "active"))
      .groupBy(wxkanbanhelp.category);

    return {
      totalArticles: Number(totalResult[0]?.articles || 0),
      totalViews: Number(totalResult[0]?.views || 0),
      totalHelpful: Number(totalResult[0]?.helpful || 0),
      totalNotHelpful: Number(totalResult[0]?.notHelpful || 0),
      topArticles,
      categoryDistribution: categoryDist.map((c) => ({
        category: c.category,
        count: Number(c.count),
      })),
    };
  }

  /**
   * Import multiple articles (bulk import)
   */
  async importArticles(articles: NewWxKanbanHelp[]): Promise<number> {
    let imported = 0;
    const now = new Date();

    for (const article of articles) {
      try {
        // Generate slug if not provided
        if (!article.slug && article.title) {
          article.slug = this.generateSlug(article.title);
        }

        await db.insert(wxkanbanhelp).values({
          ...article,
          createdAt: now,
          updatedAt: now,
        });
        imported++;
      } catch (error) {
        console.error(`Failed to import article: ${article.title}`, error);
      }
    }

    return imported;
  }

  // ==================== Landing-Page Docs (Scope 044) ====================

  // [SCOPE 044 / T002] BEGIN — listPublicDocs: ordered published docs for /docs
  /**
   * Public landing-page docs index: published (status 'active') records with
   * category = 'docs', ordered by sortorder. No auth.
   */
  async listPublicDocs(): Promise<WxKanbanHelp[]> {
    return db
      .select()
      .from(wxkanbanhelp)
      .where(
        and(
          eq(wxkanbanhelp.category, "docs"),
          eq(wxkanbanhelp.status, "active")
        )
      )
      .orderBy(asc(wxkanbanhelp.sortorder), asc(wxkanbanhelp.title));
  }
  // [SCOPE 044 / T002] END

  // [SCOPE 044 / T002] BEGIN — getPublicDocBySlug: single published doc
  /**
   * Public landing-page doc detail by slug. Returns null for unknown or
   * unpublished (draft/archived) docs so drafts never leak publicly.
   */
  async getPublicDocBySlug(slug: string): Promise<WxKanbanHelp | null> {
    const results = await db
      .select()
      .from(wxkanbanhelp)
      .where(
        and(
          eq(wxkanbanhelp.slug, slug),
          eq(wxkanbanhelp.category, "docs"),
          eq(wxkanbanhelp.status, "active")
        )
      )
      .limit(1);

    return results[0] || null;
  }
  // [SCOPE 044 / T002] END

  // [SCOPE 044 / T003] BEGIN — listDocsForAdmin: all docs regardless of status
  /**
   * SysAdmin docs list: every category = 'docs' record (any status), ordered
   * by sortorder, for management.
   */
  async listDocsForAdmin(): Promise<WxKanbanHelp[]> {
    return db
      .select()
      .from(wxkanbanhelp)
      .where(eq(wxkanbanhelp.category, "docs"))
      .orderBy(asc(wxkanbanhelp.sortorder), asc(wxkanbanhelp.title));
  }
  // [SCOPE 044 / T003] END

  // [SCOPE 044 / T003] BEGIN — createDoc: insert a docs record (category forced)
  /**
   * Create a docs record. Forces category = 'docs' and visibility 'public';
   * generates a slug from the title when none is supplied.
   */
  async createDoc(data: Partial<NewWxKanbanHelp>): Promise<WxKanbanHelp> {
    const now = new Date();
    const slug = data.slug || this.generateSlug(data.title || "doc");
    const result = await db
      .insert(wxkanbanhelp)
      .values({
        ...data,
        title: data.title || "Untitled",
        content: data.content || "",
        slug,
        category: "docs",
        visibility: "public",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result[0];
  }
  // [SCOPE 044 / T003] END

  // [SCOPE 044 / T003] BEGIN — updateDoc / deleteDoc: scoped to docs records
  /**
   * Update a docs record by id. Only affects category = 'docs' rows.
   */
  async updateDoc(
    id: string,
    data: Partial<NewWxKanbanHelp>
  ): Promise<WxKanbanHelp | null> {
    const result = await db
      .update(wxkanbanhelp)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(wxkanbanhelp.id, id), eq(wxkanbanhelp.category, "docs")))
      .returning();

    return result[0] || null;
  }

  /**
   * Hard-delete a docs record by id so it no longer appears publicly.
   */
  async deleteDoc(id: string): Promise<boolean> {
    const result = await db
      .delete(wxkanbanhelp)
      .where(and(eq(wxkanbanhelp.id, id), eq(wxkanbanhelp.category, "docs")))
      .returning();

    return result.length > 0;
  }
  // [SCOPE 044 / T003] END

  // ==================== Private Helpers ====================

  /**
   * Generate URL-friendly slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 100);
  }
}

export const helpService = new HelpService();
export default helpService;
