import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import PasswordField from '../../components/ui/PasswordField';

const SITE_KEY = import.meta.env.VITE_CAPTCHA_SITE_KEY;
const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_BAR_COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];
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
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">Join KitGrid to start booking equipment.</p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <Field label="Name" htmlFor="register-name">
            <input
              id="register-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Email" htmlFor="register-email">
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Password" htmlFor="register-password">
            <PasswordField
              id="register-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={hasErrors ? 'register-password-hint register-errors' : 'register-password-hint'}
              aria-invalid={hasErrors}
              required
            />
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    strength && i <= strength.score ? STRENGTH_BAR_COLORS[strength.score] : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
            <p id="register-password-hint" className="mt-1.5 text-xs text-slate-500">
              {strength
                ? `Strength: ${STRENGTH_LABELS[strength.score]}${strength.warning ? ` — ${strength.warning}` : ''}`
                : 'At least 12 characters, mixing upper/lowercase, a number, and a symbol'}
            </p>
          </Field>

          {SITE_KEY ? (
            <HCaptcha
              ref={captchaRef}
              sitekey={SITE_KEY}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
            />
          ) : (
            <Alert>CAPTCHA is not configured (VITE_CAPTCHA_SITE_KEY is missing) — registration will be rejected by the backend until it's set.</Alert>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Creating account…' : 'Register'}
          </Button>

          {(errors.length > 0 || submitError) && (
            <Alert id="register-errors">
              {errors.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              ) : (
                submitError
              )}
            </Alert>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Already have an account? Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
