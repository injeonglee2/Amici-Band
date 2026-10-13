import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { deleteEvent, newId, saveEvent, savePlaylist, saveTrack, updateMusicTrack, watchAllMusicTracks, watchMembers, watchPlaylists } from '../data'
import type { Member, Playlist, Track } from '../types'
import { thumbnailUrl } from '../youtube'
import SetlistPlayer from './SetlistPlayer'
import type { ToastState } from './Toast'
import Sheet from './Sheet'
import ConfirmDialog from './ConfirmDialog'
import ThemeSelect from './ThemeSelect'
import Segmented from './Segmented'
import { REHEARSAL_PLAYLIST_ID } from '../musicCatalog'
import { Icon } from '../icons'

export default function MusicCandidates({ playlist, toast, editMode, onEditTrack, onDeleteTrack, onAdd, onExport, exporting, settingsOpen, onSettingsClose, onRequestVotes }: { playlist: Playlist; toast: ToastState; editMode: boolean; onEditTrack: (track: Track) => void; onDeleteTrack: (track: Track) => void; onAdd: () => void; onExport: (tracks: Track[]) => void; exporting: boolean; settingsOpen: boolean; onSettingsClose: () => void; onRequestVotes: () => Promise<void> }) {
  const { member } = useAuth()
  const [tracks, setTracks] = useState<Track[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selectionCount, setSelectionCount] = useState(1)
  const [members, setMembers] = useState<Member[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [voterLimits, setVoterLimits] = useState<Record<string, number>>({})
  const [targetPlaylistId, setTargetPlaylistId] = useState('')
  const [editingVote, setEditingVote] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [closeConfirm, setCloseConfirm] = useState(false)
  const [openingNewVote, setOpeningNewVote] = useState(false)
  const [voteDeadline, setVoteDeadline] = useState('')
  const [voteType, setVoteType] = useState<'vocal' | 'instrument'>('vocal')
  const [rehearsalTracks, setRehearsalTracks] = useState<Track[]>([])

  useEffect(() => watchAllMusicTracks(playlist.id, setTracks, (e) => setError(e.message)), [playlist.id])
  useEffect(() => watchMembers(setMembers, () => {}), [])
  useEffect(() => watchPlaylists(setPlaylists, () => {}), [])
  useEffect(() => watchAllMusicTracks(REHEARSAL_PLAYLIST_ID, setRehearsalTracks, () => {}), [])
  useEffect(() => {
    if (!settingsOpen) return
    setSelectionCount(playlist.voteSelectionCount ?? 1)
    setVoteType(playlist.voteType ?? 'vocal')
    setVoterLimits(playlist.voteOpen ? (playlist.voteVoterLimits ?? {}) : {})
    setTargetPlaylistId(playlist.voteTargetPlaylistId ?? '')
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    now.setDate(now.getDate() + 7)
    const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    setVoteDeadline(playlist.voteDeadline && playlist.voteDeadline >= today ? playlist.voteDeadline : fallback)
    setEditingVote(false)
    setOpeningNewVote(false)
  }, [settingsOpen, playlist.voteOpen, playlist.voteType, playlist.voteSelectionCount, playlist.voteVoterLimits, playlist.voteTargetPlaylistId])

  const voteOpen = playlist.voteOpen === true
  /**
   * 득표 수는 투표를 마감한 뒤에 공개한다.
   * 진행 중에 순위대로 늘어놓으면 표를 가려도 판세가 그대로 드러나므로, 정렬도 담은 순서로 둔다.
   */
  const revealVotes = !voteOpen
  const countVotes = (track: Track) => Object.values(track.votes || {}).filter(Boolean).length
  const recommendationTracks = tracks
    .filter((track) => track.candidateStatus)
    .sort((a, b) => {
      const byOrder = (a.order ?? a.addedAt) - (b.order ?? b.addedAt)
      return revealVotes ? (countVotes(b) - countVotes(a)) || byOrder : byOrder
    })
  const candidates = recommendationTracks.filter((track) => track.candidateStatus !== 'selected')
  const playingIndex = recommendationTracks.findIndex((track) => track.id === playingId)
  const playing = playingIndex >= 0 ? recommendationTracks[playingIndex] : null
  const winnerCount = Math.max(1, playlist.voteSelectionCount ?? 1)
  const maxVotes = member ? Math.max(0, playlist.voteVoterLimits?.[member.uid] ?? 0) : 0
  const myVoteCount = member ? candidates.filter((track) => track.votes?.[member.uid]).length : 0
  const activeVoteType = playlist.voteType ?? 'vocal'
  /** 이번 투표에 낄 수 있는 파트인가 — 보컬 투표는 보컬만, 악기 투표는 비보컬 파트만 */
  const fitsVoteType = (part?: string) => (activeVoteType === 'vocal' ? part === 'vocal' : !!part && part !== 'vocal')
  const canVote = maxVotes > 0 && fitsVoteType(member?.part)
  const vocalMembers = members.filter((item) => item.part === 'vocal')
  const instrumentMembers = members.filter((item) => item.part && item.part !== 'vocal')
  const performancePlaylists = playlists.filter((item) => item.templateId === 'performance')
  const selectedResults = tracks.filter((track) => playlist.lastSelectedTrackIds?.includes(track.id))
  const hasSavedResults = selectedResults.length > 0
  const selectedVocalIds = vocalMembers.filter((vocal) => (voterLimits[vocal.uid] ?? 0) > 0).map((vocal) => vocal.uid)
  const allVocalsSelected = vocalMembers.length > 0 && selectedVocalIds.length === vocalMembers.length
  const eligibleVoters = voteType === 'vocal' ? selectedVocalIds : instrumentMembers.map((item) => item.uid)
  /**
   * 진행 중인 투표의 참여자와 공통 한도 — 한도는 거의 모두 같아 한 번만 보여준다.
   *
   * 한도(voteVoterLimits)만 보고 세면 파트가 바뀌었거나 예전 설정이 남은 사람까지 명단에 낀다.
   * 실제로 투표할 수 있는지(canVote)와 같은 기준으로 걸러 명단과 실제 권한을 일치시킨다.
   */
  const voters = members.filter((person) => (playlist.voteVoterLimits?.[person.uid] ?? 0) > 0 && fitsVoteType(person.part))
  const commonLimit = (() => {
    const tally = new Map<number, number>()
    voters.forEach((person) => {
      const limit = playlist.voteVoterLimits?.[person.uid] ?? 0
      tally.set(limit, (tally.get(limit) ?? 0) + 1)
    })
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (playlist.voteSelectionCount ?? 1)
  })()

  function toggleAllVocals(checked: boolean) {
    setVoterLimits(Object.fromEntries(vocalMembers.map((vocal) => [vocal.uid, checked ? selectionCount : 0])))
  }

  function changeSelectionCount(value: number) {
    const next = Math.max(1, Math.min(value || 1, Math.max(1, candidates.length)))
    setSelectionCount(next)
    setVoterLimits((current) => Object.fromEntries(Object.entries(current).map(([uid, limit]) => [uid, limit > 0 ? next : 0])))
  }

  async function update(track: Track, data: Record<string, unknown>) {
    if (busyId) return
    setBusyId(track.id)
    setError('')
    try {
      await updateMusicTrack(playlist.id, track.id, data)
    } catch (e) {
      const code = (e as { code?: string })?.code
      setError(code === 'permission-denied' ? '투표할 권한이 없어요. 관리자에게 문의해 주세요.' : '저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function openVote() {
    if (!member?.admin || busyId || candidates.length === 0) return
    const count = Math.max(1, Math.min(selectionCount, candidates.length))
    const enabledLimits = Object.fromEntries(eligibleVoters.map((uid) => [uid, count]))
    if (!Object.keys(enabledLimits).length) {
      setError(voteType === 'vocal' ? '투표에 참여할 보컬을 한 명 이상 선택해 주세요.' : '악기 파트로 등록된 멤버가 없어요.')
      return
    }
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(candidates.map((track) => updateMusicTrack(playlist.id, track.id, { votes: {} })))
      await Promise.all([
        savePlaylist({ ...playlist, voteOpen: true, voteType, voteSelectionCount: count, voteVoterLimits: enabledLimits, lastSelectedTrackIds: [], voteLinkedPlaylistIds: [], voteOpenedAt: Date.now(), voteDeadline, recommendationDeadline: '' }),
        saveEvent({ id: `recommendation-vote-deadline-${playlist.id}`, type: 'practice', title: '추천곡 투표 마감', date: voteDeadline, rehStart: '23:59', rehEnd: '23:59', recommendationPlaylistId: playlist.id, recommendationPlaylistName: playlist.name, musicDeadlineKind: 'vote', voteSelectionCount: count, note: '', createdBy: member.uid, createdAt: Date.now() }),
        // 투표를 열면 추천곡 추가는 끝난 것이므로 남아 있는 추가 마감 일정은 지운다.
        deleteEvent(`recommendation-deadline-${playlist.id}`),
      ])
      toast.show(`${count}곡 선정 투표를 시작했어요`)
      onSettingsClose()
    } catch {
      setError('투표를 시작하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function saveVoteChanges() {
    if (!member?.admin || busyId) return
    const count = Math.max(1, Math.min(selectionCount, candidates.length))
    const enabledLimits = Object.fromEntries(eligibleVoters.map((uid) => [uid, count]))
    if (!Object.keys(enabledLimits).length) return
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(candidates.map((track) => {
        const nextVotes = { ...(track.votes ?? {}) }
        Object.keys(nextVotes).forEach((uid) => { if (!enabledLimits[uid]) delete nextVotes[uid] })
        return updateMusicTrack(playlist.id, track.id, { votes: nextVotes })
      }))
      // 한도가 줄어든 보컬은 목록 순서 기준으로 초과 선택을 해제한다.
      for (const uid of Object.keys(enabledLimits)) {
        const selected = candidates.filter((track) => track.votes?.[uid])
        await Promise.all(selected.slice(count).map((track) => updateMusicTrack(playlist.id, track.id, { [`votes.${uid}`]: false })))
      }
      await Promise.all([
        savePlaylist({ ...playlist, voteOpen: true, voteType, voteSelectionCount: count, voteVoterLimits: enabledLimits, voteDeadline }),
        saveEvent({ id: `recommendation-vote-deadline-${playlist.id}`, type: 'practice', title: '추천곡 투표 마감', date: voteDeadline, rehStart: '23:59', rehEnd: '23:59', recommendationPlaylistId: playlist.id, recommendationPlaylistName: playlist.name, musicDeadlineKind: 'vote', voteSelectionCount: count, note: '', createdBy: member.uid, createdAt: playlist.voteOpenedAt ?? Date.now() }),
      ])
      toast.show('투표 설정을 수정했어요')
      onSettingsClose()
    } catch {
      setError('투표 설정을 수정하지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  async function cancelVote() {
    if (!member?.admin || busyId) return
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(candidates.map((track) => updateMusicTrack(playlist.id, track.id, { votes: {} })))
      await Promise.all([savePlaylist({ ...playlist, voteOpen: false }), deleteEvent(`recommendation-vote-deadline-${playlist.id}`)])
      toast.show('투표를 취소했어요')
      setCancelConfirm(false)
      onSettingsClose()
    } catch {
      setError('투표를 취소하지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  async function closeVote() {
    if (!member?.admin || busyId) return
    const ranked = candidates.map((track) => ({ track, votes: Object.values(track.votes || {}).filter(Boolean).length }))
      .sort((a, b) => b.votes - a.votes || (a.track.order ?? a.track.addedAt) - (b.track.order ?? b.track.addedAt))
    const winners = ranked.slice(0, winnerCount)
    const cutoff = winners.at(-1)?.votes ?? 0
    const tiedAtCutoff = ranked.filter((item) => item.votes === cutoff).length
    const tiedWinners = winners.filter((item) => item.votes === cutoff).length
    if (ranked.length > winnerCount && tiedAtCutoff > tiedWinners) {
      setError(`선정 경계에서 ${cutoff}표 동점이 발생했어요. 결선 투표 후 종료해 주세요.`)
      return
    }
    setBusyId('vote-session')
    setError('')
    try {
      await Promise.all(winners.map(({ track }) => updateMusicTrack(playlist.id, track.id, { candidateStatus: 'selected' })))
      await Promise.all([savePlaylist({ ...playlist, voteOpen: false, lastSelectedTrackIds: winners.map(({ track }) => track.id), voteLinkedPlaylistIds: [] }), deleteEvent(`recommendation-vote-deadline-${playlist.id}`)])
      toast.show(`${winners.length}곡을 선정했어요`)
    } catch {
      setError('투표를 종료하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setBusyId(null)
    }
  }

  async function linkSelectedTracks() {
    if (!targetPlaylistId || busyId || !selectedResults.length) return
    setBusyId('link-results')
    try {
      const now = Date.now()
      await Promise.all(selectedResults.map(async (track, index) => {
        let source = rehearsalTracks.find((item) => item.videoId && item.videoId === track.videoId)
        if (!source) {
          source = {
            ...track, id: newId(), order: now + index, addedAt: now + index,
            candidateStatus: undefined, votes: undefined, reviews: undefined, recommendation: undefined,
          }
          await saveTrack(REHEARSAL_PLAYLIST_ID, source)
        }
        await saveTrack(targetPlaylistId, {
          ...source, id: newId(), order: now + index, addedAt: now + index,
          sourcePlaylistId: REHEARSAL_PLAYLIST_ID, sourceTrackId: source.id,
          candidateStatus: undefined, votes: undefined, reviews: undefined, recommendation: undefined,
        })
      }))
      await savePlaylist({ ...playlist, voteLinkedPlaylistIds: [...new Set([...(playlist.voteLinkedPlaylistIds ?? []), targetPlaylistId])] })
      toast.show('선정곡을 합주곡에 저장하고 공연곡에 추가했어요')
      setTargetPlaylistId('')
    } catch {
      setError('선정곡을 추가하지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  return <>
    <main className="scroll">
      {error && <div className="banner-err">{error}</div>}
      {playing && <SetlistPlayer
        track={playing}
        index={playingIndex}
        total={recommendationTracks.length}
        hasPrev={playingIndex > 0}
        hasNext={playingIndex < recommendationTracks.length - 1}
        onPrev={() => setPlayingId(recommendationTracks[playingIndex - 1]?.id ?? null)}
        onNext={() => setPlayingId(recommendationTracks[playingIndex + 1]?.id ?? null)}
        onEnded={() => setPlayingId(recommendationTracks[playingIndex + 1]?.id ?? playing.id)}
        onClose={() => setPlayingId(null)}
      />}

      {recommendationTracks.length === 0 ? <div className="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        <p>추천곡이 없어요.<br />아래 <b>+ 곡 추가</b>로 추천할 곡을 넣어보세요.</p>
      </div> : <>
        {!editMode && <div className="setlist-actions recommendation-actions">
          <button className="btn play-all" onClick={() => setPlayingId(recommendationTracks[0].id)}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            전체 재생
          </button>
          <button className="btn subtle export-btn" onClick={() => onExport(recommendationTracks)} disabled={exporting} title="유튜브 재생목록으로 저장">
            {exporting ? '저장 중…' : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>유튜브 저장</>}
          </button>
        </div>}
        {editMode && <p className="hint reorder-hint"><Icon name="eraser" className="hint-ico" />곡을 눌러 제목·가수를 수정하거나 <Icon name="close" className="hint-ico" />삭제할 수 있어요.</p>}
        <div className="list track-list">{recommendationTracks.map((track) => {
          const voted = member ? !!track.votes?.[member.uid] : false
          const votes = Object.values(track.votes || {}).filter(Boolean).length
          const selected = track.candidateStatus === 'selected'
          if (editMode) return <div key={track.id} className="track-row">
            <button className="track-link" onClick={() => onEditTrack(track)} aria-label={`${track.title || '곡'} 정보 수정`}>
              <div className="track-thumb sm"><img src={track.thumbnail || thumbnailUrl(track.videoId)} alt="" loading="lazy" /></div>
              <div className="track-info"><h3>{track.title || '(제목 없음)'}</h3>{track.artist && <p>{track.artist}</p>}</div>
              <span className="track-edit-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 20-3.5-3.5a2.1 2.1 0 0 1 0-3L14 3a2.1 2.1 0 0 1 3 0l4 4a2.1 2.1 0 0 1 0 3L11 20Z"/><path d="m10 7 7 7"/><path d="M7 20h14"/></svg></span>
            </button>
            <button className="edit-btn track-del" onClick={() => onDeleteTrack(track)} aria-label={`${track.title || '곡'} 삭제`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
          return <div key={track.id} className={'setlist-row playlist-setlist-row card-play-target' + (track.id === playingId ? ' playing' : '') + (selected ? ' mine' : '')} role="button" tabIndex={0} onClick={() => setPlayingId(track.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlayingId(track.id) } }}>
            <div className="setlist-rowhead">
              <button className="track-thumb-btn" onClick={(e) => { e.stopPropagation(); setPlayingId(track.id) }} aria-label="재생">
                <div className="track-thumb sm">
                  <img src={track.thumbnail || thumbnailUrl(track.videoId)} alt="" loading="lazy" />
                  <span className="track-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                </div>
              </button>
              <div className="setlist-body"><div className="track-info">
                <h3>{track.title || '(제목 없음)'}</h3>
                {track.artist && <p>{track.artist}</p>}
              </div></div>
              {/* 추천한 사람은 투표 중에도 보여 준다 — 투표 참여자와는 별개 정보 */}
              <span className="playlist-track-adder">{track.addedByName || '멤버'}</span>
              {revealVotes && votes > 0 && <span className="candidate-vote-count">{votes}표</span>}
              {selected && <span className="track-mypart">선정</span>}
              {!selected && voteOpen && canVote && member && <div className="candidate-vote-action" onClick={(e) => e.stopPropagation()}><button disabled={busyId === track.id || (!voted && myVoteCount >= maxVotes)} className={'btn ' + (voted ? 'primary' : 'subtle')} aria-pressed={voted} onClick={() => void update(track, { [`votes.${member.uid}`]: !voted })}>{voted ? '선택 취소' : myVoteCount >= maxVotes ? `${maxVotes}곡 완료` : '곡 선택'}</button></div>}
            </div>
          </div>
        })}</div>
        {/* 몇 곡까지 고를 수 있는지 — 곡 목록 바로 아래, 버전 표시와 같은 톤으로 */}
        {voteOpen && canVote && <p className="app-ver candidate-limit-note">최대 {maxVotes}곡을 선택하세요</p>}
      </>}
    </main>
    {/* 투표 중에는 곡을 더 넣을 수 없으므로 버튼 자체를 숨긴다 */}
    {!voteOpen && <button className="fab" onClick={onAdd}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      곡 추가
    </button>}
    {settingsOpen && member?.admin && <Sheet onClose={onSettingsClose}>
      {/* 참석 현황 시트와 같은 자리 — 제목 오른쪽에 요청 보내기 */}
      {voteOpen && !editingVote ? <div className="attendance-title-row">
        <h2>투표 관리</h2>
        <button type="button" className="vote-share-btn" onClick={() => void onRequestVotes()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
          투표 요청
        </button>
      </div> : <h2>{voteOpen ? '투표 관리' : hasSavedResults && !openingNewVote ? '선정곡 연결' : '추천곡 투표 열기'}</h2>}
      {voteOpen && !editingVote ? <>
        <p className="hint">{activeVoteType === 'instrument' ? '악기' : '보컬'} 투표 · 선정곡 {playlist.voteSelectionCount ?? 1}곡</p>
        <div className="vote-voter-summary">
          <div className="vote-voter-head">
            <strong>참여 {voters.length}명</strong>
            <span className="vote-voter-limit">최대 {commonLimit}곡</span>
          </div>
          {/* 한도는 대부분 같으므로 위에 한 번만 쓰고, 다른 사람만 칩에 따로 적는다 */}
          <div className="vote-voter-chips">{voters.map((person) => {
            const limit = playlist.voteVoterLimits?.[person.uid] ?? 0
            return <span key={person.uid} className={'vote-voter-chip' + (limit === commonLimit ? '' : ' custom')}>
              {person.name}{limit === commonLimit ? null : <b>{limit}곡</b>}
            </span>
          })}</div>
        </div>
        <div className="actions vote-manage-row">
          <button className="btn subtle" onClick={() => setEditingVote(true)}>수정</button>
          <button className="btn danger" onClick={() => setCancelConfirm(true)}>취소</button>
          <button className="btn primary" disabled={!!busyId} onClick={() => setCloseConfirm(true)}>선정</button>
          <button className="btn subtle" onClick={onSettingsClose}>닫기</button>
        </div>
      </> : hasSavedResults && !openingNewVote ? <>
        <div className="vote-vocal-list">{selectedResults.map((track) => <div className="vote-vocal-row" key={track.id}><strong>{track.title}</strong><span>{track.artist}</span></div>)}</div>
        <div className="field"><label>공연곡 재생목록</label><ThemeSelect value={targetPlaylistId} onChange={setTargetPlaylistId} title="공연곡 재생목록" placeholder="선택해 주세요" options={performancePlaylists.filter((item) => !playlist.voteLinkedPlaylistIds?.includes(item.id)).map((item) => ({ value: item.id, label: item.name }))} /></div>
        <div className="actions selected-link-actions"><button className="btn subtle" onClick={onSettingsClose}>닫기</button><button className="btn subtle" onClick={() => { setVoterLimits({}); setOpeningNewVote(true) }}>새 투표</button><button className="btn primary" disabled={!targetPlaylistId || !!busyId} onClick={() => void linkSelectedTracks()}>공연곡에 추가</button></div>
      </> : <>
        <section className="vote-setting-section">
          <div className="vote-setting-head"><span className="vote-setting-step">1</span><h3>투표 유형</h3></div>
          <Segmented semantics="single-select" ariaLabel="추천곡 투표 유형" value={voteType} onChange={(value) => setVoteType(value as 'vocal' | 'instrument')} tabs={[{ k: 'vocal', label: '보컬 투표' }, { k: 'instrument', label: '악기 투표' }]} />
        </section>
        {voteType === 'vocal' && <section className="vote-setting-section">
          <div className="vote-setting-head"><span className="vote-setting-step">2</span><h3>투표할 보컬</h3></div>
          <label className="vote-select-all"><span><input type="checkbox" checked={allVocalsSelected} onChange={(e) => toggleAllVocals(e.target.checked)} /><b>전체 보컬</b></span><em>{vocalMembers.length}명</em></label>
          <div className="vote-vocal-grid">{vocalMembers.map((vocal) => {
            const enabled = (voterLimits[vocal.uid] ?? 0) > 0
            return <label className={'vote-vocal-choice' + (enabled ? ' selected' : '')} key={vocal.uid}>
              <input type="checkbox" checked={enabled} onChange={(e) => setVoterLimits((current) => ({ ...current, [vocal.uid]: e.target.checked ? selectionCount : 0 }))} />
              <span>{vocal.name}</span>
            </label>
          })}</div>
          {vocalMembers.length === 0 && <p className="setlist-empty">보컬 파트로 등록된 멤버가 없어요.</p>}
        </section>}
        {voteType === 'instrument' && <p className="hint">악기 파트로 등록된 멤버 {instrumentMembers.length}명이 투표해요.</p>}
        <div className="vote-setting-pair">
          <section className="vote-setting-section vote-count-section">
            <div className="vote-setting-head"><span className="vote-setting-step">{voteType === 'vocal' ? '3' : '2'}</span><h3>1인당 선택 곡 수</h3></div>
            <div className="vote-count-control"><button type="button" onClick={() => changeSelectionCount(selectionCount - 1)} disabled={selectionCount <= 1} aria-label="한 곡 줄이기">−</button><output aria-label={`1인당 ${selectionCount}곡 선택`}><strong>{selectionCount}</strong><span>곡</span></output><button type="button" onClick={() => changeSelectionCount(selectionCount + 1)} disabled={selectionCount >= Math.max(1, candidates.length)} aria-label="한 곡 늘리기">+</button></div>
          </section>
          <section className="vote-setting-section vote-deadline-section">
            <div className="vote-setting-head"><span className="vote-setting-step">{voteType === 'vocal' ? '4' : '3'}</span><h3>투표 마감일</h3></div>
            <div className="field recommendation-deadline-field"><input aria-label="추천곡 투표 마감일" type="date" value={voteDeadline} min={new Date().toLocaleDateString('sv-SE')} onChange={(e) => setVoteDeadline(e.target.value)} /></div>
          </section>
        </div>
        <div className="actions"><button className="btn subtle" onClick={() => editingVote ? setEditingVote(false) : hasSavedResults ? setOpeningNewVote(false) : onSettingsClose()}>{editingVote || hasSavedResults ? '돌아가기' : '취소'}</button><button className="btn primary" disabled={!!busyId || candidates.length === 0 || eligibleVoters.length === 0 || !voteDeadline} onClick={() => void (editingVote ? saveVoteChanges() : openVote())}>{editingVote ? '변경사항 저장' : <>투표 시작 <span>· {eligibleVoters.length}명</span></>}</button></div>
      </>}
    </Sheet>}
    {cancelConfirm && <ConfirmDialog message="진행 중인 투표를 취소할까요? 지금까지의 표는 모두 삭제되고 곡은 선정되지 않아요." confirmLabel="투표 취소" cancelLabel="돌아가기" confirmVariant="danger" onConfirm={() => void cancelVote()} onCancel={() => setCancelConfirm(false)} />}
    {closeConfirm && <ConfirmDialog message={`투표를 마감하고 상위 ${winnerCount}곡을 선정할까요? 마감하면 득표 수가 공개되고 다시 투표할 수 없어요.`} confirmLabel="확인" cancelLabel="취소" onConfirm={() => { setCloseConfirm(false); void closeVote() }} onCancel={() => setCloseConfirm(false)} />}
  </>
}
