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
import { getMember, getUserBand, healUserBand, saveMember } from './data'
import { setCurrentBand } from './band'
import { DEMO, DEMO_MEMBER } from './demo'
import { isDeveloperEmail } from './roles'
import type { Member, Part } from './types'

interface AuthState {
  user: User | null
  member: Member | null // 실명이 등록된 프로필 (없으면 최초 로그인 → 이름 설정 필요)
  bandId: string | null // 속한 밴드 (없으면 온보딩: 밴드 만들기/코드로 참여)
  isDeveloper: boolean // 앱 개발자(최상위 권한). 밴드 관리자(member.admin)와 별개
  loading: boolean
  signIn: () => Promise<void>
  signOutUser: () => Promise<void>
  setRealName: (name: string, part: Part) => Promise<void>
  refreshBand: () => Promise<void> // 온보딩(밴드 생성/가입) 후 밴드·멤버 재해석
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [bandId, setBandId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // user 의 밴드를 해석하고(없으면 legacy 자동치유) 그 밴드의 내 멤버 프로필을 읽는다
  async function resolveFor(u: User) {
    let bid = await getUserBand(u.uid)
    if (!bid) bid = await healUserBand(u.uid)
    setBandId(bid)
    if (bid) {
      setCurrentBand(bid)
      const m = await getMember(u.uid)
      setMember(m && m.name ? m : null)
    } else {
      setCurrentBand('')
      setMember(null)
    }
  }

  useEffect(() => {
    if (DEMO) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        await resolveFor(u)
      } else {
        setBandId(null)
        setCurrentBand('')
        setMember(null)
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user: DEMO
        ? ({ uid: DEMO_MEMBER.uid, email: DEMO_MEMBER.email, displayName: DEMO_MEMBER.name } as unknown as User)
        : user,
      member: DEMO ? DEMO_MEMBER : member,
      bandId: DEMO ? 'demo' : bandId,
      isDeveloper: isDeveloperEmail(DEMO ? DEMO_MEMBER.email : (member?.email ?? user?.email)),
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
      refreshBand: async () => {
        if (!user) return
        await resolveFor(user)
      },
    }),
    [user, member, bandId, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
