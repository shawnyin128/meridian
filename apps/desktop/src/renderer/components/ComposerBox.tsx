import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'
import './ComposerBox.css'

/**
 * The one composer box: a rounded field that holds `field`, what is being typed, and under it a row of
 * `chips`, the pickers that set how the message is sent, ending with `send`, the send control. Other
 * props, such as a key handler or a ref, go to the box itself.
 */
export function ComposerBox({ field, chips, send, ref, ...props }: {
  field: ReactNode
  chips: ReactNode
  send: ReactNode
  ref?: Ref<HTMLDivElement>
} & Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'>) {
  return (
    <div {...props} ref={ref} className="cbox">
      {field}
      <div className="cbox-foot">
        {chips}
        <span className="cbox-send">{send}</span>
      </div>
    </div>
  )
}
