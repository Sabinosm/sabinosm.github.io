// adminProfissionaisSessao.js
//
// Pequeno helper para ler os dados do usuário logado já armazenados
// no cache de sessão (ver userCache.js / afterLogin.js), sem
// depender de um novo fetch a /me só para saber o papel de quem está
// usando a tela.
//
// Formato esperado em dados.usuario (payload de /me):
//   { uuid, nome_completo, email, is_admin, funcao_clinica,
//     is_super_admin, status, ... }
// (é o retorno de GET /auth/me -- ver status.py no backend)
//
// ALTERADO (assertivo, sem alias): tipo_usuario saiu de Usuario.to_dict()
// -- is_admin (bool) e funcao_clinica ('medico' | 'enfermeiro' | null)
// entram no lugar, e são ortogonais entre si (um médico-admin tem
// is_admin=True e funcao_clinica='medico' ao mesmo tempo).
//
// ALTERADO (múltiplos admins por empresa): é_super_admin() e
// souAdmin() são usados por adminProfissionaisModal.js e
// adminProfissionaisLista.js para decidir:
//   - se o formulário de convite oferece a opção "Administrador";
//   - se os botões de ativar/desativar/editar aparecem quando o alvo
//     já é admin (só o super admin gerencia admin).

import { lerDadosUsuarioCache } from "../../../../sharedConfig/userCache.js";

function lerDadosUsuario() {
  return lerDadosUsuarioCache()?.usuario ?? null;
}
 
/** true se o usuário logado é o administrador principal (fundador) da empresa. */
export function souSuperAdmin() {
  return Boolean(lerDadosUsuario()?.is_super_admin);
}
 
/** true se o usuário logado é admin (comum ou super). */
export function souAdmin() {
  return Boolean(lerDadosUsuario()?.is_admin);
}
 
/** true se o usuário logado é médico ou enfermeiro (profissional de
 * saúde) -- usado para decidir se ações clínicas (ex: "Salvar e
 * iniciar consulta" no cadastro de paciente) aparecem na UI.
 *
 * ALTERADO: is_admin e funcao_clinica são ortogonais -- um
 * médico-admin (is_admin=True, funcao_clinica='medico') deve continuar
 * contando como profissional de saúde aqui, então a checagem é só
 * sobre funcao_clinica, sem excluir quem também é admin. */
export function souProfissionalDeSaude() {
  const funcao = lerDadosUsuario()?.funcao_clinica;
  return funcao === "medico" || funcao === "enfermeiro";
}
 
/** uuid do usuário logado, ou null se a sessão não estiver disponível. */
export function meuUuid() {
  return lerDadosUsuario()?.uuid ?? null;
}