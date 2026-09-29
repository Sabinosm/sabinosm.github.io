// adminCatalogosSessao.js
//
// Pequeno helper para ler o papel do usuário logado direto do cache
// de sessão (userCache.js), sem fetch extra a /me. Mesmo padrão de
// adminProfissionaisSessao.js -- os papéis vêm de dados.usuario:
//   { uuid, nome_completo, email, is_admin, funcao_clinica,
//     is_super_admin, status, ... }
// e são ortogonais (um médico-admin tem is_admin=True E
// funcao_clinica='medico' ao mesmo tempo).
//
// Na página de catálogo eles decidem quais OPÇÕES aparecem:
//   - souProfissionalDeSaude() -> botão "Executar" (a execução em si
//     continua protegida no back por requer_papel_clinico + gate
//     institucional -- aqui é só renderização);
//   - souAdmin() -> controle de liberação institucional.
// Ler o catálogo e o detalhe é aberto a qualquer usuário logado,
// então não há checagem de papel para as ações de estudo.

import { lerDadosUsuarioCache } from "../../../../sharedConfig/userCache.js";

function lerDadosUsuario() {
  return lerDadosUsuarioCache()?.usuario ?? null;
}

/** true se o usuário logado é admin (comum ou super). */
export function souAdmin() {
  return Boolean(lerDadosUsuario()?.is_admin);
}

/** true se o usuário logado é médico ou enfermeiro (profissional de
 * saúde) -- usado para decidir se a opção "Executar" aparece. */
export function souProfissionalDeSaude() {
  const funcao = lerDadosUsuario()?.funcao_clinica;
  return funcao === "medico" || funcao === "enfermeiro";
}