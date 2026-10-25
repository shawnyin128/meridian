import type { HarnessPlan } from '../../shared/contract.js'
import { useMessages } from '../messages/useMessages.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GenerationControl } from './GenerationControl.js'
import { NoModelTag } from './NoModelTag.js'
import { Property, PropertyList } from './PropertyList.js'
import { Tag } from './Tag.js'
import { Button } from './Button.js'
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
        className="harness-trigger" running onStop={onCancel} showStatusText
      />
    )
  }
  const personal = plan.scope.notes + plan.scope.annotatedHighlights
  const trigger = (
    <Button size="regular" className="harness-trigger" icon={<span aria-hidden="true">✦</span>}>{plan.label}</Button>
  )

  return (
    <ConfirmDialog
      trigger={trigger}
      title={m.wiki.harness.confirmTitle(plan.label)}
      confirmLabel={plan.action === 'create' ? m.wiki.harness.startCreate : m.wiki.harness.startUpdate}
      confirmTone="primary"
      confirmDisabled={!plan.model.configured}
      onConfirm={onStart}
      state={!plan.model.configured
        ? <NoModelTag tone="warn" label={m.wiki.harness.notConnectedDetail} />
        : (
          <Tag tone={plan.model.billable ? 'warn' : 'good'}>
            {plan.model.billable ? m.wiki.harness.billableNote : m.wiki.harness.freeNote}
          </Tag>
        )}
      description={(
        <PropertyList className="harness-cost-plan">
          <Property label={m.wiki.harness.scopeLabel}>{m.wiki.scope.currentPaper}</Property>
          <Property label={m.wiki.harness.personalContentLabel}>
            {m.wiki.harness.personalContentSummary(personal, plan.scope.hasRemark)}
          </Property>
          <Property label={m.wiki.harness.modelLabel}>{plan.model.provider} · {plan.model.name}</Property>
        </PropertyList>
      )}
    />
  )
}
