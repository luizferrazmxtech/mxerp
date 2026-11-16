import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  redirect(cliente ? `/vendas/adicionar?cliente=${encodeURIComponent(cliente)}` : "/vendas/adicionar");
}
