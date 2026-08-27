// sessionStatus.js
//
// Único responsável por conversar com /auth/status.
// Não decide navegação, não mexe em DOM, não sabe o que é "onboarding"
// ou "mfa" em termos de tela -- só traduz a resposta HTTP em um
// resultado previsível pra quem chamar decidir o que fazer.
//
// Usado por:
//   - afterLogin.js  (decide a navegação inicial pós-OAuth)
//   - watchSession.js (detecta expiração durante o uso da página)

// Ajuste este caminho conforme a estrutura real do projeto.
import { URL_BASE_API } from "../../config.js";

/**
 * Consulta /auth/status e devolve um resultado normalizado.
 *
 * Nunca lança em caso de sessão ausente/expirada (401) -- isso é um
 * resultado válido (`{ ok: false, motivo: "nao_autenticado" }`), não
 * uma exceção. Só lança em falha de rede genuína.
 *
 * @returns {Promise<
 *   | { ok: true, status: "completa" }
 *   | { ok: true, status: "onboarding_pendente", senhaDefinida: boolean }
 *   | { ok: true, status: "mfa_pendente", metodo: string, tentativasRestantes: number, reautenticarDisponivel: boolean }
 *   | { ok: false, motivo: "nao_autenticado" }
 *   | { ok: false, motivo: "status_desconhecido", bruto: any }
 * >}
 */
export async function consultarStatusSessao() {
  const resp = await fetch(`${URL_BASE_API}/auth/status`, {
    method: "GET",
    credentials: "include",
  });

  if (resp.status === 401) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  if (!resp.ok) {
    // Qualquer outro erro HTTP (500, etc.) -- trata como falha de rede,
    // não como "não autenticado", pra quem chamar poder diferenciar
    // se quiser (ex: tentar de novo vs. redirecionar direto).
    const erro = new Error(`/auth/status respondeu ${resp.status}`);
    erro.status = resp.status;
    throw erro;
  }

  const dados = await resp.json();

  switch (dados?.status) {
    case "completa":
      return { ok: true, status: "completa" };

    case "onboarding_pendente":
      return {
        ok: true,
        status: "onboarding_pendente",
        senhaDefinida: Boolean(dados.senha_definida),
      };

    case "mfa_pendente":
      return {
        ok: true,
        status: "mfa_pendente",
        metodo: dados.metodo,
        tentativasRestantes: dados.tentativas_restantes,
        reautenticarDisponivel: Boolean(dados.reautenticar_disponivel),
      };

    default:
      return { ok: false, motivo: "status_desconhecido", bruto: dados };
  }
}