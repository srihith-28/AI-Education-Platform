export function computeRelativeGrade(total: number, mean: number, stdDev: number): string {
  if (stdDev === 0) {
    if (total >= 90) return "A";
    if (total >= 80) return "B";
    if (total >= 70) return "C";
    if (total >= 60) return "D";
    return "F";
  }

  const zScore = (total - mean) / stdDev;

  if (zScore >= 1.5 || total >= 95) return "A";
  if (zScore >= 1.0 || total >= 90) return "A-";
  if (zScore >= 0.5 || total >= 85) return "B";
  if (zScore >= 0.0 || total >= 80) return "B-";
  if (zScore >= -0.5 || total >= 75) return "C";
  if (zScore >= -1.0 || total >= 70) return "D";
  if (zScore >= -1.5 || total >= 65) return "E";
  return "F";
}

export function getGradeBadgeColor(grade: string): string {
  if (grade.startsWith("A")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (grade.startsWith("B")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (grade.startsWith("C")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  if (grade.startsWith("D") || grade.startsWith("E")) return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
}
