// consulta.js
//
// Entry point da tela de Consultas. Não tem lógica própria: importa os
// módulos da lista e do modal de nova consulta, que se inicializam no
// DOMContentLoaded, e chama iniciarPagina() -- mesmo padrão de
// auditoria.js.
//
// O acesso é declarado no <body> de consultas.html:
//   <body data-requer="atenderClinicamente">   (médico ou enfermeiro)
//
// Estrutura da tela:
//   consultaLista.js      -> lista, busca, filtros e paginação
//   consultaNova.js       -> modal de nova consulta (3 formas) e 409
//   consultaApi.js        -> camada de fetch (espelha o blueprint)
//   consultaHelpers.js    -> labels, datas, links e builders
//   consultaValidation.js -> espelho dos schemas de consulta do back

import "./consultaLista.js";
import "./consultaNova.js";
import { iniciarPagina } from "../../../../sharedConfig/loaders/initPagina.js";

document.addEventListener("DOMContentLoaded", () => {
  iniciarPagina();
});