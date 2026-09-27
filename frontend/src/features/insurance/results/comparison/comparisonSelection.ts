/**
 * Pure comparison-selection state machine.
 *
 * The result page owns one `ComparisonState`. Every transition returns a new
 * frozen object and never mutates its input, so the reducer-free React state
 * update in `InsuranceResults` is the only place a transition is applied.
 */

/** Hard cap from the product rule: no more than four offers may be compared. */
export const MAX_COMPARISON_OFFERS = 4;

/** Below this many the comparison is meaningless, so the CTA stays disabled. */
export const MIN_COMPARISON_OFFERS = 2;

export type ComparisonState = {
  /** Selection mode is active and the offer rows expose their compare control. */
  mode: boolean;
  /** Canonical AI/chat offer ids, in the order the user picked them. */
  offerIds: string[];
  /** The comparison dialog is open. Independent of `mode`. */
  modalOpen: boolean;
};

export const idleComparison: ComparisonState = Object.freeze({
  mode: false,
  offerIds: [],
  modalOpen: false,
});

/**
 * Leaves comparison mode completely.
 *
 * The primary `selectedOffer` of the result page is deliberately untouched:
 * cancelling a comparison must never change which offer the detail panel shows.
 */
export function exitComparison(): ComparisonState {
  return idleComparison;
}

/**
 * Enters comparison mode with the currently selected offer already chosen, so
 * the user never has to pick the offer they came from. The dialog is not opened
 * here: the user still picks the remaining offers from the list.
 */
export function enterComparison(currentOfferId: string | null): ComparisonState {
  return {
    mode: true,
    offerIds: currentOfferId ? [currentOfferId] : [],
    modalOpen: false,
  };
}

const isChosen = (state: ComparisonState, offerId: string) => state.offerIds.includes(offerId);

/** True when the control must refuse a further selection, without ever evicting one. */
export function isComparisonDisabled(state: ComparisonState, offerId: string): boolean {
  return state.mode && !isChosen(state, offerId) && state.offerIds.length >= MAX_COMPARISON_OFFERS;
}

/** A selected offer is always removable, even at the cap. */
export function canRemoveFromComparison(state: ComparisonState, offerId: string): boolean {
  return state.mode && isChosen(state, offerId);
}

/**
 * Adds or removes one offer.
 *
 * At the cap the state is returned unchanged: the user must deselect an offer
 * explicitly, and a click can never silently drop one of their choices.
 */
export function toggleComparisonOffer(state: ComparisonState, offerId: string): ComparisonState {
  if (!state.mode || !offerId) return state;
  if (isChosen(state, offerId)) return removeComparisonOffer(state, offerId);
  if (state.offerIds.length >= MAX_COMPARISON_OFFERS) return state;
  return { ...state, offerIds: [...state.offerIds, offerId] };
}

export function removeComparisonOffer(state: ComparisonState, offerId: string): ComparisonState {
  if (!isChosen(state, offerId)) return state;
  return { ...state, offerIds: state.offerIds.filter((id) => id !== offerId) };
}

/** Drops ids that no longer resolve against the current result, keeping the rest. */
export function reconcileComparison(
  state: ComparisonState,
  availableIds: Iterable<string>,
): ComparisonState {
  const available = new Set(availableIds);
  const offerIds = state.offerIds.filter((id) => available.has(id));
  if (offerIds.length === state.offerIds.length) return state;
  return { ...state, offerIds };
}

export const canCompare = (state: ComparisonState) =>
  state.offerIds.length >= MIN_COMPARISON_OFFERS && state.offerIds.length <= MAX_COMPARISON_OFFERS;

/** Opens the dialog without changing the selection, so "back to list" can re-open it. */
export function openComparisonModal(state: ComparisonState): ComparisonState {
  if (!canCompare(state)) return state;
  return { ...state, modalOpen: true };
}

export function closeComparisonModal(state: ComparisonState): ComparisonState {
  if (!state.modalOpen) return state;
  return { ...state, modalOpen: false };
}
