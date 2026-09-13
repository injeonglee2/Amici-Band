import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { newId, savePlaylist, saveTrack, updateMusicTrack, watchAllMusicTracks } from '../data'
import { isFixedPart, PART_META, PART_ORDER } from '../types'
import type { Playlist, Track } from '../types'
import { parseVideoId, thumbnailUrl } from '../youtube'
import type { ToastState } from './Toast'

const statuses = { review: '검토 중', voting: '투표 중', selected: '선정됨', held: '보류' } as const
export default function MusicCandidates({ playlist, toast }: { playlist: Playlist; toast: ToastState }) {
  const { member } = useAuth()
  const [tracks, setTracks] = useState<Track[]>([])
  const [filter, setFilter] = useState('review')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const reviewParts = playlist.reviewParts ?? ['keyboard', 'guitar']
  useEffect(() => watchAllMusicTracks(playlist.id, setTracks, (e) => setError(e.message)), [playlist.id])
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch { setError('저장하지 못했어요. 다시 시도해 주세요.') } finally { setBusy(false) }
  }
  const candidates = tracks.filter((t) => t.candidateStatus)
  return <main className="scroll">
    <p className="hint">검토 대상 파트의 멤버가 연주 가능 의견을 남기고, 관리자가 투표 대상을 확정해요. 검토와 투표는 참여 신청과 별개예요.</p>
    {error && <p className="banner-err">{error}</p>}
    <div className="music-tabs">{Object.entries(statuses).map(([key, label]) => <button key={key} className={'chip' + (filter === key ? ' on' : '')} onClick={() => setFilter(key)}>{label} {candidates.filter((t) => t.candidateStatus === key).length}</button>)}</div>
    {member?.admin && <details><summary>검토할 파트 설정</summary><div className="music-tabs">{PART_ORDER.map((part) => <label key={part}><input type="checkbox" checked={reviewParts.includes(part)} disabled={busy} onChange={(e) => { const parts = e.target.checked ? [...reviewParts, part] : reviewParts.filter((p) => p !== part); void run(() => savePlaylist({ ...playlist, reviewParts: parts })) }} />{PART_META[part].label}</label>)}</div></details>}
    {member?.admin && filter === 'review' && <button className="btn subtle" disabled={busy || !chosen.length} onClick={() => void run(async () => {
      const ready = candidates.filter((t) => t.candidateStatus === 'review' && chosen.includes(t.id))
      await Promise.all(ready.map((t) => updateMusicTrack(playlist.id, t.id, { candidateStatus: 'voting' })))
      setChosen([]); setFilter('voting')
    })}>선택한 곡 일괄 투표 시작</button>}
    <div className="list">{candidates.filter((t) => t.candidateStatus === filter).sort((a, b) => Object.values(b.votes || {}).filter(Boolean).length - Object.values(a.votes || {}).filter(Boolean).length).map((t) => <article className="setlist-row" key={t.id}>
      {member?.admin && t.candidateStatus === 'review' && <label><input type="checkbox" checked={chosen.includes(t.id)} onChange={(e) => setChosen((ids) => e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id))} /> 투표 대상으로 선택</label>}<h3>{t.title}</h3><p className="hint">추천: {t.addedByName || '멤버'} · {t.recommendation || '추천 이유 없음'}</p>
      <a href={t.url} target="_blank" rel="noreferrer">유튜브에서 듣기</a>
      {reviewParts.map((part) => { const reviews = Object.values(t.reviews || {}).filter((r) => r.part === part); return <p key={part} className="hint">{isFixedPart(part) ? PART_META[part].label : part} · {reviews.length ? reviews.map((r) => `${r.name}: ${r.result}${r.note ? ` (${r.note})` : ''}`).join(' / ') : '미검토'}</p> })}
      {member && t.candidateStatus === 'review' && reviewParts.includes(member.part || '') && <Review track={t} disabled={busy} onSave={(result, note) => void run(() => updateMusicTrack(playlist.id, t.id, { [`reviews.${member.uid}`]: { part: member.part, name: member.name, result, note } }))} />}
      <p>연주하고 싶어요 · {Object.values(t.votes || {}).filter(Boolean).length}표</p>
      {member && t.candidateStatus === 'voting' && <button disabled={busy} className={'btn ' + (t.votes?.[member.uid] ? 'primary' : 'subtle')} aria-pressed={!!t.votes?.[member.uid]} onClick={() => void run(() => updateMusicTrack(playlist.id, t.id, { [`votes.${member.uid}`]: !t.votes?.[member.uid] }))}>{t.votes?.[member.uid] ? '투표 취소' : '연주하고 싶어요'}</button>}
      {member?.admin && t.candidateStatus !== 'selected' && <div className="music-tabs">
        {t.candidateStatus !== 'voting' && <button className="btn subtle" disabled={busy} onClick={() => void run(() => updateMusicTrack(playlist.id, t.id, { candidateStatus: 'voting' }))}>투표 대상 확정</button>}
        {t.candidateStatus === 'voting' && <button className="btn primary" disabled={busy} onClick={() => void run(async () => { await updateMusicTrack(playlist.id, t.id, { candidateStatus: 'selected' }); toast.show('선정곡에 연결했어요') })}>최종 선정</button>}
        <button className="btn subtle" disabled={busy} onClick={() => void run(() => updateMusicTrack(playlist.id, t.id, { candidateStatus: t.candidateStatus === 'held' ? 'review' : 'held' }))}>{t.candidateStatus === 'held' ? '다시 검토' : '보류'}</button>
      </div>}
    </article>)}</div>
    {!candidates.some((t) => t.candidateStatus === filter) && <p className="setlist-empty">이 단계의 추천곡이 없어요.</p>}
    <h3>곡 추천하기</h3><div className="field"><label htmlFor="candidate-url">유튜브 링크</label><input id="candidate-url" value={url} onInput={(e) => setUrl(e.currentTarget.value)} /></div><div className="field"><label htmlFor="candidate-title">곡 제목</label><input id="candidate-title" value={title} onInput={(e) => setTitle(e.currentTarget.value)} /></div><div className="field"><label htmlFor="candidate-reason">추천 이유</label><textarea id="candidate-reason" value={reason} onInput={(e) => setReason(e.currentTarget.value)} /></div>
    <button className="btn primary" disabled={busy || !member || !title.trim() || !parseVideoId(url)} onClick={() => void run(async () => { const videoId = parseVideoId(url)!; if (tracks.some((t) => t.videoId === videoId)) { setError('이미 프로젝트에 등록된 영상이에요.'); return } await saveTrack(playlist.id, { id: newId(), url: url.trim(), videoId, title: title.trim(), artist: '', thumbnail: thumbnailUrl(videoId), addedBy: member!.uid, addedByName: member!.name, addedAt: Date.now(), candidateStatus: 'review', recommendation: reason.trim() }); setUrl(''); setTitle(''); setReason(''); setFilter('review') })}>추천 등록</button>
  </main>
}

function Review({ track, disabled, onSave }: { track: Track; disabled: boolean; onSave: (result: string, note: string) => void }) {
  const { member } = useAuth()
  const prior = member ? track.reviews?.[member.uid] : undefined
  const [result, setResult] = useState(prior?.result || '가능')
  const [note, setNote] = useState(prior?.note || '')
  return <div className="field"><label>내 검토 의견 <select value={result} onChange={(e) => setResult(e.target.value)}>{['가능', '조건부 가능', '어려움', '해당 없음'].map((value) => <option key={value}>{value}</option>)}</select></label><input aria-label="검토 조건과 의견" placeholder="편곡·인원·연습 기간 등" value={note} onInput={(e) => setNote(e.currentTarget.value)} /><button className="btn subtle" disabled={disabled} onClick={() => onSave(result, note.trim())}>의견 저장</button></div>
}
