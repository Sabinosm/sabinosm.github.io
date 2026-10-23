// atendimentoValidation.js
//
// Espelho dos schemas de entrada do Bloco 2 (schema_binario.py, schema.py
// de dados clínicos, CondutaEnfermagemCriarSchema). O BACK é a verdade;
// isto só evita ida e volta por erro óbvio. Mesmo contrato de
// generalValidation.js: { ok, dados | null, erros: { campo: mensagem } }.
//
// ITENS DO BINÁRIO: a validação de CADA item fica nas validações de
// domínio já existentes (medicamentosEmUsoValidation.js,
// doencaCronicaValidation.js, tipoSanguineoValidation.js) -- o binário
// "possui" grava/atualiza o dado do paciente. Este arquivo valida só a
// ESTRUTURA da seção (resposta possui/nega/não-coletado).

import { CAMPO_GERAL, resultado, setErro, strip, tam, vazio } from "./generalValidation.js";
import { SECOES_BINARIO, UNIDADE_POR_TIPO, SITIOS_POR_TIPO } from "../../pages/user/shared/atendimento/atendimentoHelpers.js";

// ============================================================ binário

/**
 * Valida UMA seção do binário e monta o payload de POST. Os itens já
 * chegam VALIDADOS (validações de domínio) quando a resposta é "possui".
 *
 * valores = { resposta: "possui"|"nega"|"nao-coletado", itens: [...], tipoSanguineo }
 *
 * Regras (schema_binario.py):
 *  - nao_foi_possivel_coletar=true força possui=false e não aceita itens;
 *  - possui=false não aceita itens;
 *  - tipo sanguíneo não admite possui=false (use nao-coletado; "desconhecido" é valor).
 * itens=[] com possui=true é VÁLIDO quando já existe registro ativo (o back
 * confirma sem criar nada) -- o que depende do banco vira mensagem do back.
 */
export function validarSecaoBinario(secaoId, valores) {
  const erros = {};
  const d = { possui: undefined, nao_foi_possivel_coletar: false };

  const meta = SECOES_BINARIO.find((s) => s.id === secaoId);
  if (!meta) { setErro(erros, CAMPO_GERAL, `Seção desconhecida: ${secaoId}`); return resultado(null, erros); }

  const resposta = valores?.resposta;
  if (!resposta) { setErro(erros, CAMPO_GERAL, "Selecione uma resposta."); return resultado(null, erros); }

  if (resposta === "nao-coletado") {
    d.possui = false;
    d.nao_foi_possivel_coletar = true;
  } else if (resposta === "nega") {
    if (meta.tipoSanguineo) {
      setErro(erros, CAMPO_GERAL,
        "Tipo sanguíneo não admite “nega”: informe o tipo ou marque “não foi possível coletar”.");
      return resultado(null, erros);
    }
    d.possui = false;
  } else {
    d.possui = true;
  }

  if (meta.tipoSanguineo) {
    if (d.possui) {
      const tipo = strip(valores?.tipoSanguineo ?? "");
      if (!tipo) setErro(erros, CAMPO_GERAL, "Selecione o tipo sanguíneo.");
      else d.tipo_sanguineo = tipo; // já normalizado pela validação de domínio
    }
    return resultado(Object.keys(erros).length === 0 ? d : null, erros);
  }

  if (d.possui && meta.comItens) {
    if (!Array.isArray(valores.itens)) { setErro(erros, CAMPO_GERAL, "Itens inválidos."); return resultado(null, erros); }
    d.itens = valores.itens; // [] vale: confirma registro ativo existente
  } else if (Array.isArray(valores.itens) && valores.itens.length > 0) {
    setErro(erros, CAMPO_GERAL, "Resposta “nega”/“não coletado” não aceita itens.");
  }

  return resultado(Object.keys(erros).length === 0 ? d : null, erros);
}

/**
 * Monta o payload agregado das 4 seções (rota POST .../binario).
 * `valoresPorSecao` = {alergias: {resposta, itens, tipoSanguineo}, ...}.
 */
export function montarPayloadAgregado(valoresPorSecao) {
  const erros = {};
  const dados = {};

  for (const { id } of SECOES_BINARIO) {
    const r = validarSecaoBinario(id, valoresPorSecao[id]);
    if (!r.ok) { setErro(erros, id, r.erros[CAMPO_GERAL] ?? "Seção inválida."); continue; }
    dados[id] = r.dados;
  }

  return resultado(Object.keys(erros).length === 0 ? dados : null, erros);
}

// ======================================================= sinais vitais

/**
 * linhas = [{tipo_parametro, valorTexto, unidade, sitio, dpoc}] (1 a 50).
 * Mesmas regras de SinaisVitaisIn/SinalVitalIn: unidade tem de bater com o
 * tipo (a UI já trava, mas espelhamos), valor numérico >= 0 (bool não vale).
 */
export function validarSinaisVitais(linhas) {
  const erros = {};

  if (!Array.isArray(linhas) || linhas.length === 0) {
    setErro(erros, CAMPO_GERAL, "Adicione ao menos um sinal vital.");
    return resultado(null, erros);
  }
  if (linhas.length > 50) { setErro(erros, CAMPO_GERAL, "No máximo 50 sinais por registro."); return resultado(null, erros); }

  const sinais = [];
  linhas.forEach((l, i) => {
    const base = `sinal ${i + 1}`;
    const tipo = l.tipo_parametro;
    if (!UNIDADE_POR_TIPO[tipo]) { setErro(erros, CAMPO_GERAL, `${base}: tipo desconhecido.`); return; }

    const valorTexto = strip(l.valorTexto ?? "");
    if (vazio(valorTexto)) { setErro(erros, CAMPO_GERAL, `${base}: informe o valor.`); return; }
    if (!/^-?\d+([.,]\d+)?$/.test(valorTexto)) { setErro(erros, CAMPO_GERAL, `${base}: valor deve ser numérico.`); return; }
    const valor = Number(valorTexto.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) { setErro(erros, CAMPO_GERAL, `${base}: valor inválido.`); return; }

    const sinal = {
      tipo_parametro: tipo,
      valor_numerico: valor,
      unidade: UNIDADE_POR_TIPO[tipo],
      flag_validacao_faixa: "dentro-do-limite",
      flag_escala_dpoc: Boolean(l.dpoc),
    };
    if (l.sitio) {
      if (!SITIOS_POR_TIPO[tipo].includes(l.sitio)) {
        setErro(erros, CAMPO_GERAL, `${base}: sítio não se aplica a ${tipo}.`);
        return;
      }
      sinal.sitio_medicao = l.sitio;
    }
    sinais.push(sinal);
  });

  return resultado(erros[CAMPO_GERAL] ? null : { sinais }, erros);
}

// ============================================================ coleta/input

/** desde_quando_sintomas: opcional, inteiro 0..32767 (bool não vale). */
export function validarColeta({ desdeTexto }) {
  const erros = {};
  const d = {};
  const t = strip(desdeTexto ?? "");

  if (!vazio(t)) {
    if (!/^\d+$/.test(t)) setErro(erros, CAMPO_GERAL, "Horas de sintomas: informe um inteiro.");
    else {
      const n = Number(t);
      if (n < 0 || n > 32767) setErro(erros, CAMPO_GERAL, "Horas de sintomas: entre 0 e 32767.");
      else d.desde_quando_sintomas = n;
    }
  }
  return resultado(Object.keys(erros).length === 0 ? d : null, erros);
}

/**
 * Input de protocolo: ao menos um de queixa_principal, valor_avpu, input_json.
 * input_json (textarea) precisa parsear num objeto/valor JSON válido.
 */
export function validarInputProtocolo({ queixa, avpu, jsonTexto }) {
  const erros = {};
  const d = {};

  const q = strip(queixa ?? "");
  if (q) {
    if (tam(q) > 2000) setErro(erros, "queixa_principal", "No máximo 2000 caracteres.");
    else d.queixa_principal = q;
  }

  const a = strip(avpu ?? "");
  if (a) {
    if (tam(a) > 20) setErro(erros, "valor_avpu", "No máximo 20 caracteres.");
    else d.valor_avpu = a;
  }

  const t = strip(jsonTexto ?? "");
  if (t) {
    try {
      d.input_json = JSON.parse(t);
    } catch {
      setErro(erros, "input_json", "JSON inválido.");
    }
  }

  if (Object.keys(erros).length === 0 && !d.queixa_principal && !d.valor_avpu && d.input_json === undefined) {
    setErro(erros, CAMPO_GERAL, "Informe ao menos um de: queixa principal, AVPU ou respostas do protocolo (JSON).");
  }

  return resultado(Object.keys(erros).length === 0 ? d : null, erros);
}

// ================================================================ conduta

/** descricao_conduta obrigatória; uuid_protocolo_catalogo opcional, uuid de 36 chars. */
export function validarConduta({ descricao, uuidProtocolo }) {
  const erros = {};
  const d = {};

  const desc = strip(descricao ?? "");
  if (!desc) setErro(erros, "descricao_conduta", "Descreva a conduta.");
  else if (tam(desc) > 5000) setErro(erros, "descricao_conduta", "No máximo 5000 caracteres.");
  else d.descricao_conduta = desc;

  const proto = strip(uuidProtocolo ?? "");
  if (proto) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(proto)) {
      setErro(erros, "uuid_protocolo_catalogo", "Deve ser um UUID válido.");
    } else d.uuid_protocolo_catalogo = proto;
  }

  return resultado(Object.keys(erros).length === 0 ? d : null, erros);
}
