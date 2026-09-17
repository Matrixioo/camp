import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, login, register, type Session } from '../api';
import { flattenErrors } from '../errors';

interface Props {
  onAuthenticated: (session: Session) => void;
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const session = mode === 'login' ? await login(username, password) : await register(username, email, password);
      onAuthenticated(session);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(flattenErrors(err.errors));
      } else {
        setErrors(['Something went wrong. Please try again.']);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>camp</h1>
        <p className="muted">Reception panel.</p>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setErrors([]);
            }}
          >
            Log in
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setErrors([]);
            }}
          >
            Register
          </button>
        </div>

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </label>

        {mode === 'register' && (
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        )}

        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {errors.length > 0 && (
          <ul className="error-list">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        {mode === 'register' && (
          <p className="muted auth-hint">
            A new account has no hotel access yet — ask an owner or admin to add you.
          </p>
        )}
      </form>
    </div>
  );
}
