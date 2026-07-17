import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import axiosClient from '../../api/axiosClient';

const SITE_KEY = import.meta.env.VITE_CAPTCHA_SITE_KEY;
const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
const DEBOUNCE_MS = 400;

export default function Register() {
  const navigate = useNavigate();
  const captchaRef = useRef(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const [strength, setStrength] = useState(null);
  const [errors, setErrors] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!password) {
      setStrength(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      axiosClient
        .post('/auth/password-strength', { password, name, email })
        .then(({ data }) => {
          if (!cancelled) setStrength(data.strength);
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [password, name, email]);

  const hasErrors = errors.length > 0 || !!submitError;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    setErrors([]);

    if (!captchaToken) {
      setSubmitError('Please complete the CAPTCHA');
      return;
    }

    setSubmitting(true);
    try {
      await axiosClient.post('/auth/register', { name, email, password, captchaToken });
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setErrors(err.response?.data?.details || []);
      setSubmitError(err.response?.data?.error || 'Registration failed');
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Create an account</h1>

      <div>
        <label htmlFor="register-name">Name</label>
        <input id="register-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={hasErrors ? 'register-password-hint register-errors' : 'register-password-hint'}
          aria-invalid={hasErrors}
          required
        />
        <p id="register-password-hint">
          {strength
            ? `Strength: ${STRENGTH_LABELS[strength.score]}${strength.warning ? ` — ${strength.warning}` : ''}`
            : 'At least 12 characters, mixing upper/lowercase, a number, and a symbol'}
        </p>
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
          CAPTCHA is not configured (VITE_CAPTCHA_SITE_KEY is missing) — registration will be rejected by the
          backend until it's set.
        </p>
      )}

      <button type="submit" disabled={submitting}>
        Register
      </button>

      {(errors.length > 0 || submitError) && (
        <div id="register-errors" role="alert">
          {errors.length > 0 ? (
            <ul>
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : (
            <p>{submitError}</p>
          )}
        </div>
      )}

      <p>
        <Link to="/login">Already have an account? Log in</Link>
      </p>
    </form>
  );
}
