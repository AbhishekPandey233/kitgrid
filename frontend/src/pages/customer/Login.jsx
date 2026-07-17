import { useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useAuth } from '../../context/AuthContext';

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
        navigate('/');
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
      navigate('/');
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
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Passkey sign-in failed');
    }
  }

  if (mfaPendingToken) {
    return (
      <form onSubmit={handleMfaSubmit} noValidate>
        <h1>Enter your authentication code</h1>
        <label htmlFor="login-mfa-code">6-digit code</label>
        <input
          id="login-mfa-code"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value)}
          aria-describedby={error ? 'login-error' : undefined}
          aria-invalid={!!error}
          required
        />
        <button type="submit">Verify</button>
        {error && (
          <p id="login-error" role="alert">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div>
      {location.state?.registered && <p role="status">Account created — log in below.</p>}
      {location.state?.passwordReset && <p role="status">Password reset — log in with your new password.</p>}

      <form onSubmit={handlePasswordSubmit} noValidate>
        <h1>Log in</h1>

        <div>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={!!error}
            required
          />
        </div>

        <div>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={!!error}
            required
          />
        </div>

        {SITE_KEY ? (
          <HCaptcha
            ref={captchaRef}
            sitekey={SITE_KEY}
            onVerify={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
          />
        ) : (
          <p role="alert">
            CAPTCHA is not configured (VITE_CAPTCHA_SITE_KEY is missing) — login will be rejected by the backend
            until it's set.
          </p>
        )}

        <button type="submit" disabled={submitting}>
          Log in
        </button>

        {error && (
          <p id="login-error" role="alert">
            {error}
          </p>
        )}
      </form>

      <button type="button" onClick={handlePasskeyLogin}>
        Sign in with a passkey
      </button>

      <p>
        <a href={GOOGLE_LOGIN_URL}>Continue with Google</a>
      </p>

      <p>
        <Link to="/forgot-password">Forgot password?</Link> · <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
