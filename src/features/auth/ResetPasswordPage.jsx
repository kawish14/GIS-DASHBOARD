/**
 * Step two of a password reset: the screen the emailed link opens.
 *
 * The token and address ride in the query string, so this page can be reached
 * with neither (someone typing the URL) or with a token the server has already
 * spent. Both end here rather than at the password form, because there is
 * nothing useful to submit in either case.
 *
 * Changing the password also ends whatever session the old one was holding
 * open, so this finishes at the sign-in screen rather than logging anyone in.
 */
import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import logo from '../../assets/images/TesLogo.png';
import { AuthShell, ErrorBanner, SubmitButton, PasswordChecklist, PASSWORD_RULES } from './AuthShell';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();

  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [doneUsername, setDoneUsername] = useState(null);
  const [linkDead, setLinkDead] = useState(false);

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password]
  );
  const meetsRules = ruleResults.every((r) => r.passed);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const result = await resetPassword({ email, token, password, confirmPassword });

    if (result.success) {
      setDoneUsername(result.data.username);
    } else {
      setError(result.message);
      // A spent or expired token cannot be retried from this form, so stop
      // offering it and point them back at the request screen.
      if (result.code === 'INVALID_TOKEN') setLinkDead(true);
    }

    setIsLoading(false);
  };

  /* ---- the link was incomplete, expired, or already used ---- */
  if (!token || !email || linkDead) {
    return (
      <AuthShell logo={logo}>
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5">
            <KeyRound size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">This link isn't usable</h1>
          <p className="text-gray-400 text-sm mt-3 leading-relaxed">
            {error
              || 'Reset links last an hour and work only once. Request a fresh one and it will arrive in a moment.'}
          </p>
          <Link
            to="/forgot-password"
            className="mt-7 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)] group"
          >
            <span>Request a new link</span>
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  /* ---- done ---- */
  if (doneUsername) {
    return (
      <AuthShell logo={logo}>
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-5">
            <CheckCircle2 size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Password changed</h1>
          <p className="text-gray-400 text-sm mt-3">
            Sign in with your new password. Any other device that was signed in has been signed out.
          </p>

          <div className="mt-6 p-4 rounded-xl bg-[#0f1115] border border-blue-500/30">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Your username</p>
            <p className="mt-1.5 text-lg font-mono font-bold text-white break-all">{doneUsername}</p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login', { replace: true, state: { username: doneUsername } })}
            className="mt-6 w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)] group"
          >
            <span className="inline-flex items-center justify-center gap-2">
              Continue to sign in
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </span>
          </button>
        </div>
      </AuthShell>
    );
  }

  /* ---- the form ---- */
  return (
    <AuthShell logo={logo}>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white tracking-wide">Choose a new password</h1>
        <p className="text-gray-400 text-sm mt-1 break-all">for {email}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
            New Password
          </label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
              <Lock size={20} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoFocus
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0f1115] border border-gray-700 rounded-xl pl-10 pr-12 py-3 text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
            Confirm Password
          </label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
              <Lock size={20} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`w-full bg-[#0f1115] border rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:ring-1 transition-all outline-none ${
                confirmPassword && !passwordsMatch
                  ? 'border-red-500/60 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:border-blue-500 focus:ring-blue-500'
              }`}
              placeholder="••••••••"
            />
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="text-red-400 text-xs ml-1 pt-1">Passwords do not match.</p>
          )}
        </div>

        <PasswordChecklist results={ruleResults} />

        <ErrorBanner message={error} />

        <SubmitButton disabled={isLoading || !meetsRules || !passwordsMatch} isLoading={isLoading}>
          <span>Change password</span>
          <ShieldCheck size={18} className="group-hover:rotate-12 transition-transform" />
        </SubmitButton>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-700/50 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
