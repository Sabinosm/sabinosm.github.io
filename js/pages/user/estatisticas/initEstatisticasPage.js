import { preencherPainelPerfil } from "../../../sharedConfig/preencherPerfil.js";
import { iniciarMonitoramentoSessao } from "../../auth/watchSession.js";
import { modalConfiguracoesPronto } from "../../../sharedConfig/settingsLoader.js";
import { iniciarPaginaEstatisticas } from "../admin/adminEstatisticas/adminEstatisticas.js";
import { lerDadosUsuarioCache } from "../../../sharedConfig/userCache.js";

document.addEventListener("DOMContentLoaded", async () => {
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    window.location.href = "../../auth/login.html";
    return;
  }

  await modalConfiguracoesPronto;
  preencherPainelPerfil(dados);

  iniciarMonitoramentoSessao();

  // Cards de estatística não dependem do modal de configurações, só
  // do DOM já montado -- mesmo padrão de iniciarMetricasGerenciamento
  // em initHomePage.js.
  iniciarPaginaEstatisticas();
});