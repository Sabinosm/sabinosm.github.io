import { iniciarPaginaEstatisticas } from "./estatisticas.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

document.addEventListener("DOMContentLoaded", async () => {
  

  // Cards de estatística não dependem do modal de configurações, só
  // do DOM já montado -- mesmo padrão de iniciarMetricasGerenciamento
  // em initHomePage.js.
  iniciarPagina();
  iniciarPaginaEstatisticas();
});