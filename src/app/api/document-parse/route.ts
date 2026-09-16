import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY
const UPSTAGE_BASE_URL = 'https://api.upstage.ai/v1'

if (!UPSTAGE_API_KEY) {
  console.error('[document-parse] UPSTAGE_API_KEY not found in environment')
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const model = (formData.get('model') as string) || 'document-parse'
    const outputFormat = (formData.get('output_format') as string) || 'text'
    const ocr = (formData.get('ocr') as string) || 'auto'
    const chartRecognition = formData.get('chart_recognition') === 'true'

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    // 파일 확장자 확인
    const fileName = file.name
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (!['pdf', 'docx', 'doc', 'pptx', 'xlsx', 'txt'].includes(ext || '')) {
      return NextResponse.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 })
    }

    // 파일을 임시 저장 (Upstage API로 전송하기 위해)
    const tmpDir = join(process.cwd(), 'tmp')
    await mkdir(tmpDir, { recursive: true })
    const tmpPath = join(tmpDir, `upload-${Date.now()}-${file.name}`)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(tmpPath, buffer)

    // Upstage Document Parse API 호출
    const formDataUpstage = new FormData()
    formDataUpstage.append('document', new File([buffer], file.name, { type: file.type || 'application/octet-stream' }))
    formDataUpstage.append('model', model)
    formDataUpstage.append('output_format', JSON.stringify([outputFormat]))
    formDataUpstage.append('ocr', ocr)
    if (chartRecognition) {
      formDataUpstage.append('chart_recognition', 'true')
    }

    const upstageResponse = await fetch(`${UPSTAGE_BASE_URL}/document-digitization`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UPSTAGE_API_KEY}`,
      },
      body: formDataUpstage,
    })

    if (!upstageResponse.ok) {
      const errorText = await upstageResponse.text()
      console.error('[document-parse] Upstage API error:', upstageResponse.status, errorText)
      return NextResponse.json({
        error: '문서 처리 중 오류가 발생했습니다.',
        details: errorText.slice(0, 500),
      }, { status: upstageResponse.status })
    }

    const result = await upstageResponse.json()
    
    // 임시 파일 삭제
    try {
      await writeFile(tmpPath, Buffer.alloc(0)) // 삭제 대신 비우기
    } catch (e) {
      // 무시
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[document-parse] 처리 오류:', error)
    return NextResponse.json({ error: '서버 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
