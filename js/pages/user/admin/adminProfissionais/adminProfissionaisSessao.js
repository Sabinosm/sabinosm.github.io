// adminProfissionaisSessao.js
//
// Pequeno helper para ler os dados do usuário logado já armazenados
// em sessionStorage por afterLogin (ver initHomePage.js), sem
// depender de um novo fetch a /me só para saber o papel de quem está
// usando a tela.
//
// Formato esperado em sessionStorage["bion-dados-usuario"]:
//   { usuario: { uuid, nome_completo, email, tipo_usuario,
//                is_super_admin, status, ... }, configuracoes, webauthn }
// (é o retorno de GET /auth/me -- ver status.py no backend)
//
// ALTERADO (múltiplos admins por empresa): é_super_admin() e
// souAdmin() são usados por adminProfissionaisModal.js e
// adminProfissionaisLista.js para decidir:
//   - se o formulário de convite oferece a opção "Administrador";
//   - se os botões de ativar/desativar/editar aparecem quando o alvo
//     já é admin (só o super admin gerencia admin).

function lerDadosUsuario() {
  const bruto = sessionStorage.getItem("bion-dados-usuario");
  if (!bruto) return null;
  try {
    const dados = JSON.parse(bruto);
    return dados?.usuario ?? null;
  } catch {
    return null;
  }
}
 
/** true se o usuário logado é o administrador principal (fundador) da empresa. */
export function souSuperAdmin() {
  return Boolean(lerDadosUsuario()?.is_super_admin);
}
 
/** true se o usuário logado é admin (comum ou super). */
export function souAdmin() {
  return lerDadosUsuario()?.tipo_usuario === "admin";
}
 
/** true se o usuário logado é médico ou enfermeiro (profissional de
 * saúde) -- usado para decidir se ações clínicas (ex: "Salvar e
 * iniciar consulta" no cadastro de paciente) aparecem na UI. */
export function souProfissionalDeSaude() {
  const tipo = lerDadosUsuario()?.tipo_usuario;
  return tipo === "medico" || tipo === "enfermeiro";
}
 
/** uuid do usuário logado, ou null se a sessão não estiver disponível. */
export function meuUuid() {
  return lerDadosUsuario()?.uuid ?? null;
}