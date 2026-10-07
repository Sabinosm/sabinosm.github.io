// auditoria.js
//
// Entry point da tela de Auditoria. Não tem lógica própria: só
// importa os módulos das duas views (resumo e detalhe), que se
// inicializam no DOMContentLoaded -- mesmo padrão de carregamento de
// profissionais.html, que inclui profissionaisLista.js e
// profissionaisModal.js como <script type="module"> independentes.
//
// Estrutura da tela (camadas, conforme alinhado):
//   auditoriaResumo.js   -> view "resumo por profissional"
//   auditoriaDetalhe.js  -> view "detalhe do profissional"
//   auditoriaApi.js      -> camada de fetch (espelha o blueprint)
//   auditoriaHelpers.js  -> formatação, labels, validação, badges
//
// As duas views vivem na MESMA página (auditoria.html) e se
// alternam via atributo `hidden` -- o detalhe abre por cima do
// resumo (com botão "Voltar"), sem modal e sem navegar para fora.

import "./auditoriaResumo.js";
import "./auditoriaDetalhe.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

document.addEventListener("DOMContentLoaded", async () => {
  iniciarPagina();
});