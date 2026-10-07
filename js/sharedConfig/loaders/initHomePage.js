// sharedConfig/loaders/initHomePage.js
//
// Script ÚNICO de todas as homes. As homes diferem SÓ no HTML (cada
// perfil tem o seu arquivo, escolhido por afterLogin via homePara());
// aqui não há decisão por perfil:
//
//   - o acesso vem do <body data-requer="..."> da própria home;
//   - as seções são marcadas no HTML com data-home-secao="nome" e cada
//     uma carrega o seu módulo sob demanda, só se existir na página.
//
// Para criar uma home nova: monte o HTML com as seções desejadas.
// Para criar uma seção nova: registre o módulo em SECOES.

import { iniciarPagina } from "./initPagina.js";

// nome da seção (data-home-secao) -> módulo que exporta iniciar(raiz)
const SECOES = {
  gestao: async () =>
    (await import("../../pages/user/gestao/homeGestao.js")).iniciarMetricasGerenciamento,
  clinica: async () =>
    (await import("../../pages/user/clinico/homeClinica.js")).iniciarHomeClinica,
};

document.addEventListener("DOMContentLoaded", async () => {
  const ctx = await iniciarPagina();
  if (!ctx) return;

  document.querySelectorAll("[data-home-secao]").forEach(async (raiz) => {
    const nome = raiz.dataset.homeSecao;
    const carregar = SECOES[nome];
    if (!carregar) {
      console.warn(`home: seção "${nome}" sem módulo registrado em SECOES`);
      return;
    }
    try {
      (await carregar())(raiz);
    } catch (erro) {
      console.error(`home: falha ao iniciar a seção "${nome}"`, erro);
    }
  });
});