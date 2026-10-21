import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, XCircle, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound, Plane } from 'lucide-react';
import { supabase, supabaseConfigured } from './lib/supabase';

type Pilot = { callsign: string; ifc_username: string; discord_username: string };
type AuthMode = 'login' | 'register';
const invoke = async (body: Record<string, unknown>) => {
  if (!supabase) throw new Error('Supabase is not configured yet.');
  const { data, error } = await supabase.functions.invoke('crew-auth', { body });
  if (error) {
    let message = error.message || 'Request failed.';
    try { const context = (error as any).context; if (context?.json) { const payload = await context.json(); message = payload.error || message; } } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
};

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>(location.pathname === '/register' ? 'register' : 'login');
  const [code, setCode] = useState('');
  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usernameState, setUsernameState] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const update = () => setMode(location.pathname === '/register' ? 'register' : 'login');
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const navigate = (next: AuthMode) => {
    setMode(next); setError(''); setMessage('');
    history.pushState({}, '', next === 'register' ? '/register' : '/login');
  };
  const verifyCode = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await invoke({ action: 'verify_code', code }); setPilot(result.pilot as Pilot); setMessage('Registration code verified. Complete your account below.'); }
    catch (err) { setPilot(null); setError(err instanceof Error ? err.message : 'Could not verify code.'); }
    finally { setBusy(false); }
  };
  const checkUsername = async (value: string) => {
    setUsername(value); setUsernameState('idle');
    if (!value.trim()) return;
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(value.trim())) { setUsernameState('invalid'); return; }
    setUsernameState('checking');
    try { const result = await invoke({ action: 'check_username', username: value }); setUsernameState(result.available ? 'available' : 'taken'); }
    catch { setUsernameState('idle'); }
  };
  const register = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await invoke({ action: 'register', code, email, username, password });
      if (result.session && supabase) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token });
        if (sessionError) throw sessionError;
        history.replaceState({}, '', '/your-dashboard');
      } else { setMessage(result.message || 'Account created. Sign in with your username and password.'); navigate('login'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Registration failed.'); }
    finally { setBusy(false); }
  };
  const login = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await invoke({ action: 'login', username, password });
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error: sessionError } = await supabase.auth.setSession({ access_token: result.session.access_token, refresh_token: result.session.refresh_token });
      if (sessionError) throw sessionError;
      history.replaceState({}, '', '/your-dashboard');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign in failed.'); }
    finally { setBusy(false); }
  };
  const usernameIcon = usernameState === 'available' ? <CheckCircle2 size={17}/> : usernameState === 'taken' || usernameState === 'invalid' ? <XCircle size={17}/> : usernameState === 'checking' ? <span className="field-spinner"/> : null;
  return <div className="auth-shell">
    <div className="auth-topline"><div className="auth-brand"><span className="auth-brand-mark"><Plane size={19}/></span><span><strong>Air Astana Virtual</strong><small>CREW CENTER · KCVA</small></span></div><span className="auth-secure"><ShieldCheck size={15}/> Secure crew access</span></div>
    <main className="auth-main">
      <section className="auth-intro"><span className="eyebrow">AIR ASTANA VIRTUAL / KCVA</span><h1>{mode === 'login' ? <>Your crew.<br/><em>Your journey.</em></> : <>Join the<br/><em>flight deck.</em></>}</h1><p>{mode === 'login' ? 'Sign in to access your flight records, crew tools and live operations.' : 'Your staff-issued registration code connects your account to your pilot record.'}</p><div className="auth-trust"><span><LockKeyhole size={16}/></span><div><strong>Private by design</strong><small>Account access is linked to your assigned crew record.</small></div></div></section>
      <section className="auth-card">
        <div className="auth-card-heading"><span className="auth-icon"><KeyRound size={19}/></span><div><h2>{mode === 'login' ? 'Welcome back' : pilot ? 'Create your account' : 'Pilot registration'}</h2><p>{mode === 'login' ? 'Enter your crew username and password.' : pilot ? 'A few details and you’re ready to fly.' : 'Start with the one-time code from staff.'}</p></div></div>
        {!supabaseConfigured && <div className="auth-alert error">Supabase connection settings are missing. Configure the project URL and publishable key first.</div>}
        {error && <div className="auth-alert error"><XCircle size={16}/>{error}</div>}
        {message && <div className="auth-alert success"><CheckCircle2 size={16}/>{message}</div>}
        {mode === 'login' ? <form onSubmit={login} className="auth-form">
          <label className="auth-label">Crew username<div className="auth-input-wrap"><UserRound size={17}/><input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)} placeholder="Enter your username"/></div></label>
          <label className="auth-label">Password<div className="auth-input-wrap"><LockKeyhole size={17}/><input autoComplete="current-password" type={showPassword?'text':'password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
          <button className="auth-submit" disabled={busy||!supabaseConfigured}>{busy?'Signing in…':'Sign in'}<ArrowRight size={17}/></button>
          <div className="auth-switch">New to KCVA? <button type="button" onClick={()=>navigate('register')}>Register with a code</button></div>
        </form> : !pilot ? <form onSubmit={verifyCode} className="auth-form">
          <label className="auth-label">Registration code<div className="auth-input-wrap"><KeyRound size={17}/><input required autoCapitalize="characters" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="Enter your staff-issued code"/></div></label>
          <p className="auth-help">Codes are single-use and created by authorised KCVA staff.</p>
          <button className="auth-submit" disabled={busy||!supabaseConfigured}>{busy?'Verifying…':'Verify code'}<ArrowRight size={17}/></button>
          <div className="auth-switch">Already registered? <button type="button" onClick={()=>navigate('login')}>Sign in</button></div>
        </form> : <form onSubmit={register} className="auth-form">
          <div className="verified-pilot"><CheckCircle2 size={18}/><div><strong>{pilot.ifc_username}</strong><small>{pilot.callsign} · {pilot.discord_username}</small></div><span>VERIFIED</span></div>
          <label className="auth-label">Email address<div className="auth-input-wrap"><Mail size={17}/><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div></label>
          <label className="auth-label">Crew username<div className={'auth-input-wrap '+(usernameState==='available'?'valid-input':usernameState==='taken'||usernameState==='invalid'?'invalid-input':'')}><UserRound size={17}/><input autoComplete="username" required minLength={3} maxLength={24} value={username} onChange={e=>void checkUsername(e.target.value)} onBlur={()=>{if(username.trim())void checkUsername(username)}} placeholder="Choose a unique username"/>{usernameIcon}</div>{usernameState==='available'&&<small className="validation valid-text">Username is available</small>}{usernameState==='taken'&&<small className="validation invalid-text">That username is already taken</small>}{usernameState==='invalid'&&<small className="validation invalid-text">Use 3–24 letters, numbers, . _ or -</small>}</label>
          <label className="auth-label">Password<div className="auth-input-wrap"><LockKeyhole size={17}/><input autoComplete="new-password" type={showPassword?'text':'password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
          <button className="auth-submit" disabled={busy||!supabaseConfigured||usernameState==='taken'||usernameState==='invalid'||usernameState==='checking'}>{busy?'Creating account…':'Create account'}<ArrowRight size={17}/></button>
          <button className="auth-back" type="button" onClick={()=>{setPilot(null);setError('');setMessage('')}}>Use a different registration code</button>
        </form>}
      </section>
    </main>
    <footer className="auth-footer"><span>© {new Date().getFullYear()} Air Astana Virtual</span><span>CREW CENTER · KCVA</span></footer>
  </div>;
}