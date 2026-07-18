import { useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import PasswordField from '../../components/ui/PasswordField';

export default function ResetPassword() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState('');

  const isExpiredRedirect = location.state?.reason === 'expired';

  async function handleRequestLink(e) {
    e.preventDefault();
    setError('');
    try {
      await axiosClient.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong, please try again');
    }
  }

  async function handleSetNewPassword(e) {
    e.preventDefault();
    setError('');
    setErrors([]);
    try {
      await axiosClient.post(`/auth/reset-password/${token}`, { password });
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      setErrors(err.response?.data?.details || []);
      setError(err.response?.data?.error || 'Reset failed');
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-sm">
        <Card>
          {sent ? (
            <Alert type="success">If an account with that email exists, a reset link has been sent.</Alert>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-900">
                {isExpiredRedirect ? 'Your password has expired' : 'Reset your password'}
              </h1>
              {isExpiredRedirect && (
                <p className="mt-1 text-sm text-slate-500">
                  For your security, passwords must be renewed periodically. Enter your email to get a reset link.
                </p>
              )}

              <form onSubmit={handleRequestLink} noValidate className="mt-6 flex flex-col gap-4">
                <Field label="Email" htmlFor="reset-request-email">
                  <input
                    id="reset-request-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-describedby={error ? 'reset-request-error' : undefined}
                    aria-invalid={!!error}
                    className={inputClass}
                    required
                  />
                </Field>
                <Button type="submit" className="w-full">
                  Send reset link
                </Button>
                {error && <Alert id="reset-request-error">{error}</Alert>}
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Back to login
                </Link>
              </p>
            </>
          )}
        </Card>
      </div>
    );
  }

  const hasErrors = errors.length > 0 || !!error;

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Choose a new password</h1>
        <form onSubmit={handleSetNewPassword} noValidate className="mt-6 flex flex-col gap-4">
          <Field label="New password" htmlFor="reset-password">
            <PasswordField
              id="reset-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={hasErrors ? 'reset-password-error' : undefined}
              aria-invalid={hasErrors}
              required
            />
          </Field>
          <Button type="submit" className="w-full">
            Set new password
          </Button>
          {hasErrors && (
            <Alert id="reset-password-error">
              {errors.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              ) : (
                error
              )}
            </Alert>
          )}
        </form>
      </Card>
    </div>
  );
}
