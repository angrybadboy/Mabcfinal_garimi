'use client'

import { useCallback } from 'react'
import { ArrowLeft, ArrowRight, Users, Building2, Group, CircleUser, Maximize2, Lightbulb } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import type { RecipientType, KeepInfoOption } from '@/types'

const RECIPIENTS: { value: RecipientType; label: string; desc: string; icon: typeof Users }[] = [
  { value: 'external-partner', label: '외부 협력사', desc: '계약을 맺은 외부 파트너사', icon: Users },
  { value: 'submission-agency', label: '제출 기관', desc: '보고서나 자료를 제출하는 공공기관·재단', icon: Building2 },
  { value: 'customer', label: '고객', desc: '서비스나 제품 이용자', icon: CircleUser },
  { value: 'internal-team', label: '다른 내부 팀', desc: '같은 조직 내 다른 부서·팀', icon: Group },
  { value: 'other', label: '기타', desc: '위 항목에 해당하지 않는 경우', icon: CircleUser },
]

const KEEP_OPTIONS: { value: KeepInfoOption; label: string; desc: string }[] = [
  { value: 'contact-window', label: '문의 창구', desc: '수신자가 연락할 수 있는 창구 정보' },
  { value: 'department-name', label: '부서명', desc: '소속 부서명 또는 조직명' },
  { value: 'contact-person', label: '담당자 이름', desc: '담당자의 이름' },
  { value: 'none', label: '남길 정보 없음', desc: '모든 개인정보를 가립니다' },
]

export default function ContextPage() {
  const { state, updateSharingContext, setPhase, setError } = useApp()

  const handleRecipientChange = useCallback((value: RecipientType | null) => {
    updateSharingContext({ recipient: value })
  }, [updateSharingContext])

  const handlePurposeChange = useCallback((text: string) => {
    updateSharingContext({ purpose: text.slice(0, 200) })
  }, [updateSharingContext])

  const handleKeepChange = useCallback((value: KeepInfoOption | null) => {
    updateSharingContext({ keepInfo: value })
  }, [updateSharingContext])

  const handleBack = useCallback(() => {
    setPhase('upload')
  }, [setPhase])

  const handleNext = useCallback(() => {
    if (!state.document) {
      setError('문서가 선택되지 않았습니다.')
      return
    }
    setPhase('review')
  }, [state.document, setPhase, setError])

  const selectedRecipient = state.sharingContext.recipient
  const isRecipientComplete = selectedRecipient !== null
  const canProceed = isRecipientComplete

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                aria-label="이전 단계"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div className="flex items-center gap-2 ml-2">
                <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
                  2
                </div>
                <span className="text-lg font-bold text-slate-800">공유 상황</span>
              </div>
            </div>
            <div className="text-sm text-slate-500">
              문서: {state.document?.fileName}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
              <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-bold">
                2
              </div>
              <span className="text-sm font-medium text-slate-700">공유 상황</span>
            </div>
            <div className="flex-1 h-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center text-sm font-bold">
                3
              </div>
              <span className="text-sm font-medium text-slate-400">가림 검토</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 좌측: 질문 카드 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 질문 1: 누구에게 공유하는가 */}
              <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">누구에게 공유하시나요?</h2>
                    <p className="text-sm text-slate-500 mt-0.5">공유 대상을 선택해주세요. (필수)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {RECIPIENTS.map((option) => {
                    const Icon = option.icon
                    const selected = selectedRecipient === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleRecipientChange(
                          selected ? null : option.value
                        )}
                        className={`relative flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? 'border-brand-500 bg-brand-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selected
                            ? 'border-brand-500 bg-brand-500'
                            : 'border-slate-300'
                        }`}>
                          {selected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white" />
                          )}
                        </div>

                        <div className={`p-2 rounded-lg ${selected ? 'bg-brand-100' : 'bg-slate-100'}`}>
                          <Icon className={`w-5 h-5 ${selected ? 'text-brand-600' : 'text-slate-500'}`} />
                        </div>

                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-slate-800'}`}>
                            {option.label}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">{option.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {!isRecipientComplete && (
                  <p className="mt-3 text-sm text-amber-600 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4" />
                    공유 대상을 선택해주세요.
                  </p>
                )}
              </section>

              {/* 질문 2: 목적 */}
              <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Lightbulb className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">어떤 목적으로 공유하시나요?</h2>
                    <p className="text-sm text-slate-500 mt-0.5">공유 목적을 한 줄로 입력해주세요. (선택)</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.sharingContext.purpose}
                    onChange={(e) => handlePurposeChange(e.target.value)}
                    placeholder="예: 사업 결과 보고서 제출을 위해"
                    className="flex-1 px-4 py-2.5 border-2 border-slate-200 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() => handlePurposeChange('')}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      state.sharingContext.purpose
                        ? 'text-slate-500 hover:bg-slate-100'
                        : 'text-slate-400 bg-slate-100 cursor-not-allowed'
                    }`}
                    disabled={!state.sharingContext.purpose}
                  >
                    지우기
                  </button>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-400">
                    {state.sharingContext.purpose.length}/200자
                  </p>
                  {state.sharingContext.purpose && (
                    <button
                      type="button"
                      onClick={() => handlePurposeChange('')}
                      className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
                    >
                      입력하지 않고 건너뛰기
                    </button>
                  )}
                </div>
              </section>

              {/* 질문 3: 남길 정보 */}
              <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <Maximize2 className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">무엇을 남겨야 하나요?</h2>
                    <p className="text-sm text-slate-500 mt-0.5">공유 후에도 유지해야 할 정보가 있다면 선택해주세요.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {KEEP_OPTIONS.map((option) => {
                    const selected = state.sharingContext.keepInfo === option.value
                    const isNone = option.value === 'none'

                    let effectiveSelected = selected
                    if (isNone) {
                      effectiveSelected = state.sharingContext.keepInfo === 'none'
                    }

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (isNone) {
                            handleKeepChange('none')
                          } else {
                            if (state.sharingContext.keepInfo === 'none') {
                              handleKeepChange(option.value)
                            } else {
                              const current = state.sharingContext.keepInfo
                              handleKeepChange(current === option.value ? null : option.value)
                            }
                          }
                        }}
                        className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all w-full ${
                          effectiveSelected || (isNone && state.sharingContext.keepInfo === 'none')
                            ? 'border-brand-500 bg-brand-50 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                          effectiveSelected || (isNone && state.sharingContext.keepInfo === 'none')
                            ? 'border-brand-500 bg-brand-500'
                            : 'border-slate-300'
                        }`}>
                          {effectiveSelected || (isNone && state.sharingContext.keepInfo === 'none') ? (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : null}
                        </div>

                        <div className="flex-1">
                          <label className={`text-sm font-semibold cursor-pointer ${effectiveSelected ? 'text-brand-700' : 'text-slate-800'}`}>
                            {option.label}
                          </label>
                          <p className="text-xs text-slate-500 mt-0.5">{option.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {state.sharingContext.keepInfo && (
                  <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-200">
                    선택한 항목만 남기고 나머지 개인정보는 모두 처리됩니다.
                  </p>
                )}
              </section>
            </div>

            {/* 우측: 진행 요약 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm sticky top-24">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">진행 상황</h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">공유 대상</span>
                    <span className={`text-sm font-medium ${isRecipientComplete ? 'text-brand-600' : 'text-slate-400'}`}>
                      {isRecipientComplete 
                        ? RECIPIENTS.find(r => r.value === selectedRecipient)?.label || '-'
                        : '선택 필요'}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">공유 목적</span>
                    <span className="text-sm text-slate-400 max-w-[60%]">
                      {state.sharingContext.purpose || '입력 안 함'}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">남길 정보</span>
                    <span className={`text-sm font-medium ${state.sharingContext.keepInfo ? 'text-brand-600' : 'text-slate-400'}`}>
                      {state.sharingContext.keepInfo 
                        ? KEEP_OPTIONS.find(k => k.value === state.sharingContext.keepInfo)?.label || '-'
                        : '-'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500 mb-2">
                    <span className="font-medium">참고:</span> 공유 상황이나 문서 유형이 바뀌어도 
                    사용자가 직접 선택한 가림 처리는 보존됩니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 하단 CTA */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              className="px-6 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              뒤로
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed}
              className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
                canProceed
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/20'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              후보 검토하러 가기
              <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
