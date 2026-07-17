import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axiosClient from '../../api/axiosClient';

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
    <div>
      <h1>Profile</h1>
      <p>
        {user?.name} ({user?.email})
      </p>
      <button type="button" onClick={handleLogout}>
        Log out
      </button>

      {!user?.mfaEnabled && (
        <p>
          <Link to="/mfa-setup">Set up multi-factor authentication</Link>
        </p>
      )}

      <section>
        <h2>Edit profile</h2>
        {profileStatus === 'loading' && <p>Loading…</p>}
        {profileStatus === 'error' && <p role="alert">{profileError}</p>}
        {profileStatus === 'ready' && profile && (
          <form onSubmit={handleSaveProfile} noValidate>
            <div>
              <label htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                required
              />
            </div>

            <div>
              <label htmlFor="profile-phone">Phone</label>
              <input
                id="profile-phone"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </div>

            <fieldset>
              <legend>Notification preferences</legend>
              <div>
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
                />
                <label htmlFor="profile-notify-email">Email notifications</label>
              </div>
              <div>
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
                />
                <label htmlFor="profile-notify-sms">SMS notifications</label>
              </div>
            </fieldset>

            <button type="submit" disabled={savingProfile}>
              Save changes
            </button>
            {saveMessage && <p role="status">{saveMessage}</p>}
          </form>
        )}
      </section>

      <section>
        <h2>Your data</h2>
        <button type="button" onClick={handleExport} disabled={exporting}>
          Export my data
        </button>
        {exportError && <p role="alert">{exportError}</p>}

        <form onSubmit={handleImport} noValidate>
          <label htmlFor="import-file">Import a previously exported file</label>
          <input id="import-file" type="file" accept="application/json" ref={fileInputRef} />
          <button type="submit" disabled={importing}>
            Import
          </button>
          {importMessage && (
            <p role={importError.length > 0 ? 'alert' : 'status'}>
              {importMessage}
              {importError.length > 0 && (
                <ul>
                  {importError.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              )}
            </p>
          )}
        </form>
      </section>

      <section>
        <h2>Active sessions</h2>
        {sessionsStatus === 'loading' && <p>Loading…</p>}
        {sessionsError && <p role="alert">{sessionsError}</p>}
        {sessionsStatus === 'ready' && sessions.length === 0 && <p>No active sessions.</p>}
        {sessionsStatus === 'ready' && sessions.length > 0 && (
          <ul>
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <p>
                  {session.userAgent || 'Unknown device'} {session.current && '(this device)'}
                </p>
                <p>Last used: {formatDateTime(session.lastUsedAt)}</p>
                <button
                  type="button"
                  onClick={() => handleRevoke(session.sessionId)}
                  disabled={revokingId === session.sessionId}
                  aria-label={`Revoke session on ${session.userAgent || 'unknown device'}`}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Passkeys</h2>
        <form onSubmit={handleEnrollPasskey} noValidate>
          <label htmlFor="passkey-label">Device name (optional)</label>
          <input
            id="passkey-label"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="e.g. My Laptop"
          />
          <button type="submit" disabled={passkeyStatus === 'enrolling'}>
            Add a passkey
          </button>
        </form>
        {passkeyStatus === 'done' && <p role="status">Passkey registered.</p>}
        {passkeyError && <p role="alert">{passkeyError}</p>}
      </section>
    </div>
  );
}
