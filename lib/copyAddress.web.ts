export async function copyAddress(address: string): Promise<void> {
  await navigator.clipboard.writeText(address);
}
