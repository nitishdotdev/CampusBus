export async function allPages<T>(load: (page: number) => Promise<{ items: T[]; total: number; pageSize: number }>): Promise<T[]> {
  const first = await load(1);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    items.push(...(await load(page)).items);
  }
  return items;
}
