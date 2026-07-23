/**
 * Turns the `ministers` rows into a searchable list of individual ministries.
 *
 * The DB stores a *portfolio* string per row, not a ministry: a row can read
 * "Minister of Coal; Minister of Mines", and the PM's row is a 206-character
 * prose blob. Listing those raw would mean searching "Mines" never finds the
 * Coal-and-Mines minister, so we split each row on ";" into one entry per
 * ministry.
 *
 * 90 rows expand to ~119 entries across ~58 distinct ministries. A ministry
 * legitimately appears more than once — Defence has a Cabinet Minister and a
 * Minister of State — so entries carry their rank to tell them apart.
 */

/** Fragments that aren't ministries — the tail of the PM's portfolio blob. */
function isNoise(fragment) {
  const text = fragment.trim();
  if (text.length <= 3) return true;
  if (/^and$/i.test(text)) return true;
  // "All important policy issues", "All other portfolios not allocated ..."
  return /^all\b/i.test(text);
}

/**
 * Rank comes from the row's first fragment, not from each fragment: every
 * portfolio on a row belongs to the same appointment, so "Department of Space"
 * on the PM's row is the Prime Minister's, not a cabinet post of its own.
 */
export function rankOf(portfolio) {
  if (/^Prime Minister\b/i.test(portfolio)) return "Prime Minister";
  if (/^Minister of State \(Independent Charge\)/i.test(portfolio)) {
    return "MoS (Independent Charge)";
  }
  if (/^Minister of State\b/i.test(portfolio)) return "Minister of State";
  return "Cabinet Minister";
}

const PREFIXES = [
  /^Minister of State \(Independent Charge\) of the Ministry of\s*/i,
  /^Minister of State \(Independent Charge\)\s*(?:of|in)?\s*(?:the)?\s*(?:Ministry of)?\s*/i,
  /^Minister of State in the Ministry of\s*/i,
  /^Minister of State in the\s*/i,
  /^Minister of State\s*(?:of|in)?\s*/i,
  /^Minister of the\s*/i,
  /^Minister of\s*/i,
  /^Ministry of\s*/i,
  /^Department of\s*/i,
];

/**
 * "Minister of State in the Ministry of Finance" -> "Finance".
 *
 * Applied repeatedly, because prefixes stack: "Minister of State in the
 * Department of Atomic Energy" needs both the rank and "Department of" removed
 * to match the plain "Atomic Energy" on the PM's row.
 */
function cleanLabel(portfolio) {
  let label = portfolio.trim();

  for (let pass = 0; pass < PREFIXES.length; pass += 1) {
    const before = label;
    for (const prefix of PREFIXES) {
      const stripped = label.replace(prefix, "");
      if (stripped !== label && stripped.trim()) {
        label = stripped.trim();
        break;
      }
    }
    if (label === before) break;
  }

  return label.trim() || portfolio.trim();
}

/** Lowercase, de-accent, and reduce punctuation to spaces for matching. */
export function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RANK_ORDER = {
  "Prime Minister": 0,
  "Cabinet Minister": 1,
  "MoS (Independent Charge)": 2,
  "Minister of State": 3,
};

export function buildMinistryEntries(ministers) {
  if (!Array.isArray(ministers)) return [];

  const seen = new Set();
  const entries = [];

  for (const minister of ministers) {
    const source = String(minister?.ministry ?? "").trim();
    if (!source) continue;

    const fragments = source.split(";").filter((f) => !isNoise(f));
    const rank = rankOf(fragments[0] ?? source);

    for (const fragment of fragments) {
      const portfolio = fragment.trim();
      const label = cleanLabel(portfolio);
      const dedupe = `${normalize(label)}|${normalize(minister.minister_name)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const normalizedLabel = normalize(label);
      entries.push({
        id: dedupe,
        label,
        portfolio,
        rank,
        // The PATCH matches on the row's full, original ministry string.
        ministry: source,
        minister,
        _label: normalizedLabel,
        _labelTokens: normalizedLabel.split(" ").filter(Boolean),
        _nameTokens: normalize(minister.minister_name).split(" ").filter(Boolean),
        _otherTokens: normalize(`${minister.party ?? ""} ${rank}`)
          .split(" ")
          .filter(Boolean),
      });
    }
  }

  entries.sort(
    (a, b) =>
      a.label.localeCompare(b.label) ||
      (RANK_ORDER[a.rank] ?? 9) - (RANK_ORDER[b.rank] ?? 9) ||
      a.minister.minister_name.localeCompare(b.minister.minister_name),
  );

  return entries;
}

/**
 * Every query token must prefix-match a token somewhere in the entry, so
 * "home aff" finds Home Affairs while "zzz" finds nothing. Matches on the
 * ministry score highest, then the minister's name, then party/rank.
 */
function scoreEntry(entry, queryTokens, joined) {
  let score = 0;

  for (const token of queryTokens) {
    if (entry._labelTokens.some((t) => t.startsWith(token))) {
      score += 3;
    } else if (entry._nameTokens.some((t) => t.startsWith(token))) {
      score += 2;
    } else if (entry._otherTokens.some((t) => t.startsWith(token))) {
      score += 1;
    } else {
      return null;
    }
  }

  // A ministry that literally starts with what was typed belongs on top.
  if (entry._label.startsWith(joined)) score += 5;
  return score;
}

export function searchMinistries(entries, query) {
  const normalized = normalize(query);
  if (!normalized) return entries;

  const tokens = normalized.split(" ").filter(Boolean);
  const scored = [];

  for (const entry of entries) {
    const score = scoreEntry(entry, tokens, normalized);
    if (score !== null) scored.push({ entry, score });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label),
  );
  return scored.map((s) => s.entry);
}

/**
 * Splits `text` into `{ text, match }` runs so matched prefixes can be marked.
 * Only matches at word starts, so typing "de" underlines the "De" of Defence
 * but not the "de" inside "Independent".
 */
export function highlight(text, query) {
  const raw = String(text ?? "");
  const tokens = [...new Set(normalize(query).split(" ").filter(Boolean))];
  if (tokens.length === 0) return [{ text: raw, match: false }];

  const lower = raw.toLowerCase();
  const marked = new Array(raw.length).fill(false);

  for (let i = 0; i < raw.length; i += 1) {
    const atWordStart = i === 0 || /[^a-z0-9]/.test(lower[i - 1]);
    if (!atWordStart) continue;
    for (const token of tokens) {
      if (lower.startsWith(token, i)) {
        for (let k = 0; k < token.length; k += 1) marked[i + k] = true;
        break;
      }
    }
  }

  const runs = [];
  let current = null;
  for (let i = 0; i < raw.length; i += 1) {
    if (!current || current.match !== marked[i]) {
      current = { text: "", match: marked[i] };
      runs.push(current);
    }
    current.text += raw[i];
  }
  return runs;
}
