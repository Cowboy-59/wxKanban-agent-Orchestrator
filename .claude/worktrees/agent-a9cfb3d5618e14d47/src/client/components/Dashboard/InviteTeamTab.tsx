import { useState } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { Button } from "../ui/Button";

interface InviteFormData {
  emails: string[];
  usertype: "ADMIN" | "TEAM_MANAGER" | "TEAM_MEMBER";
  message: string;
}

export function InviteTeamTab() {
  const [inviteMethod, setInviteMethod] = useState<"single" | "csv" | "paste">(
    "single"
  );
  const [formData, setFormData] = useState<InviteFormData>({
    emails: [""],

    usertype: "TEAM_MEMBER",
    message: "",
  });
  const [seatWarning, setSeatWarning] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const parseEmails = (input: string): string[] => {
    return input
      .split(/[,\n\r]+/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
  };

  const validateEmails = (emails: string[]): boolean => {
    if (emails.length === 0) {
      setError("Please enter at least one email address");
      return false;
    }

    if (emails.length > 50) {
      setError("Maximum 50 emails allowed per invitation");
      return false;
    }

    const invalidEmails = emails.filter((email) => !validateEmail(email));
    if (invalidEmails.length > 0) {
      setError(
        `Invalid email addresses: ${invalidEmails.slice(0, 3).join(", ")}${
          invalidEmails.length > 3 ? ` and ${invalidEmails.length - 3} more` : ""
        }`
      );
      return false;
    }

    const uniqueEmails = new Set(emails);
    if (uniqueEmails.size !== emails.length) {
      setError("Duplicate email addresses detected");
      return false;
    }

    return true;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const emails = parseEmails(content);
      setFormData((prev) => ({ ...prev, emails }));
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const emails =
      inviteMethod === "single"
        ? formData.emails.filter((e) => e.length > 0)
        : formData.emails;

    if (!validateEmails(emails)) {
      return;
    }

    try {
      setLoading(true);
      // Send invitations using the proper invitations API
      const response = await fetch("/api/invitations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          emails,
          usertype: formData.usertype,
          message: formData.message || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 403 && error.upgrade) {
          setUpgradeRequired(true);
          throw new Error(error.error || "Plan upgrade required");
        }
        if (response.status === 409 && error.upgrade) {
          setSeatWarning(error.error || "Seat limit reached");
          throw new Error(error.error || "Seat limit reached");
        }
        throw new Error(error.error || "Failed to send invitations");
      }

      await response.json();
      setSuccess(
        `Invitations sent to ${emails.length} email address${
          emails.length > 1 ? "es" : ""
        }`
      );

      // Reset form
      setFormData({
        emails: [""],
        usertype: "TEAM_MEMBER",
        message: "",
      });
      setSeatWarning(null);
      setUpgradeRequired(false);
      setInviteMethod("single");

      // Invitations sent
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("Failed to send invitations:", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">Invite Team Members</h2>
        <p className="text-muted-foreground">
          Add new members to your team. They'll receive an email invitation that
          expires in 7 days.
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4 flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Input Method */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <div>
            <label className="text-sm font-semibold mb-3 block">
              How would you like to add team members?
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant={inviteMethod === "single" ? "default" : "secondary"}
                onClick={() => setInviteMethod("single")}
                className="flex-1"
              >
                Single Email
              </Button>
              <Button
                type="button"
                variant={inviteMethod === "paste" ? "default" : "secondary"}
                onClick={() => setInviteMethod("paste")}
                className="flex-1"
              >
                Paste Multiple
              </Button>
              <Button
                type="button"
                variant={inviteMethod === "csv" ? "default" : "secondary"}
                onClick={() => setInviteMethod("csv")}
                className="flex-1"
              >
                Upload CSV
              </Button>
            </div>
          </div>

          {/* Email Input */}
          {inviteMethod === "single" && (
            <div>
              <label htmlFor="email-single" className="block text-sm font-medium mb-2">
                Email Address
              </label>
              <input
                id="email-single"
                type="email"
                placeholder="developer@company.com"
                value={formData.emails[0] || ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    emails: [e.target.value],
                  }))
                }
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {inviteMethod === "paste" && (
            <div>
              <label htmlFor="emails-paste" className="block text-sm font-medium mb-2">
                Email Addresses
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Enter one email per line or comma-separated (max 50)
              </p>
              <textarea
                id="emails-paste"
                placeholder="developer1@company.com&#10;developer2@company.com&#10;developer3@company.com"
                value={formData.emails.join("\n")}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    emails: parseEmails(e.target.value),
                  }))
                }
                className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary h-32 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {formData.emails.filter((e) => e.length > 0).length} email
                address{formData.emails.length !== 1 ? "es" : ""} entered
              </p>
            </div>
          )}

          {inviteMethod === "csv" && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Upload CSV File
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-xs text-muted-foreground">
                    CSV file with one email per line
                  </span>
                </label>
              </div>
              {formData.emails.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {formData.emails.filter((e) => e.length > 0).length} email
                  address{formData.emails.length !== 1 ? "es" : ""} loaded
                </p>
              )}
            </div>
          )}
        </div>
        {/* Seat Limit Warning */}
        {seatWarning && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Seat Limit Reached</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{seatWarning}</p>
            </div>
          </div>
        )}

        {/* Upgrade Required for TEAM_MANAGER */}
        {upgradeRequired && (
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">Plan Upgrade Required</p>
              <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                Team Manager role requires CONSULTANT plan or higher. Upgrade to unlock this feature.
              </p>
            </div>
          </div>
        )}
        {/* Role Selection */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <label className="text-sm font-semibold block">Role</label>
          <div className="space-y-3">
            {([
              { value: "ADMIN", label: "Admin", desc: "Full access to company settings and team management" },
              { value: "TEAM_MANAGER", label: "Team Manager", desc: "Can manage projects and team members (requires CONSULTANT+ plan)" },
              { value: "TEAM_MEMBER", label: "Team Member", desc: "Can view and manage their own tasks" },
            ] as const).map((role) => (
              <label key={role.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="usertype"
                  value={role.value}
                  checked={formData.usertype === role.value}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      usertype: e.target.value as typeof role.value,

                    }))
                  }
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">{role.label}</p>
                  <p className="text-xs text-muted-foreground">{role.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        {/* Personal Message */}
        <div className="rounded-lg border border-border p-6 space-y-4">
          <label htmlFor="message" className="block text-sm font-semibold">
            Personal Message (Optional)
          </label>
          <p className="text-xs text-muted-foreground">
            Include a personalized message in the invitation email
          </p>
          <textarea
            id="message"
            placeholder="Welcome to the team! We're excited to have you on board..."
            value={formData.message}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, message: e.target.value }))
            }
            className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary h-24"
          />
        </div>

        {/* Submit */}
        <div className="flex gap-3">

          <Button 
            type="submit" 
            disabled={loading} 
            className="flex-1"
          >
            {loading ? "Sending..." : "Send Invitations"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFormData({
                emails: [""],
                usertype: "TEAM_MEMBER",
                message: "",
              });
              setError(null);
              setSuccess(null);
              setSeatWarning(null);
              setUpgradeRequired(false);
            }}
            disabled={loading}
          >
            Clear
          </Button>

        </div>
      </form>
      {/* Info Box */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
        <p className="text-sm text-blue-900 dark:text-blue-400">
          <strong>💡 Note:</strong> Invitations expire after 7 days. Team members
          will need to accept the invitation and create their account.
        </p>
      </div>
    </div>
  );
}
