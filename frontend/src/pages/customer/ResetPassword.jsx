import { useState } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

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
    if (sent) {
      return <p role="status">If an account with that email exists, a reset link has been sent.</p>;
    }
    return (
      <form onSubmit={handleRequestLink} noValidate>
        <h1>{isExpiredRedirect ? 'Your password has expired' : 'Reset your password'}</h1>
        {isExpiredRedirect && (
          <p>For your security, passwords must be renewed periodically. Enter your email to get a reset link.</p>
        )}
        <label htmlFor="reset-request-email">Email</label>
        <input
          id="reset-request-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={error ? 'reset-request-error' : undefined}
          aria-invalid={!!error}
          required
        />
        <button type="submit">Send reset link</button>
        {error && (
          <p id="reset-request-error" role="alert">
            {error}
          </p>
        )}
        <p>
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    );
  }

  const hasErrors = errors.length > 0 || !!error;

  return (
    <form onSubmit={handleSetNewPassword} noValidate>
      <h1>Choose a new password</h1>
      <label htmlFor="reset-password">New password</label>
      <input
        id="reset-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby={hasErrors ? 'reset-password-error' : undefined}
        aria-invalid={hasErrors}
        required
      />
      <button type="submit">Set new password</button>
      {hasErrors && (
        <div id="reset-password-error" role="alert">
          {errors.length > 0 ? (
            <ul>
              {errors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          ) : (
            <p>{error}</p>
          )}
        </div>
      )}
    </form>
  );
}
