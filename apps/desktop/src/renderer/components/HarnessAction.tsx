import type { HarnessPlan } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GenerationControl } from './GenerationControl.js'
import { ModelStatusTag } from './ModelStatusTag.js'
import { Property, PropertyList } from './PropertyList.js'
import { Tag } from './Tag.js'
import { Button } from './Button.js'
import './HarnessAction.css'

/**
 * The one shared visual gate for cost-bearing Harness work. Feature components supply a prepared
 * plan and a start callback; they cannot skip the explicit acknowledgement represented here. It
 * cannot start while the plan was prepared without a model, the model Core will run it with, which
 * it names with its reasoning effort. A run on a subscription CLI names the plan it counts against
 * and that its output has no limit; a run on an API model at an effort names its raised output cap.
 */
export function HarnessAction({ plan, running, stopping = false, onStart, onCancel }: {
  plan: HarnessPlan
  running: boolean
  /** Whether a stop was asked for and the run has not ended yet. */
  stopping?: boolean
  onStart: () => void
  onCancel: () => void
}) {
  const m = useMessages()
  if (running) {
    return <GenerationControl className="harness-trigger" running regular stopping={stopping} onStop={onCancel} />
  }
  const personal = plan.scope.notes + plan.scope.annotatedHighlights
  const ready = plan.model.configured
  const trigger = (
    <Button size="regular" className="harness-trigger" icon={<span aria-hidden="true">✦</span>}>{plan.label}</Button>
  )

  return (
    <ConfirmDialog
      trigger={trigger}
      title={m.wiki.harness.confirmTitle(plan.label)}
      confirmLabel={plan.action === 'create' ? m.wiki.harness.startCreate : m.wiki.harness.startUpdate}
      confirmTone="primary"
      confirmDisabled={!ready}
      onConfirm={onStart}
      state={!ready
        ? <ModelStatusTag state="warning" connected={false} />
        : plan.model.cli !== undefined
          ? <Tag>{m.wiki.harness.planNote[plan.model.cli]}</Tag>
          : (
            <Tag state={plan.model.billable ? 'warning' : undefined}>
              {plan.model.billable ? m.wiki.harness.billableNote : m.wiki.harness.freeNote}
            </Tag>
          )}
      description={(
        <PropertyList className="harness-cost-plan">
          <Property label={m.wiki.harness.scopeLabel}>{m.wiki.scope.currentPaper}</Property>
          <Property label={m.wiki.harness.personalContentLabel}>
            {m.wiki.harness.personalContentSummary(personal, plan.scope.hasRemark)}
          </Property>
          <Property label={m.wiki.harness.modelLabel}>
            {[plan.model.provider, plan.model.name, ...(plan.model.effort === undefined ? [] : [plan.model.effort])].join(' · ')}
          </Property>
          {plan.model.cli !== undefined ? (
            <Property label={m.wiki.harness.outputLimitLabel}>{m.wiki.harness.noOutputLimit}</Property>
          ) : plan.outputLimit === undefined ? null : (
            <Property label={m.wiki.harness.outputLimitLabel}>{m.wiki.harness.outputTokens(plan.outputLimit)}</Property>
          )}
        </PropertyList>
      )}
    />
  )
}
