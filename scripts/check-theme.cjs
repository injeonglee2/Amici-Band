#!/usr/bin/env node
/**
 * 테마 토큰 검사 — src/styles.css 에 색상 리터럴(#hex, rgb/rgba, hsl)이 토큰 블록 밖에 쓰이면 빌드를 막는다.
 *
 * 색은 반드시 :root 토큰(--accent, --surface, --ink …)이나 그 파생(color-mix(var(--accent) …))으로 쓴다.
 * 그래야 라이트/다크, 밴드/개인/친구 템플릿이 토큰만 바꿔 일관된 화면을 만든다. (docs/UI-CONSISTENCY.md "테마 토큰" 참고)
 *
 * 예외가 꼭 필요한 줄(사진 위 오버레이, 종이 질감 메모, 러닝 무지개 범례처럼 테마와 무관한 고정 색)은
 * 같은 줄에 `/* literal-ok: 이유 *\/` 를 적거나, 블록을 `/* literal-ok-start: 이유 *\/` … `/* literal-ok-end *\/` 로 감싼다.
 */
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'src', 'styles.css')
const lines = fs.readFileSync(file, 'utf8').split('\n')
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const offenders = []
let inRoot = false
let inAllowBlock = false
lines.forEach((line, index) => {
  if (/^:root\s*\{/.test(line)) inRoot = true
  if (inRoot) { if (/^\}/.test(line)) inRoot = false; return }
  if (/literal-ok-start/.test(line)) { inAllowBlock = true; return }
  if (/literal-ok-end/.test(line)) { inAllowBlock = false; return }
  if (inAllowBlock || /literal-ok/.test(line)) return
  if (LITERAL.test(line)) offenders.push(`${index + 1}: ${line.trim().slice(0, 110)}`)
})

if (offenders.length) {
  console.error(`[theme] styles.css 에 토큰이 아닌 색상 리터럴 ${offenders.length}곳 — var(--토큰) 또는 color-mix(var(--토큰) …) 로 바꾸세요.`)
  console.error(offenders.join('\n'))
  process.exit(1)
}
console.log('[theme] ok — styles.css 색상은 모두 토큰 기반입니다.')
