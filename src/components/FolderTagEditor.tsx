import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { watchEventTypes } from '../data'
import type { CustomEventType } from '../types'
import { EventIcon } from '../eventIcons'
import { typeVars } from '../colors'

/** 폴더 상세 인라인 편집에서 일정 유형 태그를 고르는 컨트롤. 유형이 없으면 아무것도 렌더하지 않는다. */
export function FolderTagEditor({ tagId, onChange }: { tagId: string; onChange: (id: string) => void }) {
  const [tags, setTags] = useState<CustomEventType[]>([])
  useEffect(() => watchEventTypes(setTags, () => {}), [])
  if (tags.length === 0) return null
  return (
    <div className="folder-tag-edit">
      <span className="folder-tag-edit-label">태그</span>
      <div className="ps-type-pick">
        <button type="button" className="ps-type-opt" aria-pressed={!tagId} onClick={() => onChange('')}>태그 없음</button>
        {tags.map((t) => (
          <button key={t.id} type="button" className="ps-type-opt" aria-pressed={tagId === t.id} style={typeVars(t.color) as CSSProperties} onClick={() => onChange(t.id)}>
            <EventIcon id={t.emoji} className="type-ico" />{t.name}
          </button>
        ))}
      </div>
    </div>
  )
}
