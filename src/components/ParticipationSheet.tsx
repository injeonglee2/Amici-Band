import { useEffect, useState } from 'react'
import { clearTrackParticipation, setTrackParticipation, watchScores } from '../data'
import { isFixedPart, PART_META, PART_ORDER, type Member, type Score, type Track, type TrackPart } from '../types'
import { thumbnailUrl } from '../youtube'
import type { ToastState } from './Toast'
import { ScoreSongSheet } from './Scores'
import { useSheetSwipe } from './useSheetSwipe'
import { useBackHandler } from '../backnav'

/**
 * 곡별 파트 참여 팝업(시트). 음악 탭·일정의 합주곡 시트에서 공용으로 쓴다.
 * 원본 곡(playlists/{playlistId}/tracks/{trackId})의 participants 를 직접 수정하므로
 * 어디서 열든 같은 데이터가 바뀐다.
 */
export default function ParticipationSheet({
  playlistId,
  track,
  memberMap,
  me,
  toast,
  onClose,
}: {
  playlistId: string
  track: Track
  memberMap: Map<string, Member>
  me: Member | null
  toast: ToastState
  onClose: () => void
}) {
  const { sheetRef, grabHandlers } = useSheetSwipe(onClose)
  const [busy, setBusy] = useState(false)

  // 이 곡에 등록된 악보 — 있으면 바로가기 아이콘을 보여준다
  const [allScores, setAllScores] = useState<Score[]>([])
  const [openScores, setOpenScores] = useState(false)
  useEffect(() => watchScores(setAllScores, () => {}), [])
  const trackScores = allScores.filter((s) => s.trackId === track.id)

  const parts = track.participants ?? {}
  const uids = Object.keys(parts)
  const count = uids.length
  const myPart: TrackPart | undefined = me ? parts[me.uid] : undefined
  const joined = myPart !== undefined

  // 파트 편집 영역 — 참여 중이어도 기본은 숨김. 아래 '수정' 버튼으로만 연다.
  const [editing, setEditing] = useState(false)
  // 뒤로가기: 파트 편집 중이면 편집만 접고, 아니면 시트 닫기
  useBackHandler(() => (editing ? setEditing(false) : onClose()))

  // 직접 입력(임의 라벨) — '직접 입력' 버튼을 눌렀을 때만 입력창·적용 노출.
  // 내 표시값이 이미 임의 라벨이면 열린 상태 + 그 값으로 프리필.
  const [customOpen, setCustomOpen] = useState(joined && !isFixedPart(myPart))
  const [customText, setCustomText] = useState(!isFixedPart(myPart) && myPart ? myPart : '')

  // 고정 파트 그룹 (순서대로, 인원 있는 것만)
  const fixedGroups = PART_ORDER.map((part) => ({
    key: part as string,
    label: PART_META[part].label,
    uids: uids.filter((u) => parts[u] === part),
  })).filter((g) => g.uids.length > 0)
  // 임의 라벨 그룹 (고정 파트가 아닌 값들을 라벨별로 묶음, 등장 순서 유지)
  const customLabels: string[] = []
  uids.forEach((u) => {
    const v = parts[u]
    if (!isFixedPart(v) && !customLabels.includes(v)) customLabels.push(v)
  })
  const customGroups = customLabels.map((label) => ({
    key: 'custom:' + label,
    label,
    uids: uids.filter((u) => parts[u] === label),
  }))
  const groups = [...fixedGroups, ...customGroups]

  async function toggleJoin() {
    if (busy) return
    if (!me) {
      toast.show('로그인 후 참여할 수 있어요')
      return
    }
    setBusy(true)
    try {
      if (joined) {
        await clearTrackParticipation(playlistId, track.id, me.uid)
        setEditing(false)
      } else {
        // 기본 파트 = 내 프로필 파트 (없으면 첫 파트). 아래 칩으로 곡마다 변경 가능
        await setTrackParticipation(playlistId, track.id, me.uid, me.part ?? PART_ORDER[0])
      }
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      toast.show(
        code === 'permission-denied'
          ? '참여 저장 권한이 없어요. 보안 규칙을 확인해 주세요.'
          : '참여를 저장하지 못했어요.',
      )
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function changeMyPart(part: TrackPart) {
    if (busy || !me || part === myPart) return
    setBusy(true)
    try {
      await setTrackParticipation(playlistId, track.id, me.uid, part)
      // 파트를 등록·변경했으면 편집 영역은 다시 접는다
      setEditing(false)
    } catch (e) {
      toast.show('파트를 바꾸지 못했어요.')
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  // '수정'을 누를 때마다 현재 내 파트 기준으로 직접 입력 상태를 다시 맞춘다
  function toggleEditing() {
    if (editing) {
      setEditing(false)
      return
    }
    const custom = joined && !isFixedPart(myPart)
    setCustomOpen(custom)
    setCustomText(custom && myPart ? myPart : '')
    setEditing(true)
  }

  async function applyCustom() {
    const v = customText.trim()
    if (!v) {
      toast.show('표시할 파트를 입력해 주세요')
      return
    }
    await changeMyPart(v)
  }

  const name = (uid: string) => memberMap.get(uid)?.name ?? '(탈퇴)'

  return (
    <>
    <div className="scrim open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={sheetRef}>
        <div className="grab-zone" {...grabHandlers}>
          <div className="grab" />
        </div>

        <div className="part-sheet-song">
          <div className="track-thumb sm">
            {track.thumbnail || track.videoId ? (
              <img src={track.thumbnail || thumbnailUrl(track.videoId)} alt="" />
            ) : null}
          </div>
          <div className="part-sheet-songinfo">
            <h2>{track.title || '(제목 없음)'}</h2>
            {track.artist && <p>{track.artist}</p>}
          </div>
          {trackScores.length > 0 && (
            <button type="button" className="part-score-link" onClick={() => setOpenScores(true)} aria-label="악보 보기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></svg>
              <span>악보 {trackScores.length}</span>
            </button>
          )}
        </div>

        <div className="part-sheet-summary">
          <span className="part-bar-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
          </span>
          {count === 0 ? '참여 인원 없음' : `참여 ${count}명`}
        </div>

        {groups.length === 0 ? (
          <p className="part-none">아직 참여자가 없어요. 아래 ‘참여’를 눌러 첫 참여자가 되어보세요.</p>
        ) : (
          <div className="part-groups">
            {groups.map((g) => (
              <div key={g.key} className="part-group">
                <span className="part-group-label">
                  {g.label} <b>{g.uids.length}</b>
                </span>
                <span className="part-group-names">
                  {g.uids.map((u) => (
                    <span key={u} className={'part-name' + (me && u === me.uid ? ' me' : '')}>
                      {name(u)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}

        {me && joined && editing && (
          <div className="part-mypart">
            <span className="part-mypart-label">이 곡에서 내 파트</span>
            <div className="part-chips">
              {PART_ORDER.map((p) => (
                <button
                  key={p}
                  className={'part-chip' + (myPart === p ? ' on' : '')}
                  onClick={() => {
                    setCustomOpen(false)
                    void changeMyPart(p)
                  }}
                  disabled={busy}
                >
                  {PART_META[p].label}
                </button>
              ))}
            </div>
            {/* '직접 입력' 클릭 시에만 입력창·적용 노출. 세 요소는 한 줄에 정렬 */}
            <div className="part-custom">
              <button
                type="button"
                className={'part-chip part-custom-chip' + (customOpen || !isFixedPart(myPart) ? ' on' : '')}
                onClick={() => setCustomOpen((o) => !o)}
                disabled={busy}
              >
                직접 입력
              </button>
              {customOpen && (
                <>
                  <input
                    className="part-custom-input"
                    type="text"
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void applyCustom()
                      }
                    }}
                    placeholder="예) 코러스, 퍼커션, MC"
                    maxLength={20}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn primary part-custom-apply"
                    onClick={() => void applyCustom()}
                    disabled={busy || !customText.trim()}
                  >
                    적용
                  </button>
                </>
              )}
            </div>
            <p className="part-custom-hint">고정 파트에 없는 역할(코러스·퍼커션·MC 등)은 ‘직접 입력’으로 이 곡에만 표시할 수 있어요. 프로필 파트는 바뀌지 않습니다.</p>
          </div>
        )}

        {/* 참여 중이면 좌: 참여 취소 · 중앙: 수정 · 우: 닫기 (셋 다 같은 너비) */}
        <div className={'actions' + (joined ? ' part-actions-3' : '')}>
          {joined ? (
            <>
              <button type="button" className="btn danger" onClick={toggleJoin} disabled={busy}>
                참여 취소
              </button>
              <button type="button" className="btn primary" onClick={toggleEditing} disabled={busy}>
                {editing ? '완료' : '수정'}
              </button>
              <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
            </>
          ) : (
            <>
              <button type="button" className="btn primary" onClick={toggleJoin} disabled={busy}>
                이 곡에 참여
              </button>
              <button type="button" className="btn subtle" onClick={onClose}>닫기</button>
            </>
          )}
        </div>
      </div>
    </div>
    {openScores && (
      <ScoreSongSheet
        song={{
          trackId: track.id,
          title: track.title,
          artist: track.artist || undefined,
          thumbnail: track.thumbnail || (track.videoId ? thumbnailUrl(track.videoId) : undefined),
          scores: trackScores,
        }}
        myPart={me?.part}
        toast={toast}
        onClose={() => setOpenScores(false)}
      />
    )}
    </>
  )
}
