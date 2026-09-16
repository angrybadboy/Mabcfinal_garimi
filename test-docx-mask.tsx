import { createMaskedDocx, extractTextFromDocx, docxBytesToFile } from './src/utils/docx-mask'
import fs from 'fs'
import path from 'path'

const dir = '/tmp/garimi-test'
const samplePath = path.join(dir, 'sample.docx')
const maskedPath = path.join(dir, 'masked.docx')

async function main() {
  if (!fs.existsSync(samplePath)) {
    console.error('sample.docx not found. Run gen-sample-docx.js first.')
    process.exit(1)
  }

  const originalBytes = fs.readFileSync(samplePath)
  const originalFile = docxBytesToFile(originalBytes, 'sample.docx')

  const candidates = [
    { id: 'phone-1', type: 'phone', value: '010-1234-5678', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'phone-2', type: 'phone', value: '010-9876-5432', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'phone-3', type: 'phone', value: '02-555-1234', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'email-1', type: 'email', value: 'kim@example.com', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'ssn-1', type: 'ssn', value: '900101-1234567', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
  ]

  console.log('Creating masked DOCX...')
  const maskedBytes = await createMaskedDocx(originalFile, candidates)
  console.log('Masked DOCX size:', maskedBytes.length, 'bytes')
  fs.writeFileSync(maskedPath, Buffer.from(maskedBytes))
  console.log('Saved:', maskedPath)

  console.log('Extracting text from masked DOCX...')
  const extracted = await extractTextFromDocx(maskedBytes)
  console.log('Extracted text:', JSON.stringify(extracted))

  const piiRegex = /010-1234|010-9876|02-555|kim@example|900101-1234567/
  if (piiRegex.test(extracted)) {
    console.log('RESULT: FAIL — PII still present in masked DOCX')
    process.exit(1)
  }
  console.log('RESULT: PASS — no PII in masked DOCX')
}

main().catch(e => { console.error(e); process.exit(1) })
