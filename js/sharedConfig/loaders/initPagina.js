// initPagina.js
//
// Bootstrap comum a toda página logada: checar o acesso, monitorar a
// sessão, esperar modal + sidebar e preencher o perfil. Devolve o
// contexto pronto para a página rodar só o que é DELA.
//
// O ACESSO É DECLARADO NO HTML, no <body> (ver acesso.js):
//
//   <body data-requer="gerenciar">
//   <body data-requer-todas="gerenciar,atenderClinicamente">
//
// (ou por argumento: iniciarPagina({ requer: [...] })). Sem declaração,
// o acesso é negado. Páginas com bootstrap próprio usam só
// guardarPagina.js.
//
// Seções DENTRO da página também podem declarar data-requer (ver
// aplicarRequerNaPagina): o JS não decide por perfil, o HTML declara.

import { preencherPainelPerfil } from "../preencherPerfil.js";
import { iniciarMonitoramentoSessao } from "../../pages/auth/watchSession.js";
import { modalConfiguracoesPronto } from "./settingsLoader.js";
import { temAlguma } from "../userCacheHelpers/userCachePermissoes.js";
import { sidebarPronta } from "./sidebarLoader.js";
import { exigirAcesso, lerLista } from "../../pages/auth/acesso.js";

export async function iniciarPagina(opcoes = {}) {
  const acesso = exigirAcesso(opcoes);
  if (!acesso.ok) return null;

  const { dados, permissoes } = acesso;

  // Monitor único de sessão + perfil (ver watchSession.js); idempotente.
  iniciarMonitoramentoSessao({ verificarAgora: true });

  // Seções da própria página que declaram data-requer.
  aplicarRequerNaPagina(permissoes);

  // preencherPainelPerfil mexe em campos que só existem depois da
  // injeção do modal (CRM, dispositivos...) e da sidebar (avatar,
  // nome): espera as duas.
  await Promise.all([modalConfiguracoesPronto, sidebarPronta]);
  preencherPainelPerfil(dados);

  return { dados, permissoes };
}

/**
 * Remove do <main> os elementos cujo data-requer o usuário não
 * satisfaz (OU lógico, igual à sidebar). Falha fechada: data-requer
 * vazio remove o elemento. Só UX -- o back é quem autoriza.
 *
 *   <section class="metrics" data-requer="gerenciar"> ... </section>
 */
function aplicarRequerNaPagina(permissoes) {
  document.querySelectorAll("main [data-requer]").forEach((el) => {
    const capacidades = lerLista(el.dataset.requer);
    if (!temAlguma(permissoes, ...capacidades)) el.remove();
  });
}