import { preencherPainelPerfil } from "./preencherPerfil.js";
import { iniciarMonitoramentoSessao } from "../auth/logic/watchSession.js";
import { modalConfiguracoesPronto } from "./settingsLoader.js";

document.addEventListener("DOMContentLoaded", async () => {
  const bruto = sessionStorage.getItem("bion-dados-usuario");
  if (!bruto) {
    // sessionStorage vazio = chegou aqui sem passar pelo afterLogin
    // (ex: digitou a URL direto). Mais seguro mandar pro login.
    window.location.href = "../../auth/login.html";
    return;
  }

  const dados = JSON.parse(bruto);

  // O modal de Configurações agora é injetado dinamicamente por
  // settingsLoader.js (fetch de um partial compartilhado, ver
  // adminProfissionais.html). preencherPainelPerfil mexe em campos
  // que só existem depois dessa injeção (avatar, nome, CRM,
  // dispositivos etc.) -- por isso esperamos aqui antes de chamar.
  await modalConfiguracoesPronto;
  preencherPainelPerfil(dados);

  iniciarMonitoramentoSessao();
})