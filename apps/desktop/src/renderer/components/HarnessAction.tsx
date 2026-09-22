import type { HarnessPlan } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GenerationControl } from './GenerationControl.js'
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
        className="btn tdel harness-trigger" running onStop={onCancel} showStatusText
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
      confirmLabel={!plan.model.configured
        ? m.wiki.harness.notConnected
        : plan.action === 'create' ? m.wiki.harness.startCreate : m.wiki.harness.startUpdate}
      confirmTone="primary"
      confirmDisabled={!plan.model.configured}
      onConfirm={onStart}
      description={(
        <div className="harness-cost-plan">
          <p className={!plan.model.configured || plan.model.billable ? 'cost-warning' : 'cost-demo'}>
            {!plan.model.configured
              ? m.wiki.harness.notConnectedDetail
              : plan.model.billable
                ? m.wiki.harness.billableNote
                : m.wiki.harness.freeNote}
          </p>
          <dl>
            <div><dt>{m.wiki.harness.scopeLabel}</dt><dd>{m.wiki.scope.currentPaper}</dd></div>
            <div>
              <dt>{m.wiki.harness.personalContentLabel}</dt>
              <dd>{m.wiki.harness.personalContentSummary(personal, plan.scope.hasRemark)}</dd>
            </div>
            <div><dt>{m.wiki.harness.modelLabel}</dt><dd>{plan.model.provider} · {plan.model.name}</dd></div>
          </dl>
          <small>{m.wiki.harness.authorizationNote}</small>
        </div>
      )}
    />
  )
}
