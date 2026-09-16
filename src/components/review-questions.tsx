'use client'

import { useState } from 'react'
import { AlertCircle, Check, Shield, X } from 'lucide-react'

interface ReviewQuestion {
  id: string
  candidateId: string
  question: string
  candidateType: string
  candidateValue: string
  answered?: 'redact' | 'keep' | 'unsure'
}

export type { ReviewQuestion }

interface ReviewQuestionItemProps {
  question: ReviewQuestion
  onAnswer: (id: string, answer: 'redact' | 'keep' | 'unsure') => void
}

function ReviewQuestionItem({ question, onAnswer }: ReviewQuestionItemProps) {
  const answered = question.answered

  return (
    <div className="p-4 rounded-xl border-2 transition-colors bg-white">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {answered ? (
            answered === 'redact' ? (
              <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            ) : answered === 'keep' ? (
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )
          ) : (
            <div className="w-5 h-5 rounded-full bg-slate-200" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{question.question}</p>
          <p className="text-xs text-slate-500 mt-1">
            ({question.candidateType}) {question.candidateValue}
          </p>
          {answered && (
            <p className="text-xs mt-1.5 font-medium text-slate-600">
              → {answered === 'redact' ? '가리기' : answered === 'keep' ? '남기기' : '모르겠음 → 전체 가림'}
            </p>
          )}
        </div>
      </div>

      {!answered && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button
            type="button"
            onClick={() => onAnswer(question.id, 'redact')}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            가리기
          </button>
          <button
            type="button"
            onClick={() => onAnswer(question.id, 'keep')}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
          >
            남기기
          </button>
          <button
            type="button"
            onClick={() => onAnswer(question.id, 'unsure')}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-400 text-amber-900 hover:bg-amber-300 transition-colors"
          >
            모르겠음 → 전체 가림
          </button>
        </div>
      )}
    </div>
  )
}

interface ReviewQuestionsProps {
  questions: ReviewQuestion[]
  onAnswer: (id: string, answer: 'redact' | 'keep' | 'unsure') => void
}

export default function ReviewQuestions({ questions, onAnswer }: ReviewQuestionsProps) {
  const pending = questions.filter(q => q.answered === undefined)
  const done = questions.filter(q => q.answered !== undefined)

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <Shield className="w-4 h-4 text-brand-500" />
        AI 제안 질문
        {pending.length > 0 && (
          <span className="text-xs font-normal text-slate-400">({pending.length}건)</span>
        )}
      </h3>

      {questions.length === 0 ? (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
          확인할 질문이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map(q => (
            <ReviewQuestionItem key={q.id} question={q} onAnswer={onAnswer} />
          ))}
          {done.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 py-1">
                답변 완료 {done.length}건
              </summary>
              <div className="space-y-2 mt-2 pl-2 border-l-2 border-slate-200">
                {done.map(q => (
                  <ReviewQuestionItem key={q.id} question={q} onAnswer={onAnswer} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
