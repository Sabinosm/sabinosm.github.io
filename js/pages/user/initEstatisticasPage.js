import { preencherPainelPerfil } from "./preencherPerfil.js";
import { iniciarMonitoramentoSessao } from "../auth/logic/watchSession.js";
import { modalConfiguracoesPronto } from "./settingsLoader.js";
import { iniciarPaginaEstatisticas } from "./admin/adminEstatisticas/adminEstatisticas.js";

document.addEventListener("DOMContentLoaded", async () => {
  const bruto = sessionStorage.getItem("bion-dados-usuario");
  if (!bruto) {
    window.location.href = "../../auth/login.html";
    return;
  }

  const dados = JSON.parse(bruto);

  await modalConfiguracoesPronto;
  preencherPainelPerfil(dados);

  iniciarMonitoramentoSessao();

  // Cards de estatística não dependem do modal de configurações, só
  // do DOM já montado -- mesmo padrão de iniciarMetricasGerenciamento
  // em initHomePage.js.
  iniciarPaginaEstatisticas();
});