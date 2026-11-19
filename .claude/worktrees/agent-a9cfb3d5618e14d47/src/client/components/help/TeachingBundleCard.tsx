/**
 * SCOPE-138 / T011 (FR-010) — "Learn wxKanban with your AI" on the Help page.
 *
 * Offers the current release's teaching bundle: start-here.md plus one lesson per process, which a
 * user loads into any AI chat to be taught wxKanban step by step. Shows the bundle's version and
 * lesson count, and one line on how to use it. Hidden until a bundle has been generated.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, GraduationCap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Button } from "../ui/Button";
import { useTranslation } from "~/client/i18n";

// [SCOPE 138 / T011] BEGIN — "Learn wxKanban with your AI" Help card
interface BundleInfo {
  available: boolean;
  appVersion: string | null;
  lessons: Array<{ id: string; title: string; version: number }>;
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("wxkanban_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export function TeachingBundleCard() {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery<BundleInfo | null>({
    queryKey: ["help", "teaching-skills"],
    queryFn: async () => {
      const r = await fetch("/api/help/teaching-skills", { credentials: "include", headers: authHeaders() });
      return r.ok ? ((await r.json()) as BundleInfo) : null;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data?.available) return null;

  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch("/api/help/teaching-skills/bundle", { credentials: "include", headers: authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "wxkanban-teaching-skills.zip";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-10 max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          {t("helpPage.teachTitle")}
        </CardTitle>
        <CardDescription>{t("helpPage.teachHowTo")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <Button onClick={download} disabled={busy}>
          <Download className="h-4 w-4 mr-2" />
          {t("helpPage.teachDownload")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("helpPage.teachVersion", { version: data.appVersion ?? "", count: data.lessons.length })}
        </span>
        {failed && <span className="text-sm text-destructive">{t("helpPage.teachError")}</span>}
      </CardContent>
    </Card>
  );
}
// [SCOPE 138 / T011] END
