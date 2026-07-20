import { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field from '../../components/ui/Field';
import PasswordField from '../../components/ui/PasswordField';
import ForgotPassword from './ForgotPassword';

export default function ResetPassword() {
  const { token } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState([]);
  const [error, setError] = useState('');

  const isExpiredRedirect = location.state?.reason === 'expired';

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
      <ForgotPassword
        heading={isExpiredRedirect ? 'Your password has expired' : 'Reset your password'}
        subtitle={
          isExpiredRedirect
            ? 'For your security, passwords must be renewed periodically. Enter your email to get a reset code.'
            : "We'll email you a code to reset it."
        }
        initialEmail={location.state?.email || ''}
      />
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
