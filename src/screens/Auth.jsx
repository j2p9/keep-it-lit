import { useState } from 'preact/hooks';
import { APP_URL } from '../config.js';
import { installed, installPrompt, promptInstall } from '../lib/install.js';
import { isAndroid, isStandalone } from '../lib/platform.js';
import { callFunction, cloudConfigured, supabase } from '../lib/supabase.js';
import { recoveryMode, setUi, showToast } from '../lib/ui.js';
import { Logo, Segmented } from '../components/controls.jsx';
import { IconShare, IconSquarePlus } from '../components/icons.jsx';

function friendly(message = '') {
  if (/invalid login|invalid credentials/i.test(message)) return 'That email and password don’t match.';
  if (/rate limit|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  if (/fetch|network/i.test(message)) return 'You seem to be offline. Check your connection and try again.';
  return message || 'Something went wrong. Please try again.';
}

export function Auth() {
  const [mode, setMode] = useState('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNote('');
    setBusy(true);
    try {
      const addr = email.trim().toLowerCase();
      if (mode === 'signup') await callFunction('signup', { email: addr, password, name: name.trim() }, { auth: false });
      const { error: err } = await supabase.auth.signInWithPassword({ email: addr, password });
      if (err) throw err;
    } catch (err) {
      setError(friendly(err.message));
      if (/already exists/i.test(err.message)) setMode('signin');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Type your email above first.');
    setError('');
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: APP_URL }).catch(() => {});
    setNote('If that email has an account, a reset link is on its way. Open it on this phone.');
  };

  return (
    <div class="auth">
      <div class="auth-inner">
        <Logo />
        <h1>Keep It Lit</h1>
        <p class="tagline">Small daily wins. Big streaks.</p>
        {!cloudConfigured ? (
          <div class="banner">
            <span aria-hidden="true">🛠️</span>
            <div>
              <b>Almost ready</b>
              Accounts are being set up. Check back in a few minutes.
            </div>
          </div>
        ) : (
          <>
            <Segmented
              label="Account"
              options={[
                ['signup', 'Create account'],
                ['signin', 'Sign in'],
              ]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError('');
                setNote('');
              }}
            />
            <form onSubmit={submit}>
              {mode === 'signup' && (
                <label class="field">
                  <span class="label">First name</span>
                  <input
                    class="input"
                    autocomplete="given-name"
                    maxLength={40}
                    placeholder="Alex"
                    value={name}
                    onInput={(e) => setName(e.currentTarget.value)}
                  />
                </label>
              )}
              <label class="field">
                <span class="label">Email</span>
                <input
                  class="input"
                  type="email"
                  inputMode="email"
                  autocomplete="email"
                  autocapitalize="off"
                  spellcheck={false}
                  required
                  placeholder="you@example.com"
                  value={email}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                />
              </label>
              <label class="field">
                <span class="label">Password</span>
                <div class="input-wrap">
                  <input
                    class="input"
                    type={show ? 'text' : 'password'}
                    autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    minLength={8}
                    required
                    placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
                    value={password}
                    onInput={(e) => setPassword(e.currentTarget.value)}
                  />
                  <button type="button" class="reveal" onClick={() => setShow(!show)}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              {error && (
                <p class="form-error" role="alert">
                  {error}
                </p>
              )}
              {note && (
                <p class="form-note" role="status">
                  {note}
                </p>
              )}
              <button class="btn btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>
            {mode === 'signin' && (
              <button class="btn btn-ghost btn-block" onClick={forgot}>
                Forgot password?
              </button>
            )}
            <p class="auth-foot">Your goals sync to your account, so they stay safe even if you switch phones.</p>
            <InstallHint />
          </>
        )}
      </div>
    </div>
  );
}

/** Android/Chrome: offer the real install prompt, or explain where the menu option is. */
function InstallHint() {
  if (isStandalone() || installed.value) return null;
  if (installPrompt.value) {
    return (
      <button class="btn btn-secondary btn-block" style="margin-top:14px" onClick={promptInstall}>
        📲 Install the app
      </button>
    );
  }
  if (isAndroid()) {
    return <p class="auth-foot">Tip: tap ⋮ in Chrome, then “Install app”, to put Keep It Lit on your home screen.</p>;
  }
  return null;
}

export function SetPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendly(err.message));
    recoveryMode.value = false;
    showToast('Password updated. You’re signed in.');
  };
  return (
    <div class="auth">
      <div class="auth-inner">
        <Logo />
        <h1>New password</h1>
        <p class="tagline">Choose a new password for your account.</p>
        <form onSubmit={save}>
          <label class="field">
            <span class="label">New password</span>
            <input
              class="input"
              type="password"
              autocomplete="new-password"
              minLength={8}
              required
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          {error && <p class="form-error">{error}</p>}
          <button class="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** First visit in Safari: show how to put the app on the Home Screen. */
export function Install() {
  return (
    <div class="auth">
      <div class="auth-inner">
        <Logo />
        <h1>Add to Home Screen</h1>
        <p class="tagline">Keep It Lit works best as an app on your iPhone, with reminders and a full-screen view.</p>
        <div class="install-steps">
          <div class="install-step">
            <span class="n">1</span>
            <span>
              Tap the <b>Share</b> button <IconShare size={18} style="vertical-align:-3px" /> in Safari (or the <b>•••</b> menu, then Share).
            </span>
          </div>
          <div class="install-step">
            <span class="n">2</span>
            <span>
              Choose <b>Add to Home Screen</b> <IconSquarePlus size={18} style="vertical-align:-3px" />, then tap <b>Add</b>.
            </span>
          </div>
          <div class="install-step">
            <span class="n">3</span>
            <span>
              Open <b>Keep It Lit</b> from your Home Screen and sign in.
            </span>
          </div>
        </div>
        <button class="btn btn-secondary btn-block" onClick={() => setUi({ installDismissed: true })}>
          Continue in the browser
        </button>
        <p class="auth-foot">Reminders only work from the Home Screen app.</p>
      </div>
    </div>
  );
}
