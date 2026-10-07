// familias/composto.js
//
// Adaptador do protocolo composto (tipo_protocolo = 'protocolo-composto'):
// um protocolo montado a partir de MÓDULOS -- cada módulo é uma pergunta
// clínica completa e independente (pontuador, classificador ou regra).
//
// Os campos de entrada do protocolo são a UNIÃO das variáveis dos módulos
// (sem repetir), cada uma indicando em quais módulos é usada. A estrutura
// (agregação, gatilhos e os módulos com suas explicações) vem da mesma
// chamada e é desenhada como seção extra.

import { buscarComposicao } from "../catalogosApi.js";
import { campoDeModulo, criarChipsCampos } from "../catalogosCampos.js";
import {
  rotuloAgregacao,
  rotuloFamiliaCalculo,
  rotuloPapelModulo,
  rotuloTipoModulo,
  rotuloTipoSaida,
} from "../catalogosLabels.js";
import { criarBadge, criarBlocoExplicacao, criarReferencia } from "../catalogosUi.js";

/** União dos campos dos módulos, sem repetir por código. */
export function unirCampos(modulos) {
  const porCodigo = new Map();

  modulos.forEach(m => {
    (m.campos ?? []).forEach(bruto => {
      const campo = campoDeModulo(bruto);
      const existente = porCodigo.get(campo.codigo);
      if (!existente) {
        porCodigo.set(campo.codigo, { ...campo, usadoEm: [m.modulo.sigla] });
        return;
      }
      existente.usadoEm.push(m.modulo.sigla);
      // obrigatório em qualquer módulo = obrigatório para o protocolo
      existente.obrigatorio = Boolean(existente.obrigatorio || campo.obrigatorio);
    });
  });

  return [...porCodigo.values()];
}

function criarEl(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function criarCartaoModulo(item, aberto) {
  const { modulo } = item;
  const detalhes = criarEl('details', 'detalhe-modulo');
  detalhes.open = aberto;

  // --- cabeçalho (sempre visível) ---
  const resumo = criarEl('summary', 'detalhe-modulo-resumo');
  resumo.appendChild(criarEl('span', 'detalhe-modulo-nome', modulo.nome_modulo));
  resumo.appendChild(criarBadge(modulo.sigla, 'catalog-badge--sigla'));
  resumo.appendChild(criarBadge(rotuloPapelModulo(item.papel), 'catalog-badge--info'));
  resumo.appendChild(criarBadge(
    `${rotuloFamiliaCalculo(modulo.familia_calculo)} → ${rotuloTipoSaida(modulo.tipo_saida)}`));
  resumo.appendChild(criarBadge(rotuloTipoModulo(modulo.tipo_modulo)));
  resumo.appendChild(criarBadge(`v${item.numero_versao}`));
  detalhes.appendChild(resumo);

  // --- corpo ---
  const corpo = criarEl('div', 'detalhe-modulo-corpo');

  if (modulo.descricao) corpo.appendChild(criarEl('p', 'detalhe-texto', modulo.descricao));

  const explicacao = criarBlocoExplicacao(item.explicacao);
  if (explicacao) corpo.appendChild(explicacao);

  if (item.grupo_agregacao) {
    corpo.appendChild(criarEl('p', 'detalhe-campo-meta', `Grupo de agregação: ${item.grupo_agregacao}`));
  }

  if (item.campos?.length) {
    corpo.appendChild(criarEl('h4', 'detalhe-explicacao-titulo', 'Campos deste módulo'));
    corpo.appendChild(criarChipsCampos(item.campos.map(campoDeModulo)));
  }

  if (modulo.referencia_bibliografica) {
    corpo.appendChild(criarEl('h4', 'detalhe-explicacao-titulo', 'Referência'));
    const p = criarEl('p', 'detalhe-texto');
    p.appendChild(criarReferencia(modulo.referencia_bibliografica));
    corpo.appendChild(p);
  }

  detalhes.appendChild(corpo);
  return detalhes;
}

export default {
  nome: 'protocolo-composto',

  aplicaA(protocolo) {
    return protocolo.tipo_protocolo === 'protocolo-composto';
  },

  async carregar(uuid) {
    const resposta = await buscarComposicao(uuid);
    const composicao = resposta.data;
    return { campos: unirCampos(composicao.modulos ?? []), dados: composicao };
  },

  /** Desenha agregação, gatilhos e os módulos dentro de `container`. */
  renderizarExtras(container, composicao) {
    container.innerHTML = '';

    const resumo = criarEl('div', 'detalhe-composicao-resumo');
    resumo.appendChild(criarEl('p', 'detalhe-texto',
      `Agregação dos módulos: ${rotuloAgregacao(composicao.agregacao)}.`));

    if (composicao.regra_gatilho) {
      const regra = criarEl('details', 'detalhe-regra');
      regra.appendChild(criarEl('summary', null, 'Regras de gatilho'));
      regra.appendChild(criarEl('pre', 'detalhe-pre', JSON.stringify(composicao.regra_gatilho, null, 2)));
      resumo.appendChild(regra);
    }
    container.appendChild(resumo);

    const modulos = composicao.modulos ?? [];
    modulos.forEach((item, indice) => container.appendChild(criarCartaoModulo(item, indice === 0)));
  },
};