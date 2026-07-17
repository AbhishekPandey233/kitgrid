import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import axiosClient, { setCsrfToken } from '../api/axiosClient';

const AuthContext = createContext(null);

async function refreshCsrfToken() {
  const { data } = await axiosClient.get('/auth/csrf-token');
  setCsrfToken(data.csrfToken);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await axiosClient.get('/auth/me');
        setUser(data.user);
        await refreshCsrfToken();
      } catch (err) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password, captchaToken) => {
    const { data } = await axiosClient.post('/auth/login', { email, password, captchaToken });
    if (!data.mfaRequired) {
      setUser(data.user);
      await refreshCsrfToken();
    }
    return data;
  }, []);

  const loginWithPasskey = useCallback(async (email) => {
    const { data: options } = await axiosClient.post('/auth/webauthn/login-options', { email });
    const assertion = await startAuthentication({ optionsJSON: options });
    const { data } = await axiosClient.post('/auth/webauthn/login-verify', { email, response: assertion });
    if (!data.mfaRequired) {
      setUser(data.user);
      await refreshCsrfToken();
    }
    return data;
  }, []);

  const registerPasskey = useCallback(async (deviceLabel) => {
    const { data: options } = await axiosClient.post('/auth/webauthn/register-options');
    const attestation = await startRegistration({ optionsJSON: options });
    const { data } = await axiosClient.post('/auth/webauthn/register-verify', {
      response: attestation,
      deviceLabel,
    });
    return data;
  }, []);

  const completeMfaChallenge = useCallback(async (mfaPendingToken, token) => {
    const { data } = await axiosClient.post('/auth/mfa/challenge', { mfaPendingToken, token });
    setUser(data.user);
    await refreshCsrfToken();
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await axiosClient.post('/auth/logout');
    } finally {
      setUser(null);
      setCsrfToken(null);
    }
  }, []);

  const value = { user, loading, login, logout, completeMfaChallenge, loginWithPasskey, registerPasskey };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
