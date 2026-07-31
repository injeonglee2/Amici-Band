import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'
import { getMember, saveMember } from './data'
import { DEMO, DEMO_MEMBER } from './demo'
import type { Member, Part } from './types'

interface AuthState {
  user: User | null
  member: Member | null // 실명이 등록된 프로필 (없으면 최초 로그인 → 이름 설정 필요)
  loading: boolean
  signIn: () => Promise<void>
  signOutUser: () => Promise<void>
  setRealName: (name: string, part: Part) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (DEMO) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const m = await getMember(u.uid)
        setMember(m && m.name ? m : null)
      } else {
        setMember(null)
      }
      setLoading(false)
    })
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user: DEMO
        ? ({ uid: DEMO_MEMBER.uid, email: DEMO_MEMBER.email, displayName: DEMO_MEMBER.name } as unknown as User)
        : user,
      member: DEMO ? DEMO_MEMBER : member,
      loading: DEMO ? false : loading,
      signIn: async () => {
        if (DEMO) return
        await signInWithPopup(auth, googleProvider)
      },
      signOutUser: async () => {
        if (DEMO) return
        await signOut(auth)
      },
      setRealName: async (name: string, part: Part) => {
        if (!user) return
        const m: Member = {
          uid: user.uid,
          email: user.email ?? '',
          name: name.trim(),
          part,
          photoURL: user.photoURL ?? undefined,
          createdAt: member?.createdAt ?? Date.now(),
        }
        await saveMember(m)
        setMember(m)
      },
    }),
    [user, member, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
