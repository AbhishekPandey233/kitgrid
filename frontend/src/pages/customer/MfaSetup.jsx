import { useEffect, useState } from 'react';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import Spinner from '../../components/ui/Spinner';

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
    return (
      <div className="flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <Card>
        {status === 'done' ? (
          <Alert type="success">MFA is enabled. You&rsquo;ll be asked for a code on future logins.</Alert>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900">Set up multi-factor authentication</h1>
            <p className="mt-1 text-sm text-slate-500">Scan the QR code with your authenticator app.</p>

            {error && (
              <Alert className="mt-4" id="mfa-setup-error">
                {error}
              </Alert>
            )}

            {qrCode && (
              <div className="mt-5 flex justify-center rounded-xl border border-slate-200 bg-slate-50 p-4 animate-scale-in">
                <img
                  src={qrCode}
                  alt="Scan this QR code with your authenticator app"
                  width={180}
                  height={180}
                  className="rounded-lg"
                />
              </div>
            )}
            {secret && (
              <p className="mt-3 text-center text-xs text-slate-500">
                Or enter this code manually:{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{secret}</code>
              </p>
            )}

            <form onSubmit={handleVerify} noValidate className="mt-6 flex flex-col gap-4">
              <Field label="Enter the 6-digit code from your authenticator app" htmlFor="mfa-setup-code">
                <input
                  id="mfa-setup-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-describedby={error ? 'mfa-setup-error' : undefined}
                  aria-invalid={!!error}
                  inputMode="numeric"
                  className={inputClass}
                  required
                />
              </Field>
              <Button type="submit" className="w-full">
                Confirm
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
