// sharedConfig/loaders/rotas.js
//
// Fonte única dos endereços das PÁGINAS (e dos partials HTML) usados
// pelo JS. Cada valor é uma URL absoluta, calculada a partir da
// localização DESTE módulo (import.meta.url) -- não da página que o
// importou. Por isso o mesmo ROTAS.erro401 funciona de qualquer página,
// em qualquer profundidade de pasta.
//
// Antes: strings relativas ao documento ("../../../pages/http_error/401.html")
// espalhadas por vários arquivos, cada uma válida só para páginas numa
// profundidade específica. Mover uma página quebrava em silêncio, em
// tempo de execução.
//
// Uso:
//   import { ROTAS } from "../../sharedConfig/loaders/rotas.js";
//   window.location.href = ROTAS.login;
//   const resp = await fetch(ROTAS.sidebar);
//
// NÃO cobre: <link>, <script src> e <a href> escritos dentro dos
// arquivos HTML (o navegador os resolve relativos ao documento) e os
// especificadores de `import` (relativos ao próprio módulo).
//
// Ao mover/renomear uma página: ajuste só a linha dela aqui.

// js/sharedConfig/loaders/rotas.js  ->  ../../  =  raiz do projeto
const PAGINAS = new URL('../../../html/pages/', import.meta.url);
const pagina = (caminho) => new URL(caminho, PAGINAS).href;

export const ROTAS = Object.freeze({
  // ── auth ──
  login: pagina('auth/login.html'),
  afterLogin: pagina('auth/afterLogin.html'),
  onboarding: pagina('auth/onboarding.html'),

  // ── cadastro público (pré-login) ──
  cadastroEmpresa: pagina('enterprise/enterpriseRegistration.html'),
  cadastroAdmin: pagina('enterprise/adminRegistration.html'),

  // ── homes (uma por combinação de capacidades; ver homePara) ──
  homeGestao: pagina('user/gestao/homeGestao.html'),                // gerenciar
  homeClinica: pagina('user/clinico/homeClinica.html'),             // atenderClinicamente
  homeGestaoClinica: pagina('user/shared/homeGestaoClinica.html'),  // gerenciar + atenderClinicamente

  // ── erros ──
  erro401: pagina('http_error/401.html'), // sem sessão
  erro403: pagina('http_error/403.html'), // sem capacidade

  // ── partials HTML injetados via fetch ──
  sidebar: pagina('user/sidebar.html'),
  settingsModal: pagina('user/settingsModal.html'),
  stepupModal: pagina('user/stepupModal.html'),
});

/**
 * Home do usuário a partir das CAPACIDADES (objeto de
 * derivarPermissoes). É a ÚNICA decisão "qual home?" do front: o
 * afterLogin a usa para o redirect e a sidebar para o link de início.
 *
 * Decisão de produto embutida: qualquer função clínica + admin cai na
 * home combinada (inclui enfermeiro-admin). Para restaurar a antiga
 * "Opção A" (enfermeiro-admin na home de gestão), troque a primeira
 * condição por `p.gerenciar && p.avaliarMedicamente`.
 *
 * @returns {string|undefined} undefined = nenhuma capacidade.
 */
export function homePara(p) {
  if (p.gerenciar && p.atenderClinicamente) return ROTAS.homeGestaoClinica;
  if (p.gerenciar) return ROTAS.homeGestao;
  if (p.atenderClinicamente) return ROTAS.homeClinica;
  return undefined;
}