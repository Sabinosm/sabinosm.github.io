// atendimento.js
//
// Entry point da página de Atendimento (Bloco 2). Não tem lógica
// própria: importa o orquestrador e as abas (que se ligam sozinhas no
// DOMContentLoaded) e chama iniciarPagina() -- mesmo padrão de
// consulta.js/consultaDetalhe.js.
//
// O acesso é declarado no <body> de atendimento.html:
//   <body data-requer="atenderClinicamente">   (médico ou enfermeiro)
//
// Estrutura:
//   atendimentoOrquestrador.js -> carrega consulta/atendimentos, abertura, estado compartilhado
//   atendimentoBinario.js      -> aba binário (4 seções, máquina de estados)
//   atendimentoSinais.js       -> aba sinais vitais (lote)
//   atendimentoColeta.js       -> aba coleta clínica + input de protocolo
//   atendimentoConduta.js      -> aba conduta de enfermagem (só triagem)
//   avaliacaoBion/             -> aba Avaliação IA (avaliação médica/reavaliação): Api, polling, render
//   atendimentoApi.js          -> camada de fetch (espelha os blueprints)
//   atendimentoHelpers.js      -> estado compartilhado, labels, parser do binário
//   atendimentoValidation.js   -> espelho dos schemas do back

import "./atendimentoBinario.js";
import "./atendimentoSinais.js";
import "./atendimentoColeta.js";
import "./atendimentoConduta.js";
import "./avaliacaoBion/avaliacaoBion.js";
import { iniciar } from "./atendimentoOrquestrador.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

document.addEventListener("DOMContentLoaded", async () => {
  await iniciarPagina();
  iniciar();
});