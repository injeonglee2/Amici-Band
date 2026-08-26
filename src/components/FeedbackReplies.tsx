import { useEffect, useRef, useState } from 'react'
import { newId, submitFeedbackReply, uploadFeedbackReplyImage, watchFeedbackReplies } from '../data'
import { compressImage } from '../image'
import { useAuth } from '../auth'
import type { FeedbackReply } from '../types'
import type { ToastState } from './Toast'

const MAX_IMAGES = 5

const when = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function FeedbackReplyList({ feedbackId }: { feedbackId: string }) {
  const [replies, setReplies] = useState<FeedbackReply[]>([])
  useEffect(() => watchFeedbackReplies(feedbackId, setReplies, () => {}), [feedbackId])
  if (replies.length === 0) return null
  return (
    <div className="fb-replies" aria-label="개발자 답변">
      {replies.map((reply) => (
        <article key={reply.id} className="fb-reply">
          <div className="fb-reply-head"><b>답변</b><span>{reply.createdByName ?? '개발자'} · {when(reply.createdAt)}</span></div>
          <p>{reply.text}</p>
          {reply.images && reply.images.length > 0 && (
            <div className="fb-thumbs">
              {reply.images.map((image, index) => (
                <a key={index} href={image.url} target="_blank" rel="noopener noreferrer" className="fb-thumb">
                  <img src={image.url} alt={`답변 첨부 ${index + 1}`} loading="lazy" />
                </a>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

export function FeedbackReplyComposer({ feedbackId, toast }: { feedbackId: string; toast: ToastState }) {
  const { user, member } = useAuth()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [pics, setPics] = useState<{ file: File; preview: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const picsRef = useRef(pics)
  picsRef.current = pics

  useEffect(() => () => picsRef.current.forEach((pic) => URL.revokeObjectURL(pic.preview)), [])

  function addFiles(files: FileList | null) {
    if (!files) return
    const added = [...files].filter((file) => file.type.startsWith('image/')).map((file) => ({ file, preview: URL.createObjectURL(file) }))
    setPics((before) => {
      const merged = [...before, ...added]
      merged.slice(MAX_IMAGES).forEach((pic) => URL.revokeObjectURL(pic.preview))
      return merged.slice(0, MAX_IMAGES)
    })
  }

  function removePic(index: number) {
    setPics((before) => {
      URL.revokeObjectURL(before[index].preview)
      return before.filter((_, i) => i !== index)
    })
  }

  async function submit() {
    if (!user || !text.trim() || busy) return
    setBusy(true)
    try {
      const id = newId()
      const images: { url: string; path: string }[] = []
      for (let i = 0; i < pics.length; i++) {
        setProgress(`사진 ${i + 1}/${pics.length}`)
        const blob = await compressImage(pics[i].file)
        const name = pics[i].file.name.replace(/\.[^.]+$/, '') + '.jpg'
        images.push(await uploadFeedbackReplyImage(feedbackId, id, blob, i, name))
      }
      setProgress('등록 중…')
      await submitFeedbackReply(feedbackId, {
        id,
        text: text.trim(),
        ...(images.length ? { images } : {}),
        createdBy: user.uid,
        createdByName: member?.name ?? '개발자',
        createdAt: Date.now(),
      })
      pics.forEach((pic) => URL.revokeObjectURL(pic.preview))
      setPics([])
      setText('')
      setOpen(false)
      toast.show('답변을 등록했어요.')
    } catch (error) {
      console.error(error)
      toast.show('답변 등록에 실패했어요.')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  if (!open) return <button type="button" className="btn subtle fb-reply-open" onClick={() => setOpen(true)}>답장</button>
  return (
    <div className="fb-reply-compose">
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={1000} placeholder="답변 내용을 입력하세요" autoFocus />
      <div className="fb-pics">
        {pics.map((pic, index) => (
          <div key={pic.preview} className="fb-pic">
            <img src={pic.preview} alt="" />
            <button type="button" className="fb-pic-x" onClick={() => removePic(index)} aria-label="사진 제거">×</button>
          </div>
        ))}
        {pics.length < MAX_IMAGES && <button type="button" className="fb-pic-add compact" onClick={() => fileRef.current?.click()} aria-label="답변 사진 추가">＋ 사진</button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
      <div className="fb-reply-actions">
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={!text.trim() || busy}>{busy ? progress || '등록 중…' : '답변 등록'}</button>
        <button type="button" className="btn subtle" onClick={() => setOpen(false)} disabled={busy}>취소</button>
      </div>
    </div>
  )
}
