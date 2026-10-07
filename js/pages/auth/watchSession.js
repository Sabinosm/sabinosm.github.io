// watchSession.js
//
// Monitor ÚNICO da sessão. Quem o liga são os pontos de entrada das
// páginas (initPagina.js e guardarPagina.js): as páginas em si nunca
// o importam. Roda durante todo o uso da página -- diferente de
// afterLogin.js, que só existe no trânsito entre o OAuth e o destino.
//
// Faz duas coisas, sempre a partir de /auth/status_completo (via
// sessionStatus.js):
//
//  1. SESSÃO: percebe que a sessão morreu (token expirou, revogada em
//     outra aba...) e manda pro login. Qualquer status que não seja
//     "completa" aqui dentro é tratado como sessão encerrada -- estas
//     páginas não têm UI de onboarding/mfa.
//
//  2. PERFIL: compara is_admin / funcao_clinica / is_super_admin que o
//     servidor devolve com os do snapshot em sessionStorage.
//       - uuid diferente  -> outra pessoa assumiu a sessão (ex: login
//                            em outra aba): trata como sessão encerrada;
//       - perfil mudou    -> atualiza o snapshot; se a página atual
//                            deixou de ser permitida, vai para 403;
//                            senão só avisa (sem recarregar: não
//                            perde formulário em preenchimento).
//
// Só UX: quem autoriza de verdade é o back.

import { consultarStatusSessao } from "./sessionStatus.js";
import { exibirMensagem } from "../../shared/feedback.js";
import { ROTAS } from "../../sharedConfig/loaders/rotas.js";
import { lerDadosUsuarioCache } from "../../sharedConfig/userCache.js";
import { atualizarUsuarioCache } from "../../sharedConfig/userCacheHelpers/userCacheUsuario.js";
import { verificarAcesso, exigirAcesso } from "./acesso.js";

const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000; // 5 minutos

let intervaloId = null;
let aoFicarVisivel = null;
let verificando = false; // evita checagens sobrepostas (carregamento + aba visível + intervalo)

/**
 * Inicia a checagem periódica. IDEMPOTENTE: com o monitor ativo, novas
 * chamadas não fazem nada -- assim initPagina(), guardarPagina.js e uma
 * página com bootstrap próprio podem todos chamar sem duplicar
 * listeners nem intervalos.
 *
 * @param {{ verificarAgora?: boolean }} [opcoes]
 *   verificarAgora: consulta já no carregamento (padrão: false). É o
 *   que faz uma mudança de perfil valer na PRÓXIMA página aberta, em
 *   vez de só após o primeiro intervalo.
 */
export function iniciarMonitoramentoSessao({ verificarAgora = false } = {}) {
  if (intervaloId !== null) return;

  // Verifica também quando a aba volta a ficar visível -- cobre o caso
  // comum de deixar a aba em segundo plano por horas e voltar a ela.
  aoFicarVisivel = () => {
    if (document.visibilityState === "visible") verificarSessao();
  };
  document.addEventListener("visibilitychange", aoFicarVisivel);

  intervaloId = setInterval(verificarSessao, INTERVALO_VERIFICACAO_MS);

  if (verificarAgora) verificarSessao();
}

export function pararMonitoramentoSessao() {
  if (intervaloId !== null) {
    clearInterval(intervaloId);
    intervaloId = null;
  }
  if (aoFicarVisivel) {
    document.removeEventListener("visibilitychange", aoFicarVisivel);
    aoFicarVisivel = null;
  }
}

async function verificarSessao() {
  if (verificando) return;
  verificando = true;

  try {
    let resultado;
    try {
      resultado = await consultarStatusSessao();
    } catch (erro) {
      // Falha de rede pontual (ex: sem internet por um instante) não
      // deve derrubar o usuário da tela -- só loga e tenta no próximo ciclo.
      console.error("Falha ao verificar sessão:", erro);
      return;
    }

    if (resultado.ok && resultado.status === "completa") {
      reagirAoUsuario(resultado.usuario);
      return;
    }

    encerrarSessaoLocal();
  } finally {
    verificando = false;
  }
}

// ── perfil ───────────────────────────────────────────────────────────

const normalizar = (u) => ({
  is_admin: Boolean(u.is_admin),
  is_super_admin: Boolean(u.is_super_admin),
  funcao_clinica: u.funcao_clinica ?? null,
});

/**
 * Compara o `usuario` do servidor com o do snapshot e, se o perfil
 * mudou, atualiza SÓ esses três campos do snapshot.
 * @returns {"igual" | "atualizado" | "identidade_diferente"}
 */
function sincronizarComServidor(usuarioServidor) {
  const local = lerDadosUsuarioCache()?.usuario;
  // Back sem `usuario` na resposta, ou sem snapshot: nada a comparar.
  if (!usuarioServidor || !local) return "igual";

  if (usuarioServidor.uuid && local.uuid && usuarioServidor.uuid !== local.uuid) {
    return "identidade_diferente";
  }

  const a = normalizar(local);
  const b = normalizar(usuarioServidor);
  if (Object.keys(a).every((k) => a[k] === b[k])) return "igual";

  atualizarUsuarioCache(b);
  return "atualizado";
}

function reagirAoUsuario(usuarioServidor) {
  const resultado = sincronizarComServidor(usuarioServidor);

  if (resultado === "identidade_diferente") {
    encerrarSessaoLocal();
    return;
  }
  if (resultado !== "atualizado") return;

  // O perfil mudou: a página atual ainda é permitida?
  if (!verificarAcesso().ok) {
    pararMonitoramentoSessao();
    exigirAcesso(); // esconde a página e vai para 403 (ou 401)
    return;
  }

  // Ainda permitida: o snapshot já está novo. Sidebar e seções
  // refletem na próxima navegação; não recarrega para não perder
  // formulário em preenchimento.
  exibirMensagem("Suas permissões foram atualizadas.", "sucesso");
}

// ── sessão encerrada ────────────────────────────────────────────────

function encerrarSessaoLocal() {
  pararMonitoramentoSessao();
  exibirMensagem("Sua sessão expirou. Faça login novamente.", "erro");
  setTimeout(() => {
    window.location.replace(ROTAS.erro401);
  }, 2000);
}