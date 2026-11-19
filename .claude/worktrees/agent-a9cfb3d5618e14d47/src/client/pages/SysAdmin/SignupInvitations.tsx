/**
 * SysAdmin — Signup Invitations
 * Spec 023 FR-002a (invite-bound signup promotions).
 *
 * The mint surface for promotional signups: invite one email onto one plan with
 * N free days. The link is single-use and shown exactly once — only its sha256
 * is stored, so it cannot be recovered later.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Copy, Check, Ban, AlertTriangle, Clock, Gift, Eye, Send, Languages, ArrowLeft } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

type Tier = "SINGLE_USER" | "SMALL_BUSINESS" | "CONSULTANT" | "ENTERPRISE";

// [SCOPE 023 / T116] Send languages (FR-002a.2). Mirrors
// src/server/lib/signupInviteEmailStrings.ts — the email's fixed content is
// pre-authored in each of these, so no model call happens at send time.
type Locale = "en-US" | "fr-FR" | "de-DE" | "es-ES" | "it-IT" | "pt-BR";

const LOCALE_LABEL: Record<Locale, string> = {
  "en-US": "English",
  "fr-FR": "Français",
  "de-DE": "Deutsch",
  "es-ES": "Español",
  "it-IT": "Italiano",
  "pt-BR": "Português (Brasil)",
};

interface SignupInvitation {
  id: string;
  email: string;
  billingplan: Tier;
  promodays: number;
  status: "pending" | "redeemed" | "revoked" | "expired";
  expiresat: string;
  invitedat: string;
  redeemedat: string | null;
  redeemedcompanyid: string | null;
}

// [SCOPE 023 / T114] Created but NOT yet emailed (FR-002a.1). The rawToken is
// held here only until Send: the server stores just its sha256, so this is the
// one and only moment it exists. Losing it means revoke + reissue.
interface CreateResult {
  registerLink: string;
  rawToken: string;
  defaultSubject: string;
  to: string;
}

const TIER_LABEL: Record<Tier, string> = {
  SINGLE_USER: "Single User — $19.95/mo",
  SMALL_BUSINESS: "Small/Medium Business — $29.95/mo",
  CONSULTANT: "Consultant — $39.95/mo",
  ENTERPRISE: "Enterprise — $59.95/mo",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  redeemed: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  revoked: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

// [SCOPE 023 / T110] BEGIN — SysAdmin signup-invitation manager
const SignupInvitations: React.FC = () => {
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState<SignupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [billingplan, setBillingplan] = useState<Tier>("CONSULTANT");
  // Must be one of the options the dropdown offers AND within MAX_PROMO_DAYS
  // (60). It defaulted to 3 — left over from when the dropdown offered up to 12
  // — which selected nothing and posted 90 days, so the server rejected the very
  // first click.
  const [freeMonths, setFreeMonths] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // [SCOPE 023 / T114] Compose step (FR-002a.1)
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  // [SCOPE 023 / T116] Send language (FR-002a.2)
  const [locale, setLocale] = useState<Locale>("en-US");
  const [translating, setTranslating] = useState(false);
  const [translateNote, setTranslateNote] = useState<string | null>(null);
  // Tracks whether the admin has written their own subject. If they have, a
  // language change must not throw their wording away.
  const [subjectEdited, setSubjectEdited] = useState(false);
  // [SCOPE 023 / T117] The English source of the message. Picking a language
  // translates FROM this, never from the currently-displayed translation — so
  // switching fr → de doesn't translate a translation. Switching back to English
  // restores exactly what was typed.
  const [messageEn, setMessageEn] = useState("");

  // The invite is specified in months (how Andy thinks about it) but Stripe
  // trials are days, so convert at the boundary.
  const promodays = freeMonths * 30;

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sysadmin/signup-invitations", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load invitations");
      setInvitations(data.invitations ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invitations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInvitations();
  }, [fetchInvitations]);

  // [SCOPE 023 / T114] Create mints the invitation and returns the link. It does
  // NOT send anything — the email is composed and sent as a separate step.
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    setSendResult(null);
    setPreviewHtml("");
    setTranslateNote(null);
    setSubjectEdited(false);
    setLocale("en-US");
    setMessageEn("");

    try {
      const res = await fetch("/api/sysadmin/signup-invitations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), billingplan, promodays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create invitation");

      const result: CreateResult = {
        registerLink: data.registerLink,
        rawToken: data.rawToken,
        defaultSubject: data.defaultSubject,
        to: email.trim(),
      };
      setCreated(result);
      setSubject(data.defaultSubject);
      setMessage("");
      setEmail("");
      await fetchInvitations();
      await refreshPreview(result.rawToken, data.defaultSubject, "", "en-US");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invitation");
    } finally {
      setSubmitting(false);
    }
  };

  // Renders server-side using the same code path as the real send, so what you
  // see is what actually goes out — not a client-side approximation that drifts.
  const refreshPreview = useCallback(
    async (token: string, subj: string, msg: string, loc: Locale) => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/sysadmin/signup-invitations/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawToken: token,
            subject: subj || "(no subject)",
            message: msg,
            locale: loc,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to render preview");
        setPreviewHtml(data.html);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to render preview");
      } finally {
        setPreviewLoading(false);
      }
    },
    [],
  );

  // [SCOPE 023 / T117] Changing language translates the WHOLE email: the
  // template (pre-authored), the default subject, and the admin's own message.
  //
  // This originally left the message alone, on the theory that auto-translating
  // would overwrite the admin's words. In practice picking "Français" and
  // getting an email with an English paragraph in it is just broken — so it now
  // translates, and protects the words by keeping the English source instead.
  const handleLocaleChange = async (next: Locale) => {
    const prev = locale;
    setLocale(next);
    setTranslateNote(null);
    if (!created) return;

    // ── the admin's message
    let nextMessage = message;
    if (next === "en-US") {
      // Restore the original exactly, rather than translating back into English
      // (which would return an approximation of what they actually wrote).
      nextMessage = messageEn;
      setMessage(messageEn);
    } else if (messageEn.trim()) {
      setTranslating(true);
      try {
        const res = await fetch("/api/sysadmin/signup-invitations/translate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // Always from the English source — never the displayed translation.
          body: JSON.stringify({ text: messageEn, locale: next }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Translation failed");
        nextMessage = data.text;
        setMessage(data.text);
        setTranslateNote(
          `Your message was translated into ${LOCALE_LABEL[next]}. Read it before sending — you can edit it.`,
        );
      } catch (err) {
        // Fail loudly and revert the picker: an email that says "Français" in
        // the dropdown but carries an English paragraph is exactly the bug
        // being fixed. Better to say translation failed than to send it.
        setLocale(prev);
        setTranslateNote(
          err instanceof Error
            ? `${err.message} Language left as ${LOCALE_LABEL[prev]}.`
            : "Translation failed — language unchanged.",
        );
        setTranslating(false);
        return;
      } finally {
        setTranslating(false);
      }
    }

    // ── the subject (only if the admin hasn't written their own)
    let nextSubject = subject;
    if (!subjectEdited) {
      try {
        const res = await fetch("/api/sysadmin/signup-invitations/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rawToken: created.rawToken,
            subject: "(placeholder)",
            message: nextMessage,
            locale: next,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.defaultSubject) {
            nextSubject = data.defaultSubject;
            setSubject(nextSubject);
          }
        }
      } catch {
        /* keep the current subject — not worth failing the language switch */
      }
    }

    await refreshPreview(created.rawToken, nextSubject, nextMessage, next);
  };

  // [SCOPE 023 / T117] Manual re-translate. The language picker does this
  // automatically; this is the retry after a failure, or a redo after the
  // English source was edited.
  const handleTranslate = async () => {
    if (!created || !messageEn.trim() || locale === "en-US") return;
    setTranslating(true);
    setTranslateNote(null);
    try {
      const res = await fetch("/api/sysadmin/signup-invitations/translate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messageEn, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Translation failed");

      setMessage(data.text);
      setTranslateNote(
        `Re-translated into ${LOCALE_LABEL[locale]} from your English text. Read it before sending.`,
      );
      await refreshPreview(created.rawToken, subject, data.text, locale);
    } catch (err) {
      // Fail loudly: silently sending English to a French prospect is worse
      // than telling the admin the translation didn't happen.
      setTranslateNote(
        err instanceof Error ? err.message : "Translation failed — your message is unchanged.",
      );
    } finally {
      setTranslating(false);
    }
  };

  const handleSend = async () => {
    if (!created) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/sysadmin/signup-invitations/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawToken: created.rawToken, subject, message, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");

      setSendResult(
        data.emailSent
          ? { ok: true, text: `Sent to ${created.to}.` }
          : { ok: false, text: data.emailError ?? "The email was not sent — send the link yourself." },
      );
      await fetchInvitations();
    } catch (err) {
      setSendResult({
        ok: false,
        text: err instanceof Error ? err.message : "Failed to send",
      });
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/sysadmin/signup-invitations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to revoke");
      await fetchInvitations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke");
    }
  };

  const copyLink = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.registerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      {/* [SCOPE 023 / T118] Way back out — matches the Feedback/Docs/Companies
          header pattern. The page had a nav entrance but no exit. */}
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => navigate("/sysadmin/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Gift className="w-6 h-6" /> Signup Invitations
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Invite someone to register with a free promotional period. The link works
          once, only for the address you enter.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>New invitation</CardTitle>
          <CardDescription>
            The recipient gets the plan and free period you choose here. They cannot
            change either.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEmail(e.target.value)
                  }
                  placeholder="prospect@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Plan
                </label>
                <select
                  value={billingplan}
                  onChange={(e) => setBillingplan(e.target.value as Tier)}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(TIER_LABEL) as Tier[]).map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Free months
                </label>
                <select
                  value={freeMonths}
                  onChange={(e) => setFreeMonths(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  {/* Capped at 2 months — the server rejects anything longer
                      (MAX_PROMO_DAYS). Kept in sync by the tier-cap unit test. */}
                  {[1, 2].map((m) => (
                    <option key={m} value={m}>
                      {m} month{m > 1 ? "s" : ""} ({m * 30} days)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="submit" disabled={submitting || !email.trim()}>
              <Mail className="w-4 h-4 mr-2" />
              {submitting ? "Creating…" : "Create invitation"}
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Creating does not send anything — you'll get the link and can edit
              the email before it goes.
            </p>
          </form>

          {created && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                Invitation created for {created.to} — no email sent yet.
              </p>

              {/* The raw token is never stored (only its sha256), so this is the
                  one and only time the link can be shown. */}
              <p className="text-sm text-blue-900 dark:text-blue-200 mt-1">
                This link is shown only once. Copy it now if you want to send it
                yourself — otherwise edit and send the email below.
              </p>

              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 overflow-x-auto whitespace-nowrap">
                  {created.registerLink}
                </code>
                <Button type="button" variant="secondary" onClick={copyLink}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* [SCOPE 023 / T114] BEGIN — compose, preview, send (FR-002a.1) */}
      {created && (
        <Card>
          <CardHeader>
            <CardTitle>Email to {created.to}</CardTitle>
            <CardDescription>
              Edit the subject and add your own message, then send. The link,
              pricing and expiry are part of the template and always included.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Compose */}
              <div className="space-y-4">
                {/* [SCOPE 023 / T116] Send language (FR-002a.2) */}
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Languages className="w-4 h-4" />
                      Language
                    </span>
                  </label>
                  <select
                    value={locale}
                    onChange={(e) => void handleLocaleChange(e.target.value as Locale)}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  >
                    {(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => (
                      <option key={l} value={l}>
                        {LOCALE_LABEL[l]}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Switches the whole email — wording, price, date, and your
                    message. Your English is kept, so switching back restores it.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Subject
                  </label>
                  <Input
                    value={subject}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setSubject(e.target.value);
                      setSubjectEdited(true);
                    }}
                    onBlur={() => refreshPreview(created.rawToken, subject, message, locale)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
                    Your message <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    rows={8}
                    value={message}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMessage(v);
                      // [SCOPE 023 / T117] Keep the English source in step while
                      // writing in English (or if there is no source yet), so
                      // switching language translates what was actually typed —
                      // and switching back to English restores it verbatim.
                      if (locale === "en-US" || !messageEn) setMessageEn(v);
                    }}
                    onBlur={() => refreshPreview(created.rawToken, subject, message, locale)}
                    placeholder={`Hi — great speaking earlier. Here's the ${freeMonths === 1 ? "month" : `${freeMonths} months`} on ${billingplan.replace("_", " ").toLowerCase()} we discussed.`}
                    className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Appears near the top of the email. Line breaks are kept.
                    Write it in English — picking a language translates it.
                  </p>
                </div>

                {/* [SCOPE 023 / T116] Translate is explicit and reviewable — the
                    result lands back in the box above so it can be edited. */}
                {locale !== "en-US" && (
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleTranslate}
                      disabled={translating || !message.trim()}
                    >
                      <Languages className="w-4 h-4 mr-2" />
                      {translating ? "Translating…" : `Re-translate my message to ${LOCALE_LABEL[locale]}`}
                    </Button>
                    {translateNote && (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                        {translateNote}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => refreshPreview(created.rawToken, subject, message, locale)}
                    disabled={previewLoading}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {previewLoading ? "Rendering…" : "Refresh preview"}
                  </Button>
                  <Button type="button" onClick={handleSend} disabled={sending || !subject.trim()}>
                    <Send className="w-4 h-4 mr-2" />
                    {sending ? "Sending…" : `Send in ${LOCALE_LABEL[locale]}`}
                  </Button>
                </div>

                {sendResult && (
                  <div
                    className={`rounded-lg border p-3 text-sm ${
                      sendResult.ok
                        ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"
                        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                    }`}
                  >
                    {sendResult.text}
                    {!sendResult.ok && (
                      <>
                        {" "}
                        The invitation is still valid — copy the link above and send it yourself.
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Preview — rendered by the server with the same code that sends,
                  so it can't drift from the real email. */}
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Preview
                </p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white">
                  <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <div><strong>To:</strong> {created.to}</div>
                    <div><strong>Subject:</strong> {subject || "(no subject)"}</div>
                  </div>
                  {previewHtml ? (
                    <iframe
                      title="Email preview"
                      // sandbox with no allow-scripts: the preview must never
                      // execute anything, it only needs to render.
                      sandbox=""
                      srcDoc={previewHtml}
                      className="h-[520px] w-full bg-white"
                    />
                  ) : (
                    <p className="p-4 text-sm text-slate-500">
                      {previewLoading ? "Rendering…" : "No preview yet."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* [SCOPE 023 / T114] END */}

      <Card>
        <CardHeader>
          <CardTitle>Issued invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-slate-500 text-sm">Loading…</p>
          ) : invitations.length === 0 ? (
            <p className="text-slate-500 text-sm">No invitations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Plan</th>
                    <th className="py-2 pr-4 font-medium">Free</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Expires</th>
                    <th className="py-2 pr-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="py-2 pr-4">{inv.email}</td>
                      <td className="py-2 pr-4">{inv.billingplan}</td>
                      <td className="py-2 pr-4">{inv.promodays} days</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            STATUS_STYLES[inv.status] ?? STATUS_STYLES.revoked
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(inv.expiresat).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {inv.status === "pending" && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleRevoke(inv.id)}
                          >
                            <Ban className="w-4 h-4 mr-1" /> Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
// [SCOPE 023 / T110] END

export default SignupInvitations;
