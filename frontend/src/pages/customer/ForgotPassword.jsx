import { useState } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';

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

  if (sent) {
    return <p role="status">If an account with that email exists, a reset link has been sent.</p>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <h1>Forgot your password?</h1>
      <label htmlFor="forgot-email">Email</label>
      <input
        id="forgot-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={error ? 'forgot-error' : undefined}
        aria-invalid={!!error}
        required
      />
      <button type="submit">Send reset link</button>
      {error && (
        <p id="forgot-error" role="alert">
          {error}
        </p>
      )}
      <p>
        <Link to="/login">Back to login</Link>
      </p>
    </form>
  );
}
