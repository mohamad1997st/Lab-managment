export function todayLocalYmd() {
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

