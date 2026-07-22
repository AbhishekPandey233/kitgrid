import { useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import PasswordField from '../../components/ui/PasswordField';

const SITE_KEY = import.meta.env.VITE_CAPTCHA_SITE_KEY;
const GOOGLE_LOGIN_URL = `${import.meta.env.VITE_API_BASE_URL}/auth/google`;

const OAUTH_ERROR_MESSAGES = {
  error: 'Google sign-in failed. Please try again.',
  email_exists: 'An account with that email already exists. Log in with your password, then connect Google from your profile.',
  suspended: 'This account has been suspended.',
};

export default function Login() {
  const { login, completeMfaChallenge, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const captchaRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const [mfaPendingToken, setMfaPendingToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState(() => {
    const oauthReason = searchParams.get('oauth');
    return oauthReason ? OAUTH_ERROR_MESSAGES[oauthReason] || OAUTH_ERROR_MESSAGES.error : '';
  });
  const [submitting, setSubmitting] = useState(false);

  function resetCaptcha() {
    captchaRef.current?.resetCaptcha();
    setCaptchaToken(null);
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');

    if (!captchaToken) {
      setError('Please complete the CAPTCHA');
      return;
    }

    setSubmitting(true);
    try {
      const data = await login(email, password, captchaToken);
      if (data.mfaRequired) {
        setMfaPendingToken(data.mfaPendingToken);
      } else {
        navigate('/catalog');
      }
    } catch (err) {
      if (err.response?.data?.passwordExpired) {
        navigate('/reset-password', { state: { email, reason: 'expired' } });
        return;
      }
      setError(err.response?.data?.error || 'Login failed');
      resetCaptcha();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await completeMfaChallenge(mfaPendingToken, mfaCode);
      navigate('/catalog');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
    }
  }

  async function handlePasskeyLogin() {
    setError('');
    if (!email) {
      setError('Enter your email above, then choose "Sign in with a passkey"');
      return;
    }
    try {
      const data = await loginWithPasskey(email);
      if (data.mfaRequired) {
        setMfaPendingToken(data.mfaPendingToken);
      } else {
        navigate('/catalog');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Passkey sign-in failed');
    }
  }

  if (mfaPendingToken) {
    return (
      <div className="mx-auto max-w-sm">
        <Card>
          <h1 className="text-xl font-bold text-slate-900">Enter your authentication code</h1>
          <p className="mt-1 text-sm text-slate-500">Open your authenticator app and enter the 6-digit code.</p>
          <form onSubmit={handleMfaSubmit} noValidate className="mt-6 flex flex-col gap-4">
            <Field label="6-digit code" htmlFor="login-mfa-code">
              <input
                id="login-mfa-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                aria-describedby={error ? 'login-error' : undefined}
                aria-invalid={!!error}
                autoFocus
                inputMode="numeric"
                className={inputClass}
                required
              />
            </Field>
            <Button type="submit" className="w-full">
              Verify
            </Button>
            {error && <Alert id="login-error">{error}</Alert>}
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      {location.state?.registered && <Alert type="success">Account created — log in below.</Alert>}
      {location.state?.passwordReset && <Alert type="success">Password reset — log in with your new password.</Alert>}

      <Card>
        <h1 className="text-xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-500">Log in to your KitGrid account.</p>

        <form onSubmit={handlePasswordSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <Field label="Email" htmlFor="login-email">
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
              aria-invalid={!!error}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Password" htmlFor="login-password">
            <PasswordField
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
              aria-invalid={!!error}
              required
            />
          </Field>

          {SITE_KEY ? (
            <HCaptcha
              ref={captchaRef}
              sitekey={SITE_KEY}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
            />
          ) : (
            <Alert>CAPTCHA is not configured (VITE_CAPTCHA_SITE_KEY is missing) — login will be rejected by the backend until it&rsquo;s set.</Alert>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>

          {error && <Alert id="login-error">{error}</Alert>}
        </form>

        <div className="my-5 flex items-center gap-3 text-xs font-medium text-slate-500">
          <div className="h-px flex-1 bg-slate-200" />
          or
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" variant="secondary" onClick={handlePasskeyLogin} className="w-full">
            Sign in with a passkey
          </Button>
          <a
            href={GOOGLE_LOGIN_URL}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]"
          >
            <img src="/images/google_logo.png" alt="" className="h-5 w-5" />
            Continue with Google
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
            Forgot password?
          </Link>
          {' · '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
