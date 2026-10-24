/** How far, in px, every menu and popover keeps from the window edge: the --sp-8 step. */
export const COLLISION_PADDING = 8

/** Anything a menu or popover can be placed against: an element, or a box that is not one. */
export type AnchorBox = { getBoundingClientRect: () => DOMRect }
