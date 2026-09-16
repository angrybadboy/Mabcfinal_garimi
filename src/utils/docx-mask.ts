/**
 * DOCX 원본 XML을 직접 편집하여 마스킹 사본을 생성한다.
 *
 * 목적:
 *  - docx 라이브러리로 새 문서를 만들지 않고, 원본의 word/document.xml만 편집해
 *    표·이미지·머리말·꼬리말·폰트·페이지 설정 등 원본 서식을 최대한 보존한다.
 *  - 처리 방법 4종(전체·가림·삭제·유지)을 사본에 정확히 반영한다.
 *  - 삭제 처리 시 레이아웃 붕괴를 막기 위해 원문을 빈 문자열이 아닌 전각 공백(U+3000)
 *    1개로 대체하고, 문단/표 셀 단위로 앞뒤 공백을 정리한다.
 *  - 사본 생성 후 detectResidualPII로 개인정보 잔존 여부를 검사한다.
 */

import JSZip from 'jszip'
import type { MaskingCandidate, MaskingMethod, InfoType } from '@/types'
import { DEFAULT_METHOD_BY_TYPE } from '@/types'

// ── 처리 방법 랭크 (높을수록 강하게 처리) ───────────────────────────────

function rank(method: MaskingMethod): number {
  return method === 'delete' ? 4 : method === 'full' ? 3 : method === 'partial' ? 2 : 1
}

// ── 후보별 처리 결정 (같은 값에 대해 강한 처리 우선) ──────────────────

function resolveMethod(candidate: MaskingCandidate): { method: MaskingMethod; replacement: string } {
  if (candidate.method === 'delete') {
    // 레이아웃 붕괴 방지: 빈 문자열 대신 전각 공백 1개
    return { method: 'delete', replacement: '\u3000' }
  }
  if (candidate.method === 'full') {
    return { method: 'full', replacement: '\u2022'.repeat(Math.max(candidate.value.length, 4)) }
  }
  if (candidate.method === 'partial') {
    if (candidate.customReplacement) {
      return { method: 'partial', replacement: candidate.customReplacement }
    }
    // 프리셋 없는 기본: 타입별 기본 일부 가림
    return { method: 'partial', replacement: applyDefaultPartialPreset(candidate.value, candidate.type) }
  }
  // keep: 원문 유지
  return { method: 'keep', replacement: candidate.value }
}

/** 일부 가림 프리셋이 없을 때 기본 대체 — 유형별로 다른 패턴 */
function applyDefaultPartialPreset(value: string, type: InfoType): string {
  // 전화번호: 010-XXXX-XXXX 또는 02-XXXX-XXXX 형태 → 중간 가림
  if (type === 'phone') {
    return value.replace(/^\d{2,3}-\d{3,4}-(\d{4})$/, '****-$1')
  }
  // 이메일: 앞부분 일부 + 도메인 마스킹
  if (type === 'email') {
    const atIdx = value.indexOf('@')
    if (atIdx > 1) {
      return value.slice(0, Math.min(atIdx, 3)) + '****@*****.***'
    }
    return '****@*****.***'
  }
  // 여권번호(P로 시작하는 영숫자), 운전면허(숫자 위주): 앞 2자 + 중간 **** + 뒤 2~4자
  if (type === 'passport' || type === 'driverLicense') {
    if (value.length >= 6) {
      return value.slice(0, 2) + '****' + value.slice(-2)
    }
    return '****'
  }
  // 생년월일: 앞 4자리(연도) + 중간 **** + 끝 2자리(월일 앞)
  if (type === 'birthDate') {
    return value.replace(/^(\d{4})[-.](\d{2})[-.](\d{2})$/, '$1-**-**')
  }
  // 계좌번호, 카드번호 등 숫자 위주 긴 값: 앞 4자리 + **** + 뒤 4자리
  if (/^\d/.test(value) && value.length >= 8) {
    return value.slice(0, 4) + '****' + value.slice(-4)
  }
  // 그 외 기본: 앞 2자 + ****
  if (value.length >= 3) {
    return value.slice(0, 2) + '****'
  }
  return '****'
}

/** 텍스트 정규화: 다양한 대시 문자를 일반 하이픈으로 통일, 공백 정규화 */
function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFF0D]/g, '-') // 다양한 대시 → 하이픈
    .replace(/\s+/g, ' ') // 공백 정리
    .trim()
}

// ── 값 → 최종 처리 결정 맵 (강한 처리 우선) ──────────────────────────

function buildValueDecision(candidates: MaskingCandidate[]): Map<string, { method: MaskingMethod; replacement: string }> {
  const map = new Map<string, { method: MaskingMethod; replacement: string }>()

  for (const c of candidates) {
    const val = c.value
    if (!val) continue
    const existing = map.get(val)
    if (!existing) {
      map.set(val, resolveMethod(c))
      continue
    }
    if (rank(c.method) > rank(existing.method)) {
      map.set(val, resolveMethod(c))
    }
  }

  return map
}

/** 텍스트 정규화: 다양한 대시 문자를 일반 하이픈으로 통일, 공백 정리 */
function normalizeText(text: string): string {
  return text
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFF0D]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── word/document.xml에서 마스킹 대상 텍스트 교체 ──────────────────────
// XML에서 <w:t> 요소 안의 텍스트만 대상으로 하며, 속성/태그 구조는 건드리지 않는다.
// 구조 훼손을 막기 위해 정규식으로 <w:t ...>텍스트</w:t> 패턴을 찾아 텍스트 부분만 교체한다.
// 값 매칭은 normalizeText 기준으로 수행하여, 대시 문자 차이 등으로 인한 불일치를 방지한다.

function maskDocumentXml(xml: string, decisionMap: Map<string, { method: MaskingMethod; replacement: string }>): string {
  if (decisionMap.size === 0) return xml

  // 정규화된 값 기준으로 정렬 (긴 값 우선)
  const normalizedEntries = [...decisionMap.entries()]
    .map(([value, decision]) => ({
      normalized: normalizeText(value),
      original: value,
      decision,
    }))
    .filter(e => e.normalized.length > 0)
    .sort((a, b) => b.normalized.length - a.normalized.length)

  let modifiedCount = 0

  const result = xml.replace(/<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g, (fullMatch, attrs, textContent) => {
    let modified = textContent
    let changed = false

    for (const { normalized, decision } of normalizedEntries) {
      if (decision.method === 'keep') continue
      const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(escaped, 'g')
      if (regex.test(modified)) {
        const replacement = decision.method === 'delete' ? '\u3000' : decision.replacement
        modified = modified.replace(regex, replacement)
        changed = true
      }
    }

    if (changed) {
      modifiedCount++
      if (modifiedCount <= 3) {
        console.log('[docx-mask] 마스킹된 <w:t>:', JSON.stringify(textContent), '→', JSON.stringify(modified))
      }
      return `<w:t${attrs}>${modified}</w:t>`
    }
    return fullMatch
  })

  // 삭제·일부 가림 이후 연속된 전각 공백 정리 (최대 2개 → 1개)
  const cleaned = result.replace(/\u3000{2,}/g, '\u3000')

  console.log('[docx-mask] 마스킹된 <w:t> 요소 수:', modifiedCount)
  return cleaned
}

/** xml 문자 이스케이프용 regex-safe escaping */
function escapeXmlRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── DOCX 마스킹 사본 생성 ────────────────────────────────────────────

export async function createMaskedDocx(
  originalFile: File,
  candidates: MaskingCandidate[],
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(originalFile)

  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) {
    throw new Error('DOCX에서 word/document.xml을 찾을 수 없습니다.')
  }

  const xml = await docXmlFile.async('string')
  const decisionMap = buildValueDecision(candidates)
  const maskedXml = maskDocumentXml(xml, decisionMap)

  // 원본 ZIP의 다른 파일들은 그대로 유지, word/document.xml만 교체
  const newZip = new JSZip()
  for (const [path, file] of Object.entries(zip.files)) {
    if (path === 'word/document.xml') {
      newZip.file(path, maskedXml)
    } else if (!file.dir) {
      const data = await file.async('uint8array')
      newZip.file(path, data)
    }
  }

  return newZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/**
 * DOCX 문서에서 <w:t> 텍스트 노드만 추출하여 하나의 문자열로 연결한다.
 * 사본 생성 후 detectResidualPII로 개인정보 잔존 여부를 검사할 때 사용한다.
 */
export async function extractTextFromDocx(docxBytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(docxBytes)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) return ''

  // <w:t> 태그 텍스트만 추출 (속성 유무 관계없이 매칭)
  const textParts: string[] = []
  const tagRegex = /<w:t\b[^>]*>([^<]*)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = tagRegex.exec(xml)) !== null) {
    textParts.push(m[1])
  }
  return textParts.join(' ')
}

/**
 * DOCX 문서를 Uint8Array → File 객체로 변환한다.
 * export-masked 라우터에서 base64로 받은 DOCX 원본을 File로 복원할 때 사용한다.
 */
export function docxBytesToFile(bytes: Uint8Array, fileName: string): File {
  return new File([bytes.slice(0)], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}
