/** 1 tick = 1 game hour；tick 0 = 2026/05/01 00:00。 */
export function formatGameTime(tick: number): string {
  const start = new Date("2026-05-01T00:00:00");
  const d = new Date(start.getTime() + tick * 60 * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:00`;
}
