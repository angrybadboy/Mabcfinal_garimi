'use client'

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react'
import type {
  AppPhase,
  AppState,
  DocumentInfo,
  SharingContext,
  MaskingCandidate,
  DocumentType,
  MaskingMethod,
  InfoType,
} from '@/types'
import { DEFAULT_METHOD_BY_TYPE } from '@/types'

// 초기 상태
const initialState: AppState = {
  phase: 'upload',
  document: null,
  sharingContext: {
    recipient: null,
    purpose: '',
    keepInfo: null,
  },
  aiEnabled: true,
  isProcessing: false,
  error: null,
  processingStep: null,
  undoHistory: [],
}

// 액션 타입
type Action =
  | { type: 'SET_PHASE'; payload: AppPhase }
  | { type: 'SET_DOCUMENT'; payload: DocumentInfo | null }
  | { type: 'UPDATE_SHARING_CONTEXT'; payload: Partial<SharingContext> }
  | { type: 'SET_AI_ENABLED'; payload: boolean }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_PROCESSING_STEP'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' }
  | { type: 'UPDATE_CANDIDATE'; payload: { id: string; updates: Partial<MaskingCandidate> } }
  | { type: 'APPLY_METHOD_TO_CANDIDATE'; payload: { id: string; method: MaskingMethod; customReplacement?: string; presetKey?: string } }
  | { type: 'APPLY_METHOD_TO_ALL'; payload: { method: MaskingMethod; candidateIds: string[] } }
  | { type: 'CONFIRM_CANDIDATE'; payload: string }
  | { type: 'SKIP_CANDIDATE'; payload: string }
  | { type: 'TOGGLE_CONFIRM_CANDIDATE'; payload: string }
  | { type: 'UNDO' }
  | { type: 'ADD_CANDIDATE'; payload: MaskingCandidate }
  | { type: 'ANSWER_QUESTION'; payload: { candidateId: string; answer: 'redact' | 'keep' | 'unsure' } }

// 리듀서
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.payload }
    case 'SET_DOCUMENT': {
      const doc = action.payload
      return {
        ...state,
        document: doc ? { ...doc, originalFile: doc.originalFile ?? state.document?.originalFile ?? undefined } : null,
      }
    }
    case 'UPDATE_SHARING_CONTEXT':
      return { 
        ...state, 
        sharingContext: { 
          ...state.sharingContext, 
          ...action.payload 
        } 
      }
    case 'SET_AI_ENABLED':
      return { ...state, aiEnabled: action.payload }
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload }
    case 'SET_PROCESSING_STEP':
      return { ...state, processingStep: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'RESET':
      return initialState
    case 'UPDATE_CANDIDATE': {
      if (!state.document) return state
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(c =>
            c.id === action.payload.id ? { ...c, ...action.payload.updates } : c
          ),
        },
      }
    }
    case 'APPLY_METHOD_TO_CANDIDATE': {
      if (!state.document) return state
      const candidate = state.document.detectedInfos.find(c => c.id === action.payload.id)
      if (!candidate) return state
      const method = action.payload.method
      let maskedValue = candidate.maskedValue
      let appliedPreset: string | undefined
      if (method === 'full') {
        maskedValue = '•'.repeat(Math.max(candidate.value.length, 4))
        appliedPreset = undefined
      } else if (method === 'partial') {
        maskedValue = action.payload.customReplacement || candidate.value
        appliedPreset = action.payload.presetKey || '__custom__'
        // customReplacement가 없으면 기본 프리셋 적용
        if (!action.payload.customReplacement) {
          maskedValue = candidate.value.replace(/^\d{3,4}-/, '****-').replace(/-(\d{4})$/, '-$1')
        }
      } else if (method === 'delete') {
        maskedValue = ''
        appliedPreset = undefined
      } else {
        maskedValue = candidate.value
        appliedPreset = undefined
      }
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(c =>
            c.id === action.payload.id
              ? { ...c, method, customReplacement: action.payload.customReplacement, maskedValue, appliedPreset }
              : c
          ),
        },
      }
    }
    case 'APPLY_METHOD_TO_ALL': {
      if (!state.document) return state
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(c =>
            action.payload.candidateIds.includes(c.id)
              ? {
                  ...c,
                  method: action.payload.method,
                  maskedValue: action.payload.method === 'full'
                    ? '•'.repeat(Math.max(c.value.length, 4))
                    : action.payload.method === 'delete'
                    ? ''
                    : action.payload.method === 'partial'
                    ? (c.customReplacement || c.value.replace(/^\d{3,4}-/, '****-').replace(/-(\d{4})$/, '-$1'))
                    : c.value,
                  appliedPreset: action.payload.method === 'partial' ? (c.appliedPreset || '__bulk__') : undefined,
                }
              : c
          ),
        },
      }
    }
    case 'CONFIRM_CANDIDATE': {
      if (!state.document) return state
      const c = state.document.detectedInfos.find(x => x.id === action.payload)
      const defaultMethod = c ? DEFAULT_METHOD_BY_TYPE[c.type] : 'full'
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(cand =>
            cand.id === action.payload
              ? {
                  ...cand,
                  method: ['full', 'partial', 'delete', 'keep'].includes(cand.method) ? cand.method : defaultMethod,
                  confirmed: true,
                  skipped: false,
                }
              : cand
          ),
        },
      }
    }
    case 'SKIP_CANDIDATE': {
      if (!state.document) return state
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(c =>
            c.id === action.payload ? { ...c, skipped: true, confirmed: false } : c
          ),
        },
      }
    }
    case 'TOGGLE_CONFIRM_CANDIDATE': {
      if (!state.document) return state
      const c = state.document.detectedInfos.find(c => c.id === action.payload)
      if (!c) return state
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(cand =>
            cand.id === action.payload
              ? { ...cand, confirmed: !cand.confirmed, skipped: false }
              : cand
          ),
        },
      }
    }
    case 'UNDO': {
      if (state.undoHistory.length === 0) return state
      const previous = state.undoHistory[state.undoHistory.length - 1]
      return { ...previous, undoHistory: state.undoHistory.slice(0, -1) }
    }
    case 'ADD_CANDIDATE': {
      if (!state.document) return state
      const incoming = action.payload
      const exists = state.document.detectedInfos.some(c => c.value === incoming.value && c.type === incoming.type)
      if (exists) return state
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: [...state.document.detectedInfos, incoming],
        },
      }
    }
    case 'ANSWER_QUESTION': {
      if (!state.document) return state
      const { candidateId, answer } = action.payload
      const method = answer === 'redact' ? 'full' : answer === 'keep' ? 'keep' : 'full'
      return {
        ...state,
        undoHistory: [...state.undoHistory.slice(-50), state],
        document: {
          ...state.document,
          detectedInfos: state.document.detectedInfos.map(c =>
            c.id === candidateId
              ? { ...c, method, confirmed: answer === 'keep', skipped: false, suggestionReason: undefined }
              : c
          ),
        },
      }
    }
    default:
      return state
  }
}

// 컨텍스트 타입
interface AppContextType {
  state: AppState
  setPhase: (phase: AppPhase) => void
  setDocument: (doc: DocumentInfo | null) => void
  updateSharingContext: (ctx: Partial<SharingContext>) => void
  setAiEnabled: (enabled: boolean) => void
  setProcessing: (processing: boolean) => void
  setProcessingStep: (step: string | null) => void
  setError: (error: string | null) => void
  reset: () => void
  getDetectedCount: (doc: DocumentInfo | null) => number
  // 후보 상태 변경
  updateCandidate: (id: string, updates: Partial<MaskingCandidate>) => void
  applyMethodToCandidate: (id: string, method: MaskingMethod, customReplacement?: string, presetKey?: string) => void
  applyMethodToAll: (method: MaskingMethod, candidateIds: string[]) => void
  confirmCandidate: (id: string) => void
  skipCandidate: (id: string) => void
  toggleConfirmCandidate: (id: string) => void
  undo: () => void
  addCandidate: (candidate: MaskingCandidate) => void
  answerQuestion: (candidateId: string, answer: 'redact' | 'keep' | 'unsure') => void
}

const AppContext = createContext<AppContextType | null>(null)

// 프로바이더
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  const setPhase = useCallback((phase: AppPhase) => {
    dispatch({ type: 'SET_PHASE', payload: phase })
  }, [])

  const setDocument = useCallback((doc: DocumentInfo | null) => {
    dispatch({ type: 'SET_DOCUMENT', payload: doc })
  }, [])

  const updateSharingContext = useCallback((ctx: Partial<SharingContext>) => {
    dispatch({ type: 'UPDATE_SHARING_CONTEXT', payload: ctx })
  }, [])

  const setAiEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AI_ENABLED', payload: enabled })
  }, [])

  const setProcessing = useCallback((processing: boolean) => {
    dispatch({ type: 'SET_PROCESSING', payload: processing })
  }, [])

  const setProcessingStep = useCallback((step: string | null) => {
    dispatch({ type: 'SET_PROCESSING_STEP', payload: step })
  }, [])

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error })
  }, [])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [])

  return (
    <AppContext.Provider
      value={{
        state,
        setPhase,
        setDocument,
        updateSharingContext,
        setAiEnabled,
        setProcessing,
        setProcessingStep,
        setError,
        reset,
        getDetectedCount: (doc: DocumentInfo | null) => doc?.detectedInfos?.length ?? 0,
        // 후보 상태 변경
        updateCandidate: (id: string, updates: Partial<MaskingCandidate>) => {
          dispatch({ type: 'UPDATE_CANDIDATE', payload: { id, updates } })
        },
        applyMethodToCandidate: (id: string, method: MaskingMethod, customReplacement?: string, presetKey?: string) => {
          dispatch({ type: 'APPLY_METHOD_TO_CANDIDATE', payload: { id, method, customReplacement, presetKey } })
        },
        applyMethodToAll: (method: MaskingMethod, candidateIds: string[]) => {
          dispatch({ type: 'APPLY_METHOD_TO_ALL', payload: { method, candidateIds } })
        },
        confirmCandidate: (id: string) => {
          dispatch({ type: 'CONFIRM_CANDIDATE', payload: id })
        },
        skipCandidate: (id: string) => {
          dispatch({ type: 'SKIP_CANDIDATE', payload: id })
        },
        toggleConfirmCandidate: (id: string) => {
          dispatch({ type: 'TOGGLE_CONFIRM_CANDIDATE', payload: id })
        },
        undo: () => {
          dispatch({ type: 'UNDO' })
        },
        addCandidate: (candidate: MaskingCandidate) => {
          dispatch({ type: 'ADD_CANDIDATE', payload: candidate })
        },
        answerQuestion: (candidateId: string, answer: 'redact' | 'keep' | 'unsure') => {
          dispatch({ type: 'ANSWER_QUESTION', payload: { candidateId, answer } })
        },
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

// 훅
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider')
  }
  return ctx
}
