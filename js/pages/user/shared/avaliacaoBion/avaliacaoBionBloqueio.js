// avaliacaoBionBloqueio.js
//
// Decide se o botão de pedir a avaliação da IA está bloqueado. Sem DOM, sem fetch e sem mensagens:
// só guarda o estado e avisa quem se inscreveu. Bloqueia em dois casos: do clique até a avaliação
// terminar (qualquer desfecho) e por 30 s depois de terminar com erro_codigo "ia_indisponivel".
// O estado vive na memória da página; recarregar a página zera o bloqueio de 30 s.

export const ESPERA_APOS_IA_INDISPONIVEL_MS = 30_000;
const CODIGO_IA_INDISPONIVEL = "ia_indisponivel";

export function criarBloqueio({ agora = () => Date.now(), esperaMs = ESPERA_APOS_IA_INDISPONIVEL_MS,
  agendar = setTimeout, cancelar = clearTimeout } = {}) {
  let emAndamento = false;
  let ate = 0;
  let timer = null;
  const ouvintes = new Set();

  const avisar = () => ouvintes.forEach((f) => f());
  const limparTimer = () => { if (timer != null) { cancelar(timer); timer = null; } };

  const bloqueado = () => emAndamento || agora() < ate;
  const segundosRestantes = () => (emAndamento ? 0 : Math.max(0, Math.ceil((ate - agora()) / 1000)));

  return {
    bloqueado,
    segundosRestantes,

    /** Chame ao clicar em enviar, antes do POST. */
    iniciar() {
      limparTimer();
      ate = 0;
      emAndamento = true;
      avisar();
    },

    /** Chame com o último estado do polling (ou com o estado de /ultima) quando deixar de ser "processando". */
    concluir(estado) {
      emAndamento = false;
      limparTimer();
      if (estado?.status === "falhou" && estado?.erro_codigo === CODIGO_IA_INDISPONIVEL) {
        ate = agora() + esperaMs;
        timer = agendar(() => { timer = null; avisar(); }, esperaMs);
      } else {
        ate = 0;
      }
      avisar();
    },

    /** Chame se o POST falhou sem criar avaliação (rede, 403, validação). Libera o botão na hora. */
    liberar() {
      emAndamento = false;
      limparTimer();
      ate = 0;
      avisar();
    },

    /** Inscreve um ouvinte (ex.: redesenhar o botão). Devolve a função que cancela a inscrição. */
    aoMudar(f) {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },

    /** Chame ao sair da página, para não deixar o timer vivo. */
    encerrar() {
      limparTimer();
      ouvintes.clear();
    },
  };
}