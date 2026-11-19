import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { useTranslation } from '~/client/i18n';

export default function VerificationPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('verification.noToken'));
      return;
    }

    verifyEmail(token);
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    try {
      const response = await fetch(`/api/auth/verify-email?token=${verificationToken}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('success');
        setMessage(t('verification.verifiedSuccess'));

        // Auto-redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } else {
        setStatus('error');
        setMessage(data.error || t('verification.verifyFailed'));
      }
    } catch (err) {
      setStatus('error');
      setMessage(t('verification.unexpectedError'));
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      // Get email from localStorage or prompt user
      const email = localStorage.getItem('pendingVerificationEmail') || '';
      
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setResent(true);
      } else {
        setMessage(t('verification.resendFailed'));
      }
    } catch (err) {
      setMessage(t('verification.networkError'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700 backdrop-blur-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
              <Mail className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-white">
            {status === 'loading' && t('verification.titleLoading')}
            {status === 'success' && t('verification.titleSuccess')}
            {status === 'error' && t('verification.titleError')}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {status === 'loading' && t('verification.descLoading')}
            {status === 'success' && t('verification.descSuccess')}
            {status === 'error' && t('verification.descError')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Status Icon */}
            <div className="flex justify-center">
              {status === 'loading' && (
                <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />
              )}
              {status === 'success' && (
                <CheckCircle className="h-16 w-16 text-green-500" />
              )}
              {status === 'error' && (
                <XCircle className="h-16 w-16 text-red-500" />
              )}
            </div>

            {/* Message */}
            <p className="text-center text-slate-300">{message}</p>

            {/* Actions */}
            <div className="space-y-3">
              {status === 'success' && (
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {t('verification.signInNow')}
                </Button>
              )}

              {status === 'error' && (
                <>
                  {!resent ? (
                    <Button
                      onClick={handleResend}
                      disabled={resending}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {resending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('verification.resending')}
                        </>
                      ) : (
                        t('verification.resendButton')
                      )}
                    </Button>
                  ) : (
                    <p className="text-center text-green-400 text-sm">
                      {t('verification.resentNotice')}
                    </p>
                  )}
                </>
              )}

              <div className="text-center">
                <Link
                  to="/login"
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  {t('verification.backToSignIn')}
                </Link>
              </div>
            </div>

            {/* Auto-redirect message */}
            {status === 'success' && (
              <p className="text-center text-slate-500 text-sm">
                {t('verification.redirecting')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

