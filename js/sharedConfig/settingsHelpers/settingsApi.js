// ============================================
// B-íon — Modal de Configurações: comunicação com a API de configurações
// ============================================

import { URL_BASE_API } from '../urlConfig.js';

const CONFIGURACAO_API_URL = URL_BASE_API + '/configuracoes/';

// ============================================
// Mapeamento entre os elementos [data-track] do painel Preferências
// (identificados pelo id do elemento, ver settingsModal.html) e a
// estrutura de configuracoes que a API espera (ver
// ConfiguracaoService.CONFIGURACOES_DEFAULT):
//   { design: { tema, tamanho_fonte }, preferencias: { linguagem } }
//
// f-idioma: <select> já tem value="pt-BR"/"en-US" no HTML -- envia
// o value direto, sem transformação.
//
// f-fonte: <input type="range" min="0" max="2">, não texto -- precisa
// converter o índice para o nome que o schema.py do backend espera.
// Se o range de opções mudar no HTML, ajustar este mapa junto.
// ============================================

const TAMANHO_FONTE_POR_INDICE = ['pequeno', 'medio', 'grande'];

/**
 * Monta o corpo de configuracoes no formato da API a partir do payload
 * plano { idDoElemento: valor, theme?: valor } usado internamente pelo
 * settings.js.
 */
export function montarConfiguracoesParaApi(payloadPlano) {
  const configuracoes = { design: {}, preferencias: {} };

  if (payloadPlano.theme !== undefined) {
    configuracoes.design.tema = payloadPlano.theme;
  }

  if (payloadPlano['f-fonte'] !== undefined) {
    const indice = Number(payloadPlano['f-fonte']);
    const nome = TAMANHO_FONTE_POR_INDICE[indice];
    if (nome) configuracoes.design.tamanho_fonte = nome;
  }

  if (payloadPlano['f-idioma'] !== undefined) {
    configuracoes.preferencias.linguagem = [payloadPlano['f-idioma']];
  }

  // Remove seções que ficaram vazias (nada mapeado nelas)
  Object.keys(configuracoes).forEach(secao => {
    if (Object.keys(configuracoes[secao]).length === 0) delete configuracoes[secao];
  });

  return configuracoes;
}

/**
 * Envia as configurações atualizadas para a API.
 *
 * Retorna { ok: boolean, mensagem?: string }. Quem chama decide o que
 * fazer com a UI (reverter campos, manter save-bar visível, etc) --
 * esta função só cuida da chamada de rede e de extrair a mensagem de
 * erro que o backend manda (ver ConfiguracaoController/json_error).
 */
export async function salvarConfiguracoesNaApi(payloadPlano) {
  const configuracoes = montarConfiguracoesParaApi(payloadPlano);
  if (Object.keys(configuracoes).length === 0) return { ok: true };

  try {
    const resposta = await fetch(CONFIGURACAO_API_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // front e API ficam em domínios/subdomínios diferentes -- 'same-origin' não enviaria o cookie httpOnly da sessão nesse caso
      body: JSON.stringify({ configuracoes }),
    });

    if (!resposta.ok) {
      // json_error retorna { success: false, message: "..." } -- ver
      // src/core/responses.py. Se o corpo não for esse formato (ex:
      // erro 500 sem JSON), cai no fallback genérico abaixo.
      let mensagem = 'Não foi possível salvar as configurações. Tente novamente.';
      try {
        const corpo = await resposta.json();
        if (corpo?.message) mensagem = corpo.message;
      } catch {
        // corpo não era JSON -- mantém a mensagem genérica
      }
      return { ok: false, mensagem };
    }

    return { ok: true };
  } catch (erro) {
    console.error('settingsApi.js: erro de rede ao salvar configurações', erro);
    return {
      ok: false,
      mensagem: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
    };
  }
}