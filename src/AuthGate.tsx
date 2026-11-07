import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import './auth.css'

type AuthContextValue = {
  user: User
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (mode === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password })
        if (authError) throw authError
        if (!data.session) setMessage('تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيده ثم سجّل الدخول.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر إكمال المصادقة.')
    } finally {
      setBusy(false)
    }
  }

  if (!isSupabaseConfigured || !supabase) {
    return <main className="auth-screen" dir="rtl"><section className="auth-card"><div className="auth-mark">REA</div><h1>اتصال قاعدة البيانات غير مكتمل</h1><p>أضف VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY إلى إعدادات بيئة Vercel ثم أعد النشر.</p></section></main>
  }

  if (loading) {
    return <main className="auth-screen" dir="rtl"><section className="auth-card"><div className="auth-mark">REA</div><p>جارٍ التحقق من جلسة الدخول…</p></section></main>
  }

  if (!user) {
    return (
      <main className="auth-screen" dir="rtl">
        <section className="auth-card">
          <div className="auth-mark">REA</div>
          <div className="auth-eyebrow">REA AI STUDIO</div>
          <h1>{mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</h1>
          <p>سجّل الدخول لحفظ مشاريعك وملفاتك في مساحة خاصة وآمنة.</p>
          <form onSubmit={submit} className="auth-form">
            <label>البريد الإلكتروني<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
            <label>كلمة المرور<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} required /></label>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-message">{message}</div>}
            <button type="submit" disabled={busy}>{busy ? 'جارٍ التنفيذ…' : mode === 'signin' ? 'دخول إلى مساحة العمل' : 'إنشاء الحساب'}</button>
          </form>
          <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage('') }}>
            {mode === 'signin' ? 'ليس لديك حساب؟ أنشئ حساباً' : 'لديك حساب بالفعل؟ سجّل الدخول'}
          </button>
          <small>تُحمى المشاريع والملفات بسياسات ملكية المستخدم في Supabase.</small>
        </section>
      </main>
    )
  }

  return <AuthContext.Provider value={{ user, signOut: async () => { await supabase.auth.signOut() } }}>{children}</AuthContext.Provider>
}
