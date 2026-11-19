import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Loader2, CheckCircle, XCircle, Building2, UserPlus } from 'lucide-react';
import { useTranslation } from '~/client/i18n';

interface InvitationDetails {
  companyName: string;
  role: string;
  inviterName: string;
  email: string;
}

export default function InvitePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'accepted'>('loading');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setError(t('invitePage.errorNoToken'));
      return;
    }

    validateInvitation(token);
  }, [token]);

  const validateInvitation = async (_invitationToken: string) => {
    try {
      // In a real implementation, this would call the API to validate
      // For now, we'll simulate a valid invitation
      setTimeout(() => {
        setInvitation({
          companyName: 'Acme Corporation',
          role: 'Team Member',
          inviterName: 'John Smith',
          email: 'user@example.com',
        });
        setStatus('valid');
      }, 1000);
    } catch (err) {
      setStatus('invalid');
      setError(t('invitePage.errorInvalidExpired'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (password !== confirmPassword) {
      setPasswordError(t('invitePage.errorPasswordMismatch'));
      return;
    }

    if (password.length < 8) {
      setPasswordError(t('invitePage.errorPasswordTooShort'));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/invitations/accept/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName,
          lastName,
          password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('accepted');
      } else {
        setError(data.error || t('invitePage.errorAcceptFailed'));
      }
    } catch (err) {
      setError(t('invitePage.errorUnexpected'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <CardTitle className="text-white">{t('invitePage.invalidTitle')}</CardTitle>
            <CardDescription className="text-slate-400">
              {error || t('invitePage.invalidDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-slate-400 mb-4">
              {t('invitePage.invalidContactPrompt')}
            </p>
            <Link to="/login">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                {t('invitePage.goToSignIn')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
          <CardHeader className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-white">{t('invitePage.acceptedTitle')}</CardTitle>
            <CardDescription className="text-slate-400">
              {t('invitePage.acceptedDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-slate-300">
              {t('invitePage.acceptedBody')}
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {t('invitePage.signInNow')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-white">{t('invitePage.joinTitle', { companyName: invitation?.companyName })}</CardTitle>
          <CardDescription className="text-slate-400">
            {t('invitePage.invitedBy', { inviterName: invitation?.inviterName, role: invitation?.role })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/50 border border-red-800 rounded-lg p-3">
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
              <Building2 className="h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-300">{t('invitePage.emailLabel')}</p>
                <p className="text-white font-medium">{invitation?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium text-slate-300">
                  {t('invitePage.firstNameLabel')}
                </label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-slate-300">
                  {t('invitePage.lastNameLabel')}
                </label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-300">
                {t('invitePage.passwordLabel')}
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-300">
                {t('invitePage.confirmPasswordLabel')}
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-slate-700/50 border-slate-600 text-white"
                required
              />
            </div>

            {passwordError && (
              <p className="text-red-400 text-sm">{passwordError}</p>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('invitePage.creatingAccount')}
                </>
              ) : (
                t('invitePage.acceptAndCreate')
              )}
            </Button>

            <p className="text-center text-slate-400 text-sm">
              {t('invitePage.alreadyHaveAccount')}{' '}
              <Link to="/login" className="text-blue-400 hover:text-blue-300">
                {t('invitePage.signInHere')}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
