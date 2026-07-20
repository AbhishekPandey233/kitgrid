import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';

const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPassword({
  heading = 'Forgot your password?',
  subtitle = "We'll email you a code to reset it.",
  initialEmail = '',
}) {
  const navigate = useNavigate();

  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await axiosClient.post('/auth/forgot-password', { email });
      setOtp('');
      setVerifyError('');
      setOtpOpen(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong, please try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setVerifyError('');
    try {
      await axiosClient.post('/auth/forgot-password/resend', { email });
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setVerifyError(err.response?.data?.error || 'Could not resend code');
    } finally {
      setResending(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setVerifyError('');
    setVerifying(true);
    try {
      const { data } = await axiosClient.post('/auth/forgot-password/verify-otp', { email, otp });
      navigate(`/reset-password/${data.resetToken}`);
    } catch (err) {
      setVerifyError(err.response?.data?.error || 'Invalid or expired code');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">{heading}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

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
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset code'}
          </Button>
          {error && <Alert id="forgot-error">{error}</Alert>}
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Back to login
          </Link>
        </p>
      </Card>

      <Modal open={otpOpen} onClose={() => setOtpOpen(false)} className="max-w-sm p-6">
        <h2 className="text-base font-semibold text-slate-900">Enter your code</h2>
        <p className="mt-1 text-sm text-slate-500">
          If an account exists for <span className="font-medium text-slate-700">{email}</span>, we sent a 6-digit
          code. It expires in 10 minutes.
        </p>

        <form onSubmit={handleVerify} noValidate className="mt-4 flex flex-col gap-4">
          <Field label="6-digit code" htmlFor="otp-code">
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-describedby={verifyError ? 'otp-error' : undefined}
              aria-invalid={!!verifyError}
              className={`${inputClass} text-center text-lg tracking-[0.5em]`}
              required
            />
          </Field>

          <Button type="submit" className="w-full" disabled={verifying || otp.length !== 6}>
            {verifying ? 'Verifying…' : 'Verify code'}
          </Button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Resending…' : 'Resend code'}
          </button>

          {verifyError && <Alert id="otp-error">{verifyError}</Alert>}
        </form>
      </Modal>
    </div>
  );
}
