import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axiosClient from '../../api/axiosClient';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import Field, { inputClass } from '../../components/ui/Field';
import Spinner from '../../components/ui/Spinner';

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

function SectionCard({ title, children }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function Profile() {
  const { user, logout, registerPasskey } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState('loading');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState([]);
  const [importing, setImporting] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [sessionsStatus, setSessionsStatus] = useState('loading');
  const [sessionsError, setSessionsError] = useState('');
  const [revokingId, setRevokingId] = useState(null);

  const [deviceLabel, setDeviceLabel] = useState('');
  const [passkeyStatus, setPasskeyStatus] = useState('idle');
  const [passkeyError, setPasskeyError] = useState('');

  function loadProfile() {
    setProfileStatus('loading');
    axiosClient
      .get('/users/me')
      .then(({ data }) => {
        setProfile(data.user);
        setProfileStatus('ready');
      })
      .catch((err) => {
        setProfileError(err.response?.data?.error || 'Failed to load profile');
        setProfileStatus('error');
      });
  }

  function loadSessions() {
    setSessionsStatus('loading');
    axiosClient
      .get('/auth/sessions')
      .then(({ data }) => {
        setSessions(data.sessions);
        setSessionsStatus('ready');
      })
      .catch((err) => {
        setSessionsError(err.response?.data?.error || 'Failed to load sessions');
        setSessionsStatus('error');
      });
  }

  useEffect(loadProfile, []);
  useEffect(loadSessions, []);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaveMessage('');
    setSavingProfile(true);
    try {
      const { data } = await axiosClient.patch('/users/me', {
        name: profile.name,
        phone: profile.phone,
        notificationPreferences: profile.notificationPreferences,
      });
      setProfile(data.user);
      setSaveMessage('Profile updated.');
    } catch (err) {
      setSaveMessage(err.response?.data?.error || 'Could not save profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleExport() {
    setExportError('');
    setExporting(true);
    try {
      const { data } = await axiosClient.get('/users/me/export');
      downloadJson(data, 'kitgrid-my-data.json');
    } catch (err) {
      setExportError(err.response?.data?.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e) {
    e.preventDefault();
    setImportMessage('');
    setImportError([]);
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setImportMessage('Choose a file first');
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { data } = await axiosClient.post('/users/me/import', parsed);
      setImportMessage(data.message);
      loadProfile();
      fileInputRef.current.value = '';
    } catch (err) {
      if (err instanceof SyntaxError) {
        setImportMessage('That file is not valid JSON');
      } else {
        setImportMessage(err.response?.data?.error || 'Import failed');
        setImportError(err.response?.data?.details || []);
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleRevoke(sessionId) {
    setRevokingId(sessionId);
    setSessionsError('');
    try {
      await axiosClient.delete(`/auth/sessions/${sessionId}`);
      loadSessions();
    } catch (err) {
      setSessionsError(err.response?.data?.error || 'Could not revoke session');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  async function handleEnrollPasskey(e) {
    e.preventDefault();
    setPasskeyError('');
    setPasskeyStatus('enrolling');
    try {
      await registerPasskey(deviceLabel || 'Passkey');
      setPasskeyStatus('done');
      setDeviceLabel('');
    } catch (err) {
      setPasskeyError(err.response?.data?.error || err.message || 'Could not register passkey');
      setPasskeyStatus('idle');
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex animate-fade-in-up flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
            {user?.name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{user?.name}</h1>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={handleLogout}>
          Log out
        </Button>
      </div>

      {!user?.mfaEnabled && (
        <Alert>
          Two-factor authentication is off.{' '}
          <Link to="/mfa-setup" className="font-semibold underline">
            Set it up
          </Link>
          .
        </Alert>
      )}

      <SectionCard title="Edit profile">
        {profileStatus === 'loading' && <Spinner />}
        {profileStatus === 'error' && <Alert>{profileError}</Alert>}
        {profileStatus === 'ready' && profile && (
          <form onSubmit={handleSaveProfile} noValidate className="flex flex-col gap-4">
            <Field label="Name" htmlFor="profile-name">
              <input
                id="profile-name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className={inputClass}
                required
              />
            </Field>

            <Field label="Phone" htmlFor="profile-phone">
              <input
                id="profile-phone"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className={inputClass}
              />
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate-700">Notification preferences</legend>
              <label htmlFor="profile-notify-email" className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  id="profile-notify-email"
                  type="checkbox"
                  checked={!!profile.notificationPreferences?.email}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      notificationPreferences: { ...profile.notificationPreferences, email: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                Email notifications
              </label>
              <label htmlFor="profile-notify-sms" className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  id="profile-notify-sms"
                  type="checkbox"
                  checked={!!profile.notificationPreferences?.sms}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      notificationPreferences: { ...profile.notificationPreferences, sms: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                SMS notifications
              </label>
            </fieldset>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save changes'}
              </Button>
              {saveMessage && <span className="text-sm text-slate-500">{saveMessage}</span>}
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Your data">
        <div className="flex flex-col gap-4">
          <div>
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              Export my data
            </Button>
            {exportError && <Alert className="mt-2">{exportError}</Alert>}
          </div>

          <form onSubmit={handleImport} noValidate className="flex flex-col gap-3 border-t border-slate-100 pt-4">
            <Field label="Import a previously exported file" htmlFor="import-file">
              <input
                id="import-file"
                type="file"
                accept="application/json"
                ref={fileInputRef}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </Field>
            <div>
              <Button type="submit" variant="secondary" disabled={importing}>
                Import
              </Button>
            </div>
            {importMessage && (
              <Alert type={importError.length > 0 ? 'error' : 'success'}>
                {importMessage}
                {importError.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {importError.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
          </form>
        </div>
      </SectionCard>

      <SectionCard title="Active sessions">
        {sessionsStatus === 'loading' && <Spinner />}
        {sessionsError && <Alert>{sessionsError}</Alert>}
        {sessionsStatus === 'ready' && sessions.length === 0 && <p className="text-sm text-slate-500">No active sessions.</p>}
        {sessionsStatus === 'ready' && sessions.length > 0 && (
          <ul className="flex flex-col divide-y divide-slate-100">
            {sessions.map((session) => (
              <li key={session.sessionId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {session.userAgent || 'Unknown device'}{' '}
                    {session.current && <span className="text-xs font-semibold text-indigo-600">(this device)</span>}
                  </p>
                  <p className="text-xs text-slate-500">Last used: {formatDateTime(session.lastUsedAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(session.sessionId)}
                  disabled={revokingId === session.sessionId}
                  aria-label={`Revoke session on ${session.userAgent || 'unknown device'}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Passkeys">
        <form onSubmit={handleEnrollPasskey} noValidate className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label="Device name (optional)" htmlFor="passkey-label">
              <input
                id="passkey-label"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="e.g. My Laptop"
                className={inputClass}
              />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={passkeyStatus === 'enrolling'}>
            Add a passkey
          </Button>
        </form>
        {passkeyStatus === 'done' && <Alert type="success" className="mt-3">Passkey registered.</Alert>}
        {passkeyError && <Alert className="mt-3">{passkeyError}</Alert>}
      </SectionCard>
    </div>
  );
}
