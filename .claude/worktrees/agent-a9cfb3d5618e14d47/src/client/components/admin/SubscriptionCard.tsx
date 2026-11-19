import { Link } from "react-router-dom";
import { Crown, Users, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "../../i18n";

const PLAN_LABELS: Record<string, string> = {
  FREE: "Free",
  SMALL_BUSINESS: "Small Business",
  CONSULTANT: "Consultant",
  ENTERPRISE: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  FREE: "text-slate-600 dark:text-slate-400",
  SMALL_BUSINESS: "text-blue-600 dark:text-blue-400",
  CONSULTANT: "text-indigo-600 dark:text-indigo-400",
  ENTERPRISE: "text-purple-600 dark:text-purple-400",
};

function StatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  switch (status) {
    case "ACTIVE":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          <CheckCircle className="w-3 h-3" />
          {t("subscriptionCard.statusActive")}
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
          <Clock className="w-3 h-3" />
          {t("subscriptionCard.statusPending")}
        </span>
      );
    case "SUSPENDED":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
          <AlertCircle className="w-3 h-3" />
          {t("subscriptionCard.statusSuspended")}
        </span>
      );
    default:
      return null;
  }
}

/**
 * Subscription status widget for the admin dashboard.
 * Shows plan name, status, seat usage, and upgrade CTA.
 */
export function SubscriptionCard() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const plan = user?.billingplan ?? "FREE";
  const status = user?.subscriptionstatus;
  const seatsused = user?.seatsused ?? 1;
  const seatslimit = user?.maxusers ?? 1;
  const usagePercent = Math.min((seatsused / seatslimit) * 100, 100);
  const isAtCapacity = seatsused >= seatslimit;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      {/* Plan header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {t("subscriptionCard.currentPlan")}
          </p>
          <p className={`text-xl font-bold mt-0.5 ${PLAN_COLORS[plan] ?? "text-slate-900 dark:text-slate-100"}`}>
            <Crown className="inline w-4 h-4 mr-1 -mt-0.5" />
            {PLAN_LABELS[plan] ?? plan}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Seat usage */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {t("subscriptionCard.teamSeats")}
          </span>
          <span className={`text-sm font-semibold ${isAtCapacity ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
            {seatsused} / {seatslimit}
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              isAtCapacity ? "bg-red-500" : usagePercent > 80 ? "bg-amber-500" : "bg-indigo-500"
            }`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        {isAtCapacity && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            {t("subscriptionCard.seatLimitReached")}
          </p>
        )}
      </div>

      {/* Upgrade CTA (hidden for ENTERPRISE) */}
      {plan !== "ENTERPRISE" && (
        <Link
          to="/settings/billing/upgrade"
          className="block text-center py-2 px-4 rounded-lg border border-indigo-600 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition"
        >
          {t("subscriptionCard.upgradePlan")}
        </Link>
      )}
    </div>
  );
}
