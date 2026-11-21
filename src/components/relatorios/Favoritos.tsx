import { Suspense } from "react";
import { usuarioAtual } from "@/lib/auth/atual";
import { favoritosDe } from "@/lib/relatorios/favoritos";
import MenuFavoritos from "./MenuFavoritos";

/** Menu de filtros favoritos do usuário logado (server: lê as preferências; o menu é client). */
export default async function Favoritos() {
  const u = await usuarioAtual();
  return <Suspense><MenuFavoritos favoritos={favoritosDe(u?.preferencias)} /></Suspense>;
}
