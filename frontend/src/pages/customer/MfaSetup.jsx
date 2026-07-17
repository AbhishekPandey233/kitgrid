import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';

export default function MfaSetup() {
  const [qrCode, setQrCode] = useState(null);
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    axiosClient
      .post('/auth/mfa/setup')
      .then(({ data }) => {
        if (cancelled) return;
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to start MFA setup');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    try {
      await axiosClient.post('/auth/mfa/verify-setup', { token: code });
      setStatus('done');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code');
    }
  }

  if (status === 'loading') {
    return <p>Loading…</p>;
  }

  if (status === 'done') {
    return <p role="status">MFA is enabled. You'll be asked for a code on future logins.</p>;
  }

  return (
    <div>
      <h1>Set up multi-factor authentication</h1>

      {error && <p role="alert">{error}</p>}

      {qrCode && <img src={qrCode} alt="Scan this QR code with your authenticator app" width={200} height={200} />}
      {secret && (
        <p>
          Or enter this code manually: <code>{secret}</code>
        </p>
      )}

      <form onSubmit={handleVerify} noValidate>
        <label htmlFor="mfa-setup-code">Enter the 6-digit code from your authenticator app</label>
        <input
          id="mfa-setup-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-describedby={error ? 'mfa-setup-error' : undefined}
          aria-invalid={!!error}
          required
        />
        <button type="submit">Confirm</button>
        {error && (
          <p id="mfa-setup-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
