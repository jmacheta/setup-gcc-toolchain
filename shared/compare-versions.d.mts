/** Compares two dotted/dashed/underscore-separated version strings part by part; each part is split into digit and non-digit runs, compared numerically where both runs are numeric, lexically otherwise. */
export declare function compareVersions(a: string, b: string): number;
