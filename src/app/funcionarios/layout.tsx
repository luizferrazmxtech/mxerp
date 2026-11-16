import { exigirArea } from "@/lib/auth/atual";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirArea("/funcionarios");
  return children;
}
