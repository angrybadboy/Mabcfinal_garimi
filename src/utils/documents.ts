/**
 * 문서 마스킹 관련 유틸
 */

/**
 * 문서 콘텐츠에서 개인정보 패턴을 찾아 마스킹 처리하는 함수 (프론트 미리보기용)
 */
export function getMaskedContent(content: string): string {
  return content
    // 전화번호: 010-XXXX-XXXX 또는 02-XXXX-XXXX 등
    .replace(/(01[016789]-\d{3,4}-\d{4})|(0[2-9]-\d{3,4}-\d{4})/g, (match) => {
      return match.replace(/\d{3,4}(?=-\d{4})/, '****')
    })
    // 이메일
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '****@*****.***')
    // 주민등록번호
    .replace(/\b\d{6}[-]\d{7}\b/g, '******-*******')
    // 생년월일
    .replace(/\b(19|20)\d{2}[-.]\d{2}[-.]\d{2}\b/g, (match) => {
      return match.replace(/\d{2}[-.]\d{2}$/, '-**-**')
    })
    // 이름 패턴 (간단한 한글 2~4자) — 참고용
    .replace(/[가-힣]{2,4}/g, (match) => {
      return '***'
    })
}

/**
 * DOCX 마스킹 사본 생성에 사용할 마스킹 값 계산
 * 후보별 처리 방법(method)에 따라 maskedValue를 결정
 */
export function computeMaskedValue(
  value: string,
  method: 'full' | 'partial' | 'delete' | 'keep',
  customReplacement?: string,
): string {
  if (method === 'full') {
    return '•'.repeat(Math.max(value.length, 4))
  }
  if (method === 'delete') {
    return '' // 원문에서 제거 — 대체 문자열 없음(위치 제거용)
  }
  if (method === 'partial' && customReplacement) {
    return customReplacement
  }
  if (method === 'partial') {
    // 프리셋이 없는 경우 기본: 가운데 번호 가리기 스타일 (전화번호/숫자 가정)
    return applyDefaultPartialPreset(value)
  }
  // keep: 원문 유지 — 원문을 그대로 둠 (사본 생성 시 바꾸지 않음)
  return value
}

/**
 * 일부 가림 프리셋이 없을 때 쓰는 기본 대체 (전화번호 스타일 가정)
 */
function applyDefaultPartialPreset(value: string): string {
  // XXX-XXXX-XXXX 또는 XX-XXXX-XXXX 형태면 중간 가림
  return value.replace(/^\d{3,4}-/, '****-').replace(/-(\d{4})$/, '-$1')
}

/**
 * DOCX 본문 텍스트에서 후보 값들을 찾아 마스킹한 새 텍스트를 만든다.
 * 값 기반 대체이므로 위치가 아닌 문자열을 기준으로 처리한다.
 *
 * - method=delete: 해당 값을 제거 (빈 문자열로 치환, 주변 공백 정리)
 * - method=full/partial: 마스킹값으로 치환
 * - method=keep: 마스킹하지 않음 (원문 유지)
 *
 * 같은 값이 여러 후보에서 다르게 지정될 수 있으므로, 후보 배열을 받아
 * value별로 최종 처리 방법을 결정하며, 동일 값에 대해 더 강한 처리(delete>full>partial>keep)를 우선한다.
 */
export function applyMaskingToText(
  text: string,
  candidates: Array<{
    value: string
    method: 'full' | 'partial' | 'delete' | 'keep'
    maskedValue?: string
    customReplacement?: string
  }>,
): string {
  if (!text || candidates.length === 0) return text

  // value → 최종 처리 결정 (강한 처리 우선)
  const resolved = new Map<string, { method: string; replacement: string }>()

  for (const c of candidates) {
    const val = c.value
    if (!val) continue
    const existing = resolved.get(val)
    if (!existing) {
      resolved.set(val, resolveMethod(c))
      continue
    }
    // 더 강한 처리로 업그레드 (delete > full > partial > keep)
    if (rank(c.method) > rank(existing.method)) {
      resolved.set(val, resolveMethod(c))
    }
  }

  // 긴 값부터 대체 (부분 일치 방지)
  const sorted = [...resolved.entries()].sort((a, b) => b[0].length - a[0].length)

  let result = text
  for (const [val, decision] of sorted) {
    if (decision.method === 'delete') {
      // 값 제거 후 공백 정리 (연속 공백 → 단일 공백, 양끝 공백 제거는 문단 단위에서 처리)
      result = result.replaceAll(val, '')
      result = result.replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '')
    } else if (decision.method === 'full' || decision.method === 'partial') {
      result = result.replaceAll(val, decision.replacement)
    }
    // keep이면 대체하지 않음
  }

  return result
}

/**
 * 처리 방법별 랭크 (높을수록 강하게 처리)
 */
function rank(method: string): number {
  return method === 'delete' ? 4 : method === 'full' ? 3 : method === 'partial' ? 2 : 1
}

/**
 * 후보 한 개의 처리 결정을 resolved 형태로 변환
 */
function resolveMethod(c: {
  method: 'full' | 'partial' | 'delete' | 'keep'
  value: string
  customReplacement?: string
}): { method: string; replacement: string } {
  if (c.method === 'delete') {
    return { method: 'delete', replacement: '' }
  }
  if (c.method === 'full') {
    return { method: 'full', replacement: '•'.repeat(Math.max(c.value.length, 4)) }
  }
  if (c.method === 'partial') {
    if (c.customReplacement) {
      return { method: 'partial', replacement: c.customReplacement }
    }
    return { method: 'partial', replacement: applyDefaultPartialPreset(c.value) }
  }
  return { method: 'keep', replacement: c.value }
}

/**
 * 문서 속성에서 삭제할 키 목록과 유지할 값을 결정한다.
 * propertyDeletions: 키→삭제여부 레코드. delete=true면 속성 값을 비운다(삭제).
 */
export function applyDocumentProperties(
  properties: Array<{ key: string; label: string; value: string }>,
  propertyDeletions: Record<string, boolean>,
): Array<{ key: string; label: string; value: string; deleted: boolean }> {
  return properties.map((p) => ({
    ...p,
    deleted: !!propertyDeletions[p.key],
    value: propertyDeletions[p.key] ? '' : p.value,
  }))
}

/**
 * 마스킹된 DOCX 본문 텍스트에서 개인정보 패턴이 남아있는지 검사한다.
 * 검출되면 잔류값 목록을 반환한다.
 */
export function detectResidualPII(text: string): Array<{ type: string; value: string }> {
  const results: Array<{ type: string; value: string }> = []
  const patterns: Array<{ type: string; regex: RegExp }> = [
    { type: 'phone', regex: /(01[016789]-\d{3,4}-\d{4})|(0[2-9]-\d{3,4}-\d{4})/g },
    { type: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { type: 'ssn', regex: /\b\d{6}[-]\d{7}\b/g },
    { type: 'birthDate', regex: /\b(19|20)\d{2}[-.]\d{2}[-.]\d{2}\b/g },
  ]

  for (const p of patterns) {
    let m: RegExpExecArray | null
    // g 플래그로 반복 찾기, 마지막Index 꼬임 방지 위해 새 regex 사용
    const regex = new RegExp(p.regex.source, p.regex.flags.includes('g') ? 'g' : 'g')
    while ((m = regex.exec(text)) !== null) {
      const v = m[0]
      if (v && !results.some((r) => r.value === v)) {
        results.push({ type: p.type, value: v })
      }
    }
  }

  return results
}
