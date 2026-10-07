// userCacheHelpers/userCachePermissoes.js
//
// Capacidades derivadas de `usuario` (payload de /me: is_admin e
// funcao_clinica). SOMENTE LEITURA: esses campos só mudam pelo back
// (ação sensível com step-up), então não existe um
// "atualizarPermissoesCache" -- o front só relê o /me.
//
// Regras herdadas de formasDoUsuario.md:
//  - is_admin e funcao_clinica são dimensões independentes: uma nunca
//    é inferida da outra.
//  - Dentro do eixo clínico, médico é superset de enfermeiro.
//
// Páginas e componentes perguntam por CAPACIDADE (p.gerenciar), nunca
// por tipo ("é médico?"). Se a regra mudar, muda só aqui.

import { lerDadosUsuarioCache } from './userCacheCore.js';

/**
 * Função PURA: deriva as capacidades de um objeto `usuario`.
 * Usada direto por afterLogin.js, que precisa decidir o destino ANTES
 * de gravar o snapshot (nesse momento getPermissoes() ainda não
 * enxerga nada). Sem `usuario`, tudo false: falha fechada.
 */
export function derivarPermissoes(usuario) {
  const u = usuario ?? {};
  const funcao = u.funcao_clinica ?? null;

  const gerenciar = Boolean(u.is_admin);                     // eixo admin
  const gerenciarAdmins = Boolean(u.is_super_admin);         // fundador: só ele gerencia outros admins
  const avaliarMedicamente = funcao === 'medico';            // eixo clínico
  const atenderClinicamente = avaliarMedicamente || funcao === 'enfermeiro';

  return Object.freeze({ gerenciar, gerenciarAdmins, atenderClinicamente, avaliarMedicamente });
}

/** Capacidades do usuário logado, lidas do snapshot em sessionStorage. */
export function getPermissoes() {
  return derivarPermissoes(lerDadosUsuarioCache()?.usuario);
}

/** true se o usuário tem PELO MENOS UMA das capacidades (OU lógico). */
export function temAlguma(permissoes, ...capacidades) {
  return capacidades.some(c => permissoes[c] === true);
}