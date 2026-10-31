/** Never close a consultation after a failed save of its current clinical content. */
export async function saveBeforeClosing(save: () => Promise<boolean>, confirm: () => boolean | Promise<boolean>, close: () => Promise<void>): Promise<void> {
  if (!await save()) return;
  if (!(await confirm())) return;
  await close();
}