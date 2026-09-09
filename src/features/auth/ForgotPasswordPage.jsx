/**
 * Step one of a password reset: ask for the link.
 *
 * The server says plainly whether the address is known, so an address that is
 * not in the system stops here with the service-request notice rather than
 * leaving the user waiting on mail that is never coming.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from './AuthContext';
import logo from '../../assets/images/TesLogo.png';
import { AuthShell, ErrorBanner, SubmitButton, AccessRequestNotice } from './AuthShell';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  // NOT_REGISTERED is not a typo the user can fix -- there is no account for
  // this address -- so the form gives way to the service-request notice.
  const [errorCode, setErrorCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrorCode('');
    setIsLoading(true);

    const result = await requestPasswordReset(email.trim());

    if (result.success) {
      setSentMessage(result.data.message);
    } else {
      setError(result.message);
      setErrorCode(result.code || '');
    }

    setIsLoading(false);
  };

  return (
    <AuthShell logo={logo}>
      {sentMessage ? (
        <div className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-5">
            <MailCheck size={30} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Check your email</h1>
          <p className="text-gray-400 text-sm mt-3 leading-relaxed">{sentMessage}</p>
          <p className="text-gray-600 text-xs mt-4">The link is good for one hour and can be used once.</p>

          <Link
            to="/login"
            className="mt-7 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_rgba(6,182,212,0.3)]"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white tracking-wide">Forgot your password?</h1>
            <p className="text-gray-400 text-sm mt-1">
              Enter your email and we'll send you a link to set a new one.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider ml-1">
                Email Address
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
                  placeholder="you@company.com"
                />
              </div>
              <p className="text-[11px] text-gray-400 ml-1 pt-1">
                Enter your registered email address and we'll send you a link to reset your password.
              </p>
            </div>

            {errorCode === 'NOT_REGISTERED' ? (
              <AccessRequestNotice
                message={`${error}`}
              />
            ) : (
              <ErrorBanner message={error} />
            )}

            <SubmitButton disabled={isLoading || !email} isLoading={isLoading}>
              <span>Send reset link</span>
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </SubmitButton>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700/50 text-center">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors">
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
