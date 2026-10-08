// profissionaisValidacoes.js  (SUBSTITUI o arquivo antigo)
//
// Validação do formulário de cadastro/edição de profissional (médico /
// enfermeiro). Não tem mais regras próprias: traduz os campos do modal
// (pf-nome, pf-cpf...) para o payload do back e delega a
// validarCadastroUsuario / validarAtualizacaoUsuario (espelho de
// schema_usuario.py). Depois traduz os erros de volta para os ids pf-*.
//
// Fica só aqui o que é exclusivo da tela: confirmação de e-mail e a
// semântica do seletor de tipo ('' = não escolheu, 'nenhum' = sem função
// clínica, só admin).
//
// Contrato mantido: validarFormularioProfissional(campos, editando)
//   -> { payload, erros: { 'pf-...': mensagem } }
// `campos.isAdmin` é opcional (ver nota abaixo).

import { validarCadastroUsuario, validarAtualizacaoUsuario } from "../../../../sharedConfig/validacoes/usuarioValidation.js";
import { setErro } from "../../../../sharedConfig/validacoes/generalValidation.js";
import { parseMensagemBackend } from "../../../../sharedConfig/validacoes/domErros.js";

// Reexportados para quem importava daqui.
export { validarCpf, validarTelefoneBr } from "../../../../sharedConfig/validacoes/generalValidation.js";

// campo do schema (back) -> id do input no modal
const CAMPO_PARA_CHAVE = {
  nome_completo: "pf-nome",
  cpf: "pf-cpf",
  user_login: "pf-login",
  telefone: "pf-telefone",
  email: "pf-email",
  tipo_papel: "pf-tipo",
  numero_crm: "pf-crm",
  uf_crm: "pf-uf-crm",
  rqe: "pf-rqe",
  numero_coren: "pf-coren",
  uf_coren: "pf-uf-coren",
  especialidade: "pf-especialidade",
  // Regras cruzadas sem campo (_geral) envolvem papel/admin: pintam no seletor de tipo.
  _geral: "pf-tipo",
};

const chaveDe = (campo) => CAMPO_PARA_CHAVE[campo.replace(/-/g, "_")];

/**
 * Erros estruturados do back { campo: msg } -> { erros: {pf-id: msg}, residual }.
 * `residual` = o que não tem input correspondente.
 */
export function mapearErrosPorCampoProfissional(porCampo) {
  const erros = {};
  const sobra = [];
  for (const [campo, msg] of Object.entries(porCampo || {})) {
    const chave = chaveDe(campo);
    if (chave) setErro(erros, chave, String(msg));
    else sobra.push(`${campo}: ${msg}`);
  }
  return { erros, residual: sobra.join("; ") };
}

/** Plano B (texto "campo: msg; campo2: msg2"). */
export function mapearErrosBackendProfissional(mensagem) {
  const { erros: porCampo, restantes } = parseMensagemBackend(mensagem);
  const r = mapearErrosPorCampoProfissional(porCampo);
  return { erros: r.erros, residual: [...restantes, r.residual].filter(Boolean).join("; ") };
}

/**
 * @param {object} campos - valores brutos do formulário (lerCamposFormulario)
 * @param {boolean} editando - true = update parcial (campo vazio = não altera)
 * @returns {{ payload: object, erros: Record<string,string> }}
 *
 * Nota sobre admin: o back exige "admin OU tipo_papel" no cadastro. O modal só
 * decide is_admin depois de validar, então, se `campos.isAdmin` não vier,
 * tipo 'nenhum' é tratado como "admin possível" (quem decide é o back). Para a
 * checagem exata, inclua `isAdmin: Boolean(checkboxAdmin?.checked)` em
 * lerCamposFormulario.
 */
export function validarFormularioProfissional(campos, editando) {
  // 1) campos do modal -> payload do back (vazio = chave ausente)
  const entrada = {};
  const put = (chave, valor) => {
    const v = typeof valor === "string" ? valor.trim() : valor;
    if (v) entrada[chave] = v;
  };
  put("nome_completo", campos.nome);
  put("cpf", campos.cpf);
  put("user_login", campos.login);
  put("telefone", campos.telefone);
  put("email", campos.email);

  const tipo = campos.tipo && campos.tipo !== "nenhum" ? campos.tipo : null;
  if (tipo) entrada.tipo_papel = tipo;
  if (tipo === "medico") {
    put("numero_crm", campos.crm);
    put("uf_crm", campos.ufCrm);
    put("rqe", campos.rqe);
  } else if (tipo === "enfermeiro") {
    put("numero_coren", campos.coren);
    put("uf_coren", campos.ufCoren);
    put("especialidade", campos.especialidade);
  }

  // 2) validação compartilhada (mesmas regras do back)
  const erros = {};
  if (!editando && !campos.tipo) setErro(erros, "pf-tipo", "Selecione o tipo de profissional.");

  const resultado = editando
    ? validarAtualizacaoUsuario(entrada)
    : validarCadastroUsuario({ ...entrada, is_admin: Boolean(campos.isAdmin ?? campos.tipo === "nenhum") });

  const traduzidos = mapearErrosPorCampoProfissional(resultado.erros);
  for (const [chave, msg] of Object.entries(traduzidos.erros)) setErro(erros, chave, msg);
  if (traduzidos.residual) setErro(erros, "pf-tipo", traduzidos.residual);

  // 3) confirmação de e-mail (só do front)
  const email = (campos.email || "").trim();
  const confirma = (campos.emailConfirma || "").trim();
  if (email || confirma || !editando) {
    if (!email) setErro(erros, "pf-email", "Informe o e-mail.");
    if (!confirma) setErro(erros, "pf-email-confirma", "Confirme o e-mail.");
    else if (email && !erros["pf-email"] && email.toLowerCase() !== confirma.toLowerCase()) {
      setErro(erros, "pf-email-confirma", "Os e-mails não coincidem.");
    }
  }

  // 4) payload final: normalizado, sem nulos e sem is_admin (o modal decide)
  const payload = {};
  for (const [k, v] of Object.entries(resultado.dados ?? entrada)) {
    if (v !== null && v !== undefined && k !== "is_admin") payload[k] = v;
  }
  // `dados` vem nulo quando há erro; nesse caso o payload não é usado (modal aborta).
  return { payload, erros };
}