'use client'

import { useCallback, useState, useMemo } from 'react'
import DocxViewer from '@/components/view-document/docx-viewer'
import PartialMaskEditor from '@/components/partial-mask-editor'
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Filter,
  Plus,
  Scan,
  X,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Shield,
} from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import type { MaskingCandidate, MaskingMethod, InfoType } from '@/types'

const TYPE_LABELS: Record<InfoType, string> = {
  name: '이름',
  phone: '전화번호',
  email: '이메일',
  address: '주소',
  birthDate: '생년월일',
  ssn: '주민등록번호',
  foreignId: '외국인등록번호',
  passport: '여권번호',
  driverLicense: '운전면허번호',
  account: '계좌번호',
  creditCard: '카드번호',
  personalId: '개인 관리번호',
}

const METHOD_LABELS: Record<MaskingMethod, string> = {
  full: '전체 가림',
  partial: '일부 가림',
  delete: '삭제',
  keep: '유지',
}

const PARTIAL_PRESETS = [
  { key: 'partial-mid', label: '가운데 가리기', apply: (v: string) => v.replace(/^\d{3,4}-/, '****-').replace(/-(\d{4})$/, '-$1') },
  { key: 'partial-end', label: '앞자리만 남기기', apply: (v: string) => v.replace(/\d{4}$/, '****') },
  { key: 'partial-front', label: '뒷자리만 남기기', apply: (v: string) => v.replace(/^\d{3,4}-/, '****-') },
]

const METHODS = [
  { key: 'full' as const, label: '전체 가림', example: '████' },
  { key: 'partial' as const, label: '일부 가림', example: '010-****-1234' },
  { key: 'delete' as const, label: '삭제', example: '(원문 제거)' },
  { key: 'keep' as const, label: '유지', example: '원문 유지' },
]

type FilterMode = 'all' | 'full' | 'partial' | 'keep' | 'unconfirmed'

export default function ReviewPage() {
  const {
    state,
    setPhase,
    applyMethodToCandidate,
    applyMethodToAll,
    addCandidate,
    undo,
    confirmCandidate,
    skipCandidate,
    answerQuestion,
  } = useApp()

  const handleBack = useCallback(() => {
    setPhase('context')
  }, [setPhase])

  const handleNext = useCallback(() => {
    setPhase('export')
  }, [setPhase])

  // 필터 / 검색
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [manualType, setManualType] = useState<InfoType>('name')
  const [manualValue, setManualValue] = useState('')
  const [manualPositions, setManualPositions] = useState('')
  const [adding, setAdding] = useState(false)
  const [manualResult, setManualResult] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackType, setFeedbackType] = useState<'info' | 'success' | 'warning'>('info')

  // 유형별 토글 / 항목 확장
  const [expandedTypes, setExpandedTypes] = useState<Set<InfoType>>(
    new Set(Object.keys(TYPE_LABELS) as InfoType[])
  )
  const [expandedCandidateIds, setExpandedCandidateIds] = useState<Set<string>>(new Set())
  const [detailCandidate, setDetailCandidate] = useState<MaskingCandidate | null>(null)
  const [editingPartialId, setEditingPartialId] = useState<string | null>(null)

  const candidates = state.document?.detectedInfos || []

  // 피드백 표시 (짧은 시간 후 자동 해제)
  const showFeedback = useCallback((msg: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setFeedback(msg)
    setFeedbackType(type)
    setTimeout(() => setFeedback(null), 2500)
  }, [])

  const filtered = useMemo(() => {
    let list = candidates
    if (filter === 'full') list = list.filter(c => c.method === 'full')
    else if (filter === 'partial') list = list.filter(c => c.method === 'partial')
    else if (filter === 'keep') list = list.filter(c => c.method === 'keep')
    else if (filter === 'unconfirmed') list = list.filter(c => !c.confirmed && !c.skipped)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        c => c.value.toLowerCase().includes(q) || TYPE_LABELS[c.type].toLowerCase().includes(q)
      )
    }
    return list
  }, [candidates, filter, search])

  const groupedByType = useMemo(() => {
    const map = new Map<InfoType, MaskingCandidate[]>()
    for (const c of filtered) {
      if (!map.has(c.type)) map.set(c.type, [])
      map.get(c.type)!.push(c)
    }
    return map
  }, [filtered])

  const toggleType = useCallback((type: InfoType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const toggleCandidate = useCallback((id: string) => {
    setExpandedCandidateIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    const c = candidates.find(c => c.id === id)
    if (c) setDetailCandidate(c)
  }, [candidates])

  const handleManualAdd = useCallback(() => {
    if (!manualValue.trim() || !state.document) return
    setAdding(true)
    try {
      const positions = manualPositions
        .split('\n')
        .filter(Boolean)
        .map((line, i) => {
          const parts = line.trim().split(/\s+/)
          return {
            page: parseInt(parts[0]) || 1,
            start: parseInt(parts[1]) || 0,
            end: parseInt(parts[2]) || 0,
          }
        })

      const incoming: MaskingCandidate = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: manualType,
        value: manualValue.trim(),
        maskedValue: manualValue.trim(),
        positions: positions.length > 0 ? positions : [{ page: 1, start: 0, end: manualValue.length }],
        method: 'full',
        confirmed: false,
        skipped: false,
      }

      addCandidate(incoming)
      setManualResult('후보가 추가되었습니다.')
      setManualValue('')
      setManualPositions('')
    } catch {
      setManualResult('추가 중 오류가 발생했습니다.')
    } finally {
      setAdding(false)
    }
  }, [manualType, manualValue, manualPositions, state.document, addCandidate])

  const totalCount = candidates.length
  const fullPartialCount = candidates.filter(c => c.method === 'full' || c.method === 'partial').length
  const keepCount = candidates.filter(c => c.method === 'keep').length
  const unconfirmedCount = candidates.filter(c => !c.confirmed && !c.skipped).length

  const methodClass = (method: MaskingMethod) => {
    if (method === 'full') return 'bg-brand-100 text-brand-700'
    if (method === 'partial') return 'bg-amber-100 text-amber-700'
    if (method === 'delete') return 'bg-red-100 text-red-700'
    return 'bg-green-100 text-green-700'
  }

  if (!state.document) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <ArrowLeft className="w-8 h-8 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">문서가 없습니다.</p>
          <button
            type="button"
            onClick={() => setPhase('upload')}
            className="mt-4 text-sm text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            업로드 페이지로 돌아가기
          </button>
        </div>
      </div>
    )
  }

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
            <h1 className="text-sm font-semibold text-slate-800">가림 검토</h1>
            <p className="text-xs text-slate-500">{state.document.fileName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2 py-1 bg-brand-100 text-brand-700 rounded-full font-medium">
            {totalCount}건 탐지
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 좌측: 문서 뷰어 */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">문서 내용</h2>
                <p className="text-xs text-slate-500">{state.document.fileName}</p>
              </div>
              <div className="p-0 min-h-[400px] bg-slate-50">
                {state.document.originalFile ? (
                  <DocxViewer
                    file={state.document.originalFile}
                    candidates={state.document.detectedInfos}
                  />
                ) : (
                  <div className="p-6 text-sm text-slate-400 text-center py-12">
                    <p>문서 내용이 비어있습니다.</p>
                    <p className="text-xs mt-1">분석 결과가 없거나 파싱에 실패했을 수 있습니다.</p>
                  </div>
                )}

                {detailCandidate && (
                  <div className="mt-4 p-4 bg-brand-50 border border-brand-200 rounded-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {TYPE_LABELS[detailCandidate.type]}
                        </p>
                        <p className="text-sm font-mono text-slate-700 mt-1">
                          {detailCandidate.value}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          문서 내 {detailCandidate.positions.length}곳 · 처리:{' '}
                          {METHOD_LABELS[detailCandidate.method]}
                        </p>
                        {detailCandidate.positions.length > 0 && (
                          <div className="mt-2 text-xs text-slate-600">
                            {detailCandidate.positions.map((p, i) => (
                              <div
                                key={i}
                                className="bg-white px-2 py-1 rounded border border-slate-200 mb-1"
                              >
                                페이지 {p.page} · 오프셋 {p.start}–{p.end}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailCandidate(null)
                          setExpandedCandidateIds(prev => {
                            const next = new Set(prev)
                            next.delete(detailCandidate.id)
                            return next
                          })
                        }}
                        className="p-1 rounded hover:bg-white"
                        aria-label="닫기"
                      >
                        <ArrowRight className="w-4 h-4 text-slate-500 rotate-180" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 우측: 마스킹 정보 패널 */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-700">마스킹 정보</h2>
              </div>

              {/* 탭: 자동 탐지 / 직접 추가 */}
              <div className="px-4 pt-3 flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setManualResult(null)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${manualResult === null ? 'bg-white shadow-sm' : 'hover:text-slate-700'}`}
                >
                  <Scan className="w-3.5 h-3.5" />
                  자동 탐지
                </button>
                <button
                  type="button"
                  onClick={() => setManualResult('manual')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${manualResult === 'manual' ? 'bg-white shadow-sm' : 'hover:text-slate-700'}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  직접 추가
                </button>
              </div>

              <div className="p-4 max-h-[500px] overflow-y-auto">
                {/* 피드백 메시지 */}
                {feedback && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-3 text-xs ${feedbackType === 'success' ? 'bg-green-50 border-green-200 text-green-700' : feedbackType === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                    {feedback}
                  </div>
                )}
                {/* 자동 탐지: 유형별 토글 그룹 */}
                {manualResult === null ? (
                  <>
                    {/* 검색 / 필터 */}
                    <div className="space-y-3">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="값이나 유형으로 검색"
                          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-slate-400" />
                        <select
                          value={filter}
                          onChange={e => setFilter(e.target.value as FilterMode)}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:border-brand-500 outline-none"
                        >
                          <option value="all">전체</option>
                          <option value="unconfirmed">미확인만</option>
                          <option value="full">전체 가림</option>
                          <option value="partial">일부 가림</option>
                          <option value="keep">유지</option>
                        </select>
                      </div>
                    </div>

                    {filtered.length === 0 ? (
                      <div className="text-center py-8 text-sm text-slate-500">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-slate-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                            />
                          </svg>
                        </div>
                        {search ? '검색 결과가 없습니다.' : '탐지된 개인정보 후보가 없습니다.'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(TYPE_LABELS).map(([type, label]) => {
                          const typeKey = type as InfoType
                          const typeValues = groupedByType.get(typeKey)
                          if (!typeValues || typeValues.length === 0) return null
                          const isExpandedType = expandedTypes.has(typeKey)
                          const unconfirmedInType = typeValues
                            .filter(c => !c.confirmed && !c.skipped).length
                          const totalOccurrences = typeValues.length

                          return (
                            <div key={type} className="border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                              <button
                                type="button"
                                onClick={() => toggleType(typeKey)}
                                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 rounded-lg transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {isExpandedType ? (
                                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                  )}
                                  <span className="text-sm font-medium text-slate-800">{label}</span>
                                  <span className="text-xs text-slate-400">
                                    고유 {typeValues.length}건 · 총 {totalOccurrences}회
                                  </span>
                                  {unconfirmedInType > 0 && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                                      미확인 {unconfirmedInType}
                                    </span>
                                  )}
                                </div>
                              </button>
                              {isExpandedType && (
                                <div className="px-3 pb-3 space-y-1 bg-slate-50/50 rounded-b-lg">
                                  {typeValues.map((candidate: MaskingCandidate) => {
                                    const isExpandedItem = expandedCandidateIds.has(candidate.id)
                                    return (
                                      <div key={candidate.id} className="border-b border-slate-100 last:border-b-0">
                                        <button
                                          type="button"
                                          onClick={() => toggleCandidate(candidate.id)}
                                          className="w-full flex items-center justify-between p-3 text-left hover:bg-white rounded-md transition-colors"
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs font-medium text-slate-500 uppercase flex-shrink-0">
                                              {TYPE_LABELS[candidate.type]}
                                            </span>
                                            <span className="text-sm font-mono text-slate-800 truncate">
                                              {candidate.value}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${methodClass(candidate.method)}`}>
                                              {METHOD_LABELS[candidate.method]}
                                            </span>
                                            {isExpandedItem ? (
                                              <ChevronDown className="w-4 h-4 text-slate-400" />
                                            ) : (
                                              <ChevronRight className="w-4 h-4 text-slate-400" />
                                            )}
                                          </div>
                                        </button>
                                        {isExpandedItem && (
                                          <div className="px-3 pb-3 space-y-3 bg-white rounded-b-md border border-slate-200 border-t-0">
                                            {/* 처리 방법 선택 */}
                                            <div>
                                              <p className="text-xs font-medium text-slate-500 mb-2">처리 방법 선택</p>
                                              <div className="grid grid-cols-2 gap-2">
                                                {METHODS.map((method) => {
                                                  const selected = candidate.method === method.key
                                                  return (
                                                    <button
                                                      key={method.key}
                                                      type="button"
                                                      onClick={() => {
                                                        applyMethodToCandidate(candidate.id, method.key)
                                                        showFeedback(`${TYPE_LABELS[candidate.type]} → ${METHOD_LABELS[method.key]}`, 'success')
                                                      }}
                                                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                                                        selected
                                                          ? 'border-brand-500 bg-brand-50 shadow-sm'
                                                          : 'border-slate-200 bg-white hover:border-slate-300'
                                                      }`}
                                                    >
                                                      <span className={`text-xs font-medium ${selected ? 'text-brand-700' : 'text-slate-600'}`}>
                                                        {method.label}
                                                      </span>
                                                      <span className="text-[10px] text-slate-400">{method.example}</span>
                                                    </button>
                                                  )
                                                })}
                                              </div>
                                            </div>

                                            {/* 일부 가림 */}
                                            {candidate.method === 'partial' && (
                                              <div>
                                                <p className="text-xs font-medium text-slate-500 mb-2">일부 가림</p>
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                  {PARTIAL_PRESETS.map((preset) => {
                                                    const preview = preset.apply(candidate.value)
                                                    const isActive = candidate.appliedPreset === preset.key
                                                    return (
                                                      <button
                                                        key={preset.key}
                                                        type="button"
                                                        onClick={() => {
                                                          applyMethodToCandidate(candidate.id, 'partial', preset.apply(candidate.value), preset.key)
                                                          showFeedback(`${preset.label} 적용 → ${preset.apply(candidate.value)}`, 'success')
                                                        }}
                                                        className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border-2 transition-all ${
                                                          isActive
                                                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                                                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                                                          }`}
                                                      >
                                                        <span className="font-medium">{preset.label}</span>
                                                        <span className="text-slate-400">→</span>
                                                        <span className="font-mono">{preview}</span>
                                                      </button>
                                                    )
                                                  })}
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => setEditingPartialId(candidate.id)}
                                                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                                                >
                                                  직접 글자 선택하기
                                                </button>
                                                {editingPartialId === candidate.id && (
                                                  <PartialMaskEditor
                                                    value={candidate.value}
                                                    currentReplacement={candidate.maskedValue}
                                                    onApply={(replacement) => {
                                                      applyMethodToCandidate(candidate.id, 'partial', replacement, '__custom__')
                                                      setEditingPartialId(null)
                                                    }}
                                                    onCancel={() => setEditingPartialId(null)}
                                                  />
                                                )}
                                              </div>
                                            )}

                                            {/* 적용 범위 */}
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                              <p className="text-xs font-medium text-slate-500 mb-2">적용 범위</p>
                                              <div className="flex items-center gap-2 text-sm flex-wrap">
                                                <span className="text-slate-700 font-medium">
                                                  현재 위치 {candidate.positions.length}곳
                                                </span>
                                                <span className="text-slate-300">|</span>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const sameValueIds = candidates.filter(
                                                      c => c.type === candidate.type && c.value === candidate.value
                                                    ).map(c => c.id)
                                                    if (sameValueIds.length > 1) {
                                                      applyMethodToAll(candidate.method, sameValueIds)
                                                      showFeedback(`같은 값의 ${sameValueIds.length}곳에 ${METHOD_LABELS[candidate.method]} 적용`, 'success')
                                                    } else {
                                                      showFeedback('같은 값이 1건뿐입니다.', 'info')
                                                    }
                                                  }}
                                                  className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                                                >
                                                  같은 값의 모든 위치로
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const sameTypeIds = candidates.filter(
                                                      c => c.type === candidate.type
                                                    ).map(c => c.id)
                                                    if (sameTypeIds.length > 1) {
                                                      applyMethodToAll(candidate.method, sameTypeIds)
                                                      showFeedback(`같은 종류 ${sameTypeIds.length}건에 ${METHOD_LABELS[candidate.method]} 적용`, 'success')
                                                    } else {
                                                      showFeedback('같은 종류가 1건뿐입니다.', 'info')
                                                    }
                                                  }}
                                                  className="text-brand-600 hover:text-brand-700 text-xs font-medium"
                                                >
                                                  같은 종류 전체
                                                </button>
                                              </div>
                                            </div>

                                            {/* 액션 */}
                                            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  confirmCandidate(candidate.id)
                                                  showFeedback('확인 완료 처리됨', 'success')
                                                }}
                                                className="px-4 py-1.5 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                              >
                                                확인 완료
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  skipCandidate(candidate.id)
                                                  showFeedback('건너뛰기 처리됨', 'info')
                                                }}
                                                className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                              >
                                                건너뛰기
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  applyMethodToCandidate(candidate.id, 'full')
                                                  showFeedback(`${TYPE_LABELS[candidate.type]} → 전체 가림`, 'warning')
                                                }}
                                                className="px-4 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors"
                                              >
                                                모르겠음 → 전체 가림
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* 직접 추가 폼 */
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={manualValue}
                        onChange={e => setManualValue(e.target.value)}
                        placeholder="가릴 값 입력 (예: 홍길동)"
                        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">유형</label>
                      <select
                        value={manualType}
                        onChange={e => setManualType(e.target.value as InfoType)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-brand-500 outline-none"
                      >
                        {Object.entries(TYPE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">
                        위치 (페이지 번호 시작오프셋 끝오프셋, 한 줄씩)
                      </label>
                      <textarea
                        value={manualPositions}
                        onChange={e => setManualPositions(e.target.value)}
                        placeholder="1 0 50\n1 100 150"
                        rows={3}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:border-brand-500 outline-none resize-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleManualAdd}
                      disabled={!manualValue.trim() || adding}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {adding ? (
                        <>
                          <RotateCcw className="w-4 h-4 animate-spin" />
                          추가 중...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          후보 추가
                        </>
                      )}
                    </button>
                    {manualResult && (
                      <p
                        className={`text-xs flex items-center gap-1 ${
                          manualResult.includes('실패') || manualResult.includes('오류')
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        {manualResult.includes('실패') || manualResult.includes('오류') ? (
                          <X className="w-3.5 h-3.5" />
                        ) : (
                          <Shield className="w-3.5 h-3.5" />
                        )}
                        {manualResult}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 처리 현황 요약 */}
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <p className="text-slate-400">전체 가림</p>
                    <p className="text-slate-800 font-medium">{candidates.filter(c => c.method === 'full').length}건</p>
                  </div>
                  <div>
                    <p className="text-slate-400">일부 가림</p>
                    <p className="text-slate-800 font-medium">{candidates.filter(c => c.method === 'partial').length}건</p>
                  </div>
                  <div>
                    <p className="text-slate-400">삭제</p>
                    <p className="text-slate-800 font-medium">{candidates.filter(c => c.method === 'delete').length}건</p>
                  </div>
                  <div>
                    <p className="text-slate-400">유지</p>
                    <p className="text-slate-800 font-medium">{candidates.filter(c => c.method === 'keep').length}건</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 하단: 진행 요약 */}
          <div className="mt-8 p-4 bg-white rounded-xl border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">검토 요약</h3>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-brand-600">{totalCount}</p>
                <p className="text-xs text-slate-500">탐지된 후보</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{fullPartialCount}</p>
                <p className="text-xs text-slate-500">가림 처리</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{keepCount}</p>
                <p className="text-xs text-slate-500">유지</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{unconfirmedCount}</p>
                <p className="text-xs text-slate-500">미확인</p>
              </div>
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
            onClick={handleNext}
            className="px-6 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/20 transition-colors"
          >
            가림 결과 확인하러 가기
            <ArrowRight className="w-4 h-4 inline ml-1" />
          </button>
        </div>
      </footer>
    </div>
  )
}
