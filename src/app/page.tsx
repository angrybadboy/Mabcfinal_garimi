'use client'

import { useCallback, useState, useRef } from 'react'
import { Shield, FileText, File, Upload, Sparkles, Play, Check, AlertCircle, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import { AiToggle } from '@/components/ai-toggle'
import { UploadZone } from '@/components/upload-zone'
import { useApp } from '@/contexts/AppContext'
import ContextPage from '@/app/context/page'
import ReviewPage from '@/app/review/page'
import ExportPage from '@/app/export/page'
import type { DocumentInfo } from '@/types'

function UploadPageContent({ 
  selectedFileName, 
  setSelectedFileName,
  selectedFileType, 
  setSelectedFileType,
  selectedFileSize, 
  setSelectedFileSize,
  localError, 
  setLocalError,
  handleFileSelected, 
  handleError,
  handleAnalyze,
  handleAiToggle,
  handleExampleDocument,
}: { 
  selectedFileName: string | null
  setSelectedFileName: (name: string | null) => void
  selectedFileType: 'docx' | null
  setSelectedFileType: (type: 'docx' | null) => void
  selectedFileSize: number | null
  setSelectedFileSize: (size: number | null) => void
  localError: string | null
  setLocalError: (error: string | null) => void
  handleFileSelected: (file: File) => void
  handleError: (error: string) => void
  handleAnalyze: () => void
  handleAiToggle: (enabled: boolean) => void
  handleExampleDocument: () => void
}) {
  const { state } = useApp()

  // 문서 유형 표시
  const getDocumentTypeLabel = (type: string | null): string => {
    if (!type) return '문서 유형 미분석'
    const labels: Record<string, string> = {
      'report-meeting': '보고·회의',
      'contract-agreement': '계약·합의',
      'transaction-settlement': '거래·정산',
      'application-list-personnel': '신청·명단·인사',
      'consultation-complaint-interview': '상담·민원·인터뷰',
      'other': '기타',
    }
    return labels[type] || type
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Shield className="w-7 h-7 text-brand-500" />
              <span className="text-xl font-bold text-slate-800">가리미</span>
              <span className="hidden sm:block text-sm text-slate-500 ml-2">문서 개인정보 마스킹 서비스</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>AI 분석</span>
              <AiToggle 
                enabled={state.aiEnabled} 
                onToggle={handleAiToggle} 
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* 단계 표시 */}
          <div className="flex items-center gap-2 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold">
                1
              </div>
              <span className="text-sm font-medium text-slate-700">문서 선택</span>
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-sm font-bold">
                2
              </div>
              <span className="text-sm font-medium text-slate-400">공유 상황</span>
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <span className="text-sm font-medium text-slate-400">가림 검토</span>
            </div>
          </div>

          {/* 업로드 영역 */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 text-center mb-2">
              문서 속 개인정보를<br />찾아 마스킹하세요
            </h1>
            <p className="text-slate-500 text-center mb-8 max-w-lg mx-auto">
              PDF나 DOCX 문서를 올리면 개인정보가 포함된 항목을 자동으로 찾아드립니다.
              공유 상황에 맞게 가릴 정보를 선택하고, 처리된 사본을 받아보세요.
            </p>

            <UploadZone 
              onFileSelected={handleFileSelected}
              onError={handleError}
              maxSizeMB={50}
              maxSizeLabel="50MB"
            />
          </div>

          {/* 숨겨진 파일 입력 */}
          <input
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            id="file-upload-input"
            onChange={(e) => {
              const files = e.target.files
              if (files && files.length > 0) {
                handleFileSelected(files[0])
              }
            }}
          />

          {/* 에러 메시지 */}
          {localError && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{localError}</p>
              <button
                type="button"
                onClick={() => setLocalError(null)}
                className="text-red-600 hover:text-red-800 text-sm font-medium ml-auto"
              >
                닫기
              </button>
            </div>
          )}

          {/* 예시 문서 버튼 */}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleExampleDocument}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              <FileText className="w-4 h-4" />
              예시 문서로 시작하기
            </button>
          </div>

          {/* 마스킹 시작하기 버튼 */}
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedFileName || state.isProcessing}
              className={`inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-base transition-all duration-200 ${
                selectedFileName && !state.isProcessing
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/20 hover:shadow-xl hover:shadow-brand-500/30 active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {state.isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {state.processingStep || '처리 중...'}
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  마스킹 시작하기
                </>
              )}
            </button>
            {!selectedFileName && !state.isProcessing && (
              <p className="mt-3 text-sm text-slate-500">
                문서 파일을 선택하면 버튼이 활성화됩니다.
              </p>
            )}
          </div>

          {/* 문서 정보 미리보기 (선택 시) */}
          {selectedFileName && selectedFileType && selectedFileSize && (
            <div className="mt-8 max-w-lg mx-auto bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <File className="w-4 h-4 text-slate-400" />
                선택한 문서
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">파일명</p>
                  <p className="text-slate-800 font-medium truncate">{selectedFileName}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">형식</p>
                  <p className="text-slate-800 font-medium">DOCX</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">크기</p>
                  <p className="text-slate-800 font-medium">
                    {(selectedFileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">문서 유형</p>
                  <p className="text-slate-800 font-medium">{getDocumentTypeLabel(state.document?.documentType ?? null)}</p>
                </div>
                {state.document && (
                  <div className="col-span-2">
                    <p className="text-slate-500 text-xs">감지된 개인정보 후보</p>
                    <p className="text-slate-800 font-medium">
                      {state.document.detectedInfos.length}건 발견
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 처리 중 오버레이 */}
          {state.isProcessing && (
            <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-100 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  문서를 분석하고 있습니다
                </h3>
                <p className="text-sm text-slate-500 mb-6">
                  {state.processingStep || '잠시만 기다려주세요...'}
                </p>
                <div className="flex justify-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-brand-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 하단 푸터 */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-slate-500">
          <p>가리미 — 문서 속 개인정보를 찾아 공유 상황에 맞게 가린 사본을 만드는 AI 마스킹 서비스</p>
        </div>
      </footer>
    </div>
  )
}

export default function Home() {
  const { state, setDocument, setPhase, setProcessing, setProcessingStep, setError, setAiEnabled, updateSharingContext } = useApp()
  
  // 업로드 관련 로컬 state
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFileType, setSelectedFileType] = useState<'docx' | null>(null)
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 파일 선택 핸들러
  const handleFileSelected = useCallback((file: File) => {
    setSelectedFileName(file.name)
    setSelectedFileType('docx')
    setSelectedFileSize(file.size)
    setSelectedFile(file)
    setLocalError(null)
  }, [])

  // 에러 핸들러
  const handleError = useCallback((error: string) => {
    setLocalError(error)
  }, [])

  // 분석 시작 핸들러
  const handleAnalyze = useCallback(async () => {
    if (!selectedFile) return

    setProcessing(true)
    setProcessingStep('문서를 업로드하고 있습니다...')
    setError(null)
    setLocalError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('ai_enabled', state.aiEnabled ? 'true' : 'false')
      formData.append('recipient', state.sharingContext.recipient || '')
      formData.append('purpose', state.sharingContext.purpose || '')
      formData.append('keepInfo', state.sharingContext.keepInfo || '')

      setProcessingStep('문서 내용을 분석하고 있습니다...')

      const response = await fetch('/api/analysis', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '문서 분석에 실패했습니다.')
      }

      const result: DocumentInfo = await response.json()

      setDocument({ ...result, originalFile: selectedFile })
      setPhase('context')

      setProcessingStep('분석 완료!')
      setTimeout(() => {
        setProcessing(false)
        setProcessingStep(null)
      }, 500)

    } catch (error) {
      setProcessing(false)
      setProcessingStep(null)
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      setError(message)
      setLocalError(message)
    }
  }, [selectedFile, state.aiEnabled, setDocument, setPhase, setProcessing, setProcessingStep, setError])

  // AI 토글 핸들러
  const handleAiToggle = useCallback((enabled: boolean) => {
    setAiEnabled(enabled)
  }, [setAiEnabled])

  // 예시 문서 핸들러
  const handleExampleDocument = useCallback(async () => {
    try {
      const response = await fetch('/api/example-document')
      if (!response.ok) {
        throw new Error('예시 문서 생성 실패')
      }
      const blob = await response.blob()
      const file = new (globalThis as any).File([blob], '예시-지역아동센터-결과보고서.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      setSelectedFileName(file.name)
      setSelectedFileType('docx')
      setSelectedFileSize(file.size)
      setSelectedFile(file)
      setLocalError(null)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '예시 문서 로딩 실패')
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {state.phase === 'upload' && (
        <UploadPageContent
          selectedFileName={selectedFileName}
          setSelectedFileName={setSelectedFileName}
          selectedFileType={selectedFileType}
          setSelectedFileType={setSelectedFileType}
          selectedFileSize={selectedFileSize}
          setSelectedFileSize={setSelectedFileSize}
          localError={localError}
          setLocalError={setLocalError}
          handleFileSelected={handleFileSelected}
          handleError={handleError}
          handleAnalyze={handleAnalyze}
          handleAiToggle={handleAiToggle}
          handleExampleDocument={handleExampleDocument}
        />
      )}
      {state.phase === 'context' && <ContextPage />}
      {state.phase === 'review' && <ReviewPage />}
      {state.phase === 'export' && <ExportPage />}
    </div>
  )
}
