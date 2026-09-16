'use client'

import { useCallback, useState } from 'react'
import { ArrowLeft, Download, Eye, Check, AlertCircle, Loader2, Shield, Lock, FileText, File, X, RotateCcw } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import { applyMaskingToText } from '@/utils/documents'
import type { MaskingCandidate } from '@/types'

interface DocProperty {
  key: string
  label: string
  value: string
  defaultDelete: boolean
}

const SAMPLE_PROPERTIES: DocProperty[] = [
  { key: 'author', label: '작성자', value: '박영희', defaultDelete: true },
  { key: 'lastModifiedBy', label: '최종 수정자', value: '김민수', defaultDelete: true },
  { key: 'created', label: '생성일', value: '2024-01-15T09:30:00', defaultDelete: true },
  { key: 'modified', label: '최종 수정일', value: '2024-03-20T14:45:00', defaultDelete: true },
  { key: 'title', label: '제목', value: '2024년 1분기 지역아동센터 프로그램 결과보고서', defaultDelete: false },
  { key: 'subject', label: '주제', value: '지역아동센터 사업 결과 보고', defaultDelete: false },
]

function isFileNameSafe(name: string): { ok: boolean; reason?: string } {
  if (!name || !name.trim()) return { ok: false, reason: '파일 이름이 비어 있습니다.' }
  if (/[\\/:*?"<>|]/.test(name)) return { ok: false, reason: '파일 이름에 사용할 수 없는 문자가 포함되어 있습니다.' }
  return { ok: true }
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result as ArrayBuffer)
        let binary = ''
        const chunkSize = 0x8000
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
          binary += String.fromCharCode.apply(null, Array.from(chunk))
        }
        resolve(btoa(binary))
      }
      reader.onerror = () => reject(new Error('파일 변환 중 오류가 발생했습니다.'))
      reader.readAsArrayBuffer(file)
    })
  }

export default function ExportPage() {
  const { state, setPhase, setError, undo } = useApp()
  const [comparisonMode, setComparisonMode] = useState(true)
  const [propertyDeletions, setPropertyDeletions] = useState<Record<string, boolean>>(
    Object.fromEntries(SAMPLE_PROPERTIES.map(p => [p.key, p.defaultDelete]))
  )
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState(false)

  const document = state.document
  const candidates = state.document?.detectedInfos || []

  const unconfirmedCount = candidates.filter(c => !c.confirmed && !c.skipped).length
  const unresolvedPositions = candidates.filter(c => c.positions.length === 0).length
  const fileNameCheck = isFileNameSafe(document?.fileName || '')

  const canDownload =
    document != null &&
    document.originalFile != null &&
    unresolvedPositions === 0 &&
    fileNameCheck.ok &&
    document.fileType === 'docx'

  const downloadBlockReason = (): string | null => {
    if (!document) return '문서가 없습니다.'
    if (!document.originalFile) return '원본 문서를 다시 선택해야 합니다. 업로드 페이지로 돌아가세요.'
    if (document.fileType !== 'docx') return '현재 마스킹 사본 다운로드는 DOCX 형식만 지원합니다.'
    if (unresolvedPositions > 0) return `${unresolvedPositions}건의 항목이 원문 위치를 찾지 못했습니다. 위치를 확인하거나 직접 추가해야 합니다.`
    if (!fileNameCheck.ok) return fileNameCheck.reason || '파일 이름이 올바르지 않습니다.'
    return null
  }

  const handleBack = useCallback(() => {
    setPhase('review')
  }, [setPhase])

  const handleDownload = useCallback(async () => {
    if (!canDownload) {
      const reason = downloadBlockReason()
      if (reason) setError(reason)
      return
    }

    const doc = state.document
    if (!doc) return

    setExporting(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = {
        fileName: doc.fileName,
        fileType: doc.fileType,
        content: doc.content,
        candidates: doc.detectedInfos,
        properties: SAMPLE_PROPERTIES,
        propertyDeletions,
      }

      if (doc.fileType === 'docx' && doc.originalFile) {
        const base64 = await fileToBase64(doc.originalFile)
        payload.originalFileBase64 = base64
      }

      const response = await fetch('/api/export-masked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        if (response.status === 501) {
          setError(data.error || 'PDF 사본 생성은 아직 지원되지 않습니다.')
        } else {
          setError(data.error || '사본 생성 또는 검사에 실패했습니다.')
        }
        setExporting(false)
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const baseName = doc.fileName.replace(/\.[^.]+$/, '')
      const safeName = baseName.replace(/[\\/:*?"<>|]/g, '-')
      const ext = doc.fileType === 'pdf' ? '.pdf' : '.docx'
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${safeName}-마스킹${ext}`
      window.document.body.appendChild(a)
      a.click()
      window.document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setExported(true)
      setExporting(false)
      // 일정 시간 후 exported 상태 초기화 (재다운로드 가능)
      setTimeout(() => setExported(false), 3000)
    } catch (error) {
      setExporting(false)
      setError('사본 다운로드 중 오류가 발생했습니다.')
    }
  }, [canDownload, state.document, propertyDeletions, setError])

  const getEffectiveProperties = useCallback(() => {
    return SAMPLE_PROPERTIES.map(p => ({
      ...p,
      active: !propertyDeletions[p.key],
    }))
  }, [propertyDeletions])

  if (!document) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <ArrowLeft className="w-8 h-8 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">문서가 없습니다.</p>
        </div>
      </div>
    )
  }

  const blockReasons = [
    unresolvedPositions > 0 && `${unresolvedPositions}건 원문 위치 미해결`,
    !fileNameCheck.ok && fileNameCheck.reason,
  ].filter(Boolean) as string[]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-slate-800">사본 확인 및 내보내기</h1>
            <p className="text-xs text-slate-500">{document.fileName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setComparisonMode(!comparisonMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              comparisonMode
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            {comparisonMode ? '비교 중' : '사본만'}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 에러 메시지 */}
      {state.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">오류</p>
            <p className="text-sm text-red-700 mt-1">{state.error}</p>
          </div>
        </div>
      )}

      {/* 다운로드 조건 안내 */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">다운로드 전 확인 사항</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: '문서 속성', done: true, desc: '속성 목록을 확인하고 삭제할 항목과 유지할 항목을 정해주세요.' },
                { label: '최신 검사', done: true, desc: '가림과 삭제가 반영되고 남길 내용이 보존되었는지 실제 저장 파일에서 검사합니다.' },
                { label: '파일 이름', done: fileNameCheck.ok, desc: fileNameCheck.ok ? '파일명이 사용 가능한 문자로 구성되어 있습니다.' : fileNameCheck.reason || '파일명을 확인하세요.' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    item.done
                      ? 'border-green-200 bg-green-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    item.done ? 'bg-green-500' : 'bg-slate-200'
                  }`}>
                    {item.done && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${item.done ? 'text-green-700' : 'text-slate-800'}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 다운로드 차단 사유 */}
          {!canDownload && blockReasons.length > 0 && (
            <div className="mb-6 p-4 bg-redact-bg/10 border border-redact-bg/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-redact-bg flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-800">다운로드할 수 없습니다</p>
                <ul className="text-sm text-slate-700 mt-1 space-y-1 list-disc list-inside">
                  {blockReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 원본 vs 사본 비교 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* 원본 */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-slate-400" />
                  원본
                </h3>
                <span className="text-xs text-slate-400">{document.fileName}</span>
              </div>
              <div className="p-4 min-h-[300px] bg-slate-50">
                <div className="text-sm text-slate-600 whitespace-pre-wrap max-h-[400px] overflow-y-auto font-mono text-xs leading-relaxed">
                  {document.content.slice(0, 2000)}
                  {document.content.length > 2000 && '... (중략)'}
                </div>
              </div>
            </div>

            {/* 사본 */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-brand-50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-brand-700 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brand-500" />
                  사본 (마스킹 적용)
                </h3>
                <span className="text-xs text-brand-600">개인정보 처리 완료</span>
              </div>
              <div className="p-4 min-h-[300px] bg-white">
                <div className="text-sm text-slate-600 whitespace-pre-wrap max-h-[400px] overflow-y-auto font-mono text-xs leading-relaxed">
                  {applyMaskingToText(document.content, candidates)}
                </div>
              </div>
            </div>
          </div>

          {/* 문서 속성 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" />
                  문서 속성
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  본문 밖에 저장된 메타데이터입니다. 삭제를 기본으로 제안하며, 필요시 유지할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const allDelete = Object.fromEntries(SAMPLE_PROPERTIES.map(p => [p.key, true]))
                  setPropertyDeletions(allDelete)
                }}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                모두 삭제
              </button>
            </div>

            {/* 마스킹 방법 요약 */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-brand-500" />
                마스킹 적용 요약
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400">전체 가림</p>
                  <p className="text-slate-800 font-medium">
                    {candidates.filter(c => c.method === 'full').length}건
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">일부 가림</p>
                  <p className="text-slate-800 font-medium">
                    {candidates.filter(c => c.method === 'partial').length}건
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">삭제</p>
                  <p className="text-slate-800 font-medium">
                    {candidates.filter(c => c.method === 'delete').length}건
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">유지</p>
                  <p className="text-slate-800 font-medium">
                    {candidates.filter(c => c.method === 'keep').length}건
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {getEffectiveProperties().map((prop) => (
                <div
                  key={prop.key}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    prop.active ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      prop.active ? 'bg-green-100' : 'bg-slate-100'
                    }`}>
                      {prop.active ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Lock className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{prop.label}</p>
                      <p className="text-xs text-slate-500 font-mono truncate max-w-xs">
                        {prop.active ? prop.value : '(삭제됨)'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPropertyDeletions(prev => ({
                      ...prev,
                      [prop.key]: !prev[prop.key],
                    }))}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      prop.active
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {prop.active ? '유지' : '삭제'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 미검사 범위 안내 */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">확인하지 않은 항목이 있어도 추천된 마스킹 설정으로 사본이 생성됩니다</p>
              <p className="text-sm text-amber-700 mt-1">
                개별 항목을 눌러 처리 방법을 바꿀 수 있습니다. 지금은 따로 검토하지 않은 항목은 AI가 추천한 기본 마스킹 방식 그대로 내보냅니다.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 px-4 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          {state.undoHistory.length > 0 && (
            <button
              type="button"
              onClick={undo}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              실행 취소
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="px-6 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            뒤로
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={exporting || !canDownload}
            className={`flex items-center gap-2 px-6 py-2 text-sm font-semibold rounded-lg transition-colors ${
              exporting
                ? 'bg-brand-500 text-white'
                : exported
                ? 'bg-green-500 text-white'
                : canDownload
                ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/20'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                사본 생성 중...
              </>
            ) : exported ? (
              <>
                <Check className="w-4 h-4" />
                다운로드 완료
              </>
            ) : canDownload ? (
              <>
                <Download className="w-4 h-4" />
                사본 다운로드
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                조건 미충족
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  )
}
