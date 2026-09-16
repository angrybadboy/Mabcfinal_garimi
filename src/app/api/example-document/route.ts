import { NextResponse } from 'next/server'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType } from 'docx'
import { mkdir, writeFile, readFile, unlink } from 'fs/promises'
import { join } from 'path'

const TMP_DIR = '/tmp'

async function ensureDir(dir: string) {
  try {
    await mkdir(dir, { recursive: true })
  } catch {
    // 이미 존재
  }
}

// 예시 문서 생성 - 합성 개인정보 포함
async function createExampleDocument(): Promise<Buffer> {
  const boldText = (text: string) => new TextRun({ text, bold: true })
  const normalText = (text: string) => new TextRun({ text })
  
  const headerCell = (text: string) => new TableCell({
    children: [new Paragraph({ children: [boldText(text)], alignment: AlignmentType.CENTER })],
    shading: { type: ShadingType.SOLID, color: '000000', fill: 'EEEEEE' },
  })
  
  const dataCell = (text: string, center = false) => new TableCell({
    children: [new Paragraph({ children: [normalText(text)], alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT })],
  })

  // 참여 아동 표
  const childrenTableRows = [
    ['1', '이지은', '2016-03-15', '최영수', '010-9876-5432', 'choiyoungsoo@email.com'],
    ['2', '박성민', '2017-07-22', '이미영', '010-4567-8901', 'mylee@mail.kr'],
    ['3', '한서준', '2015-11-08', '정다은', '010-2345-6789', 'daeeun.jung@naver.com'],
    ['4', '오지우', '2018-01-30', '강준호', '010-5678-9012', 'kjh_family@daum.net'],
    ['5', '서예은', '2016-09-12', '윤석진', '010-8901-2345', 'seoseok@paran.com'],
    ['6', '이동현', '2017-04-25', '박수진', '010-1234-5678', 'psj123@outlook.com'],
    ['7', '최민지', '2015-12-18', '이동수', '010-3456-7890', 'dslee@naver.com'],
    ['8', '정우석', '2018-06-03', '한소희', '010-6789-0123', 'hsh123@gmail.com'],
  ].map(row => new TableRow({
    children: row.map((cell, idx) => dataCell(cell, idx === 0)),
  }))

  const doc = new Document({
    creator: '가리미',
    title: '2024년 1분기 지역아동센터 프로그램 결과보고서',
    description: '지역아동센터 프로그램 운영 결과 보고서',
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      children: [
        new Paragraph({ spacing: { after: 400 } }),
        new Paragraph({
          children: [new TextRun({ text: '2024년 1분기', bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '지역아동센터 프로그램 결과보고서', bold: true, size: 32 })],
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
        }),
        new Paragraph({ spacing: { after: 400 } }),

        // 기본 정보
        new Paragraph({
          children: [boldText('기관명: '), normalText('행복한지역아동센터')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('센터장: '), normalText('박영희')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('담당자: '), normalText('김민수')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('연락처: '), normalText('02-1234-5678')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('이메일: '), normalText('happycenter@example.org')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('주소: '), normalText('서울특별시 강남구 테헤란로 123, 4층')],
          spacing: { after: 400 },
        }),

        // 1. 프로그램 개요
        new Paragraph({
          children: [new TextRun({ text: '1. 프로그램 개요', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('2024년 1분기(1월~3월) 동안 지역아동센터에서 진행된 주요 프로그램은 다음과 같습니다.')],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('• 방과후 학습지원 프로그램: 매주 월~금 오후 3시~6시, 초등학생 25명 참여')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [normalText('• 문화예술 프로그램: 매주 수요일 오후 4시~5시, 초등학생 15명 참여')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [normalText('• 정서지원 상담 프로그램: 매주 화·목 오후 5시~6시, 개별 상담 12건 진행')],
          spacing: { after: 300 },
        }),

        // 2. 참여 아동 명단
        new Paragraph({
          children: [new TextRun({ text: '2. 참여 아동 명단 (개인정보 포함)', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('다음은 이번 프로그램에 참여한 아동과 보호자 정보입니다. 외부 제출 시 개인정보 마스킹이 필요합니다.')],
          spacing: { after: 200 },
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                headerCell('번호'),
                headerCell('아동명'),
                headerCell('생년월일'),
                headerCell('보호자명'),
                headerCell('보호자 연락처'),
                headerCell('이메일'),
              ],
            }),
            ...childrenTableRows,
          ],
        }),

        new Paragraph({ spacing: { after: 300 } }),

        // 3. 강사 정보
        new Paragraph({
          children: [new TextRun({ text: '3. 프로그램 강사 정보', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [boldText('강사명: '), normalText('조민우')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('연락처: '), normalText('010-4567-8901')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('이메일: '), normalText('minwoo.cho@artschool.kr')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [boldText('주민등록번호: '), normalText('850123-1234567')],
          spacing: { after: 300 },
        }),

        // 4. 예산 집행 내역
        new Paragraph({
          children: [new TextRun({ text: '4. 예산 집행 내역', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('총 예산 15,000,000원 중 13,850,000원을 집행하였으며, 잔액은 1,150,000원입니다.')],
          spacing: { after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                headerCell('항목'),
                headerCell('금액'),
                headerCell('비고'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('강사료'),
                dataCell('4,800,000원', true),
                dataCell('주 3회 × 12주 × 100,000원'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('교재비'),
                dataCell('1,200,000원', true),
                dataCell('아동 25명 × 15,000원 × 2종'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('간식비'),
                dataCell('3,600,000원', true),
                dataCell('주 5일 × 12주 × 5,000원 × 25명'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('홍보비'),
                dataCell('800,000원', true),
                dataCell('전단지 인쇄 및 온라인 홍보'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('기타 운영비'),
                dataCell('3,450,000원', true),
                dataCell('사무용품비, 교통비 등'),
              ],
            }),
          ],
        }),

        new Paragraph({ spacing: { after: 300 } }),

        // 5. 성과 측정
        new Paragraph({
          children: [new TextRun({ text: '5. 성과 측정 및 만족도 조사', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('프로그램 종료 후 참여 아동과 보호자를 대상으로 만족도 조사를 실시하였습니다.')],
          spacing: { after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                headerCell('구분'),
                headerCell('응답 인원'),
                headerCell('만족도'),
                headerCell('비고'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('아동 만족도'),
                dataCell('25명 중 22명 응답', true),
                dataCell('4.5/5.0', true),
                dataCell('매우 만족 18명, 만족 4명'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('보호자 만족도'),
                dataCell('25명 중 20명 응답', true),
                dataCell('4.7/5.0', true),
                dataCell('매우 만족 17명, 만족 3명'),
              ],
            }),
            new TableRow({
              children: [
                dataCell('프로그램 지속 희망'),
                dataCell('22명 중 20명', true),
                dataCell('90.9%', true),
                dataCell('계속 참여 희망'),
              ],
            }),
          ],
        }),

        new Paragraph({ spacing: { after: 300 } }),

        // 6. 향후 계획
        new Paragraph({
          children: [new TextRun({ text: '6. 향후 계획 및 건의사항', bold: true, size: 28 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('2분기 프로그램에서는 학부모 참여 수업을 신설할 예정입니다. 또한 정서지원 상담 프로그램의 수요가 높아 상담 전문가를 추가로 섭외할 계획입니다.')],
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [normalText('본 보고서는 외부 기관 제출을 위해 작성되었으며, 개인정보 마스킹 후 제출 예정입니다.')],
          spacing: { after: 300 },
        }),

        new Paragraph({ spacing: { after: 200 } }),
        new Paragraph({
          children: [normalText('작성자: 박영희 (행복한지역아동센터 센터장)')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [normalText('작성일: 2024년 4월 5일')],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [normalText('연락처: 02-1234-5678, happycenter@example.org')],
          spacing: { after: 100 },
        }),
      ],
    }],
  })

  return Packer.toBuffer(doc)
}

export async function GET() {
  try {
    await ensureDir(TMP_DIR)
    const tempPath = join(TMP_DIR, `example-${Date.now()}.docx`)
    
    const buffer = await createExampleDocument()
    await writeFile(tempPath, buffer)

    try {
      const fileBuffer = await readFile(tempPath)
      const fileName = '2024년-1분기-지역아동센터-결과보고서-예시.docx'
      
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      })
    } finally {
      try {
        await unlink(tempPath)
      } catch {
        // 삭제 실패 무시
      }
    }
  } catch (error) {
    console.error('[example-document] 오류:', error)
    return NextResponse.json({ error: '예시 문서 생성 실패' }, { status: 500 })
  }
}
