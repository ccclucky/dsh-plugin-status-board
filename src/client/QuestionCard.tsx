/**
 * The floating board's inline question card (L2).
 *
 * Scope is deliberately narrow: the card answers questions whose projection
 * state is `continued` through `remote.userQuestions.answer`. A question whose
 * foreground wait is still `open` is owned by the shipped user-questions card
 * (its claim + waterfall), so this card shows the question read-only and offers
 * "open session" instead of duplicating that state machine.
 *
 * All questions of one `ask_user_question` call are rendered together and
 * submitted as one batch, because the Host accepts exactly one answer per
 * question of the call.
 * @module dsh-plugin-status-board/client/QuestionCard
 */

import { useState, type ReactElement } from 'react'
import type {
  ActiveQuestion,
  AnswerBatch,
  BoardEntry,
  QuestionAnswer,
  SessionQuestion,
} from '../shared/types.ts'
import type { Translate } from '../shared/i18n.ts'

/** Submit one answer batch to the Host; rejects with a user-facing message. */
export type AnswerQuestion = (sessionId: string, callId: string, answer: AnswerBatch) => Promise<void>

/** Per-question draft state. */
interface Draft {
  readonly selected: readonly string[]
  readonly custom: string
}

/** Build the initial (blank) draft for one call. */
function initialDraft(call: ActiveQuestion): Record<string, Draft> {
  const draft: Record<string, Draft> = {}
  for (const question of call.questions) draft[question.id] = { selected: [], custom: '' }
  return draft
}

/** Read one question's draft, falling back to a blank one. */
function draftOf(draft: Record<string, Draft>, id: string): Draft {
  return draft[id] ?? { selected: [], custom: '' }
}

/** Build the answer batch from the current drafts. */
function answerBatch(call: ActiveQuestion, draft: Record<string, Draft>): AnswerBatch {
  const answers: QuestionAnswer[] = call.questions.map(question => {
    const current = draftOf(draft, question.id)
    const custom = current.custom.trim()
    // A single-select custom answer overrides the picked option; a multi-select
    // one supplements it. This mirrors the Host's documented answer shape.
    const selected = custom.length > 0 && question.multiSelect !== true ? [] : current.selected
    return {
      id: question.id,
      selected,
      ...(custom.length === 0 ? {} : { custom }),
    }
  })
  return { answers }
}

/** One `ask_user_question` call: its questions, options, draft and submit state. */
function QuestionCall({
  call,
  sessionId,
  translate,
  onOpenSession,
  answerQuestion,
}: {
  readonly call: ActiveQuestion
  readonly sessionId: string
  readonly translate: Translate
  readonly onOpenSession: ((sessionId: string) => void) | undefined
  readonly answerQuestion: AnswerQuestion | undefined
}): ReactElement {
  const [draft, setDraft] = useState<Record<string, Draft>>(() => initialDraft(call))
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAnswer = call.state === 'continued' && answerQuestion !== undefined
  const disabled = !canAnswer || submitting

  const choose = (question: SessionQuestion, label: string): void => {
    setDraft(current => {
      const previous = draftOf(current, question.id)
      const selected = question.multiSelect === true
        ? previous.selected.includes(label)
          ? previous.selected.filter(item => item !== label)
          : [...previous.selected, label]
        : previous.selected.includes(label)
          ? []
          : [label]
      return {
        ...current,
        [question.id]: { selected, custom: question.multiSelect === true ? previous.custom : '' },
      }
    })
  }

  const setCustom = (question: SessionQuestion, custom: string): void => {
    setDraft(current => {
      const previous = draftOf(current, question.id)
      return {
        ...current,
        [question.id]: {
          // A single-select custom answer supersedes the option choice; a
          // multi-select one keeps the checked labels.
          selected: question.multiSelect === true ? previous.selected : [],
          custom,
        },
      }
    })
  }

  const submit = (): void => {
    if (!canAnswer || answerQuestion === undefined || submitting) return
    setSubmitting(true)
    setError(null)
    setSent(false)
    answerQuestion(sessionId, call.callId, answerBatch(call, draft))
      .then(() => {
        setSent(true)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return (
    <section className="status-board__qcall" data-state={call.state} role="group" aria-label={translate('question.label')}>
      {call.questions.map((question, index) => {
        const current = draftOf(draft, question.id)
        return (
          <fieldset className="status-board__q" key={question.id}>
            <legend className="status-board__q-title">{question.header ?? question.question}</legend>
            {question.header !== undefined && question.header !== question.question ? (
              <p className="status-board__q-text">{question.question}</p>
            ) : null}
            {question.detail !== undefined ? (
              <details className="status-board__q-detail">
                <summary>{translate('question.detail')}</summary>
                <p>{question.detail}</p>
              </details>
            ) : null}
            {question.options !== undefined && question.options.length > 0 ? (
              <div className="status-board__q-options" role="group" aria-label={question.question}>
                {question.options.map((option, optionIndex) => {
                  const selected = current.selected.includes(option.label)
                  return (
                    <button
                      key={`${question.id}-${optionIndex}`}
                      type="button"
                      className="status-board__q-option"
                      data-selected={selected}
                      aria-pressed={selected}
                      disabled={disabled}
                      title={option.description}
                      onClick={() => choose(question, option.label)}
                    >
                      <span className="status-board__q-option-mark" data-selected={selected} aria-hidden="true" />
                      <span className="status-board__q-option-copy">
                        <span className="status-board__q-option-label">{option.label}</span>
                        {option.description === undefined ? null : (
                          <span className="status-board__q-option-desc">{option.description}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            <label className="status-board__q-custom">
              <span className="status-board__q-custom-label">{translate('question.custom')}</span>
              <input
                className="status-board__q-input"
                type="text"
                value={current.custom}
                disabled={disabled}
                onChange={event => setCustom(question, event.target.value)}
              />
            </label>
            {index === 0 ? <p className="status-board__q-hint">{translate('question.skipHint')}</p> : null}
          </fieldset>
        )
      })}
      <div className="status-board__q-footer">
        {canAnswer ? (
          <button className="status-board__q-submit" type="button" disabled={submitting || sent} onClick={submit}>
            {submitting ? translate('question.submitting') : translate('question.submit')}
          </button>
        ) : (
          <p className="status-board__q-note">
            {call.state === 'open' ? translate('question.openNotice') : translate('question.unavailable')}
          </p>
        )}
        {onOpenSession === undefined ? null : (
          <button className="status-board__q-open" type="button" onClick={() => onOpenSession(sessionId)}>
            {translate('question.openSession')}
          </button>
        )}
      </div>
      {error === null ? null : (
        <p className="status-board__q-error" role="alert">
          {translate('question.error', { message: error })}
        </p>
      )}
      {sent ? (
        <p className="status-board__q-sent" role="status">
          {translate('question.sent')}
        </p>
      ) : null}
    </section>
  )
}

/**
 * The inline card for one decision row.
 *
 * @param props - the row, its active calls, and the answer/navigation seams.
 */
export function QuestionCard({
  entry,
  translate,
  onOpenSession,
  answerQuestion,
}: {
  readonly entry: BoardEntry
  readonly translate: Translate
  readonly onOpenSession: ((sessionId: string) => void) | undefined
  readonly answerQuestion: AnswerQuestion | undefined
}): ReactElement | null {
  const calls = entry.questions ?? []
  if (calls.length === 0) return null
  return (
    <div className="status-board__qcard">
      {calls.map(call => (
        <QuestionCall
          key={call.callId}
          call={call}
          sessionId={entry.id}
          translate={translate}
          onOpenSession={onOpenSession}
          answerQuestion={answerQuestion}
        />
      ))}
    </div>
  )
}
