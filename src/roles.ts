/**
 * 앱 개발자(최상위 권한자) 판별.
 * 밴드 관리자(member.admin)와는 별개의 전역 권한으로, 받은 의견 열람 등
 * '개발자 전용' 기능에만 쓰인다. 현재 개발자는 이인정 한 명.
 */
export const DEVELOPER_EMAILS = ['kkd00055@gmail.com']

export function isDeveloperEmail(email?: string | null): boolean {
  if (!email) return false
  return DEVELOPER_EMAILS.includes(email.toLowerCase())
}
