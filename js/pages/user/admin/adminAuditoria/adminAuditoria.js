// adminAuditoria.js
//
// Entry point da tela de Auditoria. Não tem lógica própria: só
// importa os módulos das duas views (resumo e detalhe), que se
// inicializam no DOMContentLoaded -- mesmo padrão de carregamento de
// adminProfissionais.html, que inclui adminProfissionaisLista.js e
// adminProfissionaisModal.js como <script type="module"> independentes.
//
// Estrutura da tela (camadas, conforme alinhado):
//   adminAuditoriaResumo.js   -> view "resumo por profissional"
//   adminAuditoriaDetalhe.js  -> view "detalhe do profissional"
//   adminAuditoriaApi.js      -> camada de fetch (espelha o blueprint)
//   adminAuditoriaHelpers.js  -> formatação, labels, validação, badges
//
// As duas views vivem na MESMA página (adminAuditoria.html) e se
// alternam via atributo `hidden` -- o detalhe abre por cima do
// resumo (com botão "Voltar"), sem modal e sem navegar para fora.

import "./adminAuditoriaResumo.js";
import "./adminAuditoriaDetalhe.js";