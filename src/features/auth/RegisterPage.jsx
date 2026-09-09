/**
 * Invitation-based registration, in two steps.
 *
 *   1. Email      -- the backend confirms a GIS Admin pre-registered this
 *                    address, and hands back a short-lived signup token
 *                    along with the username already assigned to them.
 *   2. Password   -- the user chooses one; the server stores it and activates
 *                    the account.
 *
 * The account itself is never created here: an address the admin has not
 * invited is turned away at step one. The username is assigned by the admin
 * panel when the invitation is sent, and is in the invitation email, so both
 * steps show it back rather than announcing it as something new.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import logo from '../../assets/images/TesLogo.png';
import {
  AuthShell, ErrorBanner, SubmitButton, PasswordChecklist, PASSWORD_RULES, AccessRequestNotice,
} from './AuthShell';

const STEPS = [
  { key: 'email', label: 'Verify email' },
  { key: 'password', label: 'Set password' },
  { key: 'done', label: 'Done' },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { verifyEmail, completeSignup } = useAuth();

  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  // NOT_INVITED is not an error the user can fix by retyping -- it means no
  // account has been created for them yet, so the form gives way to the
  // service-request notice instead of just reddening.
  const [errorCode, setErrorCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [invitation, setInvitation] = useState(null); // { full_name, role, signupToken }

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [createdUsername, setCreatedUsername] = useState('');
  const [copied, setCopied] = useState(false);

  const passwordInputRef = useRef(null);

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })),
    [password]
  );
  const passwordMeetsRules = ruleResults.every((r) => r.passed);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // Move focus to the password field once the email is accepted, so the flow
  // stays on the keyboard the whole way through.
  useEffect(() => {
    if (step === 'password') passwordInputRef.current?.focus();
  }, [step]);

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setIsLoading(true);

    const result = await verifyEmail(email.trim());

    if (result.success) {
      setInvitation(result.data);
      setStep('password');
    } else {
      setError(result.message);
      setErrorCode(result.code || '');
    }

    setIsLoading(false);
  };

  const handleCompleteSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    const result = await completeSignup({
      email: invitation.email,
      password,
      confirmPassword,
      signupToken: invitation.signupToken,
    });

    if (result.success) {
      setCreatedUsername(result.data.username);
      setStep('done');
    } else {
      setError(result.message);
      // The token is single-use and short-lived. If the server says it is no
      // longer good, sending the user back to step one is the only way out.
      if (result.code === 'INVALID_TOKEN' || result.code === 'INVITE_EXPIRED') {
        setInvitation(null);
        setPassword('');
        setConfirmPassword('');
        setStep('email');
      }
    }

    setIsLoading(false);
  };

  const handleCopyUsername = async () => {
    try {
      await navigator.clipboard.writeText(createdUsername);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (insecure origin, or a permission
      // policy). The username is on screen either way, so this is not worth
      // an error message.
    }
  };

  const goBackToEmail = () => {
    setError('');
    setErrorCode('');
    setPassword('');
    setConfirmPassword('');
    setInvitation(null);
    setStep('email');
  };

  return (
    <AuthShell logo={logo}>
      <StepIndicator currentStep={step} />

      {step === 'email' && (
        <EmailStep
          email={email}
          setEmail={setEmail}
          error={error}
          errorCode={errorCode}
          isLoading={isLoading}
          onSubmit={handleVerifyEmail}
        />
      )}

      {step === 'password' && invitation && (
        <PasswordStep
          invitation={invitation}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          ruleResults={ruleResults}
          passwordMeetsRules={passwordMeetsRules}
          passwordsMatch={passwordsMatch}
          passwordInputRef={passwordInputRef}
          error={error}
          isLoading={isLoading}
          onSubmit={handleCompleteSignup}
          onBack={goBackToEmail}
        />
      )}

      {step === 'done' && (
        <DoneStep
          username={createdUsername}
          copied={copied}
          onCopy={handleCopyUsername}
          onContinue={() =>
            navigate('/login', { replace: true, state: { username: createdUsername } })
          }
        />
      )}
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 1 -- email                                                            */
/* -------------------------------------------------------------------------- */

function EmailStep({ email, setEmail, error, errorCode, isLoading, onSubmit }) {
  const notRegistered = errorCode === 'NOT_INVITED';
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white tracking-wide">Complete Your Registration</h1>
        <p className="text-gray-400 text-sm mt-1">
          Enter the email address your GIS Admin registered for you.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
            Work Email
          </label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
              <Mail size={20} />
            </div>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#0f1115] border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
              placeholder="you@tw1.com"
            />
          </div>
        </div>

        {notRegistered ? (
          <AccessRequestNotice
            title="This email isn't registered yet"
            message={`${error} Raise a service request and the GIS Admin will set up your account. You'll get an email with your username as soon as they do.`}
          />
        ) : (
          <ErrorBanner message={error} />
        )}

        <SubmitButton disabled={isLoading || !email} isLoading={isLoading}>
          <span>Continue</span>
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </SubmitButton>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-700/50 text-center">
        <p className="text-sm text-gray-400">
          <p>Already have an account?</p>
          <Link to="/login" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 2 -- password                                                         */
/* -------------------------------------------------------------------------- */

function PasswordStep({
  invitation, password, setPassword, confirmPassword, setConfirmPassword,
  showPassword, setShowPassword, ruleResults, passwordMeetsRules, passwordsMatch,
  passwordInputRef, error, isLoading, onSubmit, onBack,
}) {
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white tracking-wide">Set Your Password</h1>
        <p className="text-gray-400 text-sm mt-1">
          Your username is already set — a password is all that is left.
        </p>
      </div>

      {/* What the admin registered, so the user can tell they are completing
          the right invitation before committing to a password. */}
      <div className="mb-5 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
        <div className="flex items-start gap-3">
          <UserCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">
              Invitation verified
            </p>
            <p className="text-white text-sm font-medium mt-1 truncate">
              {invitation.full_name}
            </p>
            <p className="text-gray-300 text-sm mt-0.5 truncate">{invitation.email}</p>
            {/* Assigned when the invitation was sent, and repeated from the
                invitation email so the user can confirm it before committing
                to a password. */}
            {invitation.username && (
              <p className="text-sm mt-1.5">
                <span className="text-gray-300">Username: </span>
                <span className="font-bold text-white">{invitation.username}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <SessionCountdown seconds={invitation.expiresInSeconds} />

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
            New Password
          </label>
          <div className="relative group">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors">
              <Lock size={20} />
            </div>
            <input
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              required
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

        <SubmitButton
          disabled={isLoading || !passwordMeetsRules || !passwordsMatch}
          isLoading={isLoading}
        >
          <span>Create Account</span>
          <ShieldCheck size={18} className="group-hover:rotate-12 transition-transform" />
        </SubmitButton>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft size={14} /> Use a different email
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Step 3 -- the generated username                                           */
/* -------------------------------------------------------------------------- */

function DoneStep({ username, copied, onCopy, onContinue }) {
  return (
    <div className="text-center">
      <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-5">
        <CheckCircle2 size={32} className="text-emerald-400" />
      </div>

      <h1 className="text-2xl font-bold text-white tracking-wide">You're all set</h1>
      <p className="text-gray-400 text-sm mt-2">
        Your account is active. Sign in with the username below — not your email address.
      </p>

      <div className="mt-6 p-5 rounded-xl bg-[#0f1115] border border-blue-500/30">
        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
          Your username
        </p>
        <div className="mt-2 flex items-center justify-center gap-3">
          <span className="text-xl font-mono font-bold text-white break-all">{username}</span>
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 border border-gray-700 transition-colors"
            aria-label="Copy username"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>
        <p className="text-gray-400 text-sm mt-3">
          This is also in your invitation email. Ask your GIS Admin if you need it changed.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-6 w-full relative overflow-hidden bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:shadow-[0_4px_25px_rgba(6,182,212,0.5)] group"
      >
        <div className="flex items-center justify-center gap-2">
          <span>Continue to Sign In</span>
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

function StepIndicator({ currentStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((s, index) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index < currentIndex
                ? 'w-8 bg-emerald-500'
                : index === currentIndex
                ? 'w-8 bg-blue-500'
                : 'w-4 bg-gray-700'
            }`}
            title={s.label}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The signup token expires; showing the remaining time turns an otherwise
 * baffling "your session expired" into something the user saw coming.
 */
function SessionCountdown({ seconds }) {
  const [remaining, setRemaining] = useState(seconds || 0);

  useEffect(() => {
    if (!seconds) return undefined;
    setRemaining(seconds);
    const tick = setInterval(() => {
      setRemaining((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [seconds]);

  if (!seconds) return null;

  const minutes = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  const isRunningOut = remaining > 0 && remaining < 120;

  return (
    <div
      className={`flex items-center justify-center gap-1.5 mb-5 text-sm ${
        isRunningOut ? 'text-amber-400' : 'text-gray-500'
      }`}
    >
      <Clock size={13} />
      {remaining > 0
        ? <span>Finish within {minutes}:{secs}</span>
        : <span>This step has expired — go back and verify your email again.</span>}
    </div>
  );
}

