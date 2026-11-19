// [profile self-service] Landing page for the email-change verification link. The
// emailed link points here with ?token=…; we POST it to confirm the change, which
// swaps the account's login email to the new (now-verified) address.
import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';

export default function VerifyEmailChangePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const ran = useRef(false); // guard against StrictMode double-invoke consuming the one-time token

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus('error');
      setMessage('This link is missing its token.');
      return;
    }
    void confirmChange(token);
  }, [token]);

  const confirmChange = async (t: string) => {
    try {
      const res = await fetch('/api/auth/profile/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setStatus('success');
        setEmail(data.email || '');
        setMessage(`Your login email is now ${data.email}. Please sign in with your new address.`);
        setTimeout(() => navigate('/login'), 4000);
      } else {
        setStatus('error');
        setMessage(data.error || 'We could not confirm this email change.');
      }
    } catch {
      setStatus('error');
      setMessage('Something went wrong confirming your email change.');
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
            {status === 'loading' && 'Confirming your new email…'}
            {status === 'success' && 'Email updated'}
            {status === 'error' && 'Could not confirm'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {status === 'loading' && 'One moment while we verify your new address.'}
            {status === 'success' && (email || 'Your new email address is confirmed.')}
            {status === 'error' && 'This link may have expired or already been used.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex justify-center">
              {status === 'loading' && <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />}
              {status === 'success' && <CheckCircle className="h-16 w-16 text-green-500" />}
              {status === 'error' && <XCircle className="h-16 w-16 text-red-500" />}
            </div>
            <p className="text-center text-slate-300">{message}</p>
            <div className="space-y-3">
              {status === 'success' && (
                <Button onClick={() => navigate('/login')} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Sign in now
                </Button>
              )}
              <div className="text-center">
                <Link to="/login" className="text-blue-400 hover:text-blue-300 text-sm">
                  Back to sign in
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
