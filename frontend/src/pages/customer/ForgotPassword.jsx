import { useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await axiosClient.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong, please try again');
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        {sent ? (
          <Alert type="success">If an account with that email exists, a reset link has been sent.</Alert>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">Forgot your password?</h1>
            <p className="mt-1 text-sm text-slate-500">We'll email you a link to reset it.</p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
              <Field label="Email" htmlFor="forgot-email">
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={error ? 'forgot-error' : undefined}
                  aria-invalid={!!error}
                  className={inputClass}
                  required
                />
              </Field>
              <Button type="submit" className="w-full">
                Send reset link
              </Button>
              {error && <Alert id="forgot-error">{error}</Alert>}
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
