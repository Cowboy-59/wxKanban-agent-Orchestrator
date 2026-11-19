import { useState, useEffect, useRef } from "react";
import { Edit2, Check, X, RefreshCw, Loader2, FileText } from "lucide-react";
import mermaid from "mermaid";
import type { ProjectDocument } from "~/shared/types/projects";


interface ProjectOverviewTabProps {
  projectId: string;
  document: ProjectDocument | null;
  loading?: boolean;
  /** Whether the current user can edit the overview (ADMIN only) */
  canEdit: boolean;
  onUpdate: (content: string) => Promise<void>;
  onRefetch: () => void;
}

/**
 * MermaidRenderer - Renders mermaid diagrams
 */
function MermaidRenderer({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
    });
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!content || !containerRef.current) return;
      
      try {
        // Generate a unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        
        // Check if content is valid mermaid
        const validMermaid = content.trim().match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|xychart|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|c4Container|c4Component|c4Deployment|sankey|block-beta|packet-beta|architecture-beta|kanban|block|packet|architecture)/);
        
        if (!validMermaid) {
          setError("Invalid mermaid diagram type");
          return;
        }

        const { svg } = await mermaid.render(id, content);
        setSvg(svg);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    };

    renderDiagram();
  }, [content]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-xs text-red-600 dark:text-red-400">Mermaid Error: {error}</p>
        <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">{content}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        <span className="ml-2 text-sm text-gray-500">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="mermaid-diagram bg-white dark:bg-gray-800 rounded-lg p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Parse content and extract mermaid blocks
 */
function parseContent(content: string): Array<{ type: "text" | "mermaid"; content: string }> {
  const blocks: Array<{ type: "text" | "mermaid"; content: string }> = [];
  const lines = content.split("\n");
  
  let currentBlock: { type: "text" | "mermaid"; content: string[] } = { type: "text", content: [] };
  let inMermaidBlock = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("```mermaid")) {
      // End current text block and start mermaid
      if (currentBlock.content.length > 0) {
        blocks.push({ type: currentBlock.type, content: currentBlock.content.join("\n") });
      }
      currentBlock = { type: "mermaid", content: [] };
      inMermaidBlock = true;
    } else if (trimmed === "```" && inMermaidBlock) {
      // End mermaid block
      if (currentBlock.content.length > 0) {
        blocks.push({ type: "mermaid", content: currentBlock.content.join("\n") });
      }
      currentBlock = { type: "text", content: [] };
      inMermaidBlock = false;
    } else {
      currentBlock.content.push(line);
    }
  }
  
  // Add remaining content
  if (currentBlock.content.length > 0) {
    blocks.push({ type: currentBlock.type, content: currentBlock.content.join("\n") });
  }
  
  return blocks;
}

/**
 * Render markdown-like content with mermaid diagram support
 */
function OverviewContent({ content }: { content: string }) {
  const blocks = parseContent(content);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
      {blocks.map((block, i) => {
        if (block.type === "mermaid") {
          return <MermaidRenderer key={i} content={block.content} />;
        }
        
        // Render text block with markdown-like formatting
        const lines = block.content.split("\n");
        return (
          <div key={i} className="space-y-1">
            {lines.map((line, j) => {
              if (line.startsWith("## ")) {
                return (
                  <h2 key={j} className="text-base font-bold text-gray-900 dark:text-white mt-4 mb-1">
                    {line.slice(3)}
                  </h2>
                );
              }
              if (line.startsWith("# ")) {
                return (
                  <h1 key={j} className="text-lg font-bold text-gray-900 dark:text-white mt-4 mb-1">
                    {line.slice(2)}
                  </h1>
                );
              }
              if (line.startsWith("### ")) {
                return (
                  <h3 key={j} className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-0.5">
                    {line.slice(4)}
                  </h3>
                );
              }
              if (line.startsWith("- ")) {
                return (
                  <li key={j} className="text-sm text-gray-700 dark:text-gray-300 ml-4 list-disc">
                    {line.slice(2)}
                  </li>
                );
              }
              if (line.trim() === "") {
                return <div key={j} className="h-2" />;
              }
              return (
                <p key={j} className="text-sm text-gray-700 dark:text-gray-300">
                  {line}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}


/**
 * ProjectOverviewTab — renders the AI-generated project overview document.
 *
 * Shows a skeleton/retry UI when content is empty (AI scaffolding pending).
 * ADMIN can edit via inline textarea.
 */
export function ProjectOverviewTab({
  projectId,
  document,
  loading = false,
  canEdit,
  onUpdate,
  onRefetch,
}: ProjectOverviewTabProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Auto-retry polling when content is empty (AI scaffolding in-flight)
  const retryCountRef = useRef(0);
  const isEmpty = !loading && document !== null && document.content === "";

  useEffect(() => {
    if (!isEmpty) return;
    if (retryCountRef.current >= 6) return; // max ~30s of polling

    const timer = setTimeout(() => {
      retryCountRef.current += 1;
      onRefetch();
    }, 5000);
    return () => clearTimeout(timer);
  }, [isEmpty, document, onRefetch]);

  const handleEditStart = () => {
    setEditContent(document?.content ?? "");
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await onUpdate(editContent);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
    setEditContent("");
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
        <div className="h-4 bg-gray-100 dark:bg-gray-700/60 rounded w-full" />
        <div className="h-4 bg-gray-100 dark:bg-gray-700/60 rounded w-4/5" />
        <div className="h-4 bg-gray-100 dark:bg-gray-700/60 rounded w-full" />
        <div className="h-4 bg-gray-100 dark:bg-gray-700/60 rounded w-3/4" />
        <p className="text-xs text-gray-400 dark:text-gray-500 pt-2">
          AI is generating the project overview...
        </p>
      </div>
    );
  }

  // No document at all
  if (!document) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No lifecycle document yet.</p>
        {canEdit && (
          <p className="text-xs mt-1">
            A lifecycle document will be generated automatically when you create a project.
          </p>
        )}
      </div>
    );
  }


  // Empty content — AI scaffolding pending
  if (isEmpty) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center space-y-3">
        <Loader2 className="w-8 h-8 mx-auto text-indigo-500 dark:text-indigo-400 animate-spin" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Generating project lifecycle...
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          AI is analysing your project and creating the lifecycle document. This usually takes a few seconds.
        </p>
        <button
          type="button"
          onClick={() => { retryCountRef.current = 0; onRefetch(); }}
          className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh now
        </button>
        {retryCountRef.current >= 6 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Generation is taking longer than expected. The project was created successfully — you can edit the lifecycle manually.
          </p>
        )}
      </div>
    );
  }


  // Editing mode
  if (editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Edit Lifecycle
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {saveError && (
          <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
        )}
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={20}
          className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
        />
      </div>
    );
  }

  // Read mode
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {document.title || "Project Lifecycle"}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Updated {new Date(document.updatedat).toLocaleDateString()}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={handleEditStart}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors"
              title="Edit lifecycle"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>


      {/* Content */}
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-6 py-5">
        <OverviewContent content={document.content} />
      </div>

      {/* Project ID reference for project.init */}
      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
        Project ID: {projectId}
      </p>
    </div>
  );
}
