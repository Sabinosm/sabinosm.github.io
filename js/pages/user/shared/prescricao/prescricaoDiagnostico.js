// prescricaoDiagnostico.js
//
// Bloco do diagnóstico da prescrição. Três modos, decididos por quem chama:
//   - sem resultado e editável   -> formulário de criação ("Prescrição manual"): POST cria o rascunho
//   - rascunho e editável        -> formulário preenchido: PATCH só dos campos que mudaram
//   - confirmado / somente leitura -> resumo
// Validação espelha o schema do back (CID-10, tamanhos); o back continua sendo a cerca.

import { criarRascunho, atualizarDiagnostico } from "./prescricaoApi.js";
import {
  el, rotulo, CERTEZA_LABELS, TIPO_PRESCRICAO_LABELS, LIMITES,
  validarDiagnostico, diferencaDiagnostico, normalizarCid, mensagemDeErro,
} from "./prescricaoHelpers.js";
import { exibirMensagem } from "../../../../shared/feedback.js";

function opcoes(select, mapa, { vazio } = {}) {
  if (vazio) select.appendChild(new Option(vazio, ""));
  Object.entries(mapa).forEach(([valor, texto]) => select.appendChild(new Option(texto, valor)));
}

function campo(id, titulo, controle, { opcional } = {}) {
  const caixa = el("div", "presc-campo");
  const label = el("label", "field-label");
  label.htmlFor = id;
  label.appendChild(el("span", null, titulo));
  if (opcional) label.appendChild(el("span", "field-optional", " (opcional)"));
  controle.id = id;
  const erro = el("p", "field-error");
  erro.id = `${id}-error`;
  caixa.append(label, controle, erro);
  return { caixa, controle, erro };
}

function resumo(resultado) {
  const caixa = el("div", "presc-resumo");
  const linha = (nome, valor) => {
    const p = el("p", "presc-linha");
    p.append(el("span", "presc-linha-nome", `${nome}: `), el("span", null, valor));
    caixa.appendChild(p);
  };
  linha("CID-10", [resultado.codigo_cid10_principal, resultado.descricao_cid10_principal].filter(Boolean).join(" — ") || "—");
  linha("Certeza", rotulo(CERTEZA_LABELS, resultado.certeza_diagnostica));
  linha("Tipo de prescrição", rotulo(TIPO_PRESCRICAO_LABELS, resultado.tipo_prescricao));
  return caixa;
}

/**
 * @param {HTMLElement} alvo
 * @param {object|null} resultado   resultado em foco (null = ainda não existe rascunho)
 * @param {{uuidAtendimento:string, editavel:boolean, recarregar:()=>Promise<void>, aoEditado:()=>void}} ctx
 */
export function renderDiagnostico(alvo, resultado, { uuidAtendimento, editavel, recarregar, aoEditado }) {
  alvo.replaceChildren();
  if (!resultado && !editavel) return;

  const painel = el("section", "cons-panel presc-bloco");
  painel.appendChild(el("h2", "cons-panel-titulo", resultado ? "Diagnóstico" : "Prescrição manual"));
  alvo.appendChild(painel);

  if (!editavel) {
    painel.appendChild(resumo(resultado));
    return;
  }

  if (!resultado) {
    painel.appendChild(el("p", "field-hint",
      "Prefere montar você mesmo? Informe o diagnóstico para criar o rascunho e depois adicione medicamentos e exames."));
  }

  const cid = el("input", "field-input");
  cid.type = "text"; cid.maxLength = LIMITES.cid; cid.placeholder = "J18.9"; cid.autocomplete = "off";
  cid.value = resultado?.codigo_cid10_principal ?? "";
  cid.addEventListener("input", () => { cid.value = cid.value.toUpperCase(); });

  const descricao = el("input", "field-input");
  descricao.type = "text"; descricao.maxLength = LIMITES.descricao; descricao.autocomplete = "off";
  descricao.value = resultado?.descricao_cid10_principal ?? "";

  const certeza = el("select", "field-input");
  opcoes(certeza, CERTEZA_LABELS);
  certeza.value = resultado?.certeza_diagnostica ?? "suspeito";

  const tipo = el("select", "field-input");
  opcoes(tipo, TIPO_PRESCRICAO_LABELS, { vazio: "Não informado" });
  tipo.value = resultado?.tipo_prescricao ?? "";

  const c = {
    cid: campo("presc-d-cid", "CID-10", cid),
    descricao: campo("presc-d-descricao", "Descrição do diagnóstico", descricao),
    certeza: campo("presc-d-certeza", "Certeza do diagnóstico", certeza),
    tipo: campo("presc-d-tipo", "Tipo de prescrição", tipo, { opcional: true }),
  };
  const grade = el("div", "presc-grade");
  Object.values(c).forEach((x) => grade.appendChild(x.caixa));
  painel.appendChild(grade);

  const botao = el("button", "btn-primary", resultado ? "Salvar diagnóstico" : "Criar rascunho de prescrição");
  botao.type = "button";
  const acoes = el("div", "cons-panel-acoes");
  acoes.appendChild(botao);
  painel.appendChild(acoes);

  const ler = () => ({ cid: cid.value, descricao: descricao.value, certeza: certeza.value, tipo: tipo.value });

  function mostrarErros(erros) {
    Object.entries(c).forEach(([nome, x]) => {
      x.erro.textContent = erros[nome] ?? "";
      x.controle.classList.toggle("field-input--invalid", Boolean(erros[nome]));
    });
  }

  if (resultado) {                       // só habilita quando algo mudou
    const atualizar = () => { botao.disabled = Object.keys(diferencaDiagnostico(resultado, ler())).length === 0; };
    [cid, descricao, certeza, tipo].forEach((x) => x.addEventListener("input", atualizar));
    [certeza, tipo].forEach((x) => x.addEventListener("change", atualizar));
    atualizar();
  }

  botao.addEventListener("click", async () => {
    const valores = ler();
    const erros = validarDiagnostico(valores);
    mostrarErros(erros);
    if (Object.keys(erros).length) return;

    botao.disabled = true;
    try {
      if (!resultado) {
        await criarRascunho(uuidAtendimento, {
          codigo_cid10_principal: normalizarCid(valores.cid),
          descricao_cid10_principal: valores.descricao.trim(),
          certeza_diagnostica: valores.certeza,
          ...(valores.tipo ? { tipo_prescricao: valores.tipo } : {}),
        });
        exibirMensagem("Rascunho de prescrição criado.", "sucesso");
      } else {
        const patch = diferencaDiagnostico(resultado, valores);
        if (!Object.keys(patch).length) return;
        await atualizarDiagnostico(resultado.uuid, patch);
        aoEditado?.();
        exibirMensagem("Diagnóstico atualizado.", "sucesso");
      }
      await recarregar();
    } catch (erro) {
      exibirMensagem(mensagemDeErro(erro, "Não foi possível salvar o diagnóstico."), "erro");
      botao.disabled = false;
    }
  });
}