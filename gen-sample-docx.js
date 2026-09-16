'use strict'
const { Document, Packer, Paragraph, TextRun } = require('./node_modules/docx')
const fs = require('fs')
const path = require('path')

const dir = '/tmp/garimi-test'
fs.mkdirSync(dir, { recursive: true })

async function main() {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ children: [new TextRun({ text: '참여자 명단 (2024년 지역아동센터 결과보고서)' })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: '이름: 김철수' })] }),
        new Paragraph({ children: [new TextRun({ text: '전화번호: 010-1234-5678' })] }),
        new Paragraph({ children: [new TextRun({ text: '이메일: kim@example.com' })] }),
        new Paragraph({ children: [new TextRun({ text: '주민등록번호: 900101-1234567' })] }),
        new Paragraph({ children: [new TextRun({ text: '담당자: 박영희 (010-9876-5432)' })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: '문의: 02-555-1234' })] }),
      ]
    }]
  })
  const buf = await Packer.toBuffer(doc)
  const outPath = path.join(dir, 'sample.docx')
  fs.writeFileSync(outPath, buf)
  console.log('sample.docx created, size:', buf.length, 'bytes')
}

main().catch(e => { console.error(e); process.exit(1) })
