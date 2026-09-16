'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import JSZip from 'jszip'
import type { MaskingCandidate } from '@/types'

interface DocxViewerProps {
  file: File
  candidates?: MaskingCandidate[]
  onLoaded?: () => void
}

/** <w:t> 요소에서 텍스트만 추출 (속성 무관) */
function extractTextNodes(xml: string): { text: string; startOffset: number; endOffset: number }[] {
  const results: { text: string; startOffset: number; endOffset: number }[] = []
  const regex = /<w:t\b[^>]*>([^<]*)<\/w:t>/g
  let match: RegExpExecArray | null
  let cursor = 0
  while ((match = regex.exec(xml)) !== null) {
    const text = match[1]
    if (text) {
      results.push({
        text,
        startOffset: cursor,
        endOffset: cursor + text.length,
      })
      cursor += text.length
    }
  }
  return results
}

/** <w:t> 텍스트 노드들을 연결해 전체 텍스트 생성 */
function concatenateText(nodes: { text: string }[]): string {
  return nodes.map(n => n.text).join('')
}

export default function DocxViewer({ file, candidates = [], onLoaded }: DocxViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [segments, setSegments] = useState<{ text: string; start: number; end: number; masked?: boolean }[]>([])

  const candidateMap = useCallback(() => {
    const map = new Map<string, MaskingCandidate>()
    const sorted = [...candidates].sort((a, b) => b.value.length - a.value.length)
    for (const c of sorted) {
      if (c.value && !map.has(c.value)) {
        map.set(c.value, c)
      }
    }
    return map
  }, [candidates])

  useEffect(() => {
    if (!containerRef.current) return
    setLoading(true)
    setError(null)
    setText('')
    setSegments([])

    const parse = async () => {
      try {
        const zip = await JSZip.loadAsync(file)
        const xmlFile = zip.file('word/document.xml')
        if (!xmlFile) {
          setError('DOCX에서 문서 본문을 찾을 수 없습니다.')
          setLoading(false)
          return
        }
        const xml = await xmlFile.async('string')
        const nodes = extractTextNodes(xml)
        const fullText = concatenateText(nodes)

        const maskedRanges: { start: number; end: number }[] = []
        const valueMap = candidateMap()
        for (const [value] of valueMap) {
          let searchFrom = 0
          while (searchFrom < fullText.length) {
            const idx = fullText.indexOf(value, searchFrom)
            if (idx < 0) break
            maskedRanges.push({ start: idx, end: idx + value.length })
            searchFrom = idx + value.length
          }
        }

        const segs: { text: string; start: number; end: number; masked?: boolean }[] = []
        let lastEnd = 0
        for (const range of maskedRanges.sort((a, b) => a.start - b.start)) {
          if (range.start > lastEnd) {
            segs.push({ text: fullText.slice(lastEnd, range.start), start: lastEnd, end: range.start })
          }
          segs.push({ text: fullText.slice(range.start, range.end), start: range.start, end: range.end, masked: true })
          lastEnd = range.end
        }
        if (lastEnd < fullText.length) {
          segs.push({ text: fullText.slice(lastEnd), start: lastEnd, end: fullText.length })
        }

        setText(fullText)
        setSegments(segs)
        setLoading(false)
        if (onLoaded) onLoaded()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'DOCX 파싱에 실패했습니다.')
        setLoading(false)
      }
    }

    parse()
  }, [file, candidateMap, onLoaded])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50 flex-shrink-0">
        <div className="text-xs text-slate-600">DOCX 문서 뷰어 (텍스트)</div>
        {!loading && !error && (
          <div className="text-xs text-slate-400">표시 완료</div>
        )}
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto bg-white p-6">
        {loading && (
          <div className="flex items-center justify-center h-48 text-sm text-slate-500">
            DOCX를 분석하는 중...
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-sm text-red-600">
            <div className="text-center">
              <p>{error}</p>
            </div>
          </div>
        )}
        {!loading && !error && text && (
          <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed">
            {segments.map((seg, i) => (
              <span
                key={i}
                className={seg.masked ? 'underline decoration-brand-500 decoration-2 underline-offset-2 bg-brand-100/40' : ''}
              >
                {seg.text}
              </span>
            ))}
          </div>
        )}
        {!loading && !error && !text && (
          <div className="text-sm text-slate-400 text-center py-12">
            <p>문서 내용이 비어있습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
