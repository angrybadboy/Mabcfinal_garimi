import { POST } from './src/app/api/export-masked/route'
import fs from 'fs'
import { Buffer } from 'buffer'

const samplePath = '/tmp/garimi-test/sample.docx'
const maskedPath = '/tmp/garimi-test/downloaded-masked.docx'

async function main() {
  if (!fs.existsSync(samplePath)) {
    console.error('sample.docx not found. Run gen-sample-docx.js first.')
    process.exit(1)
  }

  const base64 = fs.readFileSync(samplePath, 'base64').toString('base64')
  const payload = {
    fileName: 'sample.docx',
    fileType: 'docx',
    content: '참여자 명단 (2024년 지역아동센터 결과보고서)\n이름: 김철수\n전화번호: 010-1234-5678\n이메일: kim@example.com\n주민등록번호: 900101-1234567\n담당자: 박영희 (010-9876-5432)\n문의: 02-555-1234',
    candidates: [
      { id: 'phone-1', type: 'phone' as const, value: '010-1234-5678', maskedValue: '', positions: [{ pageIndex: 0, start: 0, end: 13, text: '010-1234-5678' }], method: 'full' as const, confirmed: true, skipped: false },
      { id: 'phone-2', type: 'phone' as const, value: '010-9876-5432', maskedValue: '', positions: [], method: 'full' as const, confirmed: true, skipped: false },
      { id: 'phone-3', type: 'phone' as const, value: '02-555-1234', maskedValue: '', positions: [], method: 'full' as const, confirmed: true, skipped: false },
      { id: 'email-1', type: 'email' as const, value: 'kim@example.com', maskedValue: '', positions: [], method: 'full' as const, confirmed: true, skipped: false },
      { id: 'ssn-1', type: 'ssn' as const, value: '900101-1234567', maskedValue: '', positions: [], method: 'full' as const, confirmed: true, skipped: false },
    ],
    properties: [],
    propertyDeletions: {},
    originalFileBase64: base64,
  }

  const request = {
    json: async () => payload,
    headers: {},
    nextUrl: { searchParams: new URLSearchParams() },
  } as Parameters<typeof POST>[0]

  console.log('Calling export-masked POST handler with DOCX originalFileBase64 (len=%d)...', base64.length)
  const response = await POST(request)
  const body = await response.json()

  console.log('response status:', response.status)
  const blob = await response.blob()
  const bytes = await blob.arrayBuffer()
  const uint8 = new Uint8Array(bytes)
  console.log('downloaded masked DOCX size:', uint8.length, 'bytes')

  if (response.status !== 200) {
    console.log('RESULT: FAIL — non-200 response (status=%d)', response.status)
    process.exit(1)
  }

  fs.writeFileSync(maskedPath, Buffer.from(uint8))
  console.log('saved:', maskedPath)

  // 마저 extractTextFromDocx로 residual 확인
  const { extractTextFromDocx } = await import('./src/utils/docx-mask')
  const extracted = await extractTextFromDocx(uint8)
  console.log('extracted text:', JSON.stringify(extracted))

  const piiRegex = /010-1234|010-9876|02-555|kim@example|900101-1234567/
  if (piiRegex.test(extracted)) {
    console.log('RESULT: FAIL — PII still present in downloaded DOCX')
    process.exit(1)
  }
  console.log('RESULT: PASS — DOCX pipeline end-to-end (front payload → route handler → masked DOCX download → no PII)')
}

main().catch(e => { console.error(e); process.exit(1) })
