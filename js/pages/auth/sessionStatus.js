// sessionStatus.js
//
// Único responsável por conversar com /auth/status e
// /auth/status_completo.
// Não decide navegação, não mexe em DOM, não sabe o que é "onboarding"
// ou "mfa" em termos de tela -- só traduz a resposta HTTP em um
// resultado previsível pra quem chamar decidir o que fazer.
//
// Os dois endpoints têm a mesma lógica de estado; a única diferença é
// que, em "completa", /status_completo inclui o `usuario`.
//
// Usado por:
//   - afterLogin.js   (decide a navegação inicial pós-OAuth)       -> completo
//   - watchSession.js (detecta expiração durante o uso da página e
//     reconcilia o perfil -- is_admin/funcao_clinica/is_super_admin --
//     com o que o servidor diz agora)                              -> completo
//   - onboarding.js   (só precisa do estado e de `senhaDefinida`)  -> { completo: false }

// Ajuste este caminho conforme a estrutura real do projeto.
import { URL_BASE_API } from "../../sharedConfig/urlConfig.js";

// Rota enxuta: o status da sessão, sem dados do usuário.
// AJUSTE o prefixo se o blueprint de status não estiver em /auth.
const URL_STATUS = `${URL_BASE_API}/auth/status`;

// Rota "completa": o status da sessão e, quando completa, o `usuario`
// (to_dict_session: uuid, funcao_clinica, is_admin, is_super_admin,
// status).
const URL_STATUS_COMPLETO = `${URL_BASE_API}/auth/status_completo`;

/**
 * Consulta o status da sessão e devolve um resultado normalizado.
 *
 * Nunca lança em caso de sessão ausente/expirada (401) -- isso é um
 * resultado válido (`{ ok: false, motivo: "nao_autenticado" }`), não
 * uma exceção. Só lança em falha de rede genuína.
 *
 * @param {{ completo?: boolean }} [opcoes]
 *   completo (padrão: true): usa /status_completo, que em "completa"
 *   traz o `usuario` (necessário para reconciliar perfil). Com false
 *   usa /status, e `usuario` vem sempre null -- só serve para quem
 *   precisa do ESTADO (ex: onboarding.js).
 *
 * @returns {Promise<
 *   | { ok: true, status: "completa", usuario: object|null }
 *   | { ok: true, status: "onboarding_pendente", senhaDefinida: boolean }
 *   | { ok: true, status: "mfa_pendente", metodo: string, tentativasRestantes: number, reautenticarDisponivel: boolean }
 *   | { ok: false, motivo: "nao_autenticado" }
 *   | { ok: false, motivo: "status_desconhecido", bruto: any }
 * >}
 */
export async function consultarStatusSessao({ completo = true } = {}) {
  const url = completo ? URL_STATUS_COMPLETO : URL_STATUS;
  const resp = await fetch(url, {
    method: "GET",
    credentials: "include",
    // Perfil e sessão mudam no servidor: nunca servir do cache do navegador.
    cache: "no-store",
  });
  if (resp.status === 401) {
    return { ok: false, motivo: "nao_autenticado" };
  }

  if (!resp.ok) {
    // Qualquer outro erro HTTP (500, etc.) -- trata como falha de rede,
    // não como "não autenticado", pra quem chamar poder diferenciar
    // se quiser (ex: tentar de novo vs. redirecionar direto).
    const erro = new Error(`${url} respondeu ${resp.status}`);
    erro.status = resp.status;
    throw erro;
  }

  const dados = await resp.json();

  switch (dados?.status) {
    case "completa":
      // `usuario` pode faltar num back antigo: quem consome trata null.
      return { ok: true, status: "completa", usuario: dados.usuario ?? null };

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
        metodosDisponiveis: dados.metodos_disponiveis || [],   // novo
        tentativasRestantes: dados.tentativas_restantes,
        reautenticarDisponivel: Boolean(dados.reautenticar_disponivel),
      };

    default:
      return { ok: false, motivo: "status_desconhecido", bruto: dados };
  }
}