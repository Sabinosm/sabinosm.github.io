import { preencherPainelPerfil } from "../../../../sharedConfig/preencherPerfil.js";
import { iniciarMonitoramentoSessao } from "../../../auth/watchSession.js";
import { modalConfiguracoesPronto } from "../../../../sharedConfig/loaders/settingsLoader.js";
import { iniciarPaginaEstatisticas } from ".estatisticas.js";
import { lerDadosUsuarioCache } from "../../../sharedConfig/userCache.js";

document.addEventListener("DOMContentLoaded", async () => {
  iniciarMonitoramentoSessao();
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    window.location.href = "../../../pages/http_error/401.html";
    return;
  }

  await modalConfiguracoesPronto;
  preencherPainelPerfil(dados);


  // Cards de estatística não dependem do modal de configurações, só
  // do DOM já montado -- mesmo padrão de iniciarMetricasGerenciamento
  // em initHomePage.js.
  iniciarPaginaEstatisticas();
});