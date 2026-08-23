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
import { getAllBands, getBand, getLegacyMember, getMember, getMemberFromBand, getUserBand, getUserBandIds, getUserProfile, healUserBand, saveMember, setActiveUserBand } from './data'
import { setCurrentBand } from './band'
import { DEMO, DEMO_CHANNELS, DEMO_MEMBER, demoActiveWorkspace, setDemoChannel } from './demo'
import { isDeveloperEmail } from './roles'
import type { Band, Member, Part } from './types'
import { rememberWorkspaceTemplate } from './workspaceTemplates'

interface AuthState {
  user: User | null
  member: Member | null // 실명이 등록된 프로필 (없으면 최초 로그인 → 이름 설정 필요)
  bandId: string | null // 속한 밴드 (없으면 온보딩: 밴드 만들기/코드로 참여)
  workspace: Band | null
  channels: Band[]
  isDeveloper: boolean // 앱 개발자(최상위 권한). 밴드 관리자(member.admin)와 별개
  isChannelMember: boolean // 개발자 점검 진입 시 실제 멤버 문서 생성 방지용
  loading: boolean
  signIn: () => Promise<void>
  signOutUser: () => Promise<void>
  setRealName: (name: string, part?: Part) => Promise<void>
  refreshBand: () => Promise<void> // 온보딩(밴드 생성/가입) 후 밴드·멤버 재해석
  switchChannel: (bandId: string) => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [member, setMember] = useState<Member | null>(null)
  const [bandId, setBandId] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<Band | null>(null)
  const [channels, setChannels] = useState<Band[]>([])
  const [isChannelMember, setIsChannelMember] = useState(false)
  const [loading, setLoading] = useState(true)

  // user 의 밴드를 해석하고(없으면 legacy 자동치유) 그 밴드의 내 멤버 프로필을 읽는다
  async function resolveFor(u: User) {
    const developer = isDeveloperEmail(u.email)
    let bid = await getUserBand(u.uid)
    if (!bid) bid = await healUserBand(u.uid)
    setBandId(bid)
    if (bid) {
      setCurrentBand(bid)
      const [m, band, ids, globalProfile, legacyMember] = await Promise.all([
        getMember(u.uid), getBand(bid), getUserBandIds(u.uid), getUserProfile(u.uid), getLegacyMember(u.uid),
      ])
      const candidates = await Promise.all(ids.filter((id) => id !== bid).map((id) => getMemberFromBand(id, u.uid)))
      setIsChannelMember(!!m)
      const reusable = candidates.find((candidate) => candidate?.name)
      const googleName = Array.from((u.displayName || '').trim()).slice(0, 4).join('')
      const recoveredName = m?.name || globalProfile.name || reusable?.name || legacyMember?.name || googleName
      const recoveredPart = m?.part || globalProfile.part || reusable?.part || legacyMember?.part
      let resolvedMember: Member | null = recoveredName ? {
        ...legacyMember,
        ...reusable,
        ...m,
        uid: u.uid,
        email: m?.email || u.email || '',
        name: recoveredName,
        part: recoveredPart,
        createdAt: m?.createdAt || reusable?.createdAt || legacyMember?.createdAt || Date.now(),
      } : null
      if (resolvedMember && developer && !m) resolvedMember = { ...resolvedMember, admin: false }
      if (resolvedMember && (!m?.name || (!m?.part && recoveredPart)) && (!developer || !!m)) await saveMember(resolvedMember)
      setMember(resolvedMember)
      setWorkspace(band)
      if (band) rememberWorkspaceTemplate(band.templateId)
      if (developer) {
        setChannels(await getAllBands())
      } else {
        setChannels(band ? [band] : [])
      }
    } else {
      setCurrentBand('')
      setMember(null)
      setWorkspace(null)
      setChannels([])
      setIsChannelMember(false)
    }
  }

  useEffect(() => {
    if (DEMO) {
      setLoading(false)
      return
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      try {
        if (u) {
          await resolveFor(u)
        } else {
          setBandId(null)
          setCurrentBand('')
          setMember(null)
          setWorkspace(null)
          setChannels([])
          setIsChannelMember(false)
        }
      } catch (e) {
        // 밴드/멤버 조회 실패가 로그인 자체(스플래시)를 막지 않도록. 원인은 로그로.
        console.error('auth resolve failed', e)
      } finally {
        setLoading(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user: DEMO
        ? ({ uid: DEMO_MEMBER.uid, email: DEMO_MEMBER.email, displayName: DEMO_MEMBER.name } as unknown as User)
        : user,
      member: DEMO ? DEMO_MEMBER : member,
      bandId: DEMO ? demoActiveWorkspace().id : bandId,
      workspace: DEMO ? demoActiveWorkspace() : workspace,
      channels: DEMO ? DEMO_CHANNELS : channels,
      isDeveloper: isDeveloperEmail(DEMO ? DEMO_MEMBER.email : (member?.email ?? user?.email)),
      isChannelMember: DEMO ? true : isChannelMember,
      loading: DEMO ? false : loading,
      signIn: async () => {
        if (DEMO) return
        await signInWithPopup(auth, googleProvider)
      },
      signOutUser: async () => {
        if (DEMO) return
        await signOut(auth)
      },
      setRealName: async (name: string, part?: Part) => {
        if (!user) return
        const m: Member = {
          uid: user.uid,
          email: user.email ?? '',
          name: name.trim(),
          ...(part ? { part } : {}),
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
      switchChannel: async (nextBandId: string) => {
        if (DEMO) { setDemoChannel(nextBandId); return }
        if (!user || !isDeveloperEmail(user.email)) return
        await setActiveUserBand(user.uid, nextBandId)
        await resolveFor(user)
      },
    }),
    [user, member, bandId, workspace, channels, isChannelMember, loading],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
