import { preencherPainelPerfil } from "./preencherPerfil.js";
import { iniciarMonitoramentoSessao } from "../pages/auth/watchSession.js";
import { modalConfiguracoesPronto } from "./settingsLoader.js";
import { iniciarMetricasGerenciamento } from "../pages/user/admin/adminHomePage/adminHomePage.js";
import { lerDadosUsuarioCache } from "./userCache.js";

document.addEventListener("DOMContentLoaded", async () => {
  const dados = lerDadosUsuarioCache();
  if (!dados) {
    // Cache vazio/corrompido = chegou aqui sem passar pelo afterLogin
    // (ex: digitou a URL direto) ou a aba anterior foi fechada.
    // Mais seguro mandar pro login.
    window.location.href = "../../auth/login.html";
    return;
  }

  // O modal de Configurações agora é injetado dinamicamente por
  // settingsLoader.js (fetch de um partial compartilhado, ver
  // adminProfissionais.html). preencherPainelPerfil mexe em campos
  // que só existem depois dessa injeção (avatar, nome, CRM,
  // dispositivos etc.) -- por isso esperamos aqui antes de chamar.
  await modalConfiguracoesPronto;
  preencherPainelPerfil(dados);

  iniciarMonitoramentoSessao();

  // Métricas da tela de Gerenciamento (cards do topo). Não depende
  // do modal de configurações, só do DOM já estar montado.
  iniciarMetricasGerenciamento();
})