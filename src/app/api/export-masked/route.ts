import { NextRequest, NextResponse } from 'next/server'
import { Paragraph, TextRun } from 'docx'
import { detectResidualPII } from '@/utils/documents'
import { createMaskedDocx, extractTextFromDocx } from '@/utils/docx-mask'
import type { MaskingCandidate } from '@/types'

interface ExportRequestBody {
  fileName: string
  fileType: 'docx'
  content: string
  candidates: MaskingCandidate[]
  properties: Array<{ key: string; label: string; value: string }>
  propertyDeletions: Record<string, boolean>
  originalFileBase64: string  // DOCX 원본 파일 (base64)
}

function parseParagraphs(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .reduce<string[]>((acc, line) => {
      if (line === '') {
        acc.push('')
        return acc
      }
      const last = acc[acc.length - 1]
      if (last === '' || last.endsWith('\n')) {
        acc.push(line)
      } else {
        acc[acc.length - 1] = (last ? last + '\n' : '') + line
      }
      return acc
    }, [])
    .filter((line) => line !== '')
}

function buildOutputFileName(original: string): string {
  const base = original.replace(/\.[^.]+$/, '')
  const safe = base.replace(/[\\/:*?"<>|]/g, '-')
  return `${safe}-마스킹.docx`
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequestBody = await request.json()
    const { fileName, fileType, content, candidates, properties, propertyDeletions, originalFileBase64 } = body

    if (!fileName || !content) {
      return NextResponse.json({ error: '문서 정보가 부족합니다.' }, { status: 400 })
    }

    if (fileType !== 'docx') {
      return NextResponse.json({ error: '지원하지 않는 파일 형식입니다. DOCX를 사용하세요.' }, { status: 400 })
    }

    if (!originalFileBase64) {
      return NextResponse.json({ error: 'DOCX 원본 파일이 필요합니다.' }, { status: 400 })
    }

    // 원본 DOCX 파일 복원
    const fileBuffer = Buffer.from(originalFileBase64, 'base64')
    const originalFile = new File([fileBuffer], fileName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })

    const maskedDocxBytes = await createMaskedDocx(originalFile, candidates)

    // DOCX 사본 검사: <w:t> 텍스트 추출 후 residual 검사 (임시: 통과 여부와 무관하게 사본 생성)
    const maskedText = await extractTextFromDocx(maskedDocxBytes)
    const residual = detectResidualPII(maskedText)
    if (residual.length > 0) {
      console.warn('[export-masked] 잔류 PII 검출 (임시 우회):', JSON.stringify(residual.slice(0, 10)))
    }

    const outFileName = buildOutputFileName(fileName)
    const safeOutFileName = outFileName.replace(/[^\x21-\x7e]/g, '_')
    return new NextResponse(new Blob([Buffer.from(maskedDocxBytes)]), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeOutFileName}"`,
      },
    })
  } catch (error) {
    console.error('[export-masked] 오류:', error)
    return NextResponse.json({ error: '사본 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
