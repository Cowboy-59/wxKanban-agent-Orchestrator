/**
 * ConfirmationStep Component
 * T021 - Registration confirmation step
 * Displays final confirmation before completing registration
 */

import { Button } from '~/client/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '~/client/components/ui/Card';
import { LoadingSpinner } from '~/client/components/ui/LoadingSpinner';
import { useTranslation } from '~/client/i18n'; // [SCOPE 052]

interface ConfirmationStepProps {
  companyName: string;
  billingEmail: string;
  subscriptionTier: 'FREE' | 'SMALL_BUSINESS' | 'CONSULTANT' | 'ENTERPRISE';
  adminEmail: string;
  adminName: string;
  onConfirm: () => void;
  onBack: () => void;
  isLoading?: boolean;
}

const tierLabelKey: Record<string, string> = {
  FREE: 'register.tierFree',
  SINGLE_USER: 'register.tierSingleUser',
  SMALL_BUSINESS: 'register.tierSmallBusiness',
  CONSULTANT: 'register.tierConsultant',
  ENTERPRISE: 'register.tierEnterprise',
};

const tierPrices: Record<string, string> = {
  FREE: '$0',
  SINGLE_USER: '$19.95/month',
  SMALL_BUSINESS: '$29.95/month',
  CONSULTANT: '$39.95/month',
  ENTERPRISE: '$59.95/month',
};

export function ConfirmationStep({
  companyName,
  billingEmail,
  subscriptionTier,
  adminEmail,
  adminName,
  onConfirm,
  onBack,
  isLoading = false,
}: ConfirmationStepProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t('register.confTitle')}
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          {t('register.confSubtitle')}
        </p>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('register.companyTitle')}</CardTitle>
          <CardDescription>{t('register.confCompanyDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">{t('register.confCompanyName')}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{companyName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">{t('register.confBillingEmail')}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{billingEmail}</span>
          </div>
        </CardContent>
      </Card>

      {/* Subscription Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('register.subscriptionPlan')}</CardTitle>
          <CardDescription>{t('register.subscriptionPlanDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-slate-600 dark:text-slate-400">{t('register.selectedPlan')}</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              {t(tierLabelKey[subscriptionTier] ?? 'register.tierFree')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">{t('register.monthlyPrice')}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {tierPrices[subscriptionTier]}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Admin Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('register.adminAccount')}</CardTitle>
          <CardDescription>{t('register.adminAccountDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">{t('register.nameLabel')}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{adminName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">{t('register.emailShort')}</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{adminEmail}</span>
          </div>
        </CardContent>
      </Card>

      {/* Terms and Privacy */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 text-sm text-slate-600 dark:text-slate-400">
        <p>
          {t('register.termsClickPrefix')}{' '}
          <a href="/terms" className="text-blue-600 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">
            {t('register.termsOfService')}
          </a>{' '}
          {t('register.and')}{' '}
          <a href="/privacy" className="text-blue-600 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">
            {t('register.privacyPolicy')}
          </a>
          .
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
        >
          {t('register.back')}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isLoading}
          className="min-w-[160px]"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              {t('register.creatingAccount')}
            </>
          ) : (
            t('register.completeRegistration')
          )}
        </Button>
      </div>
    </div>
  );
}

export default ConfirmationStep;
