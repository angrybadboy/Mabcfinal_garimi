/**
 * DOCX 마스킹 파이프라인 통합 테스트
 * - AppContext에서 저장한 method/customReplacement/appliedPreset이
 *   export-masked/route.ts (createMaskedDocx) 와
 *   export/page.tsx (applyMaskingToText) 양쪽에서
 *   동일하게 반영되는지 확인한다.
 */

import JSZip from 'jszip'
import { createMaskedDocx, extractTextFromDocx } from './src/utils/docx-mask'
import { applyMaskingToText } from './src/utils/documents'
import type { MaskingCandidate } from './src/types'
import { Document, Packer, Paragraph, TextRun } from 'docx'

/** docx 라이브러리로 유효한 DOCX Uint8Array 생성 */
function makeTestDocxBytes(text: string): Uint8Array {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text })],
        }),
      ],
    }],
  })
  return Packer.toBuffer(doc) as unknown as Uint8Array
}

async function runTests() {
  const failures: string[] = []
  let passed = 0

  // ── 케이스 정의 ────────────────────────────────────────────────
  const cases = [
    {
      name: '전체 가림 (full)',
      candidates: [
        {
          id: 'c1',
          type: 'phone' as const,
          value: '010-1234-5678',
          maskedValue: '•'.repeat(13),
          positions: [],
          method: 'full' as const,
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '010-1234-5678',
      expectedAfter: '•'.repeat(13),
    },
    {
      name: '일부 가림 (partial) — preset: 가운데 가리기',
      candidates: [
        {
          id: 'c1',
          type: 'phone' as const,
          value: '010-1234-5678',
          maskedValue: '010-****-5678',
          positions: [],
          method: 'partial' as const,
          customReplacement: '010-****-5678',
          appliedPreset: 'partial-mid',
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '010-1234-5678',
      expectedAfter: '010-****-5678',
    },
    {
      name: '일부 가림 (partial) — preset: 앞자리만 남기기',
      candidates: [
        {
          id: 'c1',
          type: 'phone' as const,
          value: '010-1234-5678',
          maskedValue: '010-****-5678',
          positions: [],
          method: 'partial' as const,
          customReplacement: '010-****-5678',
          appliedPreset: 'partial-end',
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '010-1234-5678',
      expectedAfter: '010-****-****',
    },
    {
      name: '삭제 (delete)',
      candidates: [
        {
          id: 'c1',
          type: 'name' as const,
          value: '홍길동',
          maskedValue: '',
          positions: [],
          method: 'delete' as const,
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '홍길동',
      expectedAfter: '\u3000', // 전각 공백 1개
    },
    {
      name: '유지 (keep)',
      candidates: [
        {
          id: 'c1',
          type: 'name' as const,
          value: '홍길동',
          maskedValue: '홍길동',
          positions: [],
          method: 'keep' as const,
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '홍길동',
      expectedAfter: '홍길동',
    },
    {
      name: '직접 편집 (custom partial)',
      candidates: [
        {
          id: 'c1',
          type: 'phone' as const,
          value: '010-1234-5678',
          maskedValue: '010-12**-5678',
          positions: [],
          method: 'partial' as const,
          customReplacement: '010-12**-5678',
          appliedPreset: '__custom__',
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '010-1234-5678',
      expectedAfter: '010-12**-5678',
    },
    {
      name: '전체 가림 + 삭제 혼합',
      candidates: [
        {
          id: 'c1',
          type: 'phone' as const,
          value: '010-1234-5678',
          maskedValue: '•'.repeat(13),
          positions: [],
          method: 'full' as const,
          confirmed: false,
          skipped: false,
        },
        {
          id: 'c2',
          type: 'name' as const,
          value: '홍길동',
          maskedValue: '',
          positions: [],
          method: 'delete' as const,
          confirmed: false,
          skipped: false,
        },
      ],
      inputText: '홍길동 010-1234-5678',
      expectedAfter: '\u3000 ' + '•'.repeat(13),
    },
  ]

  for (const tc of cases) {
    // ── 프론트엔드 미리보기 (applyMaskingToText) ──
    const frontResult = applyMaskingToText(tc.inputText, tc.candidates)
    
    // ── 백엔드 DOCX 생성 (createMaskedDocx) ──
    const originalBytes = makeTestDocxBytes(tc.inputText)
    const originalFile = new File([originalBytes], 'test.docx', { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    })
    const maskedBytes = await createMaskedDocx(originalFile, tc.candidates)
    const maskedText = await extractTextFromDocx(maskedBytes)

    // ── 검증 ──
    const frontOk = frontResult === tc.expectedAfter
    const backOk = maskedText === tc.expectedAfter

    if (frontOk && backOk) {
      passed++
      console.log(`✅ ${tc.name}`)
    } else {
      failures.push(`❌ ${tc.name}`)
      if (!frontOk) {
        failures.push(`   frontend: 기대="${tc.expectedAfter}" 실제="${frontResult}"`)
      }
      if (!backOk) {
        failures.push(`   backend:  기대="${tc.expectedAfter}" 실제="${maskedText}"`)
      }
    }
  }

  console.log(`\n${passed}/${cases.length} 통과`)
  if (failures.length > 0) {
    console.log('실패:')
    for (const f of failures) console.log(f)
    process.exit(1)
  }
}

runTests().catch(err => {
  console.error('테스트 실행 중 오류:', err)
  process.exit(1)
})
