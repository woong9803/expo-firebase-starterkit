import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import { auth, db, app } from '../lib/firebase';
import { strings } from '../constants/strings';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // admin role 여부 확인 후 대시보드 이동
  async function checkAdminAndNavigate(uid: string) {
    const userDoc = await getDoc(doc(db, 'users', uid));

    if (!userDoc.exists()) {
      // setError를 먼저 → signOut이 re-render를 유발하더라도 에러 메시지가 남음
      setError(strings.auth.loginError);
      auth.signOut();
      return;
    }

    const data = userDoc.data();

    // 탈퇴한 계정인지 확인 (deleted_at 필드가 있으면 탈퇴 처리된 계정)
    if (data.deleted_at) {
      setError('탈퇴한 계정이에요. 다른 계정으로 로그인해주세요.');
      auth.signOut();
      return;
    }

    // 관리자 권한 확인
    if (data.role !== 'admin') {
      setError(strings.auth.notAdmin);
      auth.signOut();
      return;
    }

    navigate('/', { replace: true });
  }

  // Firebase Auth 에러 코드 → 한국어 메시지 변환
  function getAuthErrorMessage(code: string): string {
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return '이메일 또는 비밀번호가 올바르지 않아요.';
      case 'auth/user-disabled':
        return '비활성화된 계정이에요. 관리자에게 문의해주세요.';
      case 'auth/too-many-requests':
        return '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요.';
      case 'auth/invalid-email':
        return '이메일 형식이 올바르지 않아요.';
      default:
        return strings.auth.loginError;
    }
  }

  // 이메일/비밀번호 로그인
  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setIsLoading(true);
    setError('');
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await checkAdminAndNavigate(user.uid);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(getAuthErrorMessage(code));
    } finally {
      setIsLoading(false);
    }
  }

  // Google 로그인
  async function handleGoogleLogin() {
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const { user } = await signInWithPopup(auth, provider);
      await checkAdminAndNavigate(user.uid);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      // 팝업 닫기는 에러로 처리하지 않음
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(getAuthErrorMessage(code));
      }
    } finally {
      setIsLoading(false);
    }
  }

  // 카카오 로그인 — Cloud Functions kakaoLogin callable 경유
  async function handleKakaoLogin() {
    setIsLoading(true);
    setError('');
    try {
      // 카카오 JS SDK로 액세스 토큰 획득 후 Cloud Function 호출
      // 실제 카카오 SDK 연동은 별도 설정 필요 (현재는 안내만 표시)
      alert('카카오 로그인은 카카오 개발자 앱 설정 후 사용할 수 있어요.\n이메일 또는 Google로 로그인해주세요.');
    } catch {
      setError(strings.auth.loginError);
    } finally {
      setIsLoading(false);
    }
  }

  // 함수 참조 유지를 위한 dummy (unused warning 방지)
  void (getFunctions(app));
  void (httpsCallable);

  return (
    <div className="min-h-screen bg-card-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-text-main items-center justify-center mb-4">
            <span className="text-white text-2xl font-black">웅</span>
          </div>
          <h1 className="text-2xl font-black text-text-main">{strings.auth.loginTitle}</h1>
          <p className="text-text-sub text-sm mt-1">{strings.auth.loginSubtitle}</p>
        </div>

        {/* 로그인 카드 */}
        <div className="card p-6">
          {/* 에러 메시지 */}
          {error && (
            <div className="bg-danger-bg border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-danger-text text-sm">{error}</p>
            </div>
          )}

          {/* 이메일/비밀번호 폼 */}
          <form onSubmit={handleEmailLogin} className="space-y-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-text-sub mb-1">
                {strings.auth.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={strings.auth.emailPlaceholder}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-sub mb-1">
                {strings.auth.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={strings.auth.passwordPlaceholder}
                className="input-field"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-1"
            >
              {isLoading ? strings.common.loading : strings.auth.loginButton}
            </button>
          </form>

          {/* 구분선 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-card-border" />
            <span className="text-xs text-text-hint">또는</span>
            <div className="flex-1 h-px bg-card-border" />
          </div>

          {/* 소셜 로그인 버튼 */}
          <div className="space-y-2">
            {/* Google 로그인 */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full h-11 flex items-center justify-center gap-3 bg-white border-2 border-card-border rounded-card text-sm font-semibold text-text-main hover:bg-card-bg transition-colors disabled:opacity-50"
            >
              {/* Google 아이콘 */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {strings.auth.googleLogin}
            </button>

            {/* 카카오 로그인 */}
            <button
              onClick={handleKakaoLogin}
              disabled={isLoading}
              className="w-full h-11 flex items-center justify-center gap-3 rounded-card text-sm font-semibold text-[#191919] hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#FEE500' }}
            >
              {/* 카카오 아이콘 */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#191919">
                <path d="M12 3C6.477 3 2 6.477 2 10.5c0 2.548 1.516 4.784 3.8 6.102L4.78 20.25l4.46-2.72C9.7 17.66 10.84 17.8 12 17.8c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
              </svg>
              {strings.auth.kakaoLogin}
            </button>
          </div>
        </div>

        {/* 안내 문구 */}
        <p className="text-center text-xs text-text-hint mt-4">
          {strings.auth.adminOnly}
        </p>
      </div>
    </div>
  );
}
