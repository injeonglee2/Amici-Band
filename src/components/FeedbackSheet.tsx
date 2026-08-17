import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { newId, submitFeedback, uploadFeedbackImage } from '../data'
import { compressImage } from '../image'
import { APP_VERSION, BUILD_TIME } from '../version'
import Sheet from './Sheet'
import { useBackHandler } from '../backnav'
import type { ToastState } from './Toast'
import type { Feedback } from '../types'

const TYPES: { value: Feedback['type']; label: string }[] = [
  { value: 'bug', label: '버그' },
  { value: 'idea', label: '개선 제안' },
  { value: 'etc', label: '기타' },
]
const MAX_IMAGES = 5

/** 버그 제보·개선 의견 제출 시트. 유형·내용 + 사진(여러 장). 앱 버전·기기 정보는 자동 첨부. */
export default function FeedbackSheet({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const { user, member } = useAuth()
  useBackHandler(onClose)
  const [type, setType] = useState<Feedback['type']>('bug')
  const [text, setText] = useState('')
  const [pics, setPics] = useState<{ file: File; preview: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 미리보기 objectURL 정리
  useEffect(() => () => pics.forEach((p) => URL.revokeObjectURL(p.preview)), [pics])

  function addFiles(list: FileList | null) {
    if (!list) return
    const added = [...list]
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ file: f, preview: URL.createObjectURL(f) }))
    setPics((prev) => {
      const merged = [...prev, ...added]
      merged.slice(MAX_IMAGES).forEach((p) => URL.revokeObjectURL(p.preview)) // 초과분 정리
      return merged.slice(0, MAX_IMAGES)
    })
  }
  function removePic(i: number) {
    setPics((prev) => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  async function submit() {
    if (!text.trim() || busy || !user) return
    setBusy(true)
    setErr('')
    try {
      const id = newId()
      const images: { url: string; path: string }[] = []
      for (let i = 0; i < pics.length; i++) {
        setProgress(`사진 올리는 중 ${i + 1}/${pics.length}`)
        const blob = await compressImage(pics[i].file) // 업로드 전 리사이즈·압축(1600px·0.7)
        const name = pics[i].file.name.replace(/\.[^.]+$/, '') + '.jpg'
        images.push(await uploadFeedbackImage(id, blob, i, name))
      }
      setProgress('보내는 중…')
      await submitFeedback({
        id,
        type,
        text: text.trim(),
        status: 'new',
        ...(images.length ? { images } : {}),
        appVersion: APP_VERSION,
        buildTime: BUILD_TIME,
        userAgent: navigator.userAgent,
        createdBy: user.uid,
        createdByName: member?.name,
        createdAt: Date.now(),
      })
      toast.show('의견을 보냈어요. 고마워요!')
      onClose()
    } catch (e) {
      const code = (e as { code?: string })?.code ?? ''
      setErr(
        code === 'permission-denied'
          ? '전송 권한이 없어요.'
          : '전송에 실패했어요.' + (code ? ` (${code})` : ''),
      )
      console.error(e)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h2>의견 보내기</h2>

      <div className="field">
        <label>유형</label>
        <div className="fb-types">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={'fb-type' + (type === t.value ? ' on' : '')}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="fb-text">내용</label>
        <textarea id="fb-text" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1000} autoFocus />
      </div>

      <div className="field">
        <label>사진 (선택)</label>
        <div className="fb-pics">
          {pics.map((p, i) => (
            <div key={i} className="fb-pic">
              <img src={p.preview} alt="" />
              <button type="button" className="fb-pic-x" onClick={() => removePic(i)} aria-label="사진 제거">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          {pics.length < MAX_IMAGES && (
            <button type="button" className="fb-pic-add" onClick={() => fileRef.current?.click()} aria-label="사진 추가">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></svg>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {err && <p className="err small">{err}</p>}

      <div className="actions">
        <button type="button" className="btn primary" onClick={submit} disabled={!text.trim() || busy}>
          {busy ? progress || '보내는 중…' : '보내기'}
        </button>
        <button type="button" className="btn subtle" onClick={onClose} disabled={busy}>닫기</button>
      </div>
    </Sheet>
  )
}
