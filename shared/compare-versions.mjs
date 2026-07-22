/** Compares two dotted/dashed/underscore-separated version strings part by part, numerically where both sides of a part are numeric, lexically otherwise. */
export function compareVersions(a, b) {
  const pa = a.split(/[.\-_]/);
  const pb = b.split(/[.\-_]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const cmp = compareVersionPart(pa[i] ?? "0", pb[i] ?? "0");
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function compareVersionPart(sa, sb) {
  const na = Number(sa);
  const nb = Number(sb);
  const bothNumeric = sa !== "" && sb !== "" && !isNaN(na) && !isNaN(nb);
  if (bothNumeric) return na - nb;
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
}
