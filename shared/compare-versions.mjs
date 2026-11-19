/** Compares two dotted/dashed/underscore-separated version strings part by part; each part is split into digit and non-digit runs, compared numerically where both runs are numeric, lexically otherwise. */
export function compareVersions(a, b) {
  const pa = a.split(/[.\-_]/);
  const pb = b.split(/[.\-_]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const cmp = compareVersionPart(pa[i] ?? "0", pb[i] ?? "0");
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/** "rel10" -> ["rel", "10"], so "rel10" > "rel9". */
function compareVersionPart(sa, sb) {
  const ra = sa.match(/\d+|\D+/g) ?? [];
  const rb = sb.match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
    const cmp = compareRun(ra[i] ?? "", rb[i] ?? "");
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareRun(sa, sb) {
  const bothNumeric = /^\d+$/.test(sa) && /^\d+$/.test(sb);
  if (bothNumeric) return Number(sa) - Number(sb);
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
}
