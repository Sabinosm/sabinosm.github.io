// familias/index.js
//
// Registro das famílias de protocolo que a página de detalhe sabe exibir.
// A primeira cujo aplicaA(protocolo) responde true vence; `semSuporte`
// fica por último e responde a tudo -- a página nunca quebra com um
// protocolo de família nova.

import escore from "./escore.js";
import composto from "./composto.js";
import semSuporte from "./semSuporte.js";

const FAMILIAS = [escore, composto, semSuporte];

export function adaptadorDe(protocolo) {
  return FAMILIAS.find(familia => familia.aplicaA(protocolo));
}