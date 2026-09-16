import { NextRequest, NextResponse } from 'next/server'
import { writeFile, readFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import type { DocumentInfo, MaskingCandidate, PageContent, DocumentType, InfoType } from '@/types'
import { DEFAULT_METHOD_BY_TYPE } from '@/types'

const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY
const UPSTAGE_API_BASE = 'https://api.upstage.ai/v1'
const TMP_DIR = join(process.cwd(), 'tmp')

async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // 이미 존재
  }
}

function fileTypeFromExt(ext: string): 'pdf' | 'docx' | 'txt' {
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx' || ext === 'doc') return 'docx'
  return 'txt'
}

function getMimeType(ext: string): string {
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc': return 'application/msword'
    case 'txt': return 'text/plain'
    default: return 'application/octet-stream'
  }
}

// ── ParsedElement: 구조 정보를 보존한 파싱 요소 ──────────────────────────────

interface ParsedElement {
  type: 'text' | 'heading' | 'list' | 'table'
  text: string
  page: number
  bBox?: { left: number; top: number; right: number; bottom: number }
  tableInfo?: {
    rows: number
    cols: number
    cellTexts: string[][]   // [row][col]
    cellValues: string[]   // 평문 순서가 필요할 때 사용
  }
}

/** Upstage elements 배열에서 구조 정보를 보존하여 ParsedElement[]로 변환 */
function extractElements(parsed: any): ParsedElement[] {
  const out: ParsedElement[] = []
  if (!parsed.elements || !Array.isArray(parsed.elements)) return out

  // 테이블 요소와 일반 요소 분리
  const tableMap = new Map<string, ParsedElement>()

  for (const el of parsed.elements) {
    const type = el.type as string | undefined
    const bBox = el.boundingBox || el.box || undefined
    let contentText = ''
    if (typeof el.content === 'string') contentText = el.content
    else if (el.content && typeof el.content === 'object') {
      if (typeof el.content.text === 'string') contentText = el.content.text
      else if (typeof el.content.value === 'string') contentText = el.content.value
      else if (typeof el.content.body === 'string') contentText = el.content.body
    }

    const page = typeof el.page === 'number' ? el.page : 0
    const elType: 'text' | 'heading' | 'list' | 'table' =
      type === 'heading' ? 'heading' : type === 'list' ? 'list' : type === 'table' ? 'table' : 'text'

    if (elType === 'table') {
      const tableId = el.id || el.tableId || `table-${out.length}`
      const cells: Array<{ text: string; row: number; col: number }> = []

      // 동일 테이블 ID를 가진 셀 요소들 찾기
      for (const sub of parsed.elements) {
        if (sub.type === 'tableCell' && (sub.tableId === tableId || sub.chunkId === tableId)) {
          let cellText = ''
          if (typeof sub.content === 'string') cellText = sub.content
          else if (sub.content && typeof sub.content === 'object' && typeof sub.content.text === 'string') {
            cellText = sub.content.text
          }
          cells.push({
            text: cellText,
            row: sub.position?.row ?? cells.length,
            col: sub.position?.col ?? 0,
          })
        }
      }

      // 셀들을 행×열 2차원 배열로 구성
      const maxRow = Math.max(1, ...cells.map(c => c.row))
      const maxCol = Math.max(1, ...cells.map(c => c.col))
      const grid: string[][] = Array.from({ length: maxRow }, () => Array(maxCol).fill(''))
      const flatValues: string[] = []
      for (const c of cells) {
        grid[c.row][c.col] = c.text
        flatValues.push(c.text)
      }

      tableMap.set(tableId, {
        type: 'table',
        text: flatValues.join('\n'),
        page,
        bBox,
        tableInfo: {
          rows: maxRow,
          cols: maxCol,
          cellTexts: grid,
          cellValues: flatValues,
        },
      })
    } else {
      out.push({ type: elType, text: contentText, page, bBox })
    }
  }

  // 테이블 요소들을 결과 맨 앞에 추가
  for (const t of tableMap.values()) {
    out.unshift(t)
  }

  return out
}

/** 구조 정보로부터 평면 텍스트 생성 (AI 분석용) */
function elementsToText(elements: ParsedElement[]): string {
  const parts: string[] = []
  for (const el of elements) {
    if (el.type === 'heading') {
      parts.push(`\n# ${el.text}\n`)
    } else if (el.type === 'list') {
      parts.push(`- ${el.text}`)
    } else if (el.type === 'table') {
      // 표 내용을 행 단위로 표현 (테이블 경계 표시)
      parts.push(`[표 시작]`)
      if (el.tableInfo) {
        for (const row of el.tableInfo.cellTexts) {
          parts.push(row.join(' | '))
        }
      } else {
        parts.push(el.text)
      }
      parts.push(`[표 끝]`)
    } else {
      if (el.text.trim()) parts.push(el.text)
    }
  }
  return parts.join('\n\n')
}

/** 구조 정보로부터 페이지별 PageContent 생성 */
function elementsToPages(elements: ParsedElement[]): PageContent[] {
  const pageMap = new Map<number, string[]>()
  for (const el of elements) {
    const pg = pageMap.get(el.page) || pageMap.get(0) || []
    if (!pageMap.has(el.page)) pageMap.set(el.page, pg)
    const target = pageMap.get(el.page)!
    if (el.type === 'table') {
      target.push(`[표: ${el.tableInfo?.rows || '?'}행 × ${el.tableInfo?.cols || '?'}열]`)
      if (el.tableInfo) {
        for (const row of el.tableInfo.cellTexts) {
          target.push(row.join(' | '))
        }
      }
      target.push('')
    } else if (el.type === 'heading') {
      target.push(`# ${el.text}`)
    } else if (el.type === 'list') {
      target.push(`- ${el.text}`)
    } else if (el.text.trim()) {
      target.push(el.text)
    }
  }

  // 페이지 번호 순서대로 정렬
  const sortedPages = [...pageMap.entries()].sort((a, b) => a[0] - b[0])
  return sortedPages.map(([pageNum, texts]) => ({
    pageNumber: pageNum + 1,
    text: texts.join('\n\n').trim(),
    hasImage: false,
  }))
}

// ── 규칙 기반 후보 추출 (AI off 또는 백업) ──────────────────────────

function extractCandidatesWithRules(
  content: string,
  pages: PageContent[],
): MaskingCandidate[] {
  const candidates: MaskingCandidate[] = []
  let idCounter = 0

  for (const page of pages) {
    const text = page.text
    if (!text) continue

    // 전화번호
    const phoneRegex = /(01[016789]-\d{3,4}-\d{4})|(0[2-9]-\d{3,4}-\d{4})/g
    let match
    while ((match = phoneRegex.exec(text)) !== null) {
      const value = match[0]
      candidates.push(makeCandidate(`phone-${idCounter++}`, 'phone', value, page.pageNumber, match.index, match.index + value.length))
    }

    // 이메일
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.\w{2,}/g
    while ((match = emailRegex.exec(text)) !== null) {
      const value = match[0]
      candidates.push(makeCandidate(`email-${idCounter++}`, 'email', value, page.pageNumber, match.index, match.index + value.length))
    }

    // 주민등록번호
    const ssnRegex = /\b\d{6}[-]\d{7}\b/g
    while ((match = ssnRegex.exec(text)) !== null) {
      const value = match[0]
      candidates.push(makeCandidate(`ssn-${idCounter++}`, 'ssn', value, page.pageNumber, match.index, match.index + value.length))
    }

    // 생년월일
    const birthRegex = /\b(19|20)\d{2}[-.]\d{2}[-.]\d{2}\b/g
    while ((match = birthRegex.exec(text)) !== null) {
      const value = match[0]
      candidates.push(makeCandidate(`birth-${idCounter++}`, 'birthDate', value, page.pageNumber, match.index, match.index + value.length))
    }
  }

  return candidates
}

function makeCandidate(id: string, type: string, value: string, page: number, start: number, end: number): MaskingCandidate {
  const t = type as InfoType
  return {
    id,
    type: t,
    value,
    maskedValue: maskValue(type, value),
    positions: [{ page, start, end }],
    method: DEFAULT_METHOD_BY_TYPE[t] ?? 'full',
    confirmed: false,
    skipped: false,
  }
}

function maskValue(type: string, value: string): string {
  switch (type) {
    case 'phone': return value.replace(/\d{3,4}(?=-\d{4})/, '****')
    case 'email': {
      const [local, domain] = value.split('@')
      if (!domain) return '***@***.***'
      return local.slice(0, 2) + '***@' + domain
    }
    case 'ssn': return value.replace(/^\d{6}/, '******')
    case 'birthDate': return value.replace(/\d{2}[-.]\d{2}$/, '-**-**')
    case 'name':
    case 'address':
    default: return '***'
  }
}

// ── Document Classification API ──────────────────────────────────────

async function classifyDocument(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string,
): Promise<DocumentType> {
  const formData = new FormData()
  formData.append('document', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName)

  const resp = await fetch(`${UPSTAGE_API_BASE}/document-classification`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!resp.ok) {
    console.error('[classification] Upstage 분류 오류:', resp.status)
    return 'other'
  }

  const data = await resp.json()
  const classifiedType = (data?.type || data?.document_type || data?.category || '') as string
  const typeMap: Record<string, DocumentType> = {
    'report-meeting': 'report-meeting',
    'contract-agreement': 'contract-agreement',
    'transaction-settlement': 'transaction-settlement',
    'application-list-personnel': 'application-list-personnel',
    'consultation-complaint-interview': 'consultation-complaint-interview',
  }
  return typeMap[classifiedType] || 'other'
}

// ── Information Extraction API (개인정보 추출) ──────────────────────

async function extractWithIE(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  apiKey: string,
): Promise<MaskingCandidate[]> {
  const formData = new FormData()
  formData.append('document', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName)

  // 추출 스키마: 12종 개인정보
  const schema = {
    type: 'object',
    properties: {
      이름: { type: 'array', items: { type: 'string' } },
      전화번호: { type: 'array', items: { type: 'string' } },
      이메일: { type: 'array', items: { type: 'string' } },
      주소: { type: 'array', items: { type: 'string' } },
      생년월일: { type: 'array', items: { type: 'string' } },
      주민등록번호: { type: 'array', items: { type: 'string' } },
      외국인등록번호: { type: 'array', items: { type: 'string' } },
      여권번호: { type: 'array', items: { type: 'string' } },
      운전면허번호: { type: 'array', items: { type: 'string' } },
      계좌번호: { type: 'array', items: { type: 'string' } },
      카드번호: { type: 'array', items: { type: 'string' } },
      개인관리번호: { type: 'array', items: { type: 'string' } },
    },
  }

  formData.append('schema', JSON.stringify(schema))

  const resp = await fetch(`${UPSTAGE_API_BASE}/information-extraction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!resp.ok) {
    console.error('[IE] Upstage 정보추출 오류:', resp.status)
    return []
  }

  const data = await resp.json()
  const candidates: MaskingCandidate[] = []
  let idCounter = 0

  // 응답 파싱 — 필드별로 추출된 값들을 후보 목록으로 변환
  const fields = data?.results || data?.entities || data?.extracted_fields || {}
  const typeMap: Record<string, string> = {
    이름: 'name',
    전화번호: 'phone',
    이메일: 'email',
    주소: 'address',
    생년월일: 'birthDate',
    주민등록번호: 'ssn',
    외국인등록번호: 'foreignId',
    여권번호: 'passport',
    운전면허번호: 'driverLicense',
    계좌번호: 'account',
    카드번호: 'creditCard',
    개인관리번호: 'personalId',
  }

  for (const [fieldName, type] of Object.entries(typeMap)) {
    const values = fields[fieldName]
    if (!values || !Array.isArray(values)) continue
    for (const value of values) {
      if (typeof value !== 'string' || !value.trim()) continue
      candidates.push(makeCandidate(
        `${type}-${idCounter++}`,
        type,
        value.trim(),
        1, // IE는 페이지 정보 없이 반환할 수 있음
        0,
        value.length,
      ))
    }
  }

  return candidates
}

// ── Solar Pro 4 — 공유 상황 기반 제안 ───────────────────────────────

async function generateSuggestions(
  content: string,
  candidates: MaskingCandidate[],
  sharingContext: { recipient: string | null; purpose: string; keepInfo: string | null },
  docType: DocumentType,
  apiKey: string,
): Promise<any[]> {
  try {
    const recipientLabels: Record<string, string> = {
      'external-partner': '외부 협력사',
      'submission-agency': '제출 기관',
      'customer': '고객',
      'internal-team': '다른 내부 팀',
      'other': '기타',
    }

    const keepInfoLabels: Record<string, string> = {
      'contact-window': '문의 창구',
      'department-name': '부서명',
      'contact-person': '담당자 이름',
      'none': '남길 정보 없음',
    }

    const candidateSummary = candidates.slice(0, 20).map(c =>
      `${c.type}: "${c.value}"`
    ).join('\n')

    const prompt = `당신은 문서 개인정보 마스킹 지원 전문가입니다. 다음 정보를 바탕으로 공유 상황에 맞는 처리 제안과 확인 질문을 생성하세요.

## 문서 유형
${docType}

## 공유 상황
- 받는 사람: ${recipientLabels[sharingContext.recipient || 'other'] || sharingContext.recipient || '미정'}
- 공유 목적: ${sharingContext.purpose || '미입력'}
- 남길 정보: ${keepInfoLabels[sharingContext.keepInfo || 'none'] || sharingContext.keepInfo || '미정'}

## 발견된 개인정보 후보 (최대 20개)
${candidateSummary || '없음'}

## 개인정보 유형 12종
이름 / 전화번호 / 이메일 / 주소 / 생년월일 / 주민등록번호 / 외국인등록번호 / 여권번호 / 운전면허번호 / 계좌번호 / 카드번호 / 개인 관리번호

## 처리 방법 4종
- 전체 가림: 값 전체를 가림 (예: ********)
- 일부 가림: 일부만 남기고 가림 (예: 010-****-5678)
- 삭제: 원문에서 제거
- 유지: 그대로 둠

## 규칙
1. 공유 상황에 따라 각 후보마다 처리 방법을 제안하세요.
2. 받는 사람이 외부 협력사라면 연락처는 전체 가림, 기관명은 유지 제안.
3. 제출 기관이라면 업무 내용 유지를 위해 일부 가림을 고려.
4. 남길 정보로 담당자 이름이 선택됐으면 해당 이름은 유지 제안.
5. 애매한 경우 확인 질문을 생성하세요.
6. 원문에서 위치를 찾지 못한 항목은 별도로 해결해야 한다고 안내하세요.

## 답변 형식 (JSON 배열)
[
  {"candidateId": "phone-0", "type": "recommendation", "content": "외부 협력사에 제출하므로 전화번호는 전체 가림을 제안합니다.", "recommendation": "full"},
  {"candidateId": "email-0", "type": "question", "content": "이 이메일을 남겨야 할 사유가 있나요?", "recommendation": null}
]`

    const resp = await fetch(`${UPSTAGE_API_BASE}/solar/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'solar-pro4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
        temperature: 0.1,
      }),
    })

    if (!resp.ok) return []

    const data = await resp.json()
    const text = data.choices?.[0]?.message?.content || ''
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
    return JSON.parse(cleaned)
  } catch (e) {
    console.error('[suggestions] Solar 제안 오류:', e)
    return []
  }
}

// ── 메인 분석 엔드포인트 ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = UPSTAGE_API_KEY
  if (!apiKey) {
    console.error('[analysis] UPSTAGE_API_KEY 없음')
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const aiEnabled = formData.get('ai_enabled') === 'true'

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    const fileName = file.name
    const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
    const mimeType = getMimeType(fileExt)

    if (!['pdf', 'docx', 'doc', 'txt'].includes(fileExt)) {
      return NextResponse.json({
        error: '지원하지 않는 파일 형식입니다. PDF, DOCX, TXT만 지원합니다.',
      }, { status: 400 })
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({
        error: '파일 크기가 50MB를 초과합니다.',
      }, { status: 400 })
    }

    // 임시 저장
    await ensureDir(TMP_DIR)
    const tempPath = join(TMP_DIR, `analysis-${Date.now()}-${fileName}`)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(tempPath, buffer)

    try {
      // ── 1. Document Parse ──────────────────────────────────────
      const parseFormData = new FormData()
      parseFormData.append('document', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName)
      parseFormData.append('model', 'document-parse')
      parseFormData.append('output_format', JSON.stringify(['text', 'markdown']))

      const parseResp = await fetch(`${UPSTAGE_API_BASE}/document-digitization`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: parseFormData,
      })

      if (!parseResp.ok) {
        const errText = await parseResp.text()
        console.error('[parse] 오류:', parseResp.status, errText.slice(0, 300))
        return NextResponse.json({
          error: '문서 파싱에 실패했습니다.',
          details: errText.slice(0, 500),
        }, { status: 502 })
      }

      const parseResult = await parseResp.json()

      // Parse 결과에서 구조 정보를 보존한 elements 추출
      const parsedElements = extractElements(parseResult)

      // 평면 텍스트 (AI 분석용)
      const content = elementsToText(parsedElements)

      // 페이지 구성 (구조 정보 유지)
      const pages = elementsToPages(parsedElements)
      const pageCount = Math.max(1, pages.length)
      while (pages.length < pageCount) {
        pages.push({ pageNumber: pages.length + 1, text: '', hasImage: false })
      }

      // ── 2. Document Classification ─────────────────────────────
      let docType: DocumentType = 'other'
      if (aiEnabled && buffer.length > 0) {
        try {
          docType = await classifyDocument(buffer, fileName, mimeType, apiKey)
        } catch (e) {
          console.error('[classification] 오류:', e)
          docType = 'other'
        }
      } else {
        // 규칙 기반 분류
        const lower = content.toLowerCase()
        if (/보고서|결과\s보고|회의|요약|성과|검토|결산/.test(content)) docType = 'report-meeting'
        else if (/계약|합의|협정|협약|MOU|각서|부속/.test(content)) docType = 'contract-agreement'
        else if (/거래|정산|계산|지급|대금|invoice|청구|입금/.test(content)) docType = 'transaction-settlement'
        else if (/신청|명단|인사|채용|선발|위원|직원|참가/.test(content)) docType = 'application-list-personnel'
        else if (/상담|민원|인터뷰|면담|질의|답변|회신/.test(content)) docType = 'consultation-complaint-interview'
      }

      // ── 3. Information Extraction + 규칙 기반 후보 ────────────
      let candidates: MaskingCandidate[]

      if (aiEnabled) {
        // IE API 호출 시도
        const ieCandidates = await extractWithIE(buffer, fileName, mimeType, apiKey)
        if (ieCandidates.length > 0) {
          candidates = ieCandidates
        } else {
          // IE 실패 시 Solar Pro 4로 후보 추출
          candidates = await extractCandidatesWithAI(content, pages, docType, apiKey)
        }
      } else {
        candidates = extractCandidatesWithRules(content, pages)
      }

      const docInfo: DocumentInfo = {
        fileName,
        fileType: fileTypeFromExt(fileExt),
        fileSize: file.size,
        pageCount: pages.length,
        content,
        pages,
        detectedInfos: candidates,
        documentType: docType,
      }

      // ── 4. 공유 상황 기반 제안 (Solar Pro 4) ─────────────────────────────
      if (aiEnabled && candidates.length > 0) {
        try {
          const sharingCtx = {
            recipient: formData.get('recipient') as string || null,
            purpose: formData.get('purpose') as string || '',
            keepInfo: formData.get('keepInfo') as string || null,
          }
          const suggestions = await generateSuggestions(content, candidates, sharingCtx, docType, apiKey)
          // 제안이 있으면 후보별 suggestionReason 갱신 + suggestions 목록 저장
          if (suggestions && Array.isArray(suggestions) && suggestions.length > 0) {
            const suggestionMap = new Map<string, any>()
            for (const s of suggestions) {
              suggestionMap.set(s.candidateId, s)
            }
            const updatedCandidates = docInfo.detectedInfos.map(c => {
              const sug = suggestionMap.get(c.id)
              if (!sug) return c
              return {
                ...c,
                suggestionReason: sug.content,
                method: sug.recommendation || c.method,
              }
            })
            docInfo.detectedInfos = updatedCandidates
            ;(docInfo as any).suggestions = suggestions
          }
        } catch (e) {
          console.error('[suggestions] 호출 실패:', e)
        }
      }

      return NextResponse.json(docInfo)
    } finally {
      try { await unlink(tempPath) } catch { /* 무시 */ }
    }
  } catch (error) {
    console.error('[analysis] 오류:', error)
    return NextResponse.json({
      error: '문서 분석 중 오류가 발생했습니다.',
    }, { status: 500 })
  }
}

// ── AI 기반 후보 추출 (IE 실패 시 백업) ─────────────────────────────

async function extractCandidatesWithAI(
  content: string,
  pages: PageContent[],
  docType: DocumentType,
  apiKey: string,
): Promise<MaskingCandidate[]> {
  try {
    const typeDescriptions = [
      { type: 'name', description: '사람 이름 (한국 이름, 영문 이름)' },
      { type: 'phone', description: '전화번호 (010-XXXX-XXXX, 지역번호 포함 등)' },
      { type: 'email', description: '이메일 주소' },
      { type: 'address', description: '주소 (도로명, 지번, 건물명 포함)' },
      { type: 'birthDate', description: '생년월일 (YYYY-MM-DD, YYYY년 MM월 DD일 등)' },
      { type: 'ssn', description: '주민등록번호 (XXXXXX-XXXXXXX)' },
      { type: 'foreignId', description: '외국인등록번호' },
      { type: 'passport', description: '여권번호 (M, G, S 등 영문 + 숫자)' },
      { type: 'driverLicense', description: '운전면허번호' },
      { type: 'account', description: '은행 계좌번호' },
      { type: 'creditCard', description: '카드번호' },
      { type: 'personalId', description: '개인 관리번호, 사번, 회원번호 등' },
    ]

    const typeTable = typeDescriptions.map((t, i) =>
      `${i + 1}. ${t.type}: ${t.description}`
    ).join('\n')

    const prompt = `당신은 문서 속 개인정보를 찾는 전문가입니다. 다음 문서에서 개인정보로 의심되는 항목을 찾아주세요.

## 개인정보 유형 12종
${typeTable}

## 문서 유형
${docType}

## 규칙
1. 본문과 표에서 개인정보 후보를 찾으세요.
2. 같은 값이라도 위치가 다르면 별도로 표시하세요.
3. 원문에서 찾은 정확한 문자열과 그 위치를 알려주세요.
4. 확실히 개인정보가 아닌 것은 포함하지 마세요.

## 답변 형식 (JSON 배열만)
[{"type":"phone","value":"010-1234-5678","page":1,"reason":"전화번호 패턴"}]

문서 내용:
${content.slice(0, 8000)}`

    const resp = await fetch(`${UPSTAGE_API_BASE}/solar/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'solar-pro4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    })

    if (!resp.ok) {
      console.error('[extract-AI] Solar 오류:', resp.status)
      return extractCandidatesWithRules(content, pages)
    }

    const data = await resp.json()
    const text = data.choices?.[0]?.message?.content || ''

    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
      const parsed = JSON.parse(cleaned)

      if (Array.isArray(parsed)) {
        return parsed.map((item: any, idx: number) => ({
          id: `${item.type}-${idx}-${Date.now()}`,
          type: item.type || 'other',
          value: item.value || '',
          maskedValue: maskValue(item.type, item.value),
          positions: item.page ? [{ page: item.page, start: 0, end: 0 }] : [],
          method: 'full',
          suggestionReason: item.reason,
          confirmed: false,
          skipped: false,
        }))
      }
    } catch (e) {
      console.error('[extract-AI] JSON 파싱 오류:', e)
    }

    return extractCandidatesWithRules(content, pages)
  } catch (error) {
    console.error('[extract-AI] 오류:', error)
    return extractCandidatesWithRules(content, pages)
  }
}
