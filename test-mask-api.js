const { createMaskedPdfImageFlatten, extractTextFromPdf } = require('./src/utils/pdf-utils.ts')

const fs = require('fs')
const samplePath = '/tmp/garimi-test/sample.pdf'

async function main() {
  const originalBytes = fs.readFileSync(samplePath)
  const originalFile = new File([originalBytes], 'sample.pdf', { type: 'application/pdf' })

  const candidates = [
    { id: 'phone-1', type: 'phone', value: '010-1234-5678', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'phone-2', type: 'phone', value: '010-9876-5432', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'phone-3', type: 'phone', value: '02-555-1234', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'email-1', type: 'email', value: 'kim@example.com', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
    { id: 'ssn-1', type: 'ssn', value: '900101-1234567', maskedValue: '', positions: [], method: 'full', confirmed: true, skipped: false },
  ]

  console.log('Creating masked PDF (image-flatten, scale=2.0)...')
  const maskedBytes = await createMaskedPdfImageFlatten(originalFile, candidates, 2.0)
  const outPath = '/tmp/garimi-test/masked.pdf'
  fs.writeFileSync(outPath, Buffer.from(maskedBytes))
  console.log('Masked PDF saved:', maskedBytes.byteLength, 'bytes ->', outPath)

  console.log('Extracting text from masked PDF...')
  const extracted = await extractTextFromPdf(maskedBytes)
  console.log('Extracted text:', JSON.stringify(extracted))

  const piiRegex = /010-1234|010-9876|02-555|kim@example|900101-1234567/
  if (piiRegex.test(extracted) || extracted.trim().length > 0) {
    console.log('RESULT: FAIL — PII extractable from masked PDF')
    process.exit(1)
  }
  console.log('RESULT: PASS — no PII text extractable from masked PDF')
}

main().catch(e => { console.error(e); process.exit(1) })
