// ============================================
// Utilitário: toggle de "mostrar senha" (olhinho)
//
// Uso:
//   import { ativarTogglesSenha } from '../sharedConfig/passwordToggle.js';
//   ativarTogglesSenha('#senha-nova, #senha-confirmar');
//
// Ou passando elementos diretamente:
//   ativarTogglesSenha([senhaInputNova, senhaInputConfirmar]);
//
// O QUE FAZ:
// Para cada <input type="password"> selecionado, envolve o input num
// wrapper e injeta um botão de olho ao lado. Clicar alterna o input
// entre type="password" (oculto) e type="text" (visível) e troca o
// ícone (olho aberto / olho riscado).
//
// PRÉ-REQUISITO DE CSS: o wrapper (.senha-toggle-wrap) precisa de
// position: relative e o botão (.senha-toggle-btn) de position:
// absolute, alinhado à direita do input. Ver bloco de estilo sugerido
// no final deste arquivo como comentário -- ajuste conforme o design
// system real (mesma pasta de css/pages/user/settings.css).
//
// Não depende de nenhum outro módulo do projeto -- pode ser chamado
// de qualquer modal/página que tenha campos de senha.
// ============================================

const ICONE_OLHO_ABERTO = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;

const ICONE_OLHO_FECHADO = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M1 1l22 22" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

/**
 * Ativa o toggle de mostrar/ocultar em um ou mais campos de senha.
 * @param {string | HTMLInputElement | HTMLInputElement[] | NodeListOf<HTMLInputElement>} alvo
 *   Seletor CSS (ex: '#senha-nova, #senha-confirmar'), um único
 *   input, ou uma lista de inputs.
 */
export function ativarTogglesSenha(alvo) {
  const inputs = resolverInputs(alvo);

  inputs.forEach((input) => {
    if (!input || input.dataset.senhaToggleAtivo) return; // evita duplicar se chamado 2x no mesmo input
    if (input.type !== 'password') return; // só faz sentido em campos de senha

    envolverEInjetarBotao(input);
    input.dataset.senhaToggleAtivo = 'true';
  });
}

function resolverInputs(alvo) {
  if (typeof alvo === 'string') {
    return Array.from(document.querySelectorAll(alvo));
  }
  if (alvo instanceof HTMLInputElement) {
    return [alvo];
  }
  if (alvo && typeof alvo.length === 'number') {
    return Array.from(alvo);
  }
  return [];
}

function envolverEInjetarBotao(input) {
  const wrapper = document.createElement('div');
  wrapper.className = 'senha-toggle-wrap';

  // Insere o wrapper no lugar do input, depois move o input pra dentro
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button'; // crítico: sem isso ele submete o form
  btn.className = 'senha-toggle-btn';
  btn.setAttribute('aria-label', 'Mostrar senha');
  btn.innerHTML = ICONE_OLHO_ABERTO;

  btn.addEventListener('click', () => {
    const visivel = input.type === 'text';
    input.type = visivel ? 'password' : 'text';
    btn.innerHTML = visivel ? ICONE_OLHO_ABERTO : ICONE_OLHO_FECHADO;
    btn.setAttribute('aria-label', visivel ? 'Mostrar senha' : 'Ocultar senha');
  });

  wrapper.appendChild(btn);
}