'use client'

import { useCallback, useEffect, useState } from 'react'
import { MaskingMethod } from '@/types'

interface PartialMaskEditorProps {
  value: string
  currentReplacement?: string
  onApply: (replacement: string) => void
  onCancel: () => void
}

/**
 * 일부 가림 직접 글자 선택 편집기
 * - 원문의 각 글자를 타일로 보여줌
 * - toggled true = 남김(보이는 글자), false = 가림
 * - 미리보기로 결과 문자열 표시
 * - "같은 원문 값에만 적용" 안내 포함
 */
export default function PartialMaskEditor({ value, currentReplacement, onApply, onCancel }: PartialMaskEditorProps) {
  const [toggled, setToggled] = useState<boolean[]>(() => {
    if (currentReplacement && currentReplacement !== value) {
      // 기존 커스텀 교체가 있으면, 표시된 글자만 toggled로 복원 시도
      const keptIndices: boolean[] = []
      for (let i = 0; i < value.length; i++) {
        keptIndices.push(i < currentReplacement.length && currentReplacement[i] === value[i])
      }
      return keptIndices
    }
    // 기본값: 첫 글자만 표시, 나머지는 숨김 (일부 가림 상태를 바로 보여줌)
    return value.split('').map((_, i) => i === 0)
  })

  const toggle = useCallback((i: number) => {
    setToggled(prev => {
      const next = [...prev]
      next[i] = !next[i]
      return next
    })
  }, [])

  // value 또는 currentReplacement 변경 시 toggled 동기화
  useEffect(() => {
    if (currentReplacement && currentReplacement !== value) {
      const keptIndices: boolean[] = []
      for (let i = 0; i < value.length; i++) {
        keptIndices.push(i < currentReplacement.length && currentReplacement[i] === value[i])
      }
      setToggled(keptIndices)
    } else {
      setToggled(value.split('').map((_, i) => i === 0))
    }
  }, [value, currentReplacement])

  const replacement = toggled.map((on, i) => (on ? value[i] : '•')).join('')

  const allOff = toggled.every(o => !o)
  const allOn = toggled.every(o => o)

  const canApply = !allOn && !allOff

  return (
    <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600">일부 가림 — 직접 글자 선택</p>
        <span className="text-[10px] text-slate-400">같은 원문 값에만 적용됨</span>
      </div>

      {/* 원본 값 */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-slate-400 mr-1">원문:</span>
        {value.split('').map((ch, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={`w-8 h-8 flex items-center justify-center text-sm font-mono rounded-md border-2 transition-all ${
              toggled[i]
                ? 'border-slate-300 bg-white text-slate-800 hover:border-brand-400'
                : 'border-slate-200 bg-slate-100 text-slate-300'
            }`}
            title={toggled[i] ? '숨김' : '표시'}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </button>
        ))}
      </div>

      {/* 조작 행 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setToggled(value.split('').map(() => true))}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            allOn ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'
          }`}
        >
          모두 표시
        </button>
        <button
          type="button"
          onClick={() => setToggled(value.split('').map(() => false))}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            allOff ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'
          }`}
        >
          모두 숨김
        </button>
      </div>

      {/* 미리보기 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">결과:</span>
        <span className="text-sm font-mono px-2 py-1 bg-white rounded border border-slate-200 break-all">
          {replacement || '\u00A0'}
        </span>
        {allOn && <span className="text-[10px] text-amber-600">(일부 가림 아님 — 바꾸기 필요)</span>}
        {allOff && <span className="text-[10px] text-amber-600">(빈 가림 — 일부 가림으로 적용 안 됨)</span>}
      </div>

      {/* 액션 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onApply(replacement)}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors ${canApply ? '' : 'opacity-60'}`}
        >
          적용
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
        >
          취소
        </button>
      </div>
      {!canApply && (
        <p className="text-[10px] text-amber-600 text-center">
          {allOn ? '모두 표시 상태입니다 — 적용해도 일부 가림이 되지 않습니다.' : '모두 숨김 상태입니다 — 적용해도 빈 가림이 됩니다.'}
        </p>
      )}
    </div>
  )
}
