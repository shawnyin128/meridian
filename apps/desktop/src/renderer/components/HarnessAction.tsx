import type { HarnessPlan } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GenerationControl } from './GenerationControl.js'
import { Tag } from './Tag.js'
import './HarnessAction.css'

/**
 * The one shared visual gate for cost-bearing Harness work. Feature components supply a prepared
 * plan and a start callback; they cannot skip the explicit acknowledgement represented here.
 */
export function HarnessAction({ plan, running, onStart, onCancel }: {
  plan: HarnessPlan
  running: boolean
  onStart: () => void
  onCancel: () => void
}) {
  const m = useMessages()
  if (running) {
    return (
      <GenerationControl
        className="btn harness-trigger" running onStop={onCancel} showStatusText
      />
    )
  }
  const personal = plan.scope.notes + plan.scope.annotatedHighlights
  const trigger = (
    <button className="btn pri harness-trigger">
      <span aria-hidden="true">✦</span>{plan.label}
    </button>
  )

  return (
    <ConfirmDialog
      trigger={trigger}
      title={m.wiki.harness.confirmTitle(plan.label)}
      confirmLabel={plan.action === 'create' ? m.wiki.harness.startCreate : m.wiki.harness.startUpdate}
      confirmTone="primary"
      confirmDisabled={!plan.model.configured}
      onConfirm={onStart}
      state={(
        <Tag tone={!plan.model.configured || plan.model.billable ? 'warn' : 'good'}>
          {!plan.model.configured
            ? m.wiki.harness.notConnectedDetail
            : plan.model.billable ? m.wiki.harness.billableNote : m.wiki.harness.freeNote}
        </Tag>
      )}
      description={(
        <div className="harness-cost-plan">
          <dl>
            <div><dt>{m.wiki.harness.scopeLabel}</dt><dd>{m.wiki.scope.currentPaper}</dd></div>
            <div>
              <dt>{m.wiki.harness.personalContentLabel}</dt>
              <dd>{m.wiki.harness.personalContentSummary(personal, plan.scope.hasRemark)}</dd>
            </div>
            <div><dt>{m.wiki.harness.modelLabel}</dt><dd>{plan.model.provider} · {plan.model.name}</dd></div>
          </dl>
        </div>
      )}
    />
  )
}
