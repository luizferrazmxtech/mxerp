import { NextResponse } from "next/server";
import { buscarEstoque } from "@/lib/estoque/consultas";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json([]);
  return NextResponse.json(await buscarEstoque(q, 15));
}
