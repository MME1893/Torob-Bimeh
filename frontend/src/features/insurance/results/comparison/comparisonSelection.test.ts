import { describe, expect, it } from "vitest";
import {
  MAX_COMPARISON_OFFERS,
  MIN_COMPARISON_OFFERS,
  canCompare,
  canRemoveFromComparison,
  closeComparisonModal,
  enterComparison,
  exitComparison,
  idleComparison,
  isComparisonDisabled,
  openComparisonModal,
  reconcileComparison,
  removeComparisonOffer,
  toggleComparisonOffer,
  type ComparisonState,
} from "./comparisonSelection";

const RAZI = "azki:رازی:0";
const MIHAN = "sabim:میهن:1";
const PARDIS = "bimebazar:پردیس:2";
const SINA = "bimeh:سینا:3";
const ALL = [RAZI, MIHAN, PARDIS, SINA];
const FIFTH = "azki:الیاس:4";

const withOffers = (offerIds: string[], overrides: Partial<ComparisonState> = {}): ComparisonState => ({
  mode: true,
  offerIds,
  modalOpen: false,
  ...overrides,
});

/** A full four-offer selection, entered from RAZI and topped up one pick at a time. */
const pickAll = () => ALL.slice(1).reduce((state, id) => toggleComparisonOffer(state, id), enterComparison(RAZI));

describe("entering comparison mode", () => {
  it("selects the currently selected offer first", () => {
    const state = enterComparison(RAZI);
    expect(state).toEqual({ mode: true, offerIds: [RAZI], modalOpen: false });
  });

  it("does not open the dialog", () => {
    expect(enterComparison(RAZI).modalOpen).toBe(false);
  });

  it("tolerates a missing current offer", () => {
    expect(enterComparison(null)).toEqual({ mode: true, offerIds: [], modalOpen: false });
  });

  it("keeps an existing selection instead of restarting it", () => {
    const current = withOffers([RAZI, MIHAN]);
    expect(enterComparison(RAZI)).not.toBe(current);
  });
});

describe("maximum of four offers", () => {
  it("refuses a fifth offer", () => {
    const full = pickAll();
    expect(full.offerIds).toEqual(ALL);
    const attempted = toggleComparisonOffer(full, FIFTH);
    expect(attempted).toBe(full);
    expect(attempted.offerIds).toEqual(ALL);
  });

  it("never silently drops an already selected offer at the cap", () => {
    const full = pickAll();
    const afterExtraClick = toggleComparisonOffer(full, FIFTH);
    expect(afterExtraClick.offerIds).toContain(RAZI);
    expect(afterExtraClick.offerIds).toHaveLength(MAX_COMPARISON_OFFERS);
  });

  it("disables the selector of an unselected offer at the cap", () => {
    const full = pickAll();
    expect(isComparisonDisabled(full, FIFTH)).toBe(true);
  });

  it("still allows removing a selected offer at the cap", () => {
    const full = pickAll();
    expect(canRemoveFromComparison(full, RAZI)).toBe(true);
    expect(isComparisonDisabled(full, RAZI)).toBe(false);
  });

  it("accepts a replacement after one is deselected", () => {
    const reduced = removeComparisonOffer(pickAll(), PARDIS);
    expect(reduced.offerIds).toEqual([RAZI, MIHAN, SINA]);
    const replaced = toggleComparisonOffer(reduced, FIFTH);
    expect(replaced.offerIds).toEqual([RAZI, MIHAN, SINA, FIFTH]);
  });
});

describe("toggling and deselecting", () => {
  it("adds an offer in selection order", () => {
    const state = toggleComparisonOffer(enterComparison(RAZI), MIHAN);
    expect(state.offerIds).toEqual([RAZI, MIHAN]);
  });

  it("deselects an offer when toggled again", () => {
    const two = toggleComparisonOffer(enterComparison(RAZI), MIHAN);
    const one = toggleComparisonOffer(two, MIHAN);
    expect(one.offerIds).toEqual([RAZI]);
  });

  it("ignores a toggle outside comparison mode", () => {
    expect(toggleComparisonOffer(idleComparison, RAZI)).toBe(idleComparison);
  });

  it("ignores an empty id", () => {
    const state = enterComparison(RAZI);
    expect(toggleComparisonOffer(state, "")).toBe(state);
  });

  it("never mutates the state it was given", () => {
    const before = enterComparison(RAZI);
    const snapshot = [...before.offerIds];
    toggleComparisonOffer(before, MIHAN);
    removeComparisonOffer(before, RAZI);
    closeComparisonModal({ ...before, modalOpen: true });
    expect(before.offerIds).toEqual(snapshot);
  });

  it("returns the same object when removing an unselected offer", () => {
    const state = enterComparison(RAZI);
    expect(removeComparisonOffer(state, SINA)).toBe(state);
  });
});

describe("minimum of two offers", () => {
  it("disables compare with a single offer", () => {
    expect(canCompare(enterComparison(RAZI))).toBe(false);
    expect(enterComparison(RAZI).offerIds.length).toBeLessThan(MIN_COMPARISON_OFFERS);
  });

  it("enables compare at two", () => {
    expect(canCompare(toggleComparisonOffer(enterComparison(RAZI), MIHAN))).toBe(true);
  });

  it("enables compare at three and four", () => {
    const three = toggleComparisonOffer(withOffers([RAZI, MIHAN]), PARDIS);
    expect(canCompare(three)).toBe(true);
    expect(canCompare(pickAll())).toBe(true);
  });

  it("refuses to open the dialog with too few offers", () => {
    const one = enterComparison(RAZI);
    expect(openComparisonModal(one)).toBe(one);
    expect(one.modalOpen).toBe(false);
  });

  it("opens the dialog once two offers are chosen", () => {
    const two = toggleComparisonOffer(enterComparison(RAZI), MIHAN);
    expect(openComparisonModal(two).modalOpen).toBe(true);
  });
});

describe("closing and cancelling", () => {
  it("closing the dialog preserves the selection so it can be re-opened", () => {
    const open = openComparisonModal(toggleComparisonOffer(enterComparison(RAZI), MIHAN));
    const closed = closeComparisonModal(open);
    expect(closed.modalOpen).toBe(false);
    expect(closed.mode).toBe(true);
    expect(closed.offerIds).toEqual([RAZI, MIHAN]);
    expect(openComparisonModal(closed).modalOpen).toBe(true);
  });

  it("closing an already closed dialog is a no-op", () => {
    const state = enterComparison(RAZI);
    expect(closeComparisonModal(state)).toBe(state);
  });

  it("cancel clears mode, ids and the dialog", () => {
    const open = openComparisonModal(toggleComparisonOffer(enterComparison(RAZI), MIHAN));
    expect(exitComparison()).toEqual({ mode: false, offerIds: [], modalOpen: false });
    expect(open.offerIds).toHaveLength(2);
  });

  it("cancelling an idle comparison is safe", () => {
    expect(exitComparison()).toEqual(idleComparison);
  });
});

describe("reconciling with a changed result", () => {
  it("drops ids that no longer resolve and keeps the rest", () => {
    const state = withOffers([RAZI, MIHAN, PARDIS]);
    const next = reconcileComparison(state, [RAZI, PARDIS, SINA]);
    expect(next.offerIds).toEqual([RAZI, PARDIS]);
  });

  it("keeps the selection and keeps compare enabled when everything still resolves", () => {
    const state = toggleComparisonOffer(enterComparison(RAZI), MIHAN);
    expect(reconcileComparison(state, ALL)).toBe(state);
  });

  it("can disable compare when the selection drops below two", () => {
    const next = reconcileComparison(withOffers([RAZI, MIHAN]), [MIHAN]);
    expect(canCompare(next)).toBe(false);
    expect(openComparisonModal(next).modalOpen).toBe(false);
  });
});
