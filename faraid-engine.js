// ═══════════════════════════════════════════════════════════════════════════════
// FARAID ENGINE — Islamic Inheritance Calculator (Ilm al-Farāʾiḍ)
// Sunni / Hanafi-default | Rule-based | Exact Rational Arithmetic
//
// Paste the blocks below into index.html exactly as described in the
// INTEGRATION GUIDE at the bottom of this file.
//
// Shariah basis: Quran 4:11-12, 4:176 | Ibn Qudama, al-Mughni
//                al-Jaziri, Fiqh ala al-Madhahib al-Arbaʿa
// ═══════════════════════════════════════════════════════════════════════════════


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK A — FRACTION ENGINE + DATA STRUCTURES
// Replaces: the old `const gcd = ...` / `const F = ...` block (lines 395-401)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── 1. FRACTION ENGINE ────────────────────────────────────────────────────────
// All inheritance arithmetic uses exact rationals {n, d} where value = n/d.
// Never use floating-point in core calculations — rounding errors break Awl/Radd.
const Frac = (() => {
  // Iterative Euclidean GCD (handles large denominators from Awl scaling)
  function _gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  }

  // make(n, d) → reduced fraction; sign always in numerator
  function make(n, d) {
    if (!d || !n) return { n: 0, d: 1 };
    const sign = (n < 0) !== (d < 0) ? -1 : 1;
    n = Math.abs(n); d = Math.abs(d);
    const g = _gcd(n, d);
    return { n: sign * (n / g), d: d / g };
  }

  const ZERO = { n: 0, d: 1 };
  const ONE  = { n: 1, d: 1 };

  const add  = (a, b) => make(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub  = (a, b) => make(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul  = (a, b) => make(a.n * b.n, a.d * b.d);
  const div  = (a, b) => make(a.n * b.d, a.d * b.n);

  const eq   = (a, b) => a.n * b.d === b.n * a.d;
  const gt   = (a, b) => a.n * b.d  >  b.n * a.d;
  const lt   = (a, b) => a.n * b.d  <  b.n * a.d;

  const isPos  = a => a.n > 0;
  const isZero = a => a.n === 0;

  const toFloat = f => f.n / f.d;
  const toPct   = f => (Math.abs(f.n / f.d) * 100).toFixed(1) + '%';
  const toStr   = f => {
    if (f.n === 0) return '0';
    if (f.d === 1) return String(f.n);
    return `${f.n}/${f.d}`;
  };

  return { make, ZERO, ONE, add, sub, mul, div, eq, gt, lt, isPos, isZero, toFloat, toPct, toStr };
})();

// Backward-compat aliases so existing renderInheritance display code still works.
// Safe to remove once you update the results render block (see BLOCK C).
const fval = f => Frac.toFloat(f);
const fpct = f => Frac.toPct(f);
const fstr = f => Frac.toStr(f);


// ── 2. CONFIGURATION ─────────────────────────────────────────────────────────
// Global engine settings. madhab drives disputed rulings (Gharrawayn, Radd, etc.)
const FARAID_CONFIG = {
  madhab: 'hanafi',   // 'hanafi' | 'shafii' | 'maliki' | 'hanbali'
};


// ── 3. HEIR REGISTRY ─────────────────────────────────────────────────────────
// Metadata for every recognised heir. Extend this to add new heir types
// (grandfather, grandson, uncle, etc.) without touching engine logic.
const HEIR_RULES = {
  husband:        { label: 'Husband',           evidence: 'Quran 4:12', category: 'spouse'  },
  wife:           { label: 'Wife',              evidence: 'Quran 4:12', category: 'spouse'  },
  son:            { label: 'Son',               evidence: 'Quran 4:11', category: 'child'   },
  daughter:       { label: 'Daughter',          evidence: 'Quran 4:11', category: 'child'   },
  father:         { label: 'Father',            evidence: 'Quran 4:11', category: 'parent'  },
  mother:         { label: 'Mother',            evidence: 'Quran 4:11', category: 'parent'  },
  fullBrother:    { label: 'Full Brother',      evidence: 'Quran 4:176', category: 'sibling' },
  fullSister:     { label: 'Full Sister',       evidence: 'Quran 4:176', category: 'sibling' },
  uterineSibling: { label: 'Uterine Sibling',  evidence: 'Quran 4:12',  category: 'sibling' },
  // TODO: pGrandfather, mGrandmother, halfBrotherP, halfSisterP,
  //       sonSon, sonDaughter, paternalUncle — add entry here then
  //       implement share rule in assignFixedShares / distributeResidue.
};


// ── 4. BLOCKING RULES ─────────────────────────────────────────────────────────
// Hijab al-Hirman: complete exclusion rules, applied in order.
// Format: { blocker: id, blocked: id, reason: string }
// Add new blocking relationships here; applyBlockingRules() picks them up automatically.
const BLOCKING_RULES = [
  // Son blocks ALL siblings — he is a closer degree agnate (Ijmaʿ)
  { blocker: 'son', blocked: 'fullBrother',
    reason: 'Son blocks full brothers as closer male agnate (Ijmaʿ)' },
  { blocker: 'son', blocked: 'fullSister',
    reason: 'Son blocks full sisters (Ijmaʿ)' },
  { blocker: 'son', blocked: 'uterineSibling',
    reason: 'Son is a "walad"; Quran 4:12 requires absence of walad for uterine siblings' },

  // Daughter blocks uterine siblings — daughter is also "walad" per Quran 4:12
  { blocker: 'daughter', blocked: 'uterineSibling',
    reason: 'Daughter is a "walad"; Quran 4:12 requires absence of walad' },

  // Father blocks ALL siblings — closer agnate degree (Ijmaʿ)
  { blocker: 'father', blocked: 'fullBrother',
    reason: 'Father blocks full brothers as closer agnate (Ijmaʿ)' },
  { blocker: 'father', blocked: 'fullSister',
    reason: 'Father blocks full sisters (Ijmaʿ)' },
  { blocker: 'father', blocked: 'uterineSibling',
    reason: 'Father blocks uterine siblings (Ijmaʿ)' },

  // Full brother supersedes paternal half-brother (lower priority agnate)
  { blocker: 'fullBrother', blocked: 'halfBrotherP',
    reason: 'Full brother blocks paternal half-brother by agnate priority (Tarjeeh)' },

  // TODO: son blocks son's son; father blocks grandfather;
  //       sons block nephews; grandfather blocks paternal half-siblings (Shafi'i/Maliki/Hanbali)
];


// ── 5. MADHAB RULES ───────────────────────────────────────────────────────────
// School-specific overrides for disputed rulings.
// Only Hanafi is fully implemented; others are architectural stubs.
const MADHAB_RULES = {
  hanafi: {
    // Gharrawayn (Umariyyatayn): all four madhabs follow this ruling
    applyGharrawayn:        true,
    // Radd: mainstream Hanafi excludes spouses (same as others)
    raddIncludesSpouse:     false,
    // Grandfather vs brothers: Hanafi — grandfather SHARES with brothers
    // (Shafi'i / Maliki / Hanbali: grandfather BLOCKS brothers — see stubs below)
    grandfatherBlocksBrothers: false,
  },
  shafii:  { applyGharrawayn: true, raddIncludesSpouse: false, grandfatherBlocksBrothers: true,  _TODO: true },
  maliki:  { applyGharrawayn: true, raddIncludesSpouse: false, grandfatherBlocksBrothers: true,  _TODO: true },
  hanbali: { applyGharrawayn: true, raddIncludesSpouse: false, grandfatherBlocksBrothers: true,  _TODO: true },
};

// END OF BLOCK A
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK B — INHERITANCE ENGINE
// Replaces: the entire `function computeInh() { ... }` block (lines 572-592)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Stage 1: NORMALISE ────────────────────────────────────────────────────────
// Converts flat S_INH state into an array of heir objects.
// Each object: { id, count, blocked, blockReason, shareType, fraction, evidence, explanation }
function normalizeHeirs(s) {
  const list = [];

  function push(id, count) {
    if (count <= 0) return;
    list.push({
      id,
      count,
      blocked:      false,
      blockReason:  '',
      shareType:    'none',      // 'fixed' | 'residue' | 'fixed+residue' | 'none'
      fraction:     Frac.ZERO,
      awlFraction:  null,        // original fraction before ʿAwl scaling (for explanation)
      raddApplied:  false,
      evidence:     (HEIR_RULES[id] || {}).evidence || '',
      explanation:  '',
    });
  }

  // Spouses are mutually exclusive (deceased is either male or female)
  if (s.gender === 'female' && s.hasHusband)   push('husband', 1);
  if (s.gender === 'male'   && s.numWives > 0) push('wife', s.numWives);

  if (s.sons      > 0) push('son',             s.sons);
  if (s.daughters > 0) push('daughter',        s.daughters);
  if (s.fatherAlive)   push('father',          1);
  if (s.motherAlive)   push('mother',          1);
  if (s.fullBrothers    > 0) push('fullBrother',    s.fullBrothers);
  if (s.fullSisters     > 0) push('fullSister',     s.fullSisters);
  if (s.uterineSiblings > 0) push('uterineSibling', s.uterineSiblings);

  return list;
}


// ── Stage 2: BLOCKING ENGINE ──────────────────────────────────────────────────
// Applies BLOCKING_RULES declaratively; no hardcoded if-chains.
// Mutates heirList in place. Returns heirList for chaining.
function applyBlockingRules(heirList) {
  for (const rule of BLOCKING_RULES) {
    // Re-evaluate active IDs each iteration (a newly blocked heir cannot block)
    const activeIds = new Set(
      heirList.filter(h => !h.blocked).map(h => h.id)
    );
    if (!activeIds.has(rule.blocker)) continue;

    const target = heirList.find(h => h.id === rule.blocked);
    if (target && !target.blocked) {
      target.blocked     = true;
      target.blockReason = rule.reason;
    }
  }
  return heirList;
}


// ── Stage 3: FIXED SHARES ENGINE ─────────────────────────────────────────────
// Assigns Furud al-Muqaddarah (designated Quranic shares) to eligible heirs.
//
// KEY RULES IMPLEMENTED:
//  Husband     : ½ (no child) | ¼ (child)                            [4:12]
//  Wife/Wives  : ¼ collective (no child) | ⅛ collective (child)      [4:12]
//  Mother      : ⅓ (no child, <2 siblings) | ⅙ otherwise            [4:11]
//  Father      : ⅙ (sons present) | ⅙ + residue (daughters only)
//              | all residue (no children)                            [4:11]
//  Daughter(s) : ½ (one, no son) | ⅔ (2+, no son)                   [4:11]
//  Uterine     : ⅙ (one) | ⅓ (2+) — only if no child (walad)        [4:12]
//  Full Sister : ½ (one) | ⅔ (2+) — if alone (no child/father/bro)  [4:176]
//
//  Gharrawayn (Umariyyatayn) — special case, all four madhabs:
//   When spouse + mother + father survive with no children,
//   mother gets ⅓ of what REMAINS after the spouse (not ⅓ of the estate).
//   This prevents mother from exceeding father. [Umar r.a. / confirmed by Ali r.a.]
//
// Returns { fixedTotal, gharrawaynApplied }
function assignFixedShares(heirList, s, madhab) {
  const cfg = MADHAB_RULES[madhab] || MADHAB_RULES.hanafi;

  // Shorthand: find a non-blocked heir by id
  const get = id => heirList.find(h => h.id === id && !h.blocked);

  const hasSon      = !!get('son');
  const hasDaughter = !!get('daughter');
  const hasChild    = hasSon || hasDaughter;
  const hasFather   = !!get('father');
  const hasMother   = !!get('mother');
  const hasHusband  = !!get('husband');
  const hasWife     = !!get('wife');

  // For mother's share: count ALL user-entered siblings (even if blocked by father).
  // Quran 4:11 "if he has brothers" — presence counts even when they don't inherit.
  const allSiblings = s.fullBrothers + s.fullSisters + s.uterineSiblings;

  // ── Husband ────────────────────────────────────────────────────────
  const husbandH = get('husband');
  if (husbandH) {
    husbandH.fraction  = hasChild ? Frac.make(1, 4) : Frac.make(1, 2);
    husbandH.shareType = 'fixed';
  }

  // ── Wife / Wives ───────────────────────────────────────────────────
  // All wives share a single collective portion; each receives (collective / count).
  const wifeH = get('wife');
  if (wifeH) {
    const collective  = hasChild ? Frac.make(1, 8) : Frac.make(1, 4);
    wifeH.groupFrac   = collective;   // stored for Gharrawayn calculation & display
    wifeH.fraction    = Frac.div(collective, Frac.make(wifeH.count, 1));
    wifeH.shareType   = 'fixed';
  }

  // ── Mother ─────────────────────────────────────────────────────────
  const motherH = get('mother');
  if (motherH) {
    // 1/6 when: (a) any child exists, OR (b) 2+ siblings exist
    // 1/3 in all other cases
    motherH.fraction  = (hasChild || allSiblings >= 2) ? Frac.make(1, 6) : Frac.make(1, 3);
    motherH.shareType = 'fixed';
  }

  // ── Father ────────────────────────────────────────────────────────
  // Father's share has THREE modes depending on who else survives:
  //   sons present        → fixed 1/6 only        (sons carry residue)
  //   daughters only      → fixed 1/6 + residue   (father is still closest agnate)
  //   no children at all  → pure residuary         (all of residue)
  const fatherH = get('father');
  if (fatherH) {
    if (hasSon) {
      fatherH.fraction  = Frac.make(1, 6);
      fatherH.shareType = 'fixed';
    } else if (hasDaughter) {
      fatherH.fraction  = Frac.make(1, 6);
      fatherH.shareType = 'fixed+residue';  // residue portion added in distributeResidue
    } else {
      fatherH.fraction  = Frac.ZERO;
      fatherH.shareType = 'residue';        // fully handled in distributeResidue
    }
  }

  // ── Daughter ──────────────────────────────────────────────────────
  const daughterH = get('daughter');
  if (daughterH) {
    if (!hasSon) {
      // No sons: daughters take their Quranic fixed share
      daughterH.fraction  = s.daughters === 1 ? Frac.make(1, 2) : Frac.make(2, 3);
      daughterH.shareType = 'fixed';
    } else {
      // Sons present: daughters become co-residuaries at 1:2 (asabah bi-ghayrihi)
      daughterH.fraction  = Frac.ZERO;
      daughterH.shareType = 'residue';  // handled in distributeResidue with sons
    }
  }

  // ── Uterine Siblings ──────────────────────────────────────────────
  // Inherit ONLY when deceased left no child (walad) — Quran 4:12
  const uterineH = get('uterineSibling');
  if (uterineH && !hasChild) {
    uterineH.fraction  = s.uterineSiblings === 1 ? Frac.make(1, 6) : Frac.make(1, 3);
    uterineH.shareType = 'fixed';
  }

  // ── Full Sisters ──────────────────────────────────────────────────
  // Mode A — Fixed share: alone (no child, no father, no full brothers)
  // Mode B — Asabah bi-ghayrihi: with full brothers → handled in distributeResidue
  // Mode C — Asabah maʿa ghayrihi: with daughters, no son/father/bro → distributeResidue
  const fullSisH = get('fullSister');
  const fullBroH = get('fullBrother');
  if (fullSisH && !hasChild && !hasFather && !fullBroH) {
    // Mode A: standalone fixed share
    fullSisH.fraction  = s.fullSisters === 1 ? Frac.make(1, 2) : Frac.make(2, 3);
    fullSisH.shareType = 'fixed';
    // Modes B & C: shareType stays 'none' here; distributeResidue handles both
  }

  // ── Gharrawayn (Umariyyatayn) ─────────────────────────────────────
  // Condition: no children + spouse + mother + father all present.
  // Apply only if madhab config enables it (all four madhabs do).
  let gharrawaynApplied = false;
  if (cfg.applyGharrawayn && !hasChild && (hasHusband || hasWife) && hasMother && hasFather) {
    // Use the collective spouse fraction for Gharrawayn calculation
    const spouseGroupFrac = hasHusband
      ? husbandH.fraction               // husband's personal share = his total share
      : wifeH.groupFrac;                // wives' collective share (not per-wife fraction)

    const remainderAfterSpouse = Frac.sub(Frac.ONE, spouseGroupFrac);
    // Mother gets exactly 1/3 of what remains (= ⅓ of remainder)
    motherH.fraction  = Frac.div(remainderAfterSpouse, Frac.make(3, 1));
    gharrawaynApplied = true;
  }

  // Calculate the sum of all fixed shares for Awl check
  let fixedTotal = Frac.ZERO;
  for (const h of heirList) {
    if (!h.blocked && (h.shareType === 'fixed' || h.shareType === 'fixed+residue')) {
      fixedTotal = Frac.add(fixedTotal, h.fraction);
    }
  }

  return { fixedTotal, gharrawaynApplied };
}


// ── Stage 4: AWL ENGINE ────────────────────────────────────────────────────────
// ʿAwl (عول): if total fixed shares exceed the estate, scale ALL down proportionally.
// The estate's denominator "swells" — each heir takes a smaller percentage.
//
// Example (classic):
//   Husband ½ + 2 Full Sisters ⅔ + Mother ⅙
//   Total = 3/6 + 4/6 + 1/6 = 8/6 → ʿAwl factor 8/6
//   Husband → 3/8 | Sisters → 4/8 | Mother → 1/8   (sum = 1 ✓)
//
// Historical note: Umar ibn al-Khattab (r.a.) first applied ʿAwl; Ibn Abbas (r.a.)
// disputed it, but the majority of companions and all four madhabs follow ʿAwl.
//
// Returns { awlApplied, awlFactor }
function applyAwl(heirList, fixedTotal) {
  if (!Frac.gt(fixedTotal, Frac.ONE)) {
    return { awlApplied: false, awlFactor: Frac.ONE };
  }

  for (const h of heirList) {
    if (h.blocked) continue;
    if (h.shareType === 'fixed' || h.shareType === 'fixed+residue') {
      h.awlFraction = h.fraction;              // preserve original for explanation
      h.fraction    = Frac.div(h.fraction, fixedTotal);
      // After ʿAwl the fixed+residue father can no longer claim residue
      if (h.shareType === 'fixed+residue') h.shareType = 'fixed';
    }
  }

  return { awlApplied: true, awlFactor: fixedTotal };
}


// ── Stage 5: RESIDUE ENGINE ────────────────────────────────────────────────────
// Distributes the remainder of the estate to agnate (Asabah) heirs.
//
// Priority chain (classical hierarchy):
//   1. Sons   (+ daughters 2:1 if present — asabah bi-ghayrihi)
//   2. Father (residuary when no children; extra residue when daughters-only)
//   3. Full Brothers (+ full sisters 2:1 — asabah bi-ghayrihi)
//   4. Full Sisters alone (asabah maʿa ghayrihi — with daughters, no sons/father/bro)
//
// TODO for extended heirs: paternal grandfather → paternal half-brothers →
//   their sons → paternal uncles → their sons (priority per classical order).
function distributeResidue(heirList, s, awlApplied) {
  // ʿAwl consumed 100% — nothing to distribute
  if (awlApplied) return;

  const get = id => heirList.find(h => h.id === id && !h.blocked);

  // Residue = 1 − (sum of all currently assigned fractions)
  let assigned = Frac.ZERO;
  for (const h of heirList) {
    if (!h.blocked) assigned = Frac.add(assigned, h.fraction);
  }
  const residue = Frac.sub(Frac.ONE, assigned);
  if (!Frac.isPos(residue)) return;

  const sonH      = get('son');
  const daughterH = get('daughter');
  const fatherH   = get('father');
  const fullBroH  = get('fullBrother');
  const fullSisH  = get('fullSister');

  // ── Priority 1: Sons (+ daughters at 2:1) ────────────────────────
  if (sonH) {
    const sons  = s.sons;
    const daus  = daughterH ? s.daughters : 0;
    // Each son = 2 units; each daughter = 1 unit  (Quran 4:11 "lidhdhakari mithl hazzal unthayayn")
    const units = sons * 2 + daus;

    sonH.fraction  = Frac.mul(residue, Frac.make(sons * 2, units));
    sonH.shareType = 'residue';

    if (daughterH && daus > 0) {
      daughterH.fraction  = Frac.mul(residue, Frac.make(daus, units));
      daughterH.shareType = 'residue';
    }
    return;
  }

  // ── Priority 2: Father ────────────────────────────────────────────
  // Daughters-only case: father already holds his 1/6 fixed; add residue on top.
  // No-children case: father's fraction was 0; he receives all residue.
  if (fatherH) {
    fatherH.fraction  = Frac.add(fatherH.fraction, residue);
    // Normalise shareType for accurate display / explanation
    if (fatherH.shareType === 'residue') fatherH.shareType = 'residue';
    return;
  }

  // ── Priority 3: Full Brothers (+ full sisters 2:1) ────────────────
  if (fullBroH) {
    const bros  = s.fullBrothers;
    // Sisters share here only if they haven't been independently blocked
    const sisCount = (fullSisH && !fullSisH.blocked) ? s.fullSisters : 0;
    const units    = bros * 2 + sisCount;

    fullBroH.fraction  = Frac.mul(residue, Frac.make(bros * 2, units));
    fullBroH.shareType = 'residue';

    if (fullSisH && sisCount > 0) {
      fullSisH.fraction  = Frac.mul(residue, Frac.make(sisCount, units));
      fullSisH.shareType = 'residue';
    }
    return;
  }

  // ── Priority 4: Full Sisters as asabah maʿa ghayrihi ──────────────
  // Applies when: daughters survive + no sons + no father + no full brothers.
  // Daughters cannot be agnates for themselves; sisters step in for the residue.
  if (fullSisH && !fullSisH.blocked && daughterH && !sonH && !fatherH) {
    fullSisH.fraction  = residue;
    fullSisH.shareType = 'residue';
    return;
  }

  // If we fall through here, residue has no agnate heir.
  // applyRadd() will redistribute it to fixed-share heirs.
}


// ── Stage 6: RADD ENGINE ──────────────────────────────────────────────────────
// Radd (رد): if total allocated < 1 and no agnate absorbed the remainder,
// return the surplus proportionally to eligible fixed-share heirs.
//
// Standard Sunni rule: SPOUSES excluded from Radd.
// (The minority Hanafi position of Imam Zufar includes them — not implemented here.)
//
// Example:
//   One daughter only → daughter gets ½ fixed, remainder ½ has no agnate.
//   Radd eligible: daughter (spouses excluded). Daughter receives the full ½ back.
//   Final: daughter = 1 (full estate).
//
// Returns { raddApplied, raddRemainder }
function applyRadd(heirList, s, madhab) {
  const cfg = MADHAB_RULES[madhab] || MADHAB_RULES.hanafi;

  let total = Frac.ZERO;
  for (const h of heirList) {
    if (!h.blocked) total = Frac.add(total, h.fraction);
  }

  const remainder = Frac.sub(Frac.ONE, total);
  if (!Frac.isPos(remainder)) return { raddApplied: false, raddRemainder: Frac.ZERO };

  // Radd-eligible: fixed-share heirs with a non-zero current fraction, excluding spouses
  const eligible = heirList.filter(h => {
    if (h.blocked || Frac.isZero(h.fraction)) return false;
    if ((h.id === 'husband' || h.id === 'wife') && !cfg.raddIncludesSpouse) return false;
    return h.shareType === 'fixed' || h.shareType === 'fixed+residue';
  });

  if (!eligible.length) return { raddApplied: false, raddRemainder: remainder };

  // Proportional redistribution: each eligible heir receives
  //   raddShare = remainder × (heir_fraction / sum_of_eligible_fractions)
  let eligibleSum = Frac.ZERO;
  for (const h of eligible) eligibleSum = Frac.add(eligibleSum, h.fraction);

  for (const h of eligible) {
    const raddShare  = Frac.mul(remainder, Frac.div(h.fraction, eligibleSum));
    h.fraction       = Frac.add(h.fraction, raddShare);
    h.raddApplied    = true;
  }

  return { raddApplied: true, raddRemainder: remainder };
}


// ── Stage 7: EXPLANATION ENGINE ───────────────────────────────────────────────
// Generates human-readable reason text for every heir (including blocked ones).
// Appends ʿAwl / Radd footnotes where applicable.
// Mutates heirList.explanation in place.
function generateExplanations(heirList, s, flags) {
  const { awlApplied, awlFactor, raddApplied, gharrawaynApplied } = flags;
  const hasChild    = s.sons > 0 || s.daughters > 0;
  const allSiblings = s.fullBrothers + s.fullSisters + s.uterineSiblings;

  for (const h of heirList) {

    // ── Blocked heir ───────────────────────────────────────────────
    if (h.blocked) {
      const label = (HEIR_RULES[h.id] || {}).label || h.id;
      h.explanation = `Excluded (Ḥijāb al-Ḥirmān): ${h.blockReason}`;
      continue;
    }

    // ── Active heir ────────────────────────────────────────────────
    switch (h.id) {

      case 'husband':
        h.explanation = hasChild
          ? `Husband receives ¼ — the deceased left children. (Quran 4:12)`
          : `Husband receives ½ — the deceased left no children. (Quran 4:12)`;
        break;

      case 'wife':
        h.explanation = hasChild
          ? `${h.count > 1 ? `${h.count} wives` : 'Wife'} collectively receive ⅛ (children present), then divided equally among them. (Quran 4:12)`
          : `${h.count > 1 ? `${h.count} wives` : 'Wife'} collectively receive ¼ (no children), then divided equally among them. (Quran 4:12)`;
        break;

      case 'mother':
        if (gharrawaynApplied) {
          h.explanation = `Mother receives ⅓ of what remains after the spouse's share — the Gharrāwayn (Umariyyatayn) ruling — preventing her from exceeding the father's portion. Confirmed by ʿUmar ibn al-Khaṭṭāb (r.a.) and followed by all four madhabs. (Quran 4:11)`;
        } else if (hasChild) {
          h.explanation = `Mother receives ⅙ — the deceased left children. (Quran 4:11)`;
        } else if (allSiblings >= 2) {
          h.explanation = `Mother receives ⅙ — the deceased left two or more siblings. Their presence reduces mother's share even if they do not ultimately inherit. (Quran 4:11)`;
        } else {
          h.explanation = `Mother receives ⅓ — no children and fewer than two siblings survive. (Quran 4:11)`;
        }
        break;

      case 'father':
        if (s.sons > 0) {
          h.explanation = `Father receives ⅙ fixed — sons are present and will carry the residue as closer agnates. Father cannot claim more than his Quranic fixed share when a son survives. (Quran 4:11)`;
        } else if (s.daughters > 0) {
          h.explanation = `Father receives ⅙ fixed plus all the residue after daughters' share — daughters cannot be agnates, so the father, as the closest male agnate, inherits what remains. (Quran 4:11)`;
        } else {
          h.explanation = `Father receives all residue as the nearest surviving male agnate (ʿaṣaba). No children are present to restrict his Quranic fixed share, so the two roles merge. (Quran 4:11)`;
        }
        break;

      case 'son':
        h.explanation = s.daughters > 0
          ? `Son(s) share the residue with daughters at 2:1 — each son receives the portion of two daughters (asabah bi-ghayrihi). "For the male the equivalent of the portion of two females." (Quran 4:11)`
          : `Son(s) divide the residue equally as agnate (ʿaṣaba) heirs. (Quran 4:11)`;
        break;

      case 'daughter':
        if (s.sons > 0) {
          h.explanation = `Daughter(s) share the residue with sons at ratio 1:2 (asabah bi-ghayrihi — residuary by virtue of the son's presence). (Quran 4:11)`;
        } else if (s.daughters === 1) {
          h.explanation = `One daughter receives ½ — she is the sole child and no son is present. (Quran 4:11)`;
        } else {
          h.explanation = `Two or more daughters collectively receive ⅔, divided equally among them. No son is present. (Quran 4:11)`;
        }
        break;

      case 'fullBrother':
        h.explanation = s.fullSisters > 0
          ? `Full brother(s) take the residue alongside full sisters at 2:1 (asabah bi-ghayrihi). No child or father survives to exclude them. (Quran 4:176)`
          : `Full brother(s) take all of the residue as the closest surviving agnates. No child or father survives. (Quran 4:176)`;
        break;

      case 'fullSister':
        if (h.shareType === 'residue' && s.daughters > 0 && s.sons === 0) {
          h.explanation = `Full sister(s) receive the residue alongside daughters (asabah maʿa ghayrihi): daughters cannot be agnates themselves, so the sisters inherit what the daughters leave. (Quran 4:176)`;
        } else if (h.shareType === 'residue') {
          h.explanation = `Full sister(s) share the residue with full brothers at 1:2 (asabah bi-ghayrihi — residuaries alongside brothers). (Quran 4:176)`;
        } else if (s.fullSisters === 1) {
          h.explanation = `One full sister receives ½ — no son, daughter, father, or full brother survives. (Quran 4:176)`;
        } else {
          h.explanation = `Two or more full sisters collectively receive ⅔, divided equally. No son, daughter, father, or full brother survives. (Quran 4:176)`;
        }
        break;

      case 'uterineSibling':
        h.explanation = s.uterineSiblings === 1
          ? `One uterine (maternal half) sibling receives ⅙ — no child (walad) survives. (Quran 4:12)`
          : `${s.uterineSiblings} uterine siblings collectively receive ⅓, divided equally — no child (walad) survives. (Quran 4:12)`;
        break;
    }

    // Append ʿAwl footnote where original share was scaled down
    if (awlApplied && h.awlFraction) {
      h.explanation +=
        ` [ʿAwl applied: original share was ${Frac.toStr(h.awlFraction)}; ` +
        `proportionally reduced because fixed shares totalled ${Frac.toStr(awlFactor)} > 1.]`;
    }

    // Append Radd footnote
    if (h.raddApplied) {
      h.explanation +=
        ` [Radd applied: no agnate heir existed, so the surplus estate was returned ` +
        `to fixed-share heirs proportionally (spouses excluded).]`;
    }
  }
}


// ── Stage 8: MAIN COMPUTE FUNCTION ────────────────────────────────────────────
// computeInheritance() — replaces the old computeInh().
// Runs the full 7-stage pipeline and returns a structured report.
//
// Return shape:
//   activeHeirs      : Heir[]   — non-blocked heirs with a non-zero final share
//   blockedHeirs     : Heir[]   — excluded heirs (with blockReason)
//   total            : Frac     — sum of active shares (should equal ONE after Radd)
//   awlApplied       : boolean
//   awlFactor        : Frac     — the swelled denominator fraction
//   raddApplied      : boolean
//   gharrawaynApplied: boolean
//   hasRemainder     : boolean  — true only on unusual edge cases (bait al-mal)
function computeInheritance() {
  const s      = S_INH;
  const madhab = (s.madhab || FARAID_CONFIG.madhab);

  // 1 — Build heir list
  const heirList = normalizeHeirs(s);

  // 2 — Apply blocking rules (Ḥijāb al-Ḥirmān)
  applyBlockingRules(heirList);

  // 3 — Assign fixed shares (Furūḍ al-Muqaddarah)
  const { fixedTotal, gharrawaynApplied } = assignFixedShares(heirList, s, madhab);

  // 4 — ʿAwl: scale down if fixed shares > estate
  const { awlApplied, awlFactor } = applyAwl(heirList, fixedTotal);

  // 5 — Distribute residue to agnate heirs (ʿaṣaba)
  distributeResidue(heirList, s, awlApplied);

  // 6 — Radd: return any surplus to fixed-share heirs (excluding spouses)
  const { raddApplied } = applyRadd(heirList, s, madhab);

  // 7 — Generate explanation text for every heir
  generateExplanations(heirList, s, { awlApplied, awlFactor, raddApplied, gharrawaynApplied });

  // Build final report
  const activeHeirs  = heirList.filter(h => !h.blocked && Frac.isPos(h.fraction));
  const blockedHeirs = heirList.filter(h => h.blocked);
  const total        = activeHeirs.reduce((sum, h) => Frac.add(sum, h.fraction), Frac.ZERO);

  return {
    heirList,
    activeHeirs,
    blockedHeirs,
    total,
    awlApplied,
    awlFactor,
    raddApplied,
    gharrawaynApplied,
    // hasRemainder is true only when no heir absorbed the full estate (edge case → bait al-mal)
    hasRemainder: !raddApplied && !awlApplied && Frac.lt(total, Frac.ONE) && activeHeirs.length > 0,
  };
}


// ── Display helper: expand multiple wives into individual rows ─────────────────
// Called by renderInheritance results block. Returns a flat display array
// where each element has .displayName and .fraction (per-person share).
function expandHeirsForDisplay(activeHeirs) {
  const display = [];
  for (const h of activeHeirs) {
    if (h.id === 'wife' && h.count > 1) {
      // Show each wife individually — each receives the same per-wife fraction
      for (let i = 1; i <= h.count; i++) {
        display.push({ ...h, displayName: `Wife ${i}` });
      }
    } else {
      const rule = HEIR_RULES[h.id] || {};
      let name   = rule.label || h.id;
      // Pluralise label when count > 1 (e.g. "2 Sons", "3 Daughters")
      if (h.count > 1 && h.id !== 'wife') name = `${h.count} ${name}s`;
      display.push({ ...h, displayName: name });
    }
  }
  return display;
}

// END OF BLOCK B
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK C — UPDATED RESULTS RENDER (step === 5 inside renderInheritance)
// Replaces: only the `else if(step===5){ ... }` branch in renderInheritance()
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/*
  else if (step === 5) {
    const r = computeInheritance();    // ← new engine

    if (!r.activeHeirs.length) {
      c.innerHTML = `<div class="no-heirs">${t('iS6NoHeirs')}</div>`;
      return;
    }

    const display  = expandHeirsForDisplay(r.activeHeirs);
    const totalPct = Frac.toFloat(r.total);

    // ── Distribution bar ──────────────────────────────────────────
    let bar = display.map((h, i) =>
      `<div style="width:${(Frac.toFloat(h.fraction) / Math.max(totalPct, 0.001) * 100).toFixed(2)}%;` +
      `background:${PALETTE[i % PALETTE.length]}"></div>`
    ).join('');
    if (r.hasRemainder) bar += `<div style="flex:1;background:var(--color-background-tertiary)"></div>`;

    // ── Status banners ────────────────────────────────────────────
    let banners = '';
    if (r.awlApplied)
      banners += `<div class="alert" style="margin-bottom:6px;font-size:12px;">` +
        `<strong>ʿAwl applied</strong> — fixed shares exceeded the estate ` +
        `(${Frac.toStr(r.awlFactor)} of estate). All shares proportionally reduced.</div>`;
    if (r.raddApplied)
      banners += `<div class="alert success" style="margin-bottom:6px;font-size:12px;">` +
        `<strong>Radd applied</strong> — surplus estate returned to fixed-share heirs ` +
        `(spouses excluded).</div>`;
    if (r.gharrawaynApplied)
      banners += `<div class="verse-note" style="margin-bottom:6px;font-size:12px;">` +
        `<strong>Gharrāwayn ruling</strong> — mother receives ⅓ of remainder after spouse.</div>`;

    // ── Heir rows ─────────────────────────────────────────────────
    let rows = display.map((h, i) => {
      const shareNote = h.shareType === 'fixed+residue' ? ' · Fixed + Residue' : '';
      return `
        <div class="heir-row">
          <div class="heir-dot" style="background:${PALETTE[i % PALETTE.length]}"></div>
          <div class="heir-info">
            <div class="heir-name">${h.displayName}</div>
            <div class="heir-basis">${h.evidence}${shareNote}</div>
          </div>
          <div class="heir-frac">
            <div class="heir-f">${Frac.toStr(h.fraction)}</div>
            <div class="heir-p">${Frac.toPct(h.fraction)}</div>
          </div>
        </div>`;
    }).join('');

    // ── Blocked heirs section ─────────────────────────────────────
    let blockedHtml = '';
    if (r.blockedHeirs.length) {
      const blockedRows = r.blockedHeirs.map(h => {
        const label = (HEIR_RULES[h.id] || {}).label || h.id;
        return `
          <div class="heir-row" style="opacity:0.45;">
            <div class="heir-dot" style="background:#9CA3AF"></div>
            <div class="heir-info">
              <div class="heir-name" style="text-decoration:line-through">${label}</div>
              <div class="heir-basis">${h.blockReason}</div>
            </div>
            <div class="heir-frac"><div class="heir-f" style="color:var(--color-text-tertiary)">—</div></div>
          </div>`;
      }).join('');
      blockedHtml = `
        <div style="margin-top:1rem;">
          <p style="font-size:11px;color:var(--color-text-tertiary);text-transform:uppercase;
                    letter-spacing:.05em;margin-bottom:6px;">Excluded Heirs (Ḥijāb)</p>
          ${blockedRows}
        </div>`;
    }

    // ── Total row ─────────────────────────────────────────────────
    c.innerHTML =
      `<div class="dist-bar">${bar}</div>` +
      banners + rows + blockedHtml +
      `<div class="total-row">` +
        `<span class="total-label">${t('iS6Assigned')}</span>` +
        `<span class="total-val">${Frac.toStr(r.total)} · ${Frac.toPct(r.total)}</span>` +
      `</div>`;
  }
*/
// END OF BLOCK C
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK D — TEST SUITE
// Paste anywhere after computeInheritance(). Run: runFaraidTests() in console.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FARAID_TEST_CASES = [

  // ── Test 1: Father + 1 Daughter ──────────────────────────────────────────
  // Father special rule: 1/6 fixed (because daughter is present) + residue.
  //   Daughter: ½ (fixed, no son)
  //   Fixed total: ½ + ⅙ = ⅔
  //   Residue: ⅓ → goes to father
  //   Father final: ⅙ + ⅓ = ½
  {
    label: 'Father + 1 Daughter — father gets fixed 1/6 plus residue',
    state: {
      gender: 'male', hasHusband: false, numWives: 0,
      sons: 0, daughters: 1,
      fatherAlive: true, motherAlive: false,
      fullBrothers: 0, fullSisters: 0, uterineSiblings: 0,
      madhab: 'hanafi',
    },
    expect: { daughter: '1/2', father: '1/2' },
    expectFlags: { awlApplied: false, raddApplied: false },
  },

  // ── Test 2: Husband + Mother + 2 Full Sisters — ʿAwl case ────────────────
  // Fixed shares: Husband ½, Mother ⅙ (2+ siblings reduce mother), Sisters ⅔
  //   Total: 3/6 + 1/6 + 4/6 = 8/6 > 1 → ʿAwl factor = 8/6
  //   After ʿAwl (× 6/8):
  //     Husband  → 3/8
  //     Mother   → 1/8
  //     Sisters  → 4/8 = ½
  {
    label: 'Husband + Mother + 2 Full Sisters — ʿAwl (8/6)',
    state: {
      gender: 'female', hasHusband: true, numWives: 0,
      sons: 0, daughters: 0,
      fatherAlive: false, motherAlive: true,
      fullBrothers: 0, fullSisters: 2, uterineSiblings: 0,
      madhab: 'hanafi',
    },
    expect: { husband: '3/8', mother: '1/8', fullSister: '1/2' },
    expectFlags: { awlApplied: true, raddApplied: false },
  },

  // ── Test 3: One Daughter Only — Radd case ────────────────────────────────
  // Daughter: ½ (fixed). No agnate heir. No other heirs.
  //   Remainder: ½ → Radd → returned to daughter (only eligible heir).
  //   Daughter final: ½ + ½ = 1.
  {
    label: 'One Daughter only — Radd (daughter receives full estate)',
    state: {
      gender: 'male', hasHusband: false, numWives: 0,
      sons: 0, daughters: 1,
      fatherAlive: false, motherAlive: false,
      fullBrothers: 0, fullSisters: 0, uterineSiblings: 0,
      madhab: 'hanafi',
    },
    expect: { daughter: '1' },
    expectFlags: { awlApplied: false, raddApplied: true },
  },

  // ── Test 4: Gharrawayn — Husband + Mother + Father ────────────────────────
  // Without Gharrawayn: Mother = ⅓, Father = ⅙ (wrong — mother > father)
  // With Gharrawayn: Mother = ⅓ of remainder after husband (½) = ⅙
  //   Husband: ½ | Mother: ⅙ | Father (residue): ⅓
  {
    label: 'Gharrawayn — Husband + Mother + Father (no children)',
    state: {
      gender: 'female', hasHusband: true, numWives: 0,
      sons: 0, daughters: 0,
      fatherAlive: true, motherAlive: true,
      fullBrothers: 0, fullSisters: 0, uterineSiblings: 0,
      madhab: 'hanafi',
    },
    expect: { husband: '1/2', mother: '1/6', father: '1/3' },
    expectFlags: { gharrawaynApplied: true },
  },

  // ── Test 5: Siblings blocked by Father ───────────────────────────────────
  // Father alive → full brothers and sisters are completely blocked.
  // State: male deceased, 2 wives, father, mother, 2 full brothers.
  //   Wives (collective): 1/8 (sons present? no — daughters? no → 1/4 collective)
  //   Actually no children here. So:
  //   Wives collective: 1/4 → per wife: 1/8
  //   Mother: 1/6 (2+ siblings present before blocking — allSiblings = 2)
  //   Father: no children → pure residue
  //   Full brothers: BLOCKED by father
  //   Father gets residue = 1 - 1/4 - 1/6 = 1 - 3/12 - 2/12 = 7/12
  {
    label: 'Siblings blocked by Father — father takes full residue',
    state: {
      gender: 'male', hasHusband: false, numWives: 2,
      sons: 0, daughters: 0,
      fatherAlive: true, motherAlive: true,
      fullBrothers: 2, fullSisters: 0, uterineSiblings: 0,
      madhab: 'hanafi',
    },
    expect: { wife: '1/8', mother: '1/6', father: '7/12' },
    expectFlags: { awlApplied: false, raddApplied: false },
    // fullBrother should be in blockedHeirs
    expectBlocked: ['fullBrother'],
  },

  // ── Test 6: 3 Wives — collective share then per-wife division ────────────
  // Male deceased, 3 wives, 1 son, 1 daughter.
  //   Wives collective (children present): 1/8 → per wife: 1/24
  //   Son + Daughter take residue 2:1. No fixed fractions for them here.
  //   Son: residue × 2/3 (2 units out of 3) | Daughter: residue × 1/3
  //   Residue = 1 - 1/8 = 7/8
  //   Son: 7/8 × 2/3 = 14/24 = 7/12 | Daughter: 7/8 × 1/3 = 7/24
  {
    label: '3 Wives + 1 Son + 1 Daughter — per-wife share',
    state: {
      gender: 'male', hasHusband: false, numWives: 3,
      sons: 1, daughters: 1,
      fatherAlive: false, motherAlive: false,
      fullBrothers: 0, fullSisters: 0, uterineSiblings: 0,
      madhab: 'hanafi',
    },
    expect: { wife: '1/24', son: '7/12', daughter: '7/24' },
    expectFlags: { awlApplied: false, raddApplied: false },
  },
];

function runFaraidTests() {
  const saved = JSON.parse(JSON.stringify(S_INH));  // snapshot current state
  let passed = 0, failed = 0;
  console.group('🕌 Faraid Engine — Test Suite');

  for (const tc of FARAID_TEST_CASES) {
    Object.assign(S_INH, tc.state);
    const r = computeInheritance();

    let ok = true;
    const errors = [];

    // Check share fractions
    for (const [id, expectedStr] of Object.entries(tc.expect)) {
      const heir   = r.activeHeirs.find(h => h.id === id);
      const actual = heir ? Frac.toStr(heir.fraction) : '(missing)';
      if (actual !== expectedStr) {
        errors.push(`  ${id}: expected ${expectedStr}, got ${actual}`);
        ok = false;
      }
    }

    // Check engine flags
    if (tc.expectFlags) {
      for (const [flag, val] of Object.entries(tc.expectFlags)) {
        if (r[flag] !== val) {
          errors.push(`  flag [${flag}]: expected ${val}, got ${r[flag]}`);
          ok = false;
        }
      }
    }

    // Check blocked heirs
    if (tc.expectBlocked) {
      for (const id of tc.expectBlocked) {
        if (!r.blockedHeirs.find(h => h.id === id)) {
          errors.push(`  ${id}: expected to be blocked but was not`);
          ok = false;
        }
      }
    }

    if (ok) {
      console.log(`%c✅ PASS%c  ${tc.label}`, 'color:green;font-weight:bold', 'color:inherit');
    } else {
      console.group(`%c❌ FAIL%c  ${tc.label}`, 'color:red;font-weight:bold', 'color:inherit');
      errors.forEach(e => console.warn(e));
      console.groupEnd();
    }

    ok ? passed++ : failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${FARAID_TEST_CASES.length}`);
  console.groupEnd();
  Object.assign(S_INH, saved);  // restore state
}

// END OF BLOCK D
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


// ════════════════════════════════════════════════════════════════════════════════
// INTEGRATION GUIDE — How to splice this engine into your existing index.html
// ════════════════════════════════════════════════════════════════════════════════
//
// ── STEP 1: Update S_INH (add madhab field) ──────────────────────────────────
//
//   Find the line (around line 407):
//     let S_INH = { gender:null, hasHusband:false, ... }
//
//   Change it to:
//     let S_INH = {
//       gender: null, hasHusband: false, numWives: 0,
//       sons: 0, daughters: 0,
//       fatherAlive: false, motherAlive: false,
//       fullBrothers: 0, fullSisters: 0, uterineSiblings: 0,
//       madhab: 'hanafi',   // ← ADD THIS
//     };
//
//
// ── STEP 2: Update resetTool() (preserve madhab on reset) ────────────────────
//
//   Find inside resetTool():
//     if(currentTool==='inheritance') S_INH = { gender:null, ... }
//
//   Change to:
//     if(currentTool==='inheritance') S_INH = {
//       gender: null, hasHusband: false, numWives: 0,
//       sons: 0, daughters: 0,
//       fatherAlive: false, motherAlive: false,
//       fullBrothers: 0, fullSisters: 0, uterineSiblings: 0,
//       madhab: 'hanafi',   // ← ADD THIS
//     };
//
//
// ── STEP 3: Replace the old Fraction + computeInh block ──────────────────────
//
//   DELETE these lines (approximately lines 395-401 + 572-592):
//
//     const gcd=(a,b)=>...
//     const F=(n,d)=>...
//     const fadd=(a,b)=>...
//     const fsub=(a,b)=>...
//     const fval=f=>...
//     const fpct=f=>...
//     const fstr=f=>...
//
//   AND delete:
//
//     function computeInh(){ ... }   (lines 572-592)
//
//   PASTE in their place:
//     → BLOCK A (Frac engine, data structures)
//     → BLOCK B (engine functions + computeInheritance)
//
//   The backward-compat aliases (fval, fpct, fstr) in BLOCK A keep any
//   other display code that may reference them working unchanged.
//
//
// ── STEP 4: Replace the results branch in renderInheritance() ────────────────
//
//   Find inside renderInheritance():
//     else if(step===5){ const r=computeInh(); ... }
//
//   Replace the entire else-if block with the code inside BLOCK C
//   (remove the surrounding /* */ comment markers when pasting).
//
//
// ── STEP 5: Paste the test suite ─────────────────────────────────────────────
//
//   Paste BLOCK D anywhere after computeInheritance().
//   Run from browser DevTools console:
//     runFaraidTests()
//
//   All 6 cases should pass on a correct integration.
//
//
// ── OPTIONAL: Add Madhab selector to the UI (Step 4 in renderInheritance) ────
//
//   In the step===3 (Parents) or step===4 (Siblings) block, you can add:
//
//     <div class="row">
//       <label>Legal school (Madhab)</label>
//       <div class="toggle">
//         <button class="tog-btn ${S_INH.madhab==='hanafi'?'on':''}"
//           onclick="S_INH.madhab='hanafi';renderApp()">Hanafi</button>
//         <button class="tog-btn" style="opacity:.4" title="Coming soon">Shafi'i</button>
//         <button class="tog-btn" style="opacity:.4" title="Coming soon">Maliki</button>
//         <button class="tog-btn" style="opacity:.4" title="Coming soon">Hanbali</button>
//       </div>
//     </div>
//
//
// ── KNOWN LIMITATIONS / TODO ─────────────────────────────────────────────────
//   • Paternal grandfather not yet implemented
//   • Son's son / son's daughter not yet implemented
//   • Paternal half-siblings (ʿAllāti) not yet implemented
//   • Paternal uncles & their sons (ʿasaba baʿīda) not yet implemented
//   • Estate deduction UI (debts / funeral / wasiyyah) not yet wired
//   • Shafi'i / Maliki / Hanbali madhab overrides are stubs only
//   • Dhaw al-Arham (distant relatives) not implemented
//
// ════════════════════════════════════════════════════════════════════════════════
