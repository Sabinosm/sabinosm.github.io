// i18n/aplicarIdioma.js
import ptBR from './pt-BR.js';
import enUS from './en-US.js';

const DICIONARIOS = { 'pt-BR': ptBR, 'en-US': enUS };
const IDIOMA_PADRAO = 'pt-BR';

/**
 * Aplica um idioma: troca document.documentElement.lang, substitui o
 * texto de todo elemento marcado com [data-i18n], e traduz o
 * placeholder de elementos marcados com [data-i18n-placeholder].
 *
 * O texto/placeholder original no HTML serve de fallback visual
 * enquanto o dicionário não carrega -- se a chave não existir no
 * dicionário do idioma pedido, o elemento simplesmente não é tocado.
 */
export function aplicarIdioma(idioma) {
  const dicionario = DICIONARIOS[idioma] || DICIONARIOS[IDIOMA_PADRAO];
  if (!dicionario) return;

  document.documentElement.lang = idioma;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const chave = el.dataset.i18n;
    if (dicionario[chave] !== undefined) el.textContent = dicionario[chave];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const chave = el.dataset.i18nPlaceholder;
    if (dicionario[chave] !== undefined) el.placeholder = dicionario[chave];
  });
}

/**
 * Para strings usadas fora do DOM -- ex: mensagens de erro montadas
 * dinamicamente em settingsSenha.js, settingsApi.js, etc -- em vez de
 * hardcoded em português. Chamar com o idioma atualmente aplicado
 * (ver getIdiomaAtual abaixo).
 */
export function t(chave) {
  const idioma = getIdiomaAtual();
  const dicionario = DICIONARIOS[idioma] || DICIONARIOS[IDIOMA_PADRAO];
  return dicionario[chave] ?? chave; // chave crua como último fallback -- visível o bastante para notar o buraco no dicionário
}

export function getIdiomaAtual() {
  return document.documentElement.lang || IDIOMA_PADRAO;
}